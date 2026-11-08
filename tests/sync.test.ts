// #39: syncUser itself, against a fake Gmail and an in-memory database.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { syncDeps, syncUser } from "../src/lib/sync";
import type { ParsedMessage } from "../src/lib/gmail";
import { FakeDb } from "./fake-db";

const ME = "a.student@vitstudent.ac.in";
const OTHER = "b.student@vitstudent.ac.in";
const real = { ...syncDeps };
let db: FakeDb;
let inbox: ParsedMessage[];
let failing: Set<string>;
let aiCalls: number;
let labeled: string[];
let labelCalls = 0;

const msg = (i: number, p: Partial<ParsedMessage> = {}): ParsedMessage => ({
  id: `m${i}`, threadId: `m${i}`, fromName: "Office", fromAddress: "office@vit.ac.in", subject: `Library timings ${i}`, snippet: "", body: "", unread: false,
  receivedAt: new Date(Date.now() - (i + 1) * 60_000), ...p,
});

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret";
  delete process.env.TOKEN_ENCRYPTION_KEY;
  process.env.GEMINI_API_KEY = "shared-key";
  inbox = [];
  failing = new Set();
  aiCalls = 0;
  labeled = [];
  labelCalls = 0;
  db = new FakeDb({
    users: [
      { email: ME, refresh_token: "1//plain-token", name: "A B STUDENT 26BCE0001", last_synced_at: null, ai_consent: null, gemini_key_enc: null, ai_day: null, ai_calls: 0 },
      { email: OTHER, refresh_token: "1//other", name: "C 26BCE0002", last_synced_at: null },
    ],
    emails: [{ id: "m0", user_email: OTHER, priority: "noise", unread: true, user_corrected: false, sorted_by: "rules", gmail_labeled: true, received_at: new Date().toISOString() }],
    app_state: [],
  });
  Object.assign(syncDeps, {
    db: db as unknown as typeof real.db,
    getAccessToken: async () => "access",
    listMessageIds: async (_t: string, q: string, max = 100) => {
      const after = Number(q.match(/after:(\d+)/)?.[1] ?? 0) * 1000;
      return inbox
        .filter((m) => m.receivedAt.getTime() > after && (!q.includes("is:unread") || m.unread))
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
        .slice(0, max)
        .map((m) => m.id);
    },
    getMessage: async (_t: string, id: string) => {
      if (failing.has(id)) throw new Error(`Gmail /messages/${id} failed (500): oops`);
      return inbox.find((m) => m.id === id)!;
    },
    ensureLabels: async () => ({ very_important: "L1", priority: "L2", later: "L3", noise: "L4" }),
    setPriorityLabel: async (_t: string, id: string) => void labeled.push(id),
    setPriorityLabelMany: async (_t: string, ids: string[]) => void (labelCalls++, labeled.push(...ids)),
    classifyWithAI: async () => {
      aiCalls++;
      return { priority: "later", category: "other", summary: "", deadline: null, reason: "AI" };
    },
  });
});
process.on("exit", () => Object.assign(syncDeps, real));

const mine = () => db.rows("emails").filter((r) => r.user_email === ME);
const user = () => db.rows("users").find((r) => r.email === ME)!;

test("saves new mail for this student only, sorted by the rules, and labels it", async () => {
  inbox = [msg(1), msg(2, { subject: "CAT-1 exam schedule released" })];
  const r = await syncUser(ME, "full");
  assert.equal(r.sorted, 2);
  assert.equal(mine().length, 2);
  assert.equal(mine().find((m) => m.id === "m2")!.priority, "very_important");
  assert.equal(db.rows("emails").filter((m) => m.user_email === OTHER).length, 1, "the other student's mail is untouched");
  assert.deepEqual(labeled.sort(), ["m1", "m2"]);
  assert.ok(labelCalls <= 2, `one Gmail call per pile (#109), got ${labelCalls}`);
  assert.ok(user().last_synced_at, "the window closes when everything is in");
});

test("a big first sync finishes over several runs without skipping anything (#28)", async () => {
  inbox = Array.from({ length: 320 }, (_, i) => msg(i + 1));
  const first = await syncUser(ME, "quick");
  assert.equal(first.sorted, 150);
  assert.equal(first.backlog, 170);
  assert.equal(user().last_synced_at, null, "window stays open");
  await syncUser(ME, "quick");
  const third = await syncUser(ME, "quick");
  assert.equal(third.backlog, 0);
  assert.equal(new Set(mine().map((m) => m.id)).size, 320);
  assert.ok(user().last_synced_at);
});

test("a failed download keeps the window open and is retried next time", async () => {
  inbox = [msg(1), msg(2)];
  failing.add("m2");
  await syncUser(ME, "quick");
  assert.equal(user().last_synced_at, null);
  failing.clear();
  await syncUser(ME, "quick");
  assert.deepEqual(mine().map((m) => m.id).sort(), ["m1", "m2"]);
  assert.ok(user().last_synced_at);
});

