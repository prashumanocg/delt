"use client";

// One mail row: tap to open, swipe to act.
import { memo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { EmailRow } from "@/lib/supabase";
import { cleanSender, cleanSubject, dueLevel, dueLabel, gapText, initials, pileLabel, senderCode, shortTime, timeOfDay } from "@/lib/inbox";
import type { Look } from "./use-look";

export type RowActions = { open: (m: EmailRow) => void; read: (m: EmailRow) => void; done: (m: EmailRow) => void };

// memo: a row re-renders only when its own mail, position, gap or the minute changes (#20)
// #61: a row renders only what the current look shows (Glyph: avatar, pile tag, unread dot;
// Minimal: time column; Grid: position, sender code, gap), the swipe background only while
// swiping, and the hover buttons only on devices with a mouse.
export const MailRow = memo(function MailRow({ m, now, pos = 0, on, current = false, query = "", look = "minimal", hover = false }: { m: EmailRow; now: number; pos?: number; on: RowActions; current?: boolean; query?: string; look?: Look; hover?: boolean }) {
  const glyph = look === "glyph", grid = look === "grid";
  const onOpen = () => on.open(m), onRead = () => on.read(m), onDone = () => on.done(m);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; on: boolean; moved: boolean; dx: number } | null>(null);
  const moved = useRef(false);
  const LIMIT = 84;

  const down = (e: RPointerEvent) => {
    if (e.pointerType === "mouse") return; // desktop uses the hover buttons
    drag.current = { x: e.clientX, y: e.clientY, on: false, moved: false, dx: 0 };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const x = e.clientX - d.x, y = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) return void (drag.current = null); // a scroll
      if (Math.abs(x) < 10) return;
      d.on = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    }
    d.moved = true;
    const was = Math.abs(d.dx) > LIMIT;
    d.dx = Math.max(-140, Math.min(140, x));
    if (!was && Math.abs(d.dx) > LIMIT) navigator.vibrate?.(10); // #50: you can feel it's armed
    setDx(d.dx);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.on) {
      if (d.dx > LIMIT) onRead();
      else if (d.dx < -LIMIT) onDone();
    }
    setDx(0);
    if (d?.moved) {
      moved.current = true; // swallow the click that follows a swipe
      setTimeout(() => (moved.current = false), 0);
    }
  };
  const sender = cleanSender(m.from_name);
  // What a screen reader says for the row (the time and pile are only shown visually).
  const label = [
    m.unread ? "Unread." : "",
    `${sender}: ${cleanSubject(m.subject)}.`,
    `${pileLabel(m.priority)}, ${shortTime(m.received_at, now) === timeOfDay(m.received_at) ? "today" : shortTime(m.received_at, now)} at ${timeOfDay(m.received_at)}.`,
    m.deadline && !m.is_done ? `${dueLabel(m.deadline, now)}.` : "",
    m.is_done ? "Done." : "",
  ].filter(Boolean).join(" ");

  return (
    <li className={`row ink-${m.priority} ${m.unread ? "unread" : ""} ${m.is_done ? "done" : ""} ${dx ? "dragging" : ""} ${current ? "current" : ""}`} data-mail={m.id} data-pos={pos} style={{ "--i": Math.min(pos, 14) } as React.CSSProperties}>
      {dx !== 0 && (
      <div className={`swipe-bg ${dx > 0 ? "r" : "l"} ${Math.abs(dx) > LIMIT ? "armed" : ""}`} aria-hidden="true">
        <span>
          {dx > 0 ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
          )}
          {dx > 0 ? (m.unread ? "Read" : "Unread") : m.is_done ? "Not done" : "Done"}
        </span>
      </div>
      )}
      <div className="row-slide" style={{ transform: dx ? `translateX(${dx}px)` : undefined }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <button className="row-main" onClick={() => !moved.current && onOpen()} aria-current={current || undefined} aria-label={label} aria-describedby={m.summary || m.snippet ? `sum-${m.id}` : undefined}>
          {glyph && (
            <span className={`avatar p-${m.priority}`} aria-hidden="true">
              {initials(sender)}
            </span>
          )}
          {grid && (
            <span className="pos" aria-hidden="true">
              {pos}
            </span>
          )}
          {look === "minimal" && (
            <span className="when" aria-hidden="true">
              {timeOfDay(m.received_at)}
            </span>
          )}
          <span className="row-text">
            <span className="line1" data-same={senderCode(m.from_name) === sender.toUpperCase() || undefined}>
              {grid && (
                <span className="code" aria-hidden="true">
                  {senderCode(m.from_name)}
                </span>
              )}
              <span className="from ell">
                <Marked text={sender} query={query} />
              </span>
              {glyph && <span className="time">{timeOfDay(m.received_at)}</span>}
            </span>
            <span className="subj ell">
              <Marked text={cleanSubject(m.subject)} query={query} />
            </span>
            <span className="sum ell" id={`sum-${m.id}`}>
              {m.summary || m.snippet}
            </span>
            {(glyph || m.is_done || (m.deadline && !m.is_done)) && (
            <span className="meta">
              {glyph && (
                <span className={`tag p-${m.priority}`}>
                  <i className="tagdot" />
                  {pileLabel(m.priority)}
                </span>
              )}
              {m.deadline && !m.is_done && <span className={`due lv-${dueLevel(m.deadline, now)}`}>{dueLabel(m.deadline, now)}</span>}
              {m.is_done && <span className="donemark">✓ Done</span>}
            </span>
            )}
          </span>
          {grid && (
            <span className="gap" aria-hidden="true">
              {gapText(m.received_at, now, pos === 1)}
            </span>
          )}
        </button>
        {hover && (
        <div className="row-acts hover-only">
          <button className="iconbtn" onClick={onRead} title={m.unread ? "Mark read" : "Mark unread"} aria-label={m.unread ? "Mark read" : "Mark unread"}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{m.unread ? <path d="M4 6h16v12H4zM4 7l8 6 8-6" /> : <path d="M4 10l8-6 8 6v9H4zM4 10l8 5 8-5" />}</svg>
          </button>
          <button className={`iconbtn check ${m.is_done ? "on" : ""}`} onClick={onDone} title={m.is_done ? "Mark not done" : "Mark done"} aria-label={m.is_done ? "Mark not done" : "Mark done"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
          </button>
        </div>
        )}
        {glyph && m.unread && <i className="unread-dot" aria-hidden="true" />}
      </div>
    </li>
  );
});

/** #57: the searched words, marked in a subject or sender. */
function Marked({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q.length < 2) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
