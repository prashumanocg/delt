import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ago, deadlineBuckets, dayLabel, dueLabel, dueLevel, dueText, filterMail, groupByDay, openDeadlines, pileCounts, shortTime, type Mail } from "../src/lib/inbox";

// Wed 4 Nov 2026, 12:00 IST
const NOW = Date.parse("2026-11-04T12:00:00+05:30");
const H = 3600_000;
let n = 0;
const mail = (o: Partial<Mail> = {}): Mail => ({
  id: `m${++n}`,
  from_name: "Office of SW",
  from_address: "sw@vit.ac.in",
  subject: `Mail ${n}`,
  summary: "",
  snippet: "",
  received_at: new Date(NOW - H).toISOString(),
  priority: "priority",
  category: "announcement",
  deadline: null,
  is_done: false,
  unread: false,
  ...o,
});

test("All shows every pile; nothing disappears when a mail changes pile", () => {
  const list = [mail({ priority: "very_important" }), mail({ priority: "later" }), mail({ priority: "noise" }), mail({ is_done: true })];
  assert.equal(filterMail(list, { pile: "all", unreadOnly: false, query: "" }).length, 4);
  assert.equal(filterMail(list, { pile: "later", unreadOnly: false, query: "" }).length, 1);
});

test("filters combine: pile + unread + search over subject, sender and summary", () => {
  const list = [
    mail({ subject: "CAT-1 schedule", priority: "very_important", unread: true }),
    mail({ subject: "CAT-1 seating", priority: "very_important", unread: false }),
    mail({ from_name: "ACM-VIT", subject: "Hack", summary: "registrations close friday", unread: true }),
  ];
  assert.equal(filterMail(list, { pile: "very_important", unreadOnly: true, query: "" }).length, 1);
  assert.equal(filterMail(list, { pile: "all", unreadOnly: false, query: "cat-1" }).length, 2);
  assert.equal(filterMail(list, { pile: "all", unreadOnly: false, query: "acm" }).length, 1);
  assert.equal(filterMail(list, { pile: "all", unreadOnly: false, query: "FRIDAY" }).length, 1);
});

test("filterMail sorts newest first", () => {
  const a = mail({ received_at: new Date(NOW - 5 * H).toISOString() });
  const b = mail({ received_at: new Date(NOW - 1 * H).toISOString() });
  assert.deepEqual(filterMail([a, b], { pile: "all", unreadOnly: false, query: "" }).map((m) => m.id), [b.id, a.id]);
});

test("pileCounts counts totals and unread per chip", () => {
  const c = pileCounts([mail({ priority: "noise", unread: true }), mail({ priority: "noise" }), mail({ priority: "later", unread: true })]);
  assert.deepEqual(c.all, { total: 3, unread: 2 });
  assert.deepEqual(c.noise, { total: 2, unread: 1 });
  assert.deepEqual(c.very_important, { total: 0, unread: 0 });
});

test("day labels and grouping follow IST, not UTC", () => {
  assert.equal(dayLabel(NOW, NOW), "Today");
  assert.equal(dayLabel(NOW - 24 * H, NOW), "Yesterday");
  // 00:30 IST on 4 Nov is still 3 Nov in UTC: must count as Today
  assert.equal(dayLabel(Date.parse("2026-11-04T00:30:00+05:30"), NOW), "Today");
  const g = groupByDay(
    [mail({ received_at: new Date(NOW - H).toISOString() }), mail({ received_at: new Date(NOW - 2 * H).toISOString() }), mail({ received_at: new Date(NOW - 30 * H).toISOString() })],
    NOW,
  );
  assert.deepEqual(g.map((x) => [x.label, x.mails.length]), [["Today", 2], ["Yesterday", 1]]);
});

test("shortTime and ago read naturally", () => {
  assert.match(shortTime(new Date(NOW - H).toISOString(), NOW), /11:00\s?am/i);
  assert.equal(shortTime(new Date(NOW - 24 * H).toISOString(), NOW), "Yesterday");
  assert.equal(ago(NOW - 10_000, NOW), "just now");
  assert.equal(ago(NOW - 3 * 60_000, NOW), "3 min ago");
  assert.equal(ago(NOW - 2 * H, NOW), "2 h ago");
});

