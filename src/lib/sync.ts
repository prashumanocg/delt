import "server-only";
import { db, type Priority } from "./supabase";
import { checkAI, classifyByRules, type RuleResult } from "./rules";
import { classifyWithAI, QuotaExhausted } from "./classify";
import {
  AccessRevoked,
  ensureLabels,
  getAccessToken,
  getMessage,
  listMessageIds,
  setPriorityLabel,
  setPriorityLabelMany,
  type ParsedMessage,
} from "./gmail";
import type { Classification, Correction } from "./types";
import { profileFromName, type StudentProfile } from "./profile";
import { COOLDOWN_MS, bumpUsage, planAI } from "./ai-quota";
import { needsReseal, open, openToken, seal } from "./secret";
import { RULES_MAX } from "./inbox";
import { BATCH, LIST_MAX, UNREAD_LIST_MAX, UNREAD_WINDOW_DAYS, isGone, nextSyncedAt, planSync, syncProblem, unreadChanges } from "./sync-plan";


/** What sync talks to: the database, Gmail and the AI. Tests swap these for fakes (#39). */
export const syncDeps = { db, getAccessToken, listMessageIds, getMessage, ensureLabels, setPriorityLabel, setPriorityLabelMany, classifyWithAI };
const D = syncDeps;

// #89: six weeks, so exam schedules, fee notices and registrations sent a few weeks before they
// fall due still show up; a big window comes in batches (#28)
export const FIRST_SYNC_DAYS = 45;
const PARALLEL = 5;
// Gemini's free tier allows only a few requests per minute, so AI calls are
// spaced out and stop once this much of the run has passed.
const AI_GAP_MS = 4500;
const AI_TIME_BUDGET_MS = 35_000;
const LABEL_BACKFILL_MAX = 150;

export type SyncResult = {
  email: string;
  fetched: number;
  sorted: number;
  sortedByAI: number;
  rechecked: number;
  labeled: number;
  /** New mail still to download; the app and the background job sync again until it's 0 (#28). */
  backlog: number;
  errors: string[];
};

const RANK = { very_important: 0, priority: 1, later: 2, noise: 3 } as const;

/** #21: "quick" = download, sort by rules, save, mirror unread (what the app waits for);
 *  "later" = AI re-checks and Gmail labels (the app starts it afterwards without waiting);
 *  "full" = both (background sync). */
export type SyncMode = "quick" | "later" | "full";

