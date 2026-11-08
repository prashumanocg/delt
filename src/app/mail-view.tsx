"use client";

// One mail, full screen. Everything about it in one place: pile, deadline,
// summary, then the original mail read live from Gmail (never stored).
import { useEffect, useRef, useState } from "react";
import type { EmailRow, Priority } from "@/lib/supabase";
import type { FullMessage } from "@/lib/gmail";
import MailFrame from "./mail-frame";
import MailAttachments from "./mail-attachments";
import { listedFiles } from "@/lib/attachments";
import { F, PILES, cleanSender, cleanSubject, dueLevel, dueLabel, pileLabel, senderDomain, wrongPileLink } from "@/lib/inbox";
import { calendarLink } from "@/lib/insights";
import { useDialog } from "./use-dialog";


// #41: a sheet (Settings, the welcome) is open on top of this mail
const covered = () => !!document.querySelector('[aria-modal="true"]:not(.mailview)');

export default function MailView({
  id, row, now, gmailLink, onClose, onPatch, onReauth, restoreFocus, pane = false, onStep, position,
}: {
  id: string;
  row: EmailRow | null;
  now: number;
  gmailLink: string;
  onClose: () => void;
  onPatch: (p: { read?: boolean; is_done?: boolean; priority?: Priority; deadline?: null }) => void;
  onReauth?: () => void;
  restoreFocus?: () => HTMLElement | null;
  /** #48: on wide screens the mail sits beside the list instead of covering it */
  pane?: boolean;
  /** #49: go to the next (1) or previous (-1) mail in the list; false when there isn't one */
  onStep?: (dir: 1 | -1) => boolean;
  position?: { index: number; total: number } | null;
}) {
  const [msg, setMsg] = useState<FullMessage | null>(null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  // #77: the mail's own frame is a whole document to build; wait until the panel has slid in
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 300);
    return () => clearTimeout(t);
  }, []);
  const box = useRef<HTMLDivElement>(null);
  // A full-screen mail is a modal dialog; a reading pane isn't (the list stays usable), but Esc still closes it.
  useDialog(box, !pane, onClose, restoreFocus);
  // J / K: next / previous mail (#49); not while typing in a box
  const step = useRef(onStep);
  step.current = onStep;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || covered() || t?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "j" || e.key === "J") step.current?.(1);
      if (e.key === "k" || e.key === "K") step.current?.(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (!pane) return;
    // a sheet on top closes first, on its own (#41)
    const k = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && !covered() && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pane, onClose]);

  useEffect(() => {
    let alive = true;
    setMsg(null);
    setError("");
    fetch(`/api/emails/${encodeURIComponent(id)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok) setMsg(d);
        else {
          if (d.reauth) onReauth?.();
          setError(r.status === 401 ? "You've been signed out. Reload and sign in again." : d.error ?? "Gmail didn't return this mail.");
        }
      })
      .catch(() => alive && setError("You're offline."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tries]);

  // Lock the page behind (Esc and focus are handled by useDialog).
  useEffect(() => {
    if (pane) return; // the list beside a reading pane keeps scrolling
    document.documentElement.classList.add("locked");
    return () => document.documentElement.classList.remove("locked");
  }, [pane]);

  const subject = cleanSubject(row?.subject ?? msg?.subject ?? null);
  const sender = msg?.from || cleanSender(row?.from_name ?? null);

  return (
    <div className={`mailview ${pane ? "pane" : ""} ${row ? `p-${row.priority}` : ""}`} role="dialog" aria-modal={pane ? undefined : true} aria-labelledby="mv-title" ref={box}>
      <header className="mv-bar">
        <button className="iconbtn mv-back" onClick={onClose} aria-label="Back to list">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          <span aria-hidden="true">Back</span>
        </button>
        {onStep && position && (
          <span className="mv-step">
            <button className="iconbtn" onClick={() => onStep(-1)} disabled={position.index === 0} aria-label="Previous mail" title="Previous (K)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
            </button>
            <button className="iconbtn" onClick={() => onStep(1)} disabled={position.index >= position.total - 1} aria-label="Next mail" title="Next (J)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </span>
        )}
        <div className="mv-acts">
          {row && (
            <>
              <button className="pillbtn" onClick={() => onPatch({ read: !row.unread })} aria-label={row.unread ? "Mark read" : "Mark unread"}>
                <span className="mv-long">{row.unread ? "Mark read" : "Mark unread"}</span>
                <span className="mv-short">{row.unread ? "Read" : "Unread"}</span>
              </button>
              <button className={`pillbtn ${row.is_done ? "on" : ""}`} aria-pressed={row.is_done} onClick={() => onPatch({ is_done: !row.is_done })}>
                {row.is_done ? "✓ Done" : "Done"}
              </button>
            </>
          )}
          <a className="pillbtn mv-gmail" href={gmailLink} target="_blank" rel="noreferrer" aria-label="Open in Gmail (new tab)">
            <span aria-hidden="true">Gmail</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>
          </a>
        </div>
      </header>

      <div className="mv-scroll">
        <article className="mv-page">
          <h1 className="mv-subj" id="mv-title" tabIndex={-1} data-autofocus>
            {subject}
          </h1>
          <div className="mv-from">
            <b>{sender}</b>
            <span className="muted">
              {F.dateTime.format(new Date(msg?.date ?? row?.received_at ?? now))}
              {msg?.to ? ` · to ${msg.to.length > 40 ? "you and others" : msg.to}` : ""}
            </span>
          </div>

          {row && (
            <div className="mv-pile" role="radiogroup" aria-label="Pile">
              <span className="muted lbl">Pile</span>
              {PILES.map((p) => (
                <button key={p.key} role="radio" aria-checked={row.priority === p.key} className={`pchip p-${p.key} ${row.priority === p.key ? "on" : ""}`} onClick={() => row.priority !== p.key && onPatch({ priority: p.key })}>
                  <i className="tagdot" />
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {row && (
            <a className="mv-report muted" href={wrongPileLink(senderDomain(row.from_address), pileLabel(row.priority), row.reason)} target="_blank" rel="noreferrer" title="Opens a public GitHub issue with the sender's domain and pile only, never the subject.">
              Wrong pile? Report it ↗
            </a>
          )}

          {row?.deadline && (
            <div className={`mv-due lv-${dueLevel(row.deadline, now)}`}>
              <span>
                <b>{dueLabel(row.deadline, now)}</b>
                <span className="muted"> · {F.dueFull.format(new Date(row.deadline))}</span>
              </span>
              <a className="pillbtn" href={calendarLink(subject, row.deadline, row.summary)} target="_blank" rel="noreferrer">+ Calendar</a>
              <button className="link mv-wrongdate" onClick={() => onPatch({ deadline: null })}>
                Wrong date? Remove
              </button>
            </div>
          )}

          {row?.summary && (
            <p className="mv-sum">
              <span className="muted lbl">Summary</span>
              {row.summary}
            </p>
          )}

          {msg?.unsubscribe && (
            <a className="mv-unsub muted" href={msg.unsubscribe} target="_blank" rel="noreferrer noopener">Unsubscribe ↗</a>
          )}
          {msg && <MailAttachments mailId={id} files={listedFiles(msg.html, msg.attachments)} gmailLink={gmailLink} />}

          <div className="mv-body">
            {error ? (
              <div className="mv-err" role="alert">
                <b>Couldn&apos;t load this mail</b>
                <span className="muted">{error}</span>
                <div>
                  <button className="pillbtn" onClick={() => setTries((t) => t + 1)}>Try again</button>
                  <a className="pillbtn" href={gmailLink} target="_blank" rel="noreferrer">Open in Gmail ↗</a>
                </div>
              </div>
            ) : !msg || !settled ? (
              <div className="mv-loading" aria-label="Loading the mail" role="status">
                <span className="sk" style={{ width: "90%" }} />
                <span className="sk" style={{ width: "75%" }} />
                <span className="sk" style={{ width: "82%" }} />
                <span className="sk" style={{ width: "40%" }} />
              </div>
            ) : (
              <MailFrame key={id} id={id} msg={msg} />
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
