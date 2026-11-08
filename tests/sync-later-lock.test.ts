// #106: the "later" sync phase (AI re-checks, Gmail labels) had no lock, so two tabs could run it
// for the same student at once and spend the shared AI quota twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { claimSyncLater, finishSyncLater, syncDeps } from "../src/lib/sync";

const real = { ...syncDeps };
process.on("exit", () => Object.assign(syncDeps, real));

// A tiny stand-in for the database function: claimed unless a later phase is already running.
function fakeDb(answer: "db" | "missing") {
  const users: Record<string, { later_started_at: string | null }> = { "a@vitstudent.ac.in": { later_started_at: null } };
  return {
    users,
    rpc: async (name: string, args: { p_email: string }) => {
      if (answer === "missing") return { data: null, error: { message: "function claim_sync_later does not exist" } };
      assert.equal(name, "claim_sync_later");
      const u = users[args.p_email];
      if (!u || u.later_started_at) return { data: null, error: null };
      u.later_started_at = new Date().toISOString();
      return { data: true, error: null };
    },
    from: () => ({ update: (v: { later_started_at: null }) => ({ eq: async (_c: string, email: string) => void Object.assign(users[email], v) }) }),
  };
}

test("#106: a second tab can't start the later phase while one runs; it can once that finishes", async () => {
  const db = fakeDb("db");
  Object.assign(syncDeps, { db });
  assert.equal(await claimSyncLater("a@vitstudent.ac.in"), true);
  assert.equal(await claimSyncLater("a@vitstudent.ac.in"), false);
  await finishSyncLater("a@vitstudent.ac.in");
  assert.equal(db.users["a@vitstudent.ac.in"].later_started_at, null);
  assert.equal(await claimSyncLater("a@vitstudent.ac.in"), true);
});

test("#106: on a database without the function yet, the later phase still runs", async () => {
  Object.assign(syncDeps, { db: fakeDb("missing") });
  assert.equal(await claimSyncLater("a@vitstudent.ac.in"), true);
});

test("#106: the route claims before the later phase, answers busy if taken, and always lets go", () => {
  const src = readFileSync("src/app/api/sync/route.ts", "utf8");
  const later = src.slice(src.indexOf('=== "later"'), src.indexOf("claimSync(email, 10)"));
  const claim = later.indexOf("claimSyncLater(email)"), run = later.indexOf('syncUser(email, "later")');
  assert.ok(claim > 0 && run > claim, "claims before running");
  assert.match(later, /if \(!\(await claimSyncLater\(email\)\)\) return NextResponse\.json\(\{ busy: true[^)]*\{ status: 429 \}\)/);
  assert.match(later, /finally \{\s*await finishSyncLater\(email\);/);
});

test("#106: schema.sql creates the lock column and claim_sync_later, callable only by the server", () => {
  const sql = readFileSync("supabase/schema.sql", "utf8");
  assert.match(sql, /alter table users add column if not exists later_started_at timestamptz;/);
  assert.match(sql, /create or replace function claim_sync_later\(p_email text, p_lock_seconds int default 150\)/);
  assert.match(sql, /revoke all on function claim_sync_later\(text, int\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function claim_sync_later\(text, int\) to service_role;/);
});
