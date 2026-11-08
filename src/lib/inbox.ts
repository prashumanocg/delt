// Pure helpers behind the inbox and deadline screens. No React, no network:
// everything here is unit tested in tests/inbox.test.ts.
import type { EmailRow, Priority } from "./supabase";
import { subjectKey } from "./insights";

export type Mail = Pick<
  EmailRow,
  "id" | "from_name" | "from_address" | "subject" | "summary" | "snippet" | "received_at" | "priority" | "category" | "deadline" | "is_done" | "unread"
>;

export const PILES: { key: Priority; label: string }[] = [
  { key: "very_important", label: "Urgent" },
  { key: "priority", label: "Priority" },
  { key: "later", label: "Later" },
  { key: "noise", label: "Noise" },
];
export const pileLabel = (p: Priority) => PILES.find((x) => x.key === p)!.label;

const TZ = "Asia/Kolkata";
const DAY = 86400_000;
/** Calendar day in IST, e.g. "2026-11-04". */
// #60: build each formatter once. A toLocaleDateString call with a timeZone makes a new
// Intl.DateTimeFormat every time (about 74x slower), and the inbox formats several dates per row.
const fmt = (locale: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: TZ, ...o });
export const F = {
  day: fmt("en-CA", {}),
  weekdayDayMonth: fmt("en-IN", { weekday: "short", day: "numeric", month: "short" }),
  time: fmt("en-IN", { hour: "numeric", minute: "2-digit" }),
  dayMonth: fmt("en-IN", { day: "numeric", month: "short" }),
  dayNum: fmt("en-IN", { day: "numeric" }),
  monthShort: fmt("en-IN", { month: "short" }),
  dateTime: fmt("en-IN", { dateStyle: "medium", timeStyle: "short" }),
  dueFull: fmt("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
  weekday: fmt("en-IN", { weekday: "long" }),
};
const dayCache = new Map<number, string>();
/** Calendar day in IST, e.g. "2026-11-04" (cached per minute). */
export const istDay = (t: number) => {
  const k = Math.floor(t / 60_000);
  let d = dayCache.get(k);
  if (!d) {
    d = F.day.format(t);
    if (dayCache.size > 20_000) dayCache.clear();
    dayCache.set(k, d);
  }
  return d;
};

export const cleanSender = (n: string | null) => (n ?? "").replace(/\s+via\s+.*$/i, "").replace(/['"]/g, "").trim() || "Unknown sender";
export const cleanSubject = (s: string | null) =>
  (s ?? "").replace(/\s*[-–:]?\s*reg\.?$/i, "").replace(/^((fwd?|re|fw):\s*)+/i, "").trim() || "(no subject)";
export const initials = (n: string) =>
  n.split(/[\s-]+/).filter((w) => /^[a-z]/i.test(w) && !/^(of|the|and|for|at|in|to)$/i.test(w)).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export type Filter = { pile: Priority | "all"; unreadOnly: boolean; query: string };

/** Mail matching the chips and search box, newest first. Nothing is ever hidden by "All". */
export function filterMail<T extends Mail>(mails: T[], f: Filter): T[] {
  const q = f.query.trim().toLowerCase();
  return mails
    .filter((m) => f.pile === "all" || m.priority === f.pile)
    .filter((m) => !f.unreadOnly || m.unread)
    .filter((m) => !q || [m.subject, m.from_name, m.from_address, m.summary].some((s) => s?.toLowerCase().includes(q)))
    .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));
}

/** Count per chip: total and unread for All and each pile. */
export function pileCounts(mails: Mail[]) {
  const out: Record<Priority | "all", { total: number; unread: number }> = {
    all: { total: 0, unread: 0 },
    very_important: { total: 0, unread: 0 },
    priority: { total: 0, unread: 0 },
    later: { total: 0, unread: 0 },
    noise: { total: 0, unread: 0 },
  };
  for (const m of mails) {
    for (const k of ["all", m.priority] as const) {
      out[k].total++;
      if (m.unread) out[k].unread++;
    }
  }
  return out;
}

/** "Today", "Yesterday", or "Mon, 2 Nov" (IST). */
export function dayLabel(t: number, now: number) {
  const d = istDay(t);
  if (d === istDay(now)) return "Today";
  if (d === istDay(now - DAY)) return "Yesterday";
  return F.weekdayDayMonth.format(t);
}

/** Splits an already-sorted list into day sections, keeping order. */
export function groupByDay<T extends Mail>(mails: T[], now: number) {
  const groups: { key: string; label: string; mails: T[] }[] = [];
  for (const m of mails) {
    const t = Date.parse(m.received_at);
    const key = istDay(t);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.mails.push(m);
    else groups.push({ key, label: dayLabel(t, now), mails: [m] });
  }
  return groups;
}

/** Row time: "4:05 pm" for today, "Yesterday", or "2 Nov". */
export function shortTime(iso: string, now: number) {
  const t = Date.parse(iso);
  if (istDay(t) === istDay(now)) return F.time.format(t);
  if (istDay(t) === istDay(now - DAY)) return "Yesterday";
  return F.dayMonth.format(t);
}

/** "9:07 pm" (IST). Rows sit under a day heading, so they only need the time (#42). */
export const timeOfDay = (iso: string) =>
  F.time.format(Date.parse(iso)).toLowerCase();

/** "just now", "3 min ago", "2 h ago". */
export function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < DAY / 1000) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** The whole due label: "Overdue", or "Due " + dueText ("Due tomorrow"). Never "Due overdue". */
export function dueLabel(iso: string, now: number) {
  const t = dueText(iso, now);
  return t === "overdue" ? "Overdue" : `Due ${t}`;
}

