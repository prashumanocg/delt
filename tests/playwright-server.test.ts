// #170: browser tests run on a production build, locally too. The dev server compiles each page
// on first visit, so local runs timed out and contributors saw failures CI never had.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// The config reads CI and PW_DEV when it loads, so each case loads it in a fresh process.
function envWith(set: Record<string, string>) {
  const e = { ...process.env };
  delete e.CI;
  delete e.PW_DEV;
  return Object.assign(e, set);
}
function serverCommand(env: Record<string, string>): string {
  const code = `import("./playwright.config.ts").then((m) => console.log((m.default.default ?? m.default).webServer.command))`;
  return execFileSync(process.execPath, ["--import", "tsx", "-e", code], { env: envWith(env), encoding: "utf8" }).trim();
}

test("#170: a local run builds and serves the production app, not the dev server", () => {
  const cmd = serverCommand({});
  assert.match(cmd, /npm run build|next build/);
  assert.match(cmd, /next start/);
  assert.doesNotMatch(cmd, /next dev/);
});

test("#170: CI serves the build its own step made; PW_DEV=1 still offers the dev server", () => {
  assert.match(serverCommand({ CI: "1" }), /^npx next start/);
  assert.match(serverCommand({ PW_DEV: "1" }), /next dev/);
});