test("no AI without the student's yes; with it, the shared allowance is counted (#31, #3)", async () => {
  inbox = [msg(1, { subject: "Something unclear", body: "hello" })];
  await syncUser(ME, "full");
  assert.equal(aiCalls, 0);
  user().ai_consent = true;
  inbox.push(msg(0, { subject: "Another unclear one", body: "hi" }));
  await syncUser(ME, "full");
  assert.ok(aiCalls > 0);
  assert.equal(user().ai_calls, aiCalls);
});

test("'quick' never calls the AI or labels; 'later' does (#21)", async () => {
  user().ai_consent = true;
  inbox = [msg(1, { subject: "Hackathon registrations open", body: "Register by 30 Nov 2026" })];
  await syncUser(ME, "quick");
  assert.equal(aiCalls, 0);
  assert.equal(labeled.length, 0);
  await syncUser(ME, "later");
  assert.ok(labeled.includes("m1"));
});

test("unread state follows Gmail within the window (#29)", async () => {
  inbox = [msg(1, { unread: true }), msg(2, { unread: true })];
  await syncUser(ME, "quick");
  assert.deepEqual(mine().filter((m) => m.unread).map((m) => m.id).sort(), ["m1", "m2"]);
  inbox[0].unread = false; // read m1 in Gmail
  await syncUser(ME, "quick");
  assert.deepEqual(mine().filter((m) => m.unread).map((m) => m.id), ["m2"]);
});

test("a plain-text token from before #27 is re-encrypted on the first sync", async () => {
  await syncUser(ME, "quick");
  assert.match(String(user().refresh_token), /^v[12]\./);
  assert.ok(!String(user().refresh_token).includes("plain-token"));
});

test("#89: a first sync reaches back six weeks, not two", async () => {
  const { FIRST_SYNC_DAYS } = await import("../src/lib/sync");
  assert.equal(FIRST_SYNC_DAYS, 45);
  const old = msg(7);
  old.receivedAt = new Date(Date.now() - 30 * 86400_000); // a notice from a month ago
  inbox = [old];
  await syncUser(ME, "quick");
  assert.ok(mine().some((m) => m.id === "m7"), "a month-old mail is brought in on the first sync");
});

test("#85: the app's 'later' step AI-checks new mail the rules filed low but weren't sure about", async () => {
  user().ai_consent = true;
  inbox = [
    msg(1, { subject: "Quick note", fromAddress: "someone@vit.ac.in", body: "Please see this." }), // unsure, lands low
    msg(2, { subject: "50% off on online courses", fromAddress: "no-reply@coursera.org", body: "Enroll today and save." }), // sure: Noise
  ];
  await syncUser(ME, "quick");
  const low = mine().filter((m) => m.priority === "later" || m.priority === "noise").map((m) => m.id);
  assert.ok(low.length >= 1);
  await syncUser(ME, "later");
  const checked = mine().filter((m) => m.sorted_by === "ai").map((m) => m.id);
  assert.ok(!checked.includes("m2"), "the confident Noise mail isn't sent to the AI");
  if (low.includes("m1")) assert.ok(checked.includes("m1"), "the unsure low mail is checked");
});

// #118: record each write to the users row (its column names); optionally refuse some columns,
// like an older database that doesn't have them yet.
function watchUserWrites(refuse: string[] = []) {
  const writes: string[][] = [];
  const from = db.from.bind(db);
  db.from = ((t: string) => {
    const q = from(t);
    if (t !== "users") return q;
    const update = q.update.bind(q);
    q.update = ((v: Record<string, unknown>) => {
      writes.push(Object.keys(v).sort());
      if (Object.keys(v).some((k) => refuse.includes(k))) return { eq: async () => ({ data: null, error: { message: "column does not exist" } }) };
      return update(v);
    }) as typeof q.update;
    return q;
  }) as typeof db.from;
  return writes;
}

test("#118: a sync ends with one write to the users row (sync time, problem note and AI usage)", async () => {
  user().ai_consent = true;
  user().refresh_token = "sealed-already"; // so the one-time token re-seal isn't counted
  inbox = [msg(1, { subject: "Quick note", fromAddress: "someone@vit.ac.in", body: "Please see this." })];
  const writes = watchUserWrites();
  await syncUser(ME);
  const end = writes.filter((w) => w.some((k) => ["last_synced_at", "last_sync_error", "ai_calls"].includes(k)));
  assert.equal(end.length, 1, JSON.stringify(writes));
  assert.ok(end[0].includes("last_synced_at") && end[0].includes("last_sync_error"));
  assert.ok(user().last_synced_at, "the sync time is saved");
  if (aiCalls > 0) assert.equal(user().ai_calls, aiCalls, "AI usage is saved in the same write");
});

test("#118: on a database without a newer column, the sync time is still saved", async () => {
  user().refresh_token = "sealed-already";
  inbox = [msg(1)];
  const writes = watchUserWrites(["last_sync_error"]);
  await syncUser(ME, "quick");
  assert.ok(user().last_synced_at, "saved by the one-column fallback write");
  assert.deepEqual(writes.at(-2), ["last_synced_at"]);
});