/** Due text for chips: "overdue", "today 6 pm", "tomorrow", "in 3 days", "12 Nov". */
export function dueText(iso: string, now: number) {
  const t = Date.parse(iso);
  if (t < now) return "overdue";
  const days = Math.round((Date.parse(istDay(t)) - Date.parse(istDay(now))) / DAY);
  // #54: one style everywhere: lowercase am/pm, no ":00", and no time at all for end-of-day deadlines
  const hm = F.time.format(t).toLowerCase().replace(":00", "");
  const endOfDay = /^(12 am|11:59 pm)$/.test(hm);
  const time = endOfDay ? "" : ` ${hm}`;
  if (days === 0) return `today${time}`;
  if (days === 1) return `tomorrow${time}`;
  if (days < 7) return `in ${days} days`;
  return F.dayMonth.format(t);
}

/** How close a deadline is: drives the chip colour. */
export function dueLevel(iso: string, now: number): "over" | "soon" | "week" | "far" {
  const d = (Date.parse(iso) - now) / DAY;
  return d < 0 ? "over" : d < 2 ? "soon" : d < 7 ? "week" : "far";
}

export type Bucket = "Overdue" | "Today" | "Tomorrow" | "This week" | "Later" | "Done";
export const BUCKETS: Bucket[] = ["Overdue", "Today", "Tomorrow", "This week", "Later", "Done"];

/**
 * Deadlines straight from mail. Noise is ignored, repeats (reminders, Fwd)
 * keep only the newest, overdue items older than 7 days drop off, and finished
 * ones go to Done so they are still findable.
 */
export function deadlineBuckets<T extends Mail>(mails: T[], now: number) {
  const withDue = mails.filter((m) => m.deadline && m.priority !== "noise");
  // newest mail per subject wins
  const seen = new Map<string, T>();
  for (const m of [...withDue].sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at))) {
    const k = subjectKey(m.subject) || m.id;
    if (!seen.has(k)) seen.set(k, m);
  }
  const out = Object.fromEntries(BUCKETS.map((b) => [b, [] as T[]])) as Record<Bucket, T[]>;
  const today = istDay(now);
  for (const m of seen.values()) {
    const t = Date.parse(m.deadline!);
    if (m.is_done) {
      out.Done.push(m);
      continue;
    }
    if (t < now) {
      if (now - t <= 7 * DAY) out.Overdue.push(m);
      continue;
    }
    const days = Math.round((Date.parse(istDay(t)) - Date.parse(today)) / DAY);
    out[days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 7 ? "This week" : "Later"].push(m);
  }
  for (const b of BUCKETS) out[b].sort((a, b2) => Date.parse(a.deadline!) - Date.parse(b2.deadline!));
  out.Done.reverse();
  return out;
}

