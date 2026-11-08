# DELT design: what it is for, how it works, why it looks this way

## 1. The one job

DELT shows a VIT student **all their college mail in one list**, with the important mail impossible to miss. Every other screen exists only to serve that.

What the user asked for (from their own words, in priority order):

1. **Deadlines, exams, registrations, interviews and fees** must never be missed.
2. **Hackathons, competitions, announcements and decisions** come next.
3. Achievements, events, and scholarships they may not qualify for can wait.
4. Everything else is noise.
5. Read the **full mail** inside the app.
6. **Every mail in one place**, like the Gmail app, with a colour tag for each pile. Nothing may vanish.
7. Phone first, minimal, smooth, and **completely free**.

## 2. What went wrong in v1 (audit, 4 Nov 2026)

| Problem | Cause | Fix in v2 |
|---|---|---|
| Mail "disappeared" | Swiping *Not for me* or tapping ✕ silently moved the mail to Later, which lived on another tab | One list holds everything. Swiping changes only read or done, never the pile |
| Hard to understand | 5 tabs (Today, New, Chances, Deadlines, Inbox) showed overlapping slices of the same mail | 2 tabs: **Inbox** and **Deadlines** |
| Couldn't read full mail | It took 3 taps (mail → side drawer → Read full mail) and opened in a cramped box | Tap a mail and it opens full screen, with the whole body shown inline |
| Deadline clutter | "Track this deadline?" prompts plus hand-made deadlines | Deadlines come from mail automatically. No prompts, no manual entry |
| "Minimal" was only a recolour | The Calm theme reused the chunky card layout | Calm is a different layout: full-width rows, dividers, system font. Glyph keeps the chunky style |
| Sync felt random | Sync ran on open, on ↻, and once a day by cron | Also syncs every 5 min while the app is open and when you come back to it. Shows "Updated 2 min ago" |

## 3. Lessons from popular mail apps

- **Gmail:** one chronological list, coloured labels, swipe to act, and actions you can undo. Everyone already knows it, so DELT copies the list shape.
- **Outlook Focused / Spark Smart Inbox:** sorting is a *tag on the mail*, not a separate place to look. That's why filters are chips over one list, not tabs.
- **HEY:** a clear promise ("you decide what's important") and a separate "Paper Trail" for low-value mail. DELT's Later and Noise act like this, but they stay visible under the **All** filter.
- **Superhuman:** speed, with every action one keystroke or swipe away. DELT has no confirm dialogs and updates the screen instantly while syncing in the background.
- **Things 3:** calm, generous spacing and few colours, with colour reserved for meaning. This is the model for the Calm look.

Common thread: **one place, a predictable result for each action, colour that means something.**

## 4. The sorting algorithm (unchanged core, tested by 118+ cases)

For each new mail (`src/lib/sync.ts` → `src/lib/rules.ts`):

1. **Your corrections win.** If you ever moved mail from this sender, use your pile.
2. **Account and security notices** go to Priority.
3. **Promotions** from outside VIT, or with no action for you, go to Noise.
4. **Not for you:** if the mail names another batch or year (your batch comes from `26BCE…` in your Google name), it goes to Later.
5. **Achievements** and **scholarships** go to Later.
6. **Exams and interviews** go to Urgent.
7. **Paid programmes** (summer schools, certificate courses) go to Later.
8. **Fees, attendance, registrations** go to Urgent. **Hackathons and competitions** go to Priority, or Urgent if the deadline is close.
9. **Decisions, announcements, academics** go to Priority. Academic work due soon ("submit by…") goes to Urgent.
10. **Events, placements, newsletters** go to Later. Anything else goes to Noise.
11. A **deadline** is pulled from the text (every VIT date format, impossible dates rejected, IST 23:59 default).
12. If the rules are unsure, Gemini's free tier gets a second look (rate-limited, never paid).

Moving a mail to another pile teaches step 1 for that sender. Labels mirror to Gmail as `DELT/Urgent` … `4 Noise`.

## 5. The app (v2)

```
Inbox ─ search
      ─ chips: All · Urgent · Priority · Later · Noise   + Unread only
      ─ list by day: [pile colour] sender · time / subject / summary / due chip
          tap         → full-screen mail (#/mail/<id>; phone Back closes it)
          swipe right → read / unread
          swipe left  → done / not done (stays in the list, greyed)
Mail  ─ subject, sender, date
      ─ Pile: Urgent | Priority | Later | Noise   (tap to move; teaches the sorter)
      ─ Due …  [Add to Google Calendar]
      ─ "In short" summary
      ─ the full original mail, inline (sandboxed, no scripts)
      ─ Mark unread · Done · Open in Gmail · Unsubscribe
Deadlines ─ from mail only: Overdue · Today · Tomorrow · This week · Later · Done
```

**Sync:** on open, every 5 min while visible, on return to the app, and on ↻. The daily 7 AM cron covers days you don't open the app (the free Vercel plan allows one cron a day).

