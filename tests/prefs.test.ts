import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, OPTIONS, PREPAINT, parsePrefs, resolveMode, toDataset, type Prefs } from "../src/lib/prefs";

test("defaults: Minimal, light, auto accent, normal size, comfortable", () => {
  assert.deepEqual(parsePrefs(null), DEFAULTS);
  assert.equal(DEFAULTS.look, "minimal");
  assert.equal(DEFAULTS.mode, "light");
});

test("junk in storage never breaks the app", () => {
  for (const raw of ["", "{", "null", "[]", "42", '"x"', '{"look":"neon","mode":7,"accent":null}', '{"__proto__":{"look":"glyph"}}']) {
    assert.deepEqual(parsePrefs(raw), DEFAULTS, raw);
  }
});

test("valid saved values are kept, invalid ones fall back one by one", () => {
  const p = parsePrefs(JSON.stringify({ look: "glyph", mode: "auto", accent: "chartreuse", size: "large", density: "compact" }));
  assert.deepEqual(p, { look: "glyph", mode: "auto", accent: "auto", size: "large", density: "compact" });
});

test("old theme keys upgrade: calm -> minimal, glyph stays, light/dark kept", () => {
  assert.equal(parsePrefs(null, { look: "calm", theme: "dark" }).look, "minimal");
  assert.equal(parsePrefs(null, { look: "calm", theme: "dark" }).mode, "dark");
  assert.equal(parsePrefs(null, { look: "glyph", theme: "light" }).look, "glyph");
  // new prefs win over legacy keys
  assert.equal(parsePrefs('{"look":"minimal"}', { look: "glyph" }).look, "minimal");
});

test("Extra dark is a dark theme with a pure-black tone", () => {
  assert.equal(parsePrefs(JSON.stringify({ mode: "black" })).mode, "black");
  const d = toDataset({ ...DEFAULTS, mode: "black" }, false);
  assert.deepEqual([d.theme, d.tone], ["dark", "black"]);
  assert.equal(toDataset({ ...DEFAULTS, mode: "dark" }, false).tone, "normal");
});

test("auto follows the phone", () => {
  assert.equal(resolveMode("auto", true), "dark");
  assert.equal(resolveMode("auto", false), "light");
  assert.equal(resolveMode("dark", false), "dark");
  assert.equal(toDataset({ ...DEFAULTS, mode: "auto" }, true).theme, "dark");
});

// Runs the inline <head> script against a fake browser and checks it matches parsePrefs.
function runPrepaint(store: Record<string, string>, systemDark: boolean) {
  const dataset: Record<string, string> = {};
  const fake = {
    document: { documentElement: { dataset } },
    localStorage: { getItem: (k: string) => (k in store ? store[k] : null) },
    window: { matchMedia: () => ({ matches: systemDark }) },
  };
  new Function("document", "localStorage", "window", PREPAINT)(fake.document, fake.localStorage, fake.window);
  return dataset;
}

test("the before-paint script agrees with parsePrefs for every combination", () => {
  let n = 0;
  for (const look of OPTIONS.look)
    for (const mode of OPTIONS.mode)
      for (const accent of OPTIONS.accent)
        for (const size of OPTIONS.size)
          for (const density of OPTIONS.density)
            for (const dark of [true, false]) {
              const p: Prefs = { look, mode, accent, size, density };
              const raw = JSON.stringify(p);
              assert.deepEqual(runPrepaint({ "delt-prefs": raw }, dark), toDataset(parsePrefs(raw), dark));
              n++;
            }
  assert.equal(n, OPTIONS.look.length * 4 * OPTIONS.accent.length * 2 * 2 * 2);
});

test("the before-paint script handles empty, broken and legacy storage", () => {
  assert.deepEqual(runPrepaint({}, false), toDataset(DEFAULTS, false));
  assert.deepEqual(runPrepaint({ "delt-prefs": "{oops" }, false), toDataset(DEFAULTS, false));
  assert.deepEqual(runPrepaint({ "delt-look": "calm", "delt-theme": "dark" }, false), toDataset(parsePrefs(null, { look: "calm", theme: "dark" }), false));
  assert.deepEqual(runPrepaint({ "delt-look": "glyph" }, true), toDataset(parsePrefs(null, { look: "glyph" }), true));
});

test("Extra dark paints the phone's status bar black before the app loads (#26)", () => {
  const metas = [0, 1].map(() => {
    const a: Record<string, string> = { content: "#ffffff", media: "(prefers-color-scheme: light)" };
    return { a, setAttribute: (k: string, v: string) => (a[k] = v), removeAttribute: (k: string) => delete a[k] };
  });
  const run = (prefs: object) => {
    const fake = {
      document: { documentElement: { dataset: {} }, readyState: "complete", querySelectorAll: () => metas },
      localStorage: { getItem: (k: string) => (k === "delt-prefs" ? JSON.stringify(prefs) : null) },
      window: { matchMedia: () => ({ matches: false }) },
    };
    new Function("document", "localStorage", "window", PREPAINT)(fake.document, fake.localStorage, fake.window);
    return metas.map((m) => m.a);
  };
  for (const look of ["minimal", "glyph"]) {
    assert.deepEqual(run({ look, mode: "black" }), [{ content: "#000000" }, { content: "#000000" }]);
  }
  assert.equal(run({ look: "minimal", mode: "light" })[0].content, "#fafaf9");
  assert.equal(run({ look: "minimal", mode: "dark" })[0].content, "#0d0e10");
});

test("Grid (F1-inspired) is always dark, and only offers its own driver colours", () => {
  assert.equal(toDataset({ ...DEFAULTS, look: "grid", mode: "light" }, false).theme, "dark");
  assert.equal(toDataset({ ...DEFAULTS, look: "grid", mode: "auto" }, false).theme, "dark");
  assert.equal(toDataset({ ...DEFAULTS, look: "grid", mode: "black" }, false).tone, "black");
  assert.equal(toDataset({ ...DEFAULTS, look: "grid", accent: "papaya" }, false).accent, "papaya");
  assert.equal(toDataset({ ...DEFAULTS, look: "grid", accent: "purple" }, false).accent, "auto");
  assert.equal(toDataset({ ...DEFAULTS, look: "minimal", accent: "papaya" }, false).accent, "auto");
});
