// #212: which toast is on screen, and which earlier actions can still be undone.
// Kept apart from the component so it can be tested without React.

export type ToastMsg = { text: string; undo?: () => void; alt?: { label: string; run: () => void } };

/** Earlier actions that can still be undone, newest last. */
type Entry = { msg: ToastMsg; at: number };
export type ToastState = { toast: ToastMsg | null; history: Entry[] };
export type ToastAction = { type: "show"; msg: ToastMsg; at: number } | { type: "close"; at: number } | { type: "expire"; at: number };
export const UNDO_KEEP = 5; // actions
export const UNDO_FOR = 60_000; // ms

/**
 * One toast at a time (#235), but a new message no longer throws away an earlier Undo (#212).
 * - A new toast puts the one on screen, if it can be undone, on a short history.
 * - Closing a toast (its Undo, its other button) or a plain message running out brings back the
 *   newest earlier Undo that is under a minute old. So Undo, Undo steps back through the last few
 *   actions, and an error message can't hide the Undo it interrupted.
 * - An Undo that simply times out takes the older ones with it: the student has moved on.
 */
export function toastReducer(s: ToastState, a: ToastAction): ToastState {
  if (a.type === "show") {
    const history = s.toast?.undo ? [...s.history, { msg: s.toast, at: a.at }].slice(-UNDO_KEEP) : s.history;
    return { toast: a.msg, history };
  }
  if (a.type === "expire" && s.toast?.undo) return { toast: null, history: [] };
  const fresh = s.history.filter((e) => a.at - e.at < UNDO_FOR);
  return { toast: fresh.at(-1)?.msg ?? null, history: fresh.slice(0, -1) };
}