**Looks (◐ → Appearance):**
- **Minimal** (default): Swiss / International Typographic Style, after researching minimalist design rules (one typeface at light/regular/medium, never bold; 8px grid; whitespace instead of cards and dividers; one accent; square corners; flat navigation).
  - **Importance is ink.** Urgent prints at 100% with a red mark, Priority 72%, Later 48%, Noise 30%. You read priority by how dark a line is, not by labels.
  - **No tab bar.** "Inbox" and "Deadlines" are a typographic masthead; the current one is solid, the other faint.
  - Rows sit on a two-column grid (time | mail). Deadlines show big light day numbers. Filters and pile choices are underlined words.
  - Typeface: IBM Plex Sans. Accent: Swiss red #C8102E (the DELT dot). Only numbers: the two masthead counts.
- **Glyph**: the chunky Nothing-style skin with dot-matrix headings, ink borders, hard shadows, avatars and counts.
- Theme Light / Dark / Extra dark (pure black, Nothing OS style) / Auto, Accent (6), Text Normal / Large, Spacing Comfortable / Compact. Saved per device (`delt-prefs`) and applied before first paint by `PREPAINT` in `src/lib/prefs.ts`.

**Many students, one app:** sign-in is open to any `@vitstudent.ac.in` account (Google "Internal" app in VIT's student organisation). Each mail row is keyed by **(student, Gmail id)**, because Gmail ids are per mailbox and two students can share one. Every API query is filtered by the signed-in student; `tests/safety.test.ts` fails if a route forgets.

## 6. Code map

Every file in `src/app/` and `src/lib/` (`tests/design-code-map.test.ts` checks the list is complete
and that every name here still exists).

**App shell and pages**
- `src/app/layout.tsx`: the HTML shell and the bundled fonts. `page.tsx`: sign-in or the app. `error.tsx` (#228), `not-found.tsx` (#229), `privacy/`, `e2e/` (fake-mail inbox for browser tests), `icons/`, `manifest.ts` (installable app).
- `src/app/inbox-app.tsx`: the two-tab app. It wires together `use-mail.ts` (loading, paging, search, offline copy), `use-sync.ts` (checking Gmail), `use-mail-actions.ts` (changes with Undo), `use-screen.ts` (route, screen size, gestures), `use-look.ts` (which look is on, hover or touch), `use-dialog.ts` (focus and Esc for panels) and the components `inbox-list.tsx`, `deadlines-list.tsx`, `mail-row.tsx`, `list-states.tsx` (loading and empty states), `overview.tsx` (laptop pane with no mail open), `account-menu.tsx`, `banners.tsx`, `tabs.tsx`, `toast.tsx` (with `src/lib/toast-history.ts`, the Undo history, #212), `welcome.tsx` (first-run help).
- `src/app/motion.ts`: screen changes animated with View Transitions.

**Reading a mail**
- `src/app/mail-view.tsx`: the open mail. `mail-frame.tsx`: the original mail in a locked-down frame, read live from Gmail. `mail-dark.ts`: recolours it for dark themes (#71). `mail-attachments.tsx`: thumbnails, viewer and downloads (#72).

**Styles and settings**
- `src/app/app.css`: imports the style files in cascade order: `styles/base.css` (layout for every look), `look-shared.css` (what Minimal and Grid share), `look-minimal.css`, `look-glyph.css`, `themes.css` (Extra dark, accents, size, spacing), then `look-grid.css`. A rule names the looks it is for (`:root[data-look="glyph"]`, `:root:is([data-look="minimal"], [data-look="grid"])`), never the ones it isn't.
- `src/app/appearance.tsx` + `src/lib/prefs.ts`: the Appearance panel and saved preferences.
- `src/app/settings.tsx`: the Settings panel; `settings-push.tsx` (notifications) and `settings-ai.tsx` (AI sorting, your own Gemini key).

**Server and shared helpers (`src/lib/`)**
- Sorting: `rules.ts`, `classify.ts` (the AI check), `topics.ts` (learning from moves by topic), `profile.ts` (batch, branch and year from the Google name).
- Gmail and sync: `gmail.ts`, `sync.ts`, `sync-message.ts` (what the app says when a check fails, #150), `sync-plan.ts` (what one run saves, and when it moves `last_synced_at`), `attachments.ts`, `app-update.ts` (Android build check).
- `src/lib/schedule.ts`: who background sync checks next (active students ~15 min, others daily). Run by `.github/workflows/sync.yml`.
- `src/lib/ai-quota.ts` + `src/lib/secret.ts`: fair share of the shared Gemini key, and encryption for students' own keys.
- `src/lib/notify-plan.ts` + `src/lib/notify.ts` + `public/sw.js`: phone notifications for urgent mail and deadlines due within a day.
- Data: `supabase.ts` (server-only client), `types.ts`, `all-rows.ts` (paging past 1,000 rows), `retention.ts` (old previews purged), `account.ts` (Delete my data).
- API helpers: `rate-limit.ts`, `api-error.ts` (no raw errors to the browser).
- Other helpers: `inbox.ts` (filter, group by day, deadline buckets, relative time), `insights.ts` (duplicates and other pure helpers), `offline.ts` (the last inbox on this device), `logo.ts` (the wordmark as shapes, for icons).
- `src/app/api/`: the routes (`emails`, `sync`, `rules`, `push`, `settings`, `account`, `health`, `app-version`, `auth`).

