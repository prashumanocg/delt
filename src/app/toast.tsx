"use client";

// The short message at the bottom of the screen, with Undo or a second choice when there is one.
import { useCallback, useEffect, useReducer } from "react";
import { toastReducer, type ToastMsg } from "@/lib/toast-history";

export type { ToastMsg };

const life = (t: ToastMsg) => (t.alt ? 8000 : t.undo ? 5000 : 2600);

export function useToast() {
  const [{ toast }, dispatch] = useReducer(toastReducer, { toast: null, history: [] });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dispatch({ type: "expire", at: Date.now() }), life(toast));
    return () => clearTimeout(t);
  }, [toast]);
  // same shape as before: set a message, or null to close the one on screen
  const set = useCallback((msg: ToastMsg | null) => dispatch(msg ? { type: "show", msg, at: Date.now() } : { type: "close", at: Date.now() }), []);
  return [toast, set] as const;
}

export function Toast({ toast, onClose }: { toast: ToastMsg | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite" key={toast.text} style={{ "--life": `${life(toast)}ms` } as React.CSSProperties}>
      <b className="rc" aria-hidden="true">
        Race control
      </b>
      <span>{toast.text}</span>
      {toast.alt && (
        <button
          onClick={() => {
            const run = toast.alt!.run;
            onClose();
            run();
          }}
        >
          {toast.alt.label}
        </button>
      )}
      {toast.undo && (
        <button
          onClick={() => {
            toast.undo!();
            onClose();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
