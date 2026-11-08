// Issue #7: every row's text must be readable (WCAG 4.5:1 for normal text, 3:1 for 24px+),
// while the four piles still look clearly different. Reads the real numbers from the style files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// app.css only imports the style files; read them in the same order.
const files = [...readFileSync("src/app/app.css", "utf8").matchAll(/@import "\.\/(styles\/[\w-]+\.css)";/g)].map((m) => m[1]);
const css = files.map((f) => readFileSync(`src/app/${f}`, "utf8")).join("\n");

test("the styles are split into one file per look, in cascade order", () => {
  assert.deepEqual(files, ["styles/base.css", "styles/look-shared.css", "styles/look-minimal.css", "styles/look-glyph.css", "styles/themes.css", "styles/look-grid.css", "styles/look-slate.css"]);
  assert.ok(!css.includes(":not([data-look"), "say which looks a rule is for, not which it isn't");
  assert.ok(!/data-look/.test(readFileSync("src/app/styles/base.css", "utf8")), "base.css has no look-specific rules");
});

type RGB = [number, number, number];
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const hex = (h: string): RGB => {
  const s = h.replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as RGB;
};
const mix = (ink: RGB, bg: RGB, a: number): RGB => ink.map((v, i) => bg[i] + a * (v - bg[i])) as RGB;

/** Custom properties declared in the first rule whose selector is exactly `sel`. */
function vars(sel: string) {
  const i = css.indexOf(sel + " {");
  assert.ok(i >= 0, `no rule for ${sel}`);
  const body = css.slice(i, css.indexOf("}", i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const M = ':root:is([data-look="minimal"], [data-look="grid"])';
const light = vars(M);
const dark = { ...light, ...vars(`${M}[data-theme="dark"]`) };
const black = { ...dark, ...vars(`${M}[data-tone="black"]`) };
const THEMES = { Light: light, Dark: dark, "Extra dark": black };

// Pile levels and the two ink formulas, as written in the row rule.
const rowRule = css.slice(css.indexOf(`${M} .row { --lv`), css.indexOf(`${M} .when {`));
const level = (cls: string) => Number(rowRule.match(new RegExp(`\\.${cls} \\{ --lv: ([\\d.]+)`))?.[1]);
const LEVELS = { Urgent: 1, Priority: level("ink-priority"), Later: level("ink-later"), Noise: level("ink-noise") };
const ink = (floor: number, lv: number) => floor + (1 - floor) * lv; // --a
const quiet = (floor: number, lv: number) => floor + (1 - floor) * lv * 0.45; // --a2

test("the row rule still uses the formulas this test checks", () => {
  assert.match(rowRule, /--a: calc\(var\(--floor\) \+ \(1 - var\(--floor\)\) \* var\(--lv\)\)/);
  assert.match(rowRule, /--a2: calc\(var\(--floor\) \+ \(1 - var\(--floor\)\) \* var\(--lv\) \* 0\.45\)/);
  for (const [k, v] of Object.entries(LEVELS)) assert.ok(v >= 0 && v <= 1, `${k} level ${v}`);
});

test("every pile's subject, sender, summary and time pass 4.5:1 in Light, Dark and Extra dark", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    const fg = t.ink.split(/\s+/).map(Number) as RGB;
    const bg = hex(t.bg);
    const floor = Number(t.floor);
    for (const [pile, lv] of Object.entries(LEVELS)) {
      for (const [what, a] of [["subject", ink(floor, lv)], ["sender/summary/time", quiet(floor, lv)]] as const) {
        const r = ratio(mix(fg, bg, a), bg);
        assert.ok(r >= 4.5, `${name} ${pile} ${what}: ${r.toFixed(2)}:1`);
      }
    }
  }
});

test("the big section names pass 3:1 (large text) when not selected", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    const r = ratio(mix(t.ink.split(/\s+/).map(Number) as RGB, hex(t.bg), Number(t["floor-lg"])), hex(t.bg));
    assert.ok(r >= 3, `${name}: ${r.toFixed(2)}:1`);
  }
  assert.match(css, /\.mast button \{ font: 400 34px/, "the section names are 24px or more");
});

