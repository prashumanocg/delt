// #119: every first-page inbox load wrote users.last_seen_at and then read the user back: two
// queries, one a write, every few minutes per open app. Now it's one read, and the write happens
// at most once an hour (last seen only decides "active this week" for background sync).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTIVE_WINDOW_MS, SEEN_EVERY_MS, seenIsStale } from "../src/lib/schedule";

const now = Date.parse("2026-11-10T12:00:00Z");
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

test("#119: last seen is rewritten only when missing or an hour old", () => {
  assert.equal(seenIsStale(null, now), true);
  assert.equal(seenIsStale(undefined, now), true);
  assert.equal(seenIsStale(ago(5), now), false);
  assert.equal(seenIsStale(ago(59), now), false);
  assert.equal(seenIsStale(ago(60), now), true);
  assert.equal(seenIsStale(ago(60 * 24), now), true);
});

test("#119: the hourly write can't make an active student look inactive", () => {
  assert.ok(SEEN_EVERY_MS * 24 <= ACTIVE_WINDOW_MS);
});

test("#119: the first inbox page reads the user once and writes last_seen_at only when stale", () => {
  const src = readFileSync("src/app/api/emails/route.ts", "utf8");
  const get = src.slice(src.indexOf("export async function GET"), src.indexOf("const Patch"));
  assert.equal(get.match(/from\("users"\)\.select\(/g)?.length, 1, "one read of the user");
  assert.equal(get.match(/from\("users"\)\.update\(/g)?.length, 1, "one write, at most");
  const read = get.indexOf('from("users").select('), write = get.indexOf('from("users").update(');
  assert.ok(read < write, "reads first, so it knows whether last seen is stale");
  assert.match(get.slice(read, write + 80), /if \(userError \|\| seenIsStale\(u\?\.last_seen_at, Date\.now\(\)\)\) await db\.from\("users"\)\.update\(\{ last_seen_at/);
});
