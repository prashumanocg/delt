"use client";

// The Inbox tab: search, pile chips, the Unread switch and the list of mail.
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmailRow, Priority } from "@/lib/supabase";
import { PILES, pileLabel, type groupByDay, type pileCounts } from "@/lib/inbox";
import { Empty, Skeleton } from "./list-states";
import { MailRow, type RowActions } from "./mail-row";
import type { Look } from "./use-look";

export type Filters = { pile: Priority | "all"; unreadOnly: boolean; query: string };

type Props = {
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  loaded: boolean;
  total: number; // all loaded mail, so paging re-arms after each page
  shown: EmailRow[];
  pinned: EmailRow[];
  days: ReturnType<typeof groupByDay<EmailRow>>;
  counts: ReturnType<typeof pileCounts>;
  posOf: Map<string, number>;
  searching: boolean;
  more: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
  onMarkAllRead: (ids: string[]) => void;
  swipeHint: boolean;
  dismissSwipeHint: () => void;
  rowActions: RowActions;
  currentId: string | null;
  now: number;
  look: Look;
  hover: boolean;
  /** #76: on wide screens search sits in the top bar instead */
  searchInBar?: boolean;
  /** #102: on phones search is folded into a top-bar button until opened (or holding a search) */
  searchOpen?: boolean;
  onCloseSearch?: () => void;
};

// #77: two screens of rows on a phone or laptop; the rest follow in a pausable render
const FIRST_ROWS = 12;

export const SearchIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 5 5" /></svg>;

/** `onClose` (phones, #102): the box was opened from the top bar's search button and folds away
 *  again when it's empty and loses focus, on Esc, or when it's cleared. */
export function SearchBox({ query, onChange, onClose }: { query: string; onChange: (q: string) => void; onClose?: () => void }) {
  return (
    <label className="searchbar">
      <SearchIcon />
      <input
        id={onClose ? "search" : undefined}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search mail"
        aria-label="Search mail"
        autoFocus={!!onClose}
        onBlur={() => !query && onClose?.()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onClose) {
            onChange("");
            onClose();
          }
        }}
      />
      {query && (
        // keeps focus in the box, so clearing doesn't count as leaving it
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(""); onClose?.(); }} aria-label="Clear search">✕</button>
      )}
    </label>
  );
}