/** Number of deadlines that still need you (for the tab badge). */
export const openDeadlines = (b: Record<Bucket, unknown[]>) => b.Overdue.length + b.Today.length + b.Tomorrow.length + b["This week"].length;

/**
 * A pre-filled "Mail in the wrong pile" GitHub issue (issue #1). Only the subject,
 * sender name and pile go in; never the mail body or addresses. The student sees
 * it on GitHub and can edit or cancel before posting.
 */
/** The part of an address after @, e.g. "vit.ac.in". */
export const senderDomain = (address: string | null) => (address ?? "").toLowerCase().split("@")[1]?.replace(/[^a-z0-9.-]/g, "") || "unknown";

/** A public GitHub issue about a wrong pile (#33). It never carries the subject, the text or a
 *  person's name: only the sender's domain, the pile, and DELT's own reason for choosing it. */
export function wrongPileLink(domain: string, pile: string, reason: string | null) {
  const body = [
    `**Sender's domain:** ${domain}`,
    `**DELT put it in:** ${pile}`,
    `**DELT's reason:** ${reason || "(none given)"}`,
    `**It should be in:** Urgent / Priority / Later / Noise`,
    `**What kind of mail is it?** Describe it in general words (for example "a fee deadline from the hostel office"). Please don't paste the subject or names.`,
    `**Your batch year** (for example 2026)\n`,
    `_This issue is public._`,
  ].join("\n\n");
  const q = new URLSearchParams({ title: `Wrong pile: mail from ${domain} sorted as ${pile}`.slice(0, 120), labels: "sorting", body });
  return `https://github.com/pranavvehmid/delt/issues/new?${q.toString()}`;
}

// ---------- loading more than one page (issue #11) ----------
export const PAGE_SIZE = 200;
const newestFirst = (a: Mail, b: Mail) => Date.parse(b.received_at) - Date.parse(a.received_at);

/** A fresh first page replaces the newest part of what's loaded; older pages already loaded stay. */
export function mergeFresh<T extends Mail>(loaded: T[], page: T[], more: boolean): T[] {
  if (!more || page.length === 0) return page; // the page is everything there is
  const edge = Math.min(...page.map((m) => Date.parse(m.received_at)));
  const ids = new Set(page.map((m) => m.id));
  return [...page, ...loaded.filter((m) => Date.parse(m.received_at) < edge && !ids.has(m.id))].sort(newestFirst);
}

/** Adds an older page (or search results) without duplicates. Mail already loaded wins, so
 *  a change made on screen isn't undone by an older copy. */
export function mergeMore<T extends Mail>(loaded: T[], extra: T[]): T[] {
  const byId = new Map(loaded.map((m) => [m.id, m]));
  for (const m of extra) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort(newestFirst);
}

/** Where the next older page starts: the oldest loaded mail. */
export const oldestReceived = (mails: Mail[]) =>
  mails.length ? mails.reduce((o, m) => (Date.parse(m.received_at) < Date.parse(o) ? m.received_at : o), mails[0].received_at) : null;

/** Search words made safe for the database filter: no commas, brackets, quotes or wildcards.
 *  Words are joined by "%" so "b tech" also finds "B.Tech". Empty means no server search. */
