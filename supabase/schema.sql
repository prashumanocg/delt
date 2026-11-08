-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

-- One row per signed-in Google account. Stores the refresh token so the
-- server can fetch mail in the background (cron) without you being online.
create table if not exists users (
  email           text primary key,
  refresh_token   text not null,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);

-- One row per sorted email. Only a short preview is stored, never the full body.
create table if not exists emails (
  id            text primary key,          -- Gmail message id
  user_email    text not null references users(email) on delete cascade,
  thread_id     text,
  from_name     text,
  from_address  text,
  subject       text,
  snippet       text,
  received_at   timestamptz not null,
  priority      text not null check (priority in ('very_important','priority','later','noise')),
  category      text not null,
  summary       text not null,
  deadline      timestamptz,
  reason        text,
  -- true when you moved the mail yourself; the sorter learns from these
  user_corrected boolean not null default false,
  is_done       boolean not null default false,
  gmail_labeled boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists emails_user_received_idx on emails (user_email, received_at desc);
create index if not exists emails_user_deadline_idx on emails (user_email, deadline) where deadline is not null;

-- 'rules' or 'ai'. Rules-sorted mails get re-checked by the free AI when quota allows.
alter table emails add column if not exists sorted_by text not null default 'rules';

-- Mirrors Gmail's UNREAD label; refreshed on every sync. Drives the NEW deck.
alter table emails add column if not exists unread boolean not null default false;

-- One row per student per mail. Gmail message ids are per mailbox, so two
-- students can receive mail with the same id; the key must include the owner.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'emails'::regclass and contype = 'p' and array_length(conkey, 1) = 1
  ) then
    alter table emails drop constraint emails_pkey;
    alter table emails add constraint emails_pkey primary key (user_email, id);
  end if;
end $$;

-- Lock both tables. The app only talks to them from the server with the
-- service-role key, so the public (anon) key can read nothing.
alter table users  enable row level security;
alter table emails enable row level security;

-- New Supabase projects don't expose new tables automatically, so grant the
-- server key access explicitly.
grant select, insert, update, delete on users, emails to service_role;

-- Unused since v2 (deadlines now come only from mail). Kept so old installs stay valid.
create table if not exists deadlines (
  id          uuid primary key default gen_random_uuid(),
  user_email  text not null references users(email) on delete cascade,
  title       text not null,
  due_at      timestamptz not null,
  email_id    text,
  note        text,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists deadlines_user_due_idx on deadlines (user_email, due_at);
alter table deadlines enable row level security;
grant select, insert, update, delete on deadlines to service_role;

-- Your answer to "track this deadline?": 'tracked' or 'skipped'.
alter table emails add column if not exists deadline_choice text;

-- ---------- Nov 2026: issues #3, #4, #5, #6 ----------
-- #3: a student's own Gemini key (encrypted by the app) and their daily use of the shared key.
alter table users add column if not exists gemini_key_enc text;
alter table users add column if not exists ai_day text;
alter table users add column if not exists ai_calls int not null default 0;
-- #4/#5: when the student last opened the app; active students are synced more often.
alter table users add column if not exists last_seen_at timestamptz;
-- The Google display name, saved at sign-in (src/auth.ts); the register number in it gives the batch.
-- Without this column a fresh database rejects every sign-in.
alter table users add column if not exists name text;

-- Small shared settings, e.g. when the shared Gemini key may be used again.
create table if not exists app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- #6: phone notifications. One row per device that turned them on.
create table if not exists push_subscriptions (
  endpoint   text primary key,
  user_email text not null references users(email) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_email);
-- Sent once: an alert for new urgent mail, and a reminder for a deadline due within a day.
alter table emails add column if not exists notified boolean not null default false;
alter table emails add column if not exists reminded boolean not null default false;

alter table app_state enable row level security;
alter table push_subscriptions enable row level security;
grant select, insert, update, delete on app_state, push_subscriptions to service_role;

-- ---------- Nov 2026: issues #9 to #12 ----------
-- #10: set when Google says DELT's access was removed; cleared on the next sign-in.
alter table users add column if not exists access_revoked boolean not null default false;

-- ---------- Nov 2026: #30 / #35 sync lock ----------
alter table users add column if not exists sync_started_at timestamptz;
alter table users add column if not exists sync_finished_at timestamptz;

-- Claims the right to sync this student now. Returns true if claimed, null if:
--  - a sync started less than p_gap_seconds ago (rate limit), or
--  - a sync is still running (started, not finished, and less than p_lock_seconds old).
create or replace function claim_sync(p_email text, p_gap_seconds int default 10, p_lock_seconds int default 180)
returns boolean
language sql
as $$
  update users set sync_started_at = now()
  where email = p_email
    and (sync_started_at is null or sync_started_at < now() - make_interval(secs => p_gap_seconds))
    and (sync_started_at is null
         or (sync_finished_at is not null and sync_finished_at >= sync_started_at)
         or sync_started_at < now() - make_interval(secs => p_lock_seconds))
  returning true;
$$;
revoke all on function claim_sync(text, int, int) from public, anon, authenticated;
grant execute on function claim_sync(text, int, int) to service_role;

-- ---------- Nov 2026: #31 AI consent ----------
alter table users add column if not exists ai_consent boolean;

-- ---------- Nov 2026: #40 sync health ----------
alter table users add column if not exists last_sync_error text;
