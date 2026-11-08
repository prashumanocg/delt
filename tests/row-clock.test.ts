// #165: the 30-second clock re-rendered every row. A row now redraws on a tick only when a time,
// deadline or gap it shows changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameRow } from "../src/lib/inbox";

const MIN = 60_000, H = 60 * MIN;
const noonIST = Date.parse("2026-11-10T12:00:00+05:30");
const on = { open() {}, read() {}, done() {} };
type Row = { m: { received_at: string; deadline: string | null; is_done: boolean }; now: number; pos?: number; look?: string; on?: unknown; current?: boolean };
const row = (m: { received_at: string; deadline?: string | null; is_done?: boolean }, now: number, extra: Partial<Row> = {}): Row => ({
  m: { deadline: null, is_done: false, ...m },
  now,
  pos: 3,
  on,
  look: "minimal",
  ...extra,
});

test("#165: a tick that changes nothing on the row skips it", () => {
  const m = { received_at: new Date(noonIST - 3 * 24 * H).toISOString() }; // three days ago: "7 Nov"
  const a = row(m, noonIST), b = { ...row(m, noonIST + 30_000), m: a.m };
  assert.equal(sameRow(a, b), true);
});

test("#165: the row redraws when its day label turns over at midnight (IST)", () => {
  const m = { received_at: new Date(noonIST - 2 * H).toISOString() };
  const beforeMidnight = Date.parse("2026-11-10T23:59:45+05:30");
  const a = row(m, beforeMidnight), b = { ...row(m, beforeMidnight + 30_000), m: a.m };
  assert.equal(sameRow(a, b), false); // "10:00 am" becomes "Yesterday"
});

test("#165: the row redraws when its deadline passes", () => {
  const m = { received_at: new Date(noonIST - H).toISOString(), deadline: new Date(noonIST + 10_000).toISOString() };
  const a = row(m, noonIST), b = { ...row(m, noonIST + 30_000), m: a.m };
  assert.equal(sameRow(a, b), false); // "today 12:00 pm" becomes "overdue"
});

test("#165: in Grid the gap counts minutes, so recent rows redraw when the minute changes", () => {
  const m = { received_at: new Date(noonIST - 5 * MIN - 10_000).toISOString() };
  const a = row(m, noonIST, { look: "grid" }), b = { ...row(m, noonIST + 60_000, { look: "grid" }), m: a.m };
  assert.equal(sameRow(a, b), false); // +5M -> +6M
  const c = { ...row(m, noonIST + 30_000), m: a.m }, d = { ...c, now: noonIST + 31_000 };
  assert.equal(sameRow(c, d), true); // Minimal shows no gap
});

test("#165: any other prop change still redraws the row", () => {
  const m = { received_at: new Date(noonIST - 3 * 24 * H).toISOString() };
  const a = row(m, noonIST);
  assert.equal(sameRow(a, { ...a, pos: 4 }), false);
  assert.equal(sameRow(a, { ...a, m: { ...a.m } }), false);
  assert.equal(sameRow(a, { ...a, look: "glyph" }), false);
  assert.equal(sameRow(a, { ...a, current: true }), false);
});

test("#165: MailRow is memoised with sameRow", () => {
  assert.match(readFileSync("src/app/mail-row.tsx", "utf8"), /\}, sameRow\);/);
});
