// #171: throwaway zz-* probes must not run with the real browser suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../playwright.config";

const ignored = (pattern: unknown, file: string): boolean =>
  Array.isArray(pattern) ? pattern.some((p) => ignored(p, file)) : pattern instanceof RegExp && pattern.test(file);

test("#171: every project skips zz-* probes and keeps the real specs", () => {
  assert.equal(config.testDir, "e2e");
  assert.ok(config.projects?.length);
  for (const p of config.projects ?? []) {
    const pattern = p.testIgnore ?? config.testIgnore;
    for (const f of ["/repo/e2e/zz-probe.spec.ts", "C:\\repo\\e2e\\zz-shot.spec.ts"]) assert.ok(ignored(pattern, f), `${p.name} runs ${f}`);
    for (const f of ["/repo/e2e/inbox.spec.ts", "/repo/e2e/fuzz-zz.spec.ts"]) assert.ok(!ignored(pattern, f), `${p.name} skips ${f}`);
  }
});
