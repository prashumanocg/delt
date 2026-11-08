// #212: a second action no longer throws away the first action's Undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { UNDO_FOR, UNDO_KEEP, toastReducer, type ToastMsg, type ToastState } from "../src/lib/toast-history";

const empty: ToastState = { toast: null, history: [] };
const undoable = (text: string): ToastMsg => ({ text, undo: () => {} });
const run = (...steps: Parameters<typeof toastReducer>[1][]) => steps.reduce(toastReducer, empty);

test("Undo on the second action brings back the first action's Undo", () => {
  const s = run({ type: "show", msg: undoable("A done"), at: 0 }, { type: "show", msg: undoable("B done"), at: 1000 });
  assert.equal(s.toast?.text, "B done");
  const back = toastReducer(s, { type: "close", at: 2000 }); // B's Undo pressed
  assert.equal(back.toast?.text, "A done");
  assert.ok(back.toast?.undo);
  assert.equal(toastReducer(back, { type: "close", at: 3000 }).toast, null); // and then nothing is left
});

test("a plain message can't hide the Undo it interrupted", () => {
  const s = run({ type: "show", msg: undoable("Marked done"), at: 0 }, { type: "show", msg: { text: "Gmail didn't update" }, at: 500 });
  assert.equal(s.toast?.text, "Gmail didn't update");
  assert.equal(toastReducer(s, { type: "expire", at: 3100 }).toast?.text, "Marked done");
});

test("an Undo that times out takes the older ones with it", () => {
  const s = run({ type: "show", msg: undoable("A"), at: 0 }, { type: "show", msg: undoable("B"), at: 100 });
  assert.deepEqual(toastReducer(s, { type: "expire", at: 5100 }), empty);
});

test("only recent actions come back, and only the last few", () => {
  const old = run({ type: "show", msg: undoable("A"), at: 0 }, { type: "show", msg: undoable("B"), at: 1 });
  assert.equal(toastReducer(old, { type: "close", at: 1 + UNDO_FOR }).toast, null, "a minute later, A is gone");

  const many = run(...Array.from({ length: UNDO_KEEP + 3 }, (_, i) => ({ type: "show" as const, msg: undoable(`m${i}`), at: i })));
  assert.equal(many.history.length, UNDO_KEEP);
  let s = many;
  const seen: string[] = [];
  while (s.toast) { seen.push(s.toast.text); s = toastReducer(s, { type: "close", at: 100 }); }
  assert.deepEqual(seen, ["m7", "m6", "m5", "m4", "m3", "m2"]);
});

test("plain messages are never kept to come back", () => {
  const s = run({ type: "show", msg: { text: "AI sorting on" }, at: 0 }, { type: "show", msg: { text: "Couldn't save" }, at: 10 });
  assert.equal(s.history.length, 0);
  assert.equal(toastReducer(s, { type: "close", at: 20 }).toast, null);
});
