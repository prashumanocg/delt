"use client";

// Screen changes (opening a mail, a panel, switching tabs or themes) animate with the browser's
// View Transitions: it snapshots the screen and cross-fades or slides on the GPU, so nothing is
// animated element by element. Opening and closing both animate. Browsers without it, and people
// who turned on "reduce motion", just get the change straight away.
import { flushSync } from "react-dom";

type VT = { ready?: Promise<unknown>; finished?: Promise<unknown> };
type VTDocument = Document & { startViewTransition?: (cb: () => void) => VT | undefined };

export function transition(update: () => void) {
  const d = document as VTDocument;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!d.startViewTransition || reduce || document.visibilityState !== "visible") return update();
  const t = d.startViewTransition(() => flushSync(update));
  // A new transition (a quick second tap, a theme change during a close) skips the running one,
  // and the browser then rejects its promises ("Transition was skipped"). That's expected, not an
  // error: catch it so it doesn't surface as an uncaught rejection. The screen still updates.
  t?.ready?.catch(() => {});
  t?.finished?.catch(() => {});
}