test("dueText and dueLevel", () => {
  assert.equal(dueText(new Date(NOW - H).toISOString(), NOW), "overdue");
  assert.match(dueText("2026-11-04T18:00:00+05:30", NOW), /^today 6\s?pm$/i);
  assert.match(dueText("2026-11-05T23:59:00+05:30", NOW), /^tomorrow/);
  assert.equal(dueText("2026-11-08T10:00:00+05:30", NOW), "in 4 days");
  assert.equal(dueText("2026-11-20T10:00:00+05:30", NOW), "20 Nov");
  assert.equal(dueLevel(new Date(NOW + 30 * H).toISOString(), NOW), "soon");
  assert.equal(dueLevel(new Date(NOW + 100 * H).toISOString(), NOW), "week");
  assert.equal(dueLevel(new Date(NOW - H).toISOString(), NOW), "over");
});

test("dueLabel says Overdue, not \"Due overdue\"", () => {
  assert.equal(dueLabel(new Date(NOW - H).toISOString(), NOW), "Overdue");
  assert.match(dueLabel("2026-11-05T23:59:00+05:30", NOW), /^Due tomorrow/);
  assert.equal(dueLabel("2026-11-20T10:00:00+05:30", NOW), "Due 20 Nov");
  // every screen goes through dueLabel, so no "Due " + dueText(...) is left to print "Due overdue"
  for (const f of ["src/app/mail-row.tsx", "src/app/mail-view.tsx", "src/app/overview.tsx", "src/lib/notify-plan.ts"])
    assert.doesNotMatch(readFileSync(f, "utf8"), /Due \{dueText|Due \$\{dueText/, f);
});

test("deadlineBuckets: only from mail, no noise, repeats merged, done kept", () => {
  const b = deadlineBuckets(
    [
      mail({ subject: "Fee due", deadline: "2026-11-04T23:59:00+05:30" }),
      mail({ subject: "Reminder: Fee due", deadline: "2026-11-04T23:59:00+05:30", received_at: new Date(NOW - 10 * H).toISOString() }),
      mail({ subject: "Hack closes", deadline: "2026-11-05T18:00:00+05:30" }),
      mail({ subject: "DA 2", deadline: "2026-11-09T23:59:00+05:30" }),
      mail({ subject: "Paper", deadline: "2026-11-30T23:59:00+05:30" }),
      mail({ subject: "Old", deadline: "2026-11-03T10:00:00+05:30" }),
      mail({ subject: "Ancient", deadline: "2026-10-01T10:00:00+05:30" }),
      mail({ subject: "Sale ends", deadline: "2026-11-05T10:00:00+05:30", priority: "noise" }),
      mail({ subject: "Quiz", deadline: "2026-11-06T10:00:00+05:30", is_done: true }),
    ],
    NOW,
  );
  assert.deepEqual(b.Today.map((m) => m.subject), ["Fee due"]);
  assert.deepEqual(b.Tomorrow.map((m) => m.subject), ["Hack closes"]);
  assert.deepEqual(b["This week"].map((m) => m.subject), ["DA 2"]);
  assert.deepEqual(b.Later.map((m) => m.subject), ["Paper"]);
  assert.deepEqual(b.Overdue.map((m) => m.subject), ["Old"]);
  assert.deepEqual(b.Done.map((m) => m.subject), ["Quiz"]);
  assert.equal(openDeadlines(b), 4);
});

test("initials skip small words and split hyphens", async () => {
  const { initials } = await import("../src/lib/inbox");
  assert.equal(initials("Office of DSW"), "OD");
  assert.equal(initials("ACM-VIT"), "AV");
  assert.equal(initials("Controller of Examinations"), "CE");
  assert.equal(initials(""), "?");
});

test("wrong-pile report link never carries the subject, text or a name (#33)", async () => {
  const { wrongPileLink, senderDomain } = await import("../src/lib/inbox");
  const u = new URL(wrongPileLink(senderDomain("Office.Of.DSW@VIT.ac.in"), "Later", "From VIT, no action found"));
  assert.equal(u.origin + u.pathname, "https://github.com/pranavvehmid/delt/issues/new");
  assert.equal(u.searchParams.get("labels"), "sorting");
  assert.equal(u.searchParams.get("title"), "Wrong pile: mail from vit.ac.in sorted as Later");
  const body = u.searchParams.get("body")!;
  assert.match(body, /Sender's domain:\*\* vit\.ac\.in/);
  assert.match(body, /DELT's reason:\*\* From VIT, no action found/);
  assert.match(body, /public/);
  assert.doesNotMatch(body, /@|Office|DSW/);
  assert.equal(senderDomain(null), "unknown");
});

// ---------- issue #11: more than one page ----------
import { mergeFresh, mergeMore, oldestReceived, searchPattern } from "../src/lib/inbox";
const at = (id: string, hoursAgo: number, extra: Partial<Mail> = {}) =>
  ({ id, from_name: "S", from_address: "s@vit.ac.in", subject: id, summary: "", snippet: "", received_at: new Date(Date.parse("2026-11-05T12:00:00Z") - hoursAgo * 3600_000).toISOString(), priority: "later", category: "other", deadline: null, is_done: false, unread: false, ...extra }) as Mail;

test("a fresh first page keeps older pages that were already loaded", () => {
  const loaded = [at("n2", 0.5), at("n1", 1), at("o1", 50), at("o2", 60)];
  const page = [at("new", 0), at("n1", 1, { unread: true })];
  const out = mergeFresh(loaded, page, true);
  assert.deepEqual(out.map((m) => m.id), ["new", "n1", "o1", "o2"]);
  assert.equal(out[1].unread, true, "the fresh copy wins in the newest part");
  // n2 is newer than the page edge but not in the page: it was deleted, so it goes
  assert.ok(!out.some((m) => m.id === "n2"));
});

test("when the first page is everything, it replaces the list", () => {
  assert.deepEqual(mergeFresh([at("x", 90)], [at("a", 1)], false).map((m) => m.id), ["a"]);
  assert.deepEqual(mergeFresh([at("x", 90)], [], false), []);
});

test("older pages and search hits never duplicate mail or undo a change on screen", () => {
  const loaded = [at("a", 1, { is_done: true }), at("b", 5)];
  const out = mergeMore(loaded, [at("a", 1), at("c", 100), at("b", 5)]);
  assert.deepEqual(out.map((m) => m.id), ["a", "b", "c"]);
  assert.equal(out[0].is_done, true);
});

test("the next page starts at the oldest loaded mail", () => {
  assert.equal(oldestReceived([at("a", 1), at("b", 70), at("c", 5)]), at("b", 70).received_at);
  assert.equal(oldestReceived([]), null);
});

test("search text is made safe for the database filter", () => {
  assert.equal(searchPattern("CAT-1"), "%CAT-1%");
  assert.equal(searchPattern("b.tech"), "%b%tech%");
  assert.equal(searchPattern("  register   by "), "%register%by%");
  for (const evil of ["a,subject.eq.x", "x)or(true", "%%%", "_", "a'b\"c", "a*b"]) {
    assert.doesNotMatch(searchPattern(evil).slice(1, -1), /[,()'"*_]|%%/, evil);
  }
  assert.equal(searchPattern(""), "");
  assert.equal(searchPattern("a"), "");
  assert.ok(searchPattern("x".repeat(500)).length <= 82);
});

// ---------- issue #13: sender rules ----------
import { senderRules } from "../src/lib/inbox";
test("sender rules: one per sender, the newest move wins, sorted by name", () => {
  const rows = [
    { from_address: "acm@vitstudent.ac.in", from_name: "ACM-VIT", priority: "noise" as const, received_at: "2026-11-01T10:00:00Z" },
    { from_address: "ACM@vitstudent.ac.in", from_name: "ACM-VIT", priority: "priority" as const, received_at: "2026-11-03T10:00:00Z" },
    { from_address: "coe@vit.ac.in", from_name: "'COE' via B.Tech", priority: "very_important" as const, received_at: "2026-11-02T10:00:00Z" },
    { from_address: "x@y.com", from_name: null, priority: "later" as const, received_at: "2026-11-02T10:00:00Z" },
    { from_address: null, from_name: "Ghost", priority: "later" as const, received_at: "2026-11-02T10:00:00Z" },
  ];
  assert.deepEqual(senderRules(rows), [
    { from: "acm@vitstudent.ac.in", name: "ACM-VIT", priority: "priority", mails: 2 },
    { from: "coe@vit.ac.in", name: "COE", priority: "very_important", mails: 1 },
    { from: "x@y.com", name: "x@y.com", priority: "later", mails: 1 },
  ]);
  assert.deepEqual(senderRules([]), []);
});

// ---------- Grid look: driver codes and gaps ----------
import { gapText, senderCode } from "../src/lib/inbox";
test("sender codes read like timing-tower driver codes", () => {
  assert.equal(senderCode("COE"), "COE");
  assert.equal(senderCode("Office of DSW"), "DSW");
  assert.equal(senderCode("ACM-VIT"), "ACM");
  assert.equal(senderCode("VIT"), "VIT");
  assert.equal(senderCode("Photo Club"), "PHO");
  assert.equal(senderCode("'Dean' via B.Tech"), "DEA");
  assert.equal(senderCode("Dr. Rao"), "RAO");
  assert.equal(senderCode(null), "UNK");
  assert.equal(senderCode("123"), "???");
  for (const n of ["The Placement Cell", "coursera", "Google Drive"]) assert.match(senderCode(n), /^[A-Z?]{3}$/);
});
test("#74: P1 is always the LEADER; the rest show how long they have waited", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(gapText("2026-11-01T12:00:00Z", now, true), "LEADER", "P1 leads even when it is older");
  assert.equal(gapText("2026-11-05T12:00:00Z", now), "+0M");
  assert.equal(gapText("2026-11-05T11:15:00Z", now), "+45M");
  assert.equal(gapText("2026-11-05T09:40:00Z", now), "+2H 20M");
  assert.equal(gapText("2026-11-05T10:00:00Z", now), "+2H");
  assert.equal(gapText("2026-11-03T09:00:00Z", now), "+2D 3H");
  assert.equal(gapText("2026-11-04T12:00:00Z", now), "+1D");
  assert.equal(gapText("2026-11-06T12:00:00Z", now), "+0M", "a clock a little ahead never shows a negative gap");
});

// ---------- #42: rows show the time of day, not the day again ----------
import { timeOfDay } from "../src/lib/inbox";
test("rows show the time of day in IST, lowercase", () => {
  assert.equal(timeOfDay("2026-11-04T15:37:00Z"), "9:07 pm");
  assert.equal(timeOfDay("2026-11-04T03:30:00Z"), "9:00 am");
});

// ---------- #23: Needs you ----------
import { needsYou } from "../src/lib/inbox";
test("needs you: unread urgent and soon-due mail, due soonest first, nothing done or noise", () => {
  const NOW_ = Date.parse("2026-11-05T12:00:00Z");
  const h = (n: number) => new Date(NOW_ + n * 3600_000).toISOString();
  const mails = [
    at("urgent-unread", 1, { priority: "very_important", unread: true }),
    at("urgent-read", 1, { priority: "very_important", unread: false }),
    at("due-30h", 5, { priority: "priority", deadline: h(30) }),
    at("due-10h", 9, { priority: "later", deadline: h(10) }),
    at("due-done", 2, { priority: "priority", deadline: h(5), is_done: true }),
    at("due-noise", 2, { priority: "noise", deadline: h(5) }),
    at("due-far", 2, { priority: "priority", deadline: h(100) }),
    at("overdue-2d", 2, { priority: "priority", deadline: h(-48) }),
  ];
  assert.deepEqual(needsYou(mails, NOW_).map((m) => m.id), ["due-10h", "due-30h", "urgent-unread"]);
  assert.equal(needsYou(mails, NOW_, 2).length, 2);
});

test("due times: lowercase, no :00, and no time for end-of-day deadlines (#54)", () => {
  const N = Date.parse("2026-11-05T10:00:00+05:30");
  assert.equal(dueText("2026-11-05T18:00:00+05:30", N), "today 6 pm");
  assert.equal(dueText("2026-11-06T09:30:00+05:30", N), "tomorrow 9:30 am");
  assert.equal(dueText("2026-11-06T23:59:00+05:30", N), "tomorrow");
  assert.equal(dueText("2026-11-07T00:00:00+05:30", N), "in 2 days");
});

test("deadline rows inside a bucket (#55)", async () => {
  const { dueInBucket } = await import("../src/lib/inbox");
  const N = Date.parse("2026-11-05T10:00:00+05:30");
  assert.equal(dueInBucket("2026-11-06T09:30:00+05:30", "Tomorrow", N), "9:30 am");
  assert.equal(dueInBucket("2026-11-06T23:59:00+05:30", "Tomorrow", N), "end of day");
  assert.equal(dueInBucket("2026-11-08T17:00:00+05:30", "This week", N), "Sunday 5 pm");
  assert.equal(dueInBucket("2026-11-03T17:00:00+05:30", "Overdue", N), "2 days ago");
});