export function searchPattern(q: string): string {
  const words = q.replace(/[%_*,()\\"'.:;]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  const text = words.join("%").slice(0, 80);
  return text.length >= 2 ? `%${text}%` : "";
}

// ---------- sender rules (issue #13) ----------
/** #114: how many of a student's moves count as rules, for both the sorter and the Settings list. */
export const RULES_MAX = 2000;
export type SenderRule = { from: string; name: string; priority: Priority; mails: number };

/** Moving a mail by hand teaches DELT "mail from this sender goes to this pile". The newest
 *  moved mail from a sender decides. One rule per sender, sorted by name. */
export function senderRules(rows: { from_address: string | null; from_name: string | null; priority: Priority; received_at: string }[]): SenderRule[] {
  const by = new Map<string, SenderRule & { at: number }>();
  for (const r of rows) {
    const from = (r.from_address ?? "").toLowerCase().trim();
    if (!from) continue;
    const at = Date.parse(r.received_at);
    const cur = by.get(from);
    if (!cur) by.set(from, { from, name: cleanSender(r.from_name) === "Unknown sender" ? from : cleanSender(r.from_name), priority: r.priority, mails: 1, at });
    else {
      cur.mails++;
      if (at > cur.at) Object.assign(cur, { priority: r.priority, at });
    }
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name)).map(({ from, name, priority, mails }) => ({ from, name, priority, mails }));
}

// ---------- Grid look (F1-inspired) ----------
/** A three-letter "driver code" for a sender, like VER or HAM on the timing tower.
 *  An acronym in the name wins (COE, DSW, ACM); otherwise the first three letters. */
export function senderCode(name: string | null): string {
  const clean = cleanSender(name);
  const words = clean.split(/[\s\-–:,/]+/).filter((w) => /^[A-Za-z]/.test(w));
  // VIT is in almost every sender, so it never names one (ACM-VIT is ACM)
  const acronym = words.find((w) => /^[A-Z]{2,4}$/.test(w) && w !== "VIT");
  if (acronym) return acronym.slice(0, 3);
  const main = words.find((w) => !/^(the|of|and|for|at|in|to|dr|prof|mr|ms|mrs)\.?$/i.test(w)) ?? words[0] ?? "";
  return (main.replace(/[^A-Za-z]/g, "").slice(0, 3) || "???").toUpperCase();
}

/** The timing-tower gap: the newest mail leads, others show how far behind it they arrived. */
/** #74: the timing tower's gap column. P1 is always the LEADER; every other mail shows how long it
 *  has been waiting, like a gap in a race (+45M, +2H 20M, +1D). */
export function gapText(receivedAt: string, now: number, leader = false): string {
  if (leader) return "LEADER";
  const d = Math.max(0, now - Date.parse(receivedAt));
  if (d < 60_000) return "+0M";
  const m = Math.floor(d / 60_000), h = Math.floor(m / 60), days = Math.floor(h / 24);
  if (days >= 1) return `+${days}D${h % 24 ? ` ${h % 24}H` : ""}`;
  if (h >= 1) return `+${h}H${m % 60 ? ` ${m % 60}M` : ""}`;
  return `+${m}M`;
}

// ---------- #23: what needs you, above everything else ----------
/** Unread Urgent mail, and anything due within 48 h (or up to a day overdue) that isn't done or Noise.
 *  Due soonest first, then newest. At most `max`. */
export function needsYou<T extends Mail>(mails: T[], now: number, max = 5): T[] {
  const dueAt = (m: T) => (m.deadline ? Date.parse(m.deadline) : Infinity);
  const soon = (m: T) => m.deadline && !m.is_done && m.priority !== "noise" && dueAt(m) <= now + 2 * DAY && dueAt(m) >= now - DAY;
  return mails
    .filter((m) => (m.unread && m.priority === "very_important" && !m.is_done) || soon(m))
    .sort((a, b) => dueAt(a) - dueAt(b) || Date.parse(b.received_at) - Date.parse(a.received_at))
    .slice(0, max);
}

// ---------- #55: a deadline row says only what its heading doesn't ----------
export function dueInBucket(iso: string, bucket: Bucket, now: number): string {
  const t = Date.parse(iso);
  const hm = F.time.format(t).toLowerCase().replace(":00", "");
  const endOfDay = /^(12 am|11:59 pm)$/.test(hm);
  if (bucket === "Overdue") {
    const days = Math.round((Date.parse(istDay(now)) - Date.parse(istDay(t))) / DAY);
    return days <= 0 ? "earlier today" : days === 1 ? "since yesterday" : `${days} days ago`;
  }
  if (bucket === "Today" || bucket === "Tomorrow") return endOfDay ? "end of day" : hm;
  if (bucket === "This week") return F.weekday.format(t) + (endOfDay ? "" : ` ${hm}`);
  return dueText(iso, now);
}