test("the four piles still look different: ink steps apart, plus size and weight", () => {
  for (const [name, t] of Object.entries(THEMES)) {
    const floor = Number(t.floor);
    const steps = Object.values(LEVELS).map((lv) => ink(floor, lv));
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i - 1] - steps[i] >= 0.08, `${name}: piles ${i - 1} and ${i} too close in ink`);
  }
  assert.match(rowRule, /\.ink-later \{[^}]*--subj: 16px/);
  // #69: Noise is the type scale's smallest step; its weight stays 400 (no faint type)
  assert.match(rowRule, /\.ink-noise \{[^}]*--subj: 14px; --w: 400/);
});

test("no faint fixed-alpha text is left in the Minimal look", () => {
  // any rgb(var(--ink) / 0.x) used as a text colour must be at least the floor
  const found: number[] = [];
  for (const line of css.split("\n").filter((l) => l.startsWith(M))) {
    for (const m of line.matchAll(/(?:^|[{;]\s*)color: rgb\(var\(--ink\) \/ (0\.\d+)\)/g)) {
      found.push(Number(m[1]));
      assert.ok(Number(m[1]) >= 0.64, `text at ${m[1]}: ${line.slice(0, 120)}`);
    }
  }
  assert.ok(found.length >= 2, "the check found the hover colours, so it is really looking");
});

test("Glyph look: muted text passes 4.5:1 on its cards", () => {
  const gDark = vars(':root[data-look="glyph"]');
  const gLight = { ...gDark, ...vars(':root[data-look="glyph"][data-theme="light"]') };
  for (const [name, t] of Object.entries({ dark: gDark, light: gLight })) {
    if (!t.muted || !t.surface) continue;
    for (const bg of [t.bg, t.surface]) {
      const r = ratio(hex(t.muted), hex(bg));
      assert.ok(r >= 4.5, `Glyph ${name} muted on ${bg}: ${r.toFixed(2)}:1`);
    }
  }
});

test("Grid (F1-inspired): every pile and the due dates are readable in Dark and Extra dark", () => {
  const G = ':root[data-look="grid"][data-theme][data-tone]';
  const dark = vars(G);
  const black = { ...dark, ...vars(':root[data-look="grid"][data-theme][data-tone="black"]') };
  for (const [name, t] of Object.entries({ Dark: dark, "Extra dark": black })) {
    const fg = t.ink.split(/\s+/).map(Number) as RGB;
    const bg = hex(t.bg);
    const floor = Number(t.floor);
    for (const [pile, lv] of Object.entries(LEVELS)) {
      for (const a of [ink(floor, lv), quiet(floor, lv)]) {
        // rows sit on --surface, which is lighter than the page: check against that
        for (const ground of [bg, hex(t.surface)]) {
          const r = ratio(mix(fg, ground, a), ground);
          assert.ok(r >= 4.5, `Grid ${name} ${pile}: ${r.toFixed(2)}:1`);
        }
      }
    }
    for (const c of ["due-soon", "due-week"]) assert.ok(ratio(hex(t[c]), hex(t.surface)) >= 4.5, `Grid ${name} ${c}`);
  }
});

test("Grid: text on every driver colour (buttons, counts, toasts) is readable", () => {
  const rules = [...css.matchAll(/:root\[data-look="grid"\]\[data-theme\]\[data-accent="(\w+)"\] \{ --accent: (#[0-9a-f]{6}); --on-accent: (#[0-9a-f]{6}); \}/g)];
  assert.ok(rules.length >= 7, "found the driver colours");
  for (const [, key, accent, on] of rules) {
    const r = ratio(hex(accent), hex(on));
    assert.ok(r >= 4.5, `${key}: ${r.toFixed(2)}:1`);
  }
});

test("a switch that's off is outlined at 3:1 or more in Minimal light, dark and extra dark (#43)", () => {
  assert.match(css, /\.toggle input:not\(:checked\) \+ \.knob \{ box-shadow: inset 0 0 0 1\.5px color-mix\(in srgb, var\(--text\) 62%, transparent\); \}/);
  for (const [name, t] of Object.entries(THEMES)) {
    const fg = t.ink.split(/\s+/).map(Number) as RGB;
    const r = ratio(mix(fg, hex(t.bg), 0.62), hex(t.bg));
    assert.ok(r >= 3, `${name}: ${r.toFixed(2)}:1`);
  }
});
