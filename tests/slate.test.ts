// Fork only (FORK.md): the Slate refinement of Minimal dark keeps every text colour readable.
// Same WCAG maths as contrast.test.ts, run on Slate's own tokens, on both the page and its raised panels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/styles/look-slate.css", "utf8");
const SEL = ':root[data-look="minimal"][data-theme="dark"][data-tone="normal"]';

type RGB = [number, number, number];
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (ink: RGB, bg: RGB, a: number): RGB => ink.map((v, i) => bg[i] + a * (v - bg[i])) as RGB;

const i = css.indexOf(SEL + " {");
const body = css.slice(i, css.indexOf("}", i));
const v = Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const ink = v.ink.split(" ").map(Number) as RGB;
const grounds = { page: hex(v.bg), panel: hex(v.surface), raised: hex(v.surface2) };

test("Slate declares its tokens for Minimal dark only", () => {
  assert.ok(i >= 0, "no Slate token rule");
  for (const k of ["ink", "bg", "surface", "surface2", "floor", "floor-lg", "due-soon"]) assert.ok(v[k], `missing --${k}`);
  assert.ok(!css.includes('data-tone="black"]'), "Extra dark keeps its own style");
});

for (const [name, g] of Object.entries(grounds)) {
  test(`Slate text passes WCAG on the ${name}`, () => {
    assert.ok(ratio(ink, g) >= 7, `full ink ${ratio(ink, g).toFixed(2)}`);
    assert.ok(ratio(mix(ink, g, Number(v.floor)), g) >= 4.5, `muted text ${ratio(mix(ink, g, Number(v.floor)), g).toFixed(2)}`);
    assert.ok(ratio(mix(ink, g, Number(v["floor-lg"])), g) >= 3, `large muted text`);
    assert.ok(ratio(hex(v["due-soon"]), g) >= 4.5, `urgent red ${ratio(hex(v["due-soon"]), g).toFixed(2)}`);
  });
}
