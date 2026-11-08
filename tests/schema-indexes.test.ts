// #121: the filters every sync and notify run use must have an index, or each run reads every
// stored mail of the student. Partial indexes keep only the rows each query is looking for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/schema.sql", "utf8").replace(/--.*$/gm, "").replace(/\s+/g, " ");
const has = (cols: string, where: string) =>
  new RegExp(`create index if not exists \\w+ on emails \\(${cols}\\) where ${where};`, "i").test(sql);

test("#121: sender rules, unlabelled, unread and un-notified mail each have a partial index", () => {
  assert.ok(has("user_email, received_at desc", "user_corrected"), "sender rules (user_corrected)");
  assert.ok(has("user_email, received_at desc", "not gmail_labeled"), "label backfill (gmail_labeled = false)");
  assert.ok(has("user_email, received_at", "unread"), "unread mirror (unread = true)");
  assert.ok(has("user_email", "priority = 'very_important' and not notified"), "urgent notifications (notified = false)");
});
