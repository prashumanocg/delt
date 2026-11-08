// #185: the package carries the app's name, so npm, the lockfile and error logs say "delt".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#185: package.json and the lockfile are named delt", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(pkg.name, "delt");
  assert.equal(lock.name, "delt");
  assert.equal(lock.packages[""].name, "delt");
});
