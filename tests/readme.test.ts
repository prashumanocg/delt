// #180: the README showed "231 tests passing" long after the count changed. Counts typed by hand
// go stale, so the front page shows the live CI badge and no hand-written test totals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const COUNT = /\b\d+\s*(%20)?((browser|unit)\s+)?(tests?|checks?)\b/i;

test("#180: the README and its stats image carry no hand-typed test counts", () => {
  for (const f of ["README.md", "assets/stats.svg"]) {
    const m = readFileSync(f, "utf8").match(COUNT);
    assert.equal(m, null, `${f} says "${m?.[0]}"`);
  }
});

test("#180: the README's test badge is the live one from the Tests workflow", () => {
  assert.match(readFileSync("README.md", "utf8"), /actions\/workflows\/test\.yml\/badge\.svg/);
});
