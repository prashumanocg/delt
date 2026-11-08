// Appearance preferences: look, light/dark, accent, text size, spacing.
// Saved per device in localStorage and applied as data-* attributes on <html>.

export type Prefs = {
  look: "minimal" | "glyph" | "grid";
  mode: "light" | "dark" | "black" | "auto";
  accent: "auto" | "purple" | "blue" | "green" | "red" | "gold" | "papaya" | "teal" | "navy" | "racing" | "sky" | "pink";
  size: "normal" | "large";
  density: "comfortable" | "compact";
};

export const OPTIONS = {
  look: ["minimal", "glyph", "grid"],
  mode: ["light", "dark", "black", "auto"],
  accent: ["auto", "purple", "blue", "green", "red", "gold", "papaya", "teal", "navy", "racing", "sky", "pink"],
  size: ["normal", "large"],
  density: ["comfortable", "compact"],
} as const satisfies { [K in keyof Prefs]: readonly Prefs[K][] };

/** Accent colours each look offers. Grid (F1-inspired) has its own "driver colours". */
export const LOOK_ACCENTS: Record<Prefs["look"], readonly Prefs["accent"][]> = {
  minimal: ["auto", "purple", "blue", "green", "red", "gold"],
  glyph: ["auto", "purple", "blue", "green", "red", "gold"],
  grid: ["auto", "papaya", "teal", "navy", "racing", "sky", "pink", "gold"],
};

export const DEFAULTS: Prefs = { look: "minimal", mode: "light", accent: "auto", size: "normal", density: "comfortable" };
export const KEY = "delt-prefs";

/** Reads saved prefs, ignoring junk. Also upgrades the old "delt-look"/"delt-theme" keys. */
export function parsePrefs(raw: string | null, legacy: { look?: string | null; theme?: string | null } = {}): Prefs {
  let saved: Record<string, unknown> = {};
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object" && !Array.isArray(v)) saved = v;
  } catch {}
  const out: Prefs = { ...DEFAULTS };
  if (!raw) {
    if (legacy.look) out.look = legacy.look === "glyph" ? "glyph" : "minimal";
    if (legacy.theme === "dark" || legacy.theme === "light") out.mode = legacy.theme;
  }
  for (const k of Object.keys(OPTIONS) as (keyof Prefs)[]) {
    const v = saved[k];
    if ((OPTIONS[k] as readonly unknown[]).includes(v)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** "auto" follows the phone. */
/** "auto" follows the phone; "black" (Extra dark) is dark with a pure-black tone. */
export const resolveMode = (mode: Prefs["mode"], systemDark: boolean): "light" | "dark" =>
  mode === "auto" ? (systemDark ? "dark" : "light") : mode === "black" ? "dark" : mode;

/** The attributes set on <html>. Grid is always dark (Extra dark makes it pure black);
 *  an accent the look doesn't offer falls back to the look's own default. */
export function toDataset(p: Prefs, systemDark: boolean) {
  const theme = p.look === "grid" ? "dark" : resolveMode(p.mode, systemDark);
  const accent = LOOK_ACCENTS[p.look].includes(p.accent) ? p.accent : "auto";
  return { look: p.look, theme, tone: p.mode === "black" ? "black" : "normal", accent, size: p.size, density: p.density };
}

/**
 * Runs inline in <head> before first paint so the page never flashes the wrong
 * theme. Kept as a plain string (bundlers rewrite real functions);
 * tests/prefs.test.ts runs it and checks it agrees with parsePrefs/toDataset.
 */
export const PREPAINT = `(function(){
var r=document.documentElement,p={},raw=null;
function ok(v,l,d){return typeof v==="string"&&l.indexOf(v)>=0?v:d}
try{raw=localStorage.getItem("delt-prefs");var v=raw?JSON.parse(raw):null;if(v&&typeof v==="object"&&!Array.isArray(v))p=v;
if(!raw){var lk=localStorage.getItem("delt-look"),lt=localStorage.getItem("delt-theme");if(lk)p={look:lk==="glyph"?"glyph":"minimal"};if(lt==="dark"||lt==="light")p.mode=lt}}catch(e){}
var m=ok(p.mode,["light","dark","black","auto"],"light"),tone=m==="black"?"black":"normal";if(m==="black")m="dark";
if(m==="auto")m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
var look=ok(p.look,["minimal","glyph","grid"],"minimal");if(look==="grid")m="dark";
r.dataset.look=look;r.dataset.theme=m;r.dataset.tone=tone;
r.dataset.accent=ok(p.accent,look==="grid"?["auto","papaya","teal","navy","racing","sky","pink","gold"]:["auto","purple","blue","green","red","gold"],"auto");
r.dataset.size=ok(p.size,["normal","large"],"normal");
r.dataset.density=ok(p.density,["comfortable","compact"],"comfortable");
try{var bg={minimal:{light:"#fafaf9",dark:"#0d0e10"},glyph:{light:"#fff8e8",dark:"#17112b"},grid:{light:"#0b0b0e",dark:"#0b0b0e"}}[look][m];if(tone==="black")bg="#000000";
function bar(){var ms=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<ms.length;i++){ms[i].setAttribute("content",bg);ms[i].removeAttribute("media")}}
bar();if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bar)}catch(e){}
})()`;
