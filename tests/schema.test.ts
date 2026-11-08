// A fresh database made from supabase/schema.sql must have every column the app writes.
// Found on a new copy of DELT: sign-in saved `users.name`, schema.sql never created it, and every
// sign-in failed with "Could not find the 'name' column of 'users' in the schema cache" (#138's message).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync("supabase/schema.sql", "utf8").toLowerCase();

/** Columns per table: from `create table` bodies and `alter table … add column`. */
function schemaColumns() {
  const cols = new Map<string, Set<string>>();
  const add = (t: string, c: string) => (cols.get(t) ?? cols.set(t, new Set()).get(t)!).add(c);
  for (const [, t, body] of schema.matchAll(/create table if not exists (\w+) \(([\s\S]*?)\n\);/g))
    for (const [, c] of body.matchAll(/^\s+(\w+)\s+\w/gm)) if (c !== "primary") add(t, c);
  for (const [, t, c] of schema.matchAll(/alter table (\w+) add column if not exists (\w+)/g)) add(t, c);
  return cols;
}

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

/** The object literal starting at `i` (which must be "{"), braces balanced. */
function objectAt(src: string, i: number) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1);
  }
  return "";
}

/** Top-level keys of an object literal (comments removed, nested objects skipped). */
function keys(obj: string) {
  const body = obj.slice(1, -1).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let j = 0; j <= body.length; j++) {
    const ch = body[j];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    else if ((ch === "," || j === body.length) && depth === 0) {
      const m = body.slice(start, j).match(/^\s*(\w+)\s*:/) ?? body.slice(start, j).match(/^\s*(\w+)\s*$/);
      if (m) out.push(m[1]);
      start = j + 1;
    }
  }
  return out;
}

test("every column the app writes in a literal upsert/update/insert exists in schema.sql", () => {
  const cols = schemaColumns();
  const missing: string[] = [];
  let checked = 0;
  for (const f of files("src")) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/from\("(\w+)"\)\s*\.(?:upsert|update|insert)\(\s*\{/g)) {
      const table = m[1];
      for (const k of keys(objectAt(src, m.index! + m[0].length - 1))) {
        checked++;
        if (!cols.get(table)?.has(k)) missing.push(`${f}: ${table}.${k}`);
      }
    }
  }
  assert.ok(checked >= 10, `the check found ${checked} written columns, so it is really looking`);
  assert.deepEqual(missing, []);
});

test("sign-in's columns on users are in schema.sql (email, refresh_token, name, access_revoked)", () => {
  const users = schemaColumns().get("users")!;
  for (const c of ["email", "refresh_token", "name", "access_revoked"]) assert.ok(users.has(c), `users.${c}`);
});
