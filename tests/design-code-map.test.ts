// #182: docs/DESIGN.md's code map had fallen behind the code. Every file in src/app and src/lib
// must be named there, and every file it names must still exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const doc = readFileSync("docs/DESIGN.md", "utf8");
const map = doc.slice(doc.indexOf("## 6. Code map"));
const end = map.indexOf("\n## ", 5);
const section = end === -1 ? map : map.slice(0, end);
const code = (dir: string) => readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));

test("#182: the code map names every file in src/app and src/lib", () => {
  for (const dir of ["src/app", "src/lib"]) {
    for (const f of code(dir)) assert.ok(section.includes(`\`${f}\``) || section.includes(`${dir}/${f}`), `${dir}/${f} is missing from DESIGN.md's code map`);
  }
});

test("#182: every file the code map names still exists", () => {
  const all = new Set([...code("src/app"), ...code("src/lib"), ...readdirSync("src/app/styles"), ...readdirSync("src/app")]);
  for (const [, name] of section.matchAll(/`(?:[\w./-]+\/)?([\w-]+\.(?:tsx?|css|js))`/g)) {
    assert.ok(all.has(name) || existsSync(`public/${name}`), `DESIGN.md names ${name}, which no longer exists`);
  }
});