export async function syncUser(email: string, mode: SyncMode = "full"): Promise<SyncResult> {
  const started = Date.now();
  const result: SyncResult = { email, fetched: 0, sorted: 0, sortedByAI: 0, rechecked: 0, labeled: 0, backlog: 0, errors: [] };

  const { data: user, error } = await D.db.from("users").select("*").eq("email", email).single();
  if (error || !user) throw new Error(`No saved Google account for ${email}. Sign in again.`);

  let token: string;
  try {
    token = await D.getAccessToken(user.refresh_token);
    // Rows saved before #27 (plain text), or with an old key: re-encrypt now, on the server that owns the key.
    if (needsReseal(user.refresh_token)) {
      const plain = openToken(user.refresh_token);
      if (plain) await D.db.from("users").update({ refresh_token: seal(plain) }).eq("email", email);
    }
  } catch (e) {
    if (e instanceof AccessRevoked) await markRevoked(email);
    throw e;
  }
  const profile: StudentProfile = profileFromName(user.name);

  // First run: last FIRST_SYNC_DAYS days. Later runs: everything since the last sync, plus an hour of overlap.
  const since = user.last_synced_at
    ? Math.floor(new Date(user.last_synced_at).getTime() / 1000) - 3600
    : Math.floor(Date.now() / 1000) - FIRST_SYNC_DAYS * 86400;
  const startedAt = new Date().toISOString();

  // List every new id in the window (cheap), then download at most BATCH of the ones not saved yet.
  const ids = mode === "later" ? [] : await D.listMessageIds(token, `after:${since} -in:sent -in:drafts -in:chats`, LIST_MAX);
  const knownIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: known } = await D.db.from("emails").select("id").eq("user_email", email).in("id", ids.slice(i, i + 200));
    for (const r of known ?? []) knownIds.add(r.id);
  }
  const mailPlan = planSync(ids, knownIds, BATCH);
  const todo = mailPlan.batch;
  result.backlog = mailPlan.left;
  if (mailPlan.listCapped) result.errors.push(`More than ${LIST_MAX} new mails at once; the oldest may be missing.`);
  let failed = 0;

  // Your manual corrections teach both sorters.
  const { data: corrected } = await D.db
    .from("emails")
    .select("from_address, subject, priority")
    .eq("user_email", email)
    .eq("user_corrected", true)
    .order("received_at", { ascending: false })
    .limit(RULES_MAX); // #114: newest first, the same rows and order as the Settings list
  const corrections: Correction[] = (corrected ?? []).map((c) => ({
    from: c.from_address ?? "",
    subject: c.subject ?? "",
    priority: c.priority,
  }));

  // 1. Download and sort new mail with the free rules.
  const items: { msg: ParsedMessage; c: Classification; rules: RuleResult; byAI: boolean }[] = [];
  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(
      todo.slice(i, i + PARALLEL).map(async (id) => {
        try {
          const msg = await D.getMessage(token, id);
          const rules = classifyByRules(msg, corrections, profile);
          items.push({ msg, c: rules, rules, byAI: false });
        } catch (e) {
          const message = (e as Error).message;
          if (!isGone(message)) failed++; // deleted since it was listed: nothing to save
          result.errors.push(`${id}: ${message}`);
        }
      }),
    );
  }

  // 2. Ask free Gemini about the new mails that matter most or that the rules weren't sure about.
  // The shared key is split fairly between students (see ai-quota.ts); a student's own key isn't limited.
  const plan = planAI({
    consent: user.ai_consent ?? null, // nothing goes to Gemini without the student's yes (#31)
    ownKey: open(user.gemini_key_enc),
    sharedKey: process.env.GEMINI_API_KEY,
    sharedCooldownUntil: await sharedCooldownUntil(),
    usedDay: user.ai_day ?? null,
    usedToday: user.ai_calls ?? 0,
    now: Date.now(),
  });
  let aiStopped = !plan.key;
  let aiUsed = 0;
  let lastAI = 0;
  const askAI = async (msg: ParsedMessage) => {
    const wait = lastAI + AI_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAI = Date.now();
    aiUsed++;
    return D.classifyWithAI(msg, corrections.slice(0, 30), profile, plan.key ?? undefined);
  };
  const aiTimeLeft = () => !aiStopped && aiUsed < plan.allowance && Date.now() - started < AI_TIME_BUDGET_MS;
  const onAIError = (id: string, e: unknown) => {
    if (e instanceof QuotaExhausted) {
      aiStopped = true;
      // Tell every other sync to rest the shared key for a while instead of hitting the limit again.
      if (!plan.own) void restSharedKey();
      result.errors.push(plan.own ? "Your Gemini key hit its free limit; the rest were sorted by rules." : "Shared AI limit reached for now; the rest were sorted by rules.");
    } else {
      result.errors.push(`AI ${id}: ${(e as Error).message}`);
    }
  };

  const candidates = items
    .filter(({ rules }) => rules.confidence < 0.95 && (rules.confidence < 0.6 || RANK[rules.priority] <= 1))
    .sort((a, b) => RANK[a.rules.priority] - RANK[b.rules.priority] || b.msg.receivedAt.getTime() - a.msg.receivedAt.getTime());
  for (const item of mode === "full" ? candidates : []) {
    if (!aiTimeLeft()) break;
    try {
      item.c = checkAI(await askAI(item.msg), item.rules, item.msg); // #103, #104
      item.byAI = true;
      result.sortedByAI++;
    } catch (e) {
      onAIError(item.msg.id, e);
    }
  }

  // 3. Save new mail.
  for (let i = 0; i < items.length; i += PARALLEL) {
    await Promise.all(
      items.slice(i, i + PARALLEL).map(async ({ msg, c, byAI }) => {
        const { error: insertError } = await D.db.from("emails").upsert({
          id: msg.id,
          user_email: email,
          thread_id: msg.threadId,
          from_name: msg.fromName,
          from_address: msg.fromAddress,
          subject: msg.subject,
          snippet: msg.snippet,
          received_at: msg.receivedAt.toISOString(),
          priority: c.priority,
          category: c.category,
          summary: c.summary,
          deadline: c.deadline,
          reason: c.reason,
          sorted_by: byAI ? "ai" : "rules",
          user_corrected: false, // the database default, said explicitly (only new mail is saved here)
          unread: msg.unread,
          gmail_labeled: false,
        }, { onConflict: "user_email,id" }); // one row per student per mail
        if (insertError) {
          failed++;
          result.errors.push(`${msg.id}: ${insertError.message}`);
        }
        else result.sorted++;
      }),
    );
  }

  // 4. Spare AI time: re-check older rules-sorted mail, most important and newest first.
  if (mode !== "quick" && aiTimeLeft()) {
    const { data: backlog } = await D.db
      .from("emails")
      .select("id, priority")
      .eq("user_email", email)
      .eq("sorted_by", "rules")
      .eq("user_corrected", false)
      .in("priority", ["very_important", "priority"])
      .order("received_at", { ascending: false })
      .limit(mode === "later" ? 25 : 10); // "later" is where new mail gets its AI check now
    // #85: new mail the rules filed low (Later, Noise) but weren't sure about gets its AI check here too;
    // the rules are re-run on the message to see how sure they were (confidence isn't stored)
    const { data: recentLow } = mode === "later" ? await D.db
      .from("emails")
      .select("id, priority")
      .eq("user_email", email)
      .eq("sorted_by", "rules")
      .eq("user_corrected", false)
      .in("priority", ["later", "noise"])
      .gte("received_at", new Date(Date.now() - 3 * 86400_000).toISOString())
      .order("received_at", { ascending: false })
      .limit(15) : { data: [] as { id: string; priority: string }[] };
    const rows = [...(recentLow ?? []).map((r) => ({ ...r, low: true })), ...(backlog ?? []).map((r) => ({ ...r, low: false }))];
    for (const row of rows) {
      if (!aiTimeLeft()) break;
      try {
        const msg = await D.getMessage(token, row.id);
        const rules = classifyByRules(msg, corrections, profile);
        if (row.low && rules.confidence >= 0.6) continue; // the rules were sure: leave it
        const c = checkAI(await askAI(msg), rules, msg); // #103, #104
        await D.db
          .from("emails")
          .update({ ...c, sorted_by: "ai", gmail_labeled: c.priority === row.priority })
          .eq("id", row.id)
          .eq("user_email", email);
        result.rechecked++;
      } catch (e) {
        onAIError(row.id, e);
      }
    }
  }

  // 5. Put Gmail labels on everything not yet labeled (new mail, re-checked mail, past failures).
  const { data: unlabeled } = mode === "quick" ? { data: [] as { id: string; priority: string }[] } : await D.db
    .from("emails")
    .select("id, priority")
    .eq("user_email", email)
    .eq("gmail_labeled", false)
    .order("received_at", { ascending: false })
    .limit(LABEL_BACKFILL_MAX);
  if (unlabeled?.length) {
    try {
      const labelIds = await D.ensureLabels(token);
      // #109: one Gmail call per pile (up to 1,000 mails each), not one per mail
      for (const pile of Object.keys(RANK) as Priority[]) {
        const ids = unlabeled.filter((r) => r.priority === pile).map((r) => r.id);
        if (!ids.length) continue;
        try {
          await D.setPriorityLabelMany(token, ids, pile, labelIds);
          for (let i = 0; i < ids.length; i += 200)
            await D.db.from("emails").update({ gmail_labeled: true }).in("id", ids.slice(i, i + 200)).eq("user_email", email);
          result.labeled += ids.length;
        } catch (e) {
          result.errors.push(`Label ${pile}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      result.errors.push(`Labels: ${(e as Error).message}`);
    }
  }

  // 6. Mirror Gmail's unread state, so mail read in Gmail leaves the NEW deck too.
  if (mode !== "later") try {
    // #29: up to 2000 unread ids, compared only with rows from the same 60 days
    const unreadNow = await D.listMessageIds(token, `is:unread newer_than:${UNREAD_WINDOW_DAYS}d -in:sent -in:chats`, UNREAD_LIST_MAX);
    const windowStart = new Date(Date.now() - UNREAD_WINDOW_DAYS * 86400_000).toISOString();
    const { data: flagged } = await D.db.from("emails").select("id").eq("user_email", email).eq("unread", true).gte("received_at", windowStart);
    const change = unreadChanges((flagged ?? []).map((r) => r.id), unreadNow, unreadNow.length >= UNREAD_LIST_MAX);
    for (let i = 0; i < change.markRead.length; i += 200)
      await D.db.from("emails").update({ unread: false }).in("id", change.markRead.slice(i, i + 200)).eq("user_email", email);
    for (let i = 0; i < change.markUnread.length; i += 200)
      await D.db.from("emails").update({ unread: true }).in("id", change.markUnread.slice(i, i + 200)).eq("user_email", email).eq("unread", false);
  } catch (e) {
    result.errors.push(`Unread refresh: ${(e as Error).message}`);
  }

  // Only close the window when everything in it was saved (#28); otherwise the next run carries on.
  result.fetched = result.sorted; // what the app reports as "N new mails"
  const syncedAt = mode === "later" ? (user.last_synced_at ?? null) : nextSyncedAt({ previous: user.last_synced_at ?? null, startedAt, left: mailPlan.left, failed });
  // #118: one write for the sync time, the problem note (#40) and AI usage, instead of one each
  const parts = userUpdates({
    syncedAt: syncedAt !== (user.last_synced_at ?? null) ? { last_synced_at: syncedAt } : null,
    problem: mode !== "later" ? { last_sync_error: syncProblem(result.errors) } : null,
    usage: !plan.own && aiUsed > 0 ? bumpUsage(user.ai_day ?? null, user.ai_calls ?? 0, aiUsed, Date.now()) : null,
  });
  if (parts.length) {
    const { error: oneWrite } = await D.db.from("users").update(Object.assign({}, ...parts)).eq("email", email);
    // An older database lacks some of these columns and refuses the whole update: then write each
    // part on its own, sync time first, so a missing column can't block the others.
    if (oneWrite) for (const part of parts) await D.db.from("users").update(part).eq("email", email);
  }
  return result;
}

/** #118: the end-of-sync changes to the users row that apply this time, most important first. */
export function userUpdates(p: { syncedAt: Record<string, unknown> | null; problem: Record<string, unknown> | null; usage: Record<string, unknown> | null }) {
  return [p.syncedAt, p.problem, p.usage].filter((x): x is Record<string, unknown> => !!x);
}

/** #30 / #35: one sync per student at a time, at most one start every `gapSeconds`.
 *  Atomic in the database (claim_sync in schema.sql), so the app, the background job and the daily
 *  cron can't overlap. If the function isn't installed yet, syncing is allowed (and logged). */
export async function claimSync(email: string, gapSeconds: number): Promise<boolean> {
  const { data, error } = await D.db.rpc("claim_sync", { p_email: email, p_gap_seconds: gapSeconds });
  if (error) {
    console.warn("claim_sync unavailable, syncing without the lock:", error.message);
    return true;
  }
  return data === true;
}
export async function finishSync(email: string) {
  await D.db.from("users").update({ sync_finished_at: new Date().toISOString() }).eq("email", email);
}

/** #106: the "later" phase (AI re-checks, Gmail labels) has its own lock (claim_sync_later in
 *  schema.sql), so two tabs can't both run it. Without the function (older database), it's allowed. */
export async function claimSyncLater(email: string): Promise<boolean> {
  const { data, error } = await D.db.rpc("claim_sync_later", { p_email: email });
  if (error) {
    console.warn("claim_sync_later unavailable, running without the lock:", error.message);
    return true;
  }
  return data === true;
}
export async function finishSyncLater(email: string) {
  await D.db.from("users").update({ later_started_at: null }).eq("email", email);
}

/** Issue #10: remember that Google access is gone, so the app asks the student to sign in
 *  again and background sync stops trying. Cleared on the next sign-in (auth.ts). */
export async function markRevoked(email: string) {
  await D.db.from("users").update({ access_revoked: true }).eq("email", email); // no-op on an older database
}

// ---------- shared Gemini key cooldown, stored in app_state so every sync sees it ----------
async function sharedCooldownUntil(): Promise<number | null> {
  const { data, error } = await D.db.from("app_state").select("value").eq("key", "gemini_cooldown_until").maybeSingle();
  if (error || !data) return null;
  const t = Number((data.value as { until?: number })?.until);
  return Number.isFinite(t) ? t : null;
}
async function restSharedKey() {
  await D.db.from("app_state").upsert({ key: "gemini_cooldown_until", value: { until: Date.now() + COOLDOWN_MS }, updated_at: new Date().toISOString() });
}