export default function InboxList(p: Props) {
  const { filters, setFilters, loaded, shown, pinned, days, counts, now } = p;
  const { pile, unreadOnly, query } = filters;

  // #59: a fade on the chips' right edge while some are scrolled out of sight
  const chipsRef = useRef<HTMLElement>(null);
  const chipsMore = useCallback(() => {
    const el = chipsRef.current;
    if (el) el.dataset.more = String(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  const chipsMount = useCallback((el: HTMLElement | null) => {
    chipsRef.current = el;
    chipsMore();
  }, [chipsMore]);
  useEffect(() => {
    window.addEventListener("resize", chipsMore);
    return () => window.removeEventListener("resize", chipsMore);
  }, [chipsMore]);

  // #60: after a filter change, draw the first screens of rows at once and the rest right
  // after, as an interruptible update, so the tap answers quickly even with hundreds of mails.
  const filterKey = `${pile}|${unreadOnly}|${query}`;
  const [cap, setCap] = useState({ key: filterKey, n: FIRST_ROWS });
  if (cap.key !== filterKey) setCap({ key: filterKey, n: FIRST_ROWS });
  useEffect(() => {
    if (cap.n === Infinity) return;
    let t = 0;
    const f = requestAnimationFrame(() => {
      t = window.setTimeout(() => startTransition(() => setCap((c) => (c.key === cap.key ? { ...c, n: Infinity } : c))));
    });
    return () => {
      cancelAnimationFrame(f);
      clearTimeout(t);
    };
  }, [cap]);
  const drawnDays = useMemo(() => {
    let left = cap.n - pinned.length;
    return days.map((d) => {
      const draw = left <= 0 ? [] : d.mails.slice(0, left);
      left -= draw.length;
      return { ...d, draw };
    }).filter((d) => d.draw.length > 0);
  }, [days, cap.n, pinned.length]);

  // load the next page when the end of the list comes near
  const sentinel = useRef<HTMLDivElement>(null);
  const { more, loadOlder } = p;
  const canLoadOlder = !query.trim() && more && loaded && cap.n === Infinity;
  useEffect(() => {
    const el = sentinel.current;
    if (!canLoadOlder || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && loadOlder(), { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadOlder, loadOlder, p.total]);

  const unreadShown = shown.filter((m) => m.unread).map((m) => m.id);
  const row = (m: EmailRow) => (
    <MailRow key={m.id} m={m} now={now} pos={p.posOf.get(m.id) ?? 0} on={p.rowActions} current={p.currentId === m.id} query={query} look={p.look} hover={p.hover} />
  );

  return (
    <main className="page">
      {!p.searchInBar && (p.searchOpen || query) && <SearchBox query={query} onChange={(q) => setFilters({ query: q })} onClose={p.onCloseSearch} />}

      <nav className="chips" aria-label="Filter by pile" ref={chipsMount} onScroll={chipsMore}>
        {(["all", ...PILES.map((p) => p.key)] as const).map((k) => (
          <button key={k} className={`fchip p-${k} ${pile === k ? "on" : ""}`} onClick={() => startTransition(() => setFilters({ pile: k }))} aria-pressed={pile === k}>
            {k !== "all" && <i className="tagdot" />}
            {k === "all" ? "All" : pileLabel(k)}
            <span className="n">{counts[k].total}</span>
          </button>
        ))}
      </nav>

      <div className="listbar">
        <label className="toggle">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setFilters({ unreadOnly: e.target.checked })} />
          <span className="knob" aria-hidden="true" />
          Unread only <span className="muted">({counts[pile].unread})</span>
        </label>
        {unreadShown.length > 0 && (
          <button className="link" onClick={() => p.onMarkAllRead(unreadShown)}>
            Mark all read
          </button>
        )}
      </div>

      {!loaded ? (
        <Skeleton />
      ) : shown.length === 0 ? (
        <Empty
          title={
            query && p.searching
              ? "Searching…"
              : query
                ? `Nothing matches “${query.trim()}”${pile !== "all" || unreadOnly ? ` in ${[pile !== "all" ? pileLabel(pile) : "", unreadOnly ? "unread mail" : ""].filter(Boolean).join(", ")}` : ""}`
                : unreadOnly
                  ? "No unread mail"
                  : "No mail here"
          }
          hint={query && !p.searching && pile === "all" && !unreadOnly ? "Try a sender or a word from the subject." : ""}
        >
          {/* #57: one tap to widen an empty search or filter */}
          {!p.searching && pile !== "all" && (
            <button className="pillbtn" onClick={() => setFilters({ pile: "all" })}>
              {query ? "Search all piles" : "Show all piles"}
            </button>
          )}
          {!p.searching && unreadOnly && (
            <button className="pillbtn" onClick={() => setFilters({ unreadOnly: false })}>
              Include read mail
            </button>
          )}
          {query && !p.searching && (
            <button className="pillbtn" onClick={() => setFilters({ query: "" })}>
              Clear search
            </button>
          )}
        </Empty>
      ) : (
        <>
          {p.swipeHint && (
            <p className="swipe-hint">
              <span>
                <b>Tip:</b> swipe a mail right to mark it read, left when it&apos;s done.
              </span>
              <button className="link" onClick={p.dismissSwipeHint}>
                Got it
              </button>
            </p>
          )}
          {pinned.length > 0 && (
            <section className="day needs" aria-labelledby="needs-you">
              <h2 className="dayhead" id="needs-you">
                Needs you
              </h2>
              <ul className="rows">{pinned.map(row)}</ul>
            </section>
          )}
          {drawnDays.map((d) => (
            <section key={d.key} className="day">
              <h2 className="dayhead">
                {d.label}
                <span className="muted">
                  {/* #69: says what it counts, not "2 · 1" */}
                  {d.mails.length} {d.mails.length === 1 ? "mail" : "mails"}
                  {d.mails.some((m) => m.unread) && ` · ${d.mails.filter((m) => m.unread).length} unread`}
                </span>
              </h2>
              <ul className="rows">{d.draw.map(row)}</ul>
            </section>
          ))}
        </>
      )}
      {loaded && !query.trim() && (
        <div ref={sentinel} className="foot muted" aria-live="polite">
          {more ? (
            <button className="link" onClick={loadOlder} disabled={p.loadingOlder}>
              {p.loadingOlder ? "Loading older mail…" : "Load older mail"}
            </button>
          ) : (
            <span className="finish">That&apos;s all your mail in DELT</span>
          )}
        </div>
      )}
      {query.trim() && shown.length > 0 && (
        <p className="foot muted" aria-live="polite">
          {p.searching ? "Searching all your mail…" : `${shown.length} result${shown.length === 1 ? "" : "s"}`}
        </p>
      )}
    </main>
  );
}
