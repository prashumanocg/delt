// The browser-test job runs on an Ubuntu that this Playwright version supports. ubuntu-latest moved
// to 26.04, where `playwright install` refuses ("does not support chromium on ubuntu26.04-x64").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the browser-test job is pinned to Ubuntu 24.04, not ubuntu-latest", () => {
  const yml = readFileSync(".github/workflows/test.yml", "utf8");
  const job = yml.slice(yml.indexOf("\n  test:"), yml.indexOf("\n  db:"));
  assert.match(job, /runs-on: ubuntu-24\.04/);
});
