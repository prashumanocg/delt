"use client";

// DELT v2: one inbox with every mail (colour tag = pile), and a Deadlines tab.
// Tap a mail to read it full screen. Swipe right = read/unread, left = done.
// See docs/DESIGN.md for why it works this way. The parts live in their own files:
// use-mail (loading), use-sync (checking Gmail), use-mail-actions (changes + undo),
// use-screen (route, screen size, gestures), inbox-list / deadlines-list (the two tabs).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmailRow } from "@/lib/supabase";
import { BUCKETS, cleanSubject, ago, deadlineBuckets, filterMail, groupByDay, mergeMore, needsYou, openDeadlines, pileCounts } from "@/lib/inbox";
import MailView from "./mail-view";
import Appearance from "./appearance";
import { useCanHover, useLook } from "./use-look";
import Settings from "./settings";
import Welcome from "./welcome";
import { transition } from "./motion";
import AccountMenu from "./account-menu";
import Banners from "./banners";
import DeadlinesList from "./deadlines-list";
import Overview from "./overview";
import { LoadError } from "./list-states";
import InboxList, { SearchBox, SearchIcon, type Filters } from "./inbox-list";
import type { RowActions } from "./mail-row";
import { TabBar, TopTabs } from "./tabs";
import { Toast, useToast } from "./toast";
import { useMail, useSearch } from "./use-mail";
import { useMailActions, type Patch } from "./use-mail-actions";
import { PULL_AT, goTab, restoreScroll, usePullToRefresh, useRoute, useSwipeHint, useWide } from "./use-screen";
import { useNow, useSync } from "./use-sync";

type Props = { email: string; name: string; signOutAction: () => Promise<void>; signInAction?: () => Promise<void> };

export default function InboxApp({ email, name, signOutAction, signInAction }: Props) {
  const [toast, setToast] = useToast();
  const data = useMail(email);
  const { mails, due, offline, load, setReauth, setOffline, loadError } = data;
  const [filters, setFiltersState] = useState<Filters>({ pile: "all", unreadOnly: false, query: "" });
  const setFilters = useCallback((f: Partial<Filters>) => setFiltersState((s) => ({ ...s, ...f })), []);
  const { pile, unreadOnly, query } = filters;
  const { hits, setHits, searching } = useSearch(query);
  const { sync, syncing, syncedAt, backlog } = useSync({ load, setReauth, setOffline, say: setToast });
  const now = useNow();
  const route = useRoute();
  const wide = useWide();
  const [swipeHint, dismissSwipeHint] = useSwipeHint();
  const look = useLook();
  const canHover = useCanHover();
  const [settingsSection, setSettingsSection] = useState<"data" | "rules" | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); // #102: phones only
  const { findMail, patch, markAllRead, answerAi } = useMailActions({ ...data, hits, setHits, say: setToast });

  const loudSync = useCallback(() => sync(true), [sync]);
  const pull = usePullToRefresh(!route.mailId && route.tab === "inbox", loudSync);

  // ---------- opening and closing a mail ----------
  const openedFrom = useRef<string | null>(null);
  const openMail = (m: EmailRow, step = false) => {
    openedFrom.current = m.id;
    sessionStorage.setItem("delt-tab", route.tab);
    // stepping to the next/previous mail replaces the entry, so Back still returns to the list (#49)
    // #196: in the laptop pane, switching from one open mail to another replaces the entry too,
    // so Back leaves the mail instead of walking through every one you opened
    if (step || (wide && route.mailId)) location.replace(`#/mail/${encodeURIComponent(m.id)}`);
    else location.hash = `#/mail/${encodeURIComponent(m.id)}`;
    if (m.unread) patch(m.id, { read: true }, true);
  };
  // On a phone, closing goes Back (so the phone's Back button and ours agree). In the wide-screen
  // pane you may have clicked through several mails, so closing goes straight to the list (#48).
  const closeMail = () => (!wide && history.length > 1 && route.mailId ? history.back() : (location.hash = `#/${route.tab}`));

  // Row handlers that never change identity, so a tap re-renders only the row that changed (#20)
  const act = useRef<{ openMail: (m: EmailRow) => void; patch: (id: string, p: Patch) => void; learned: () => void } | null>(null);
  act.current = { openMail, patch: (id, p) => patch(id, p), learned: () => swipeHint && dismissSwipeHint() };
  const rowActions = useMemo<RowActions>(
    () => ({
      open: (m) => act.current?.openMail(m),
      read: (m) => (act.current?.patch(m.id, { read: m.unread }), act.current?.learned()),
      done: (m) => (act.current?.patch(m.id, { is_done: !m.is_done }), act.current?.learned()),
    }),
    [],
  );

  // ---------- what's shown ----------
  const all = useMemo(() => mails ?? [], [mails]);
  const counts = useMemo(() => pileCounts(all), [all]);
  // #211: the badge says something needs you: unread Urgent and Priority only, not promotions
  const badge = counts.very_important.unread + counts.priority.unread;
  const searchable = useMemo(() => (hits ? mergeMore(all, hits) : all), [all, hits]);
  const shown = useMemo(() => filterMail(searchable, { pile, unreadOnly, query }), [searchable, pile, unreadOnly, query]);
  // #23: in All (no search), what needs you comes first; those mails move up instead of repeating
  const pinned = useMemo(() => (pile === "all" && !query.trim() ? needsYou(shown, now) : []), [pile, query, shown, now]);
  const rest = useMemo(() => {
    const ids = new Set(pinned.map((m) => m.id));
    return ids.size ? shown.filter((m) => !ids.has(m.id)) : shown;
  }, [shown, pinned]);
  const days = useMemo(() => groupByDay(rest, now), [rest, now]);
  // #230: the pile and "Unread only" are kept on this device, the search for this visit
  const filtersLoaded = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("delt-filters") || "{}");
      const query = sessionStorage.getItem("delt-query") || "";
      setFilters({ ...(["all", "very_important", "priority", "later", "noise"].includes(saved.pile) ? { pile: saved.pile } : {}), unreadOnly: saved.unreadOnly === true, query });
    } catch {}
    filtersLoaded.current = true;
  }, [setFilters]);
  useEffect(() => {
    if (!filtersLoaded.current) return;
    try {
      localStorage.setItem("delt-filters", JSON.stringify({ pile: filters.pile, unreadOnly: filters.unreadOnly }));
      sessionStorage.setItem("delt-query", filters.query);
    } catch {}
  }, [filters]);
  // #197: coming back to a tab returns to where you were on it
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) return void (firstTab.current = false);
    restoreScroll(route.tab);
  }, [route.tab]);
  // #75, #77: the list's entrance plays once, when the first mail arrives; after that new rows,
  // filters and tab switches draw straight away (re-running it on every change cost frames)
  const hasMail = shown.length > 0;
  useEffect(() => {
    if (!hasMail) return;
    const t = setTimeout(() => document.documentElement.classList.add("settled"), 1600);
    return () => clearTimeout(t);
  }, [hasMail]);
  // Grid look: each row's place in the list (P1 is the leader)
  const posOf = useMemo(() => new Map([...pinned, ...rest].map((m, i) => [m.id, i + 1])), [pinned, rest]);
  const buckets = useMemo(() => deadlineBuckets(mergeMore(all, due), now), [all, due, now]);
  const dueCount = openDeadlines(buckets);
  // the overview counts what needs you across all mail, whatever filter the list has
  const needsAll = useMemo(() => needsYou(all, now), [all, now]);
  const open = route.mailId ? findMail(route.mailId) : null;
  const order = route.tab === "deadlines" ? BUCKETS.flatMap((b) => buckets[b]) : [...pinned, ...rest];
  const at = route.mailId ? order.findIndex((m) => m.id === route.mailId) : -1;
  const openSettings = (section?: "data" | "rules") => {
    setSettingsSection(section);
    transition(() => setSettingsOpen(true));
  };
  // #223: the browser tab says what's waiting, or which mail is open
  useEffect(() => {
    const waiting = needsAll.filter((m) => m.unread).length;
    document.title = open ? `${cleanSubject(open.subject)} · DELT` : waiting ? `(${waiting}) DELT` : "DELT";
  }, [open, needsAll]);
  // #102: on a phone search waits behind this button, so the list starts higher
  const searchButton = (
    <button
      className="iconbtn searchbtn"
      aria-label="Search mail"
      aria-expanded={searchOpen || !!query}
      onClick={() => {
        if (route.tab !== "inbox") goTab("inbox");
        setSearchOpen(true);
        document.getElementById("search")?.focus();
      }}
    >
      <SearchIcon />
    </button>
  );
  const gmailHome = `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`;
  const { syncProblem } = data;

  return (
    <div className={`shell ${wide ? "reading" : ""} ${swipeHint ? "hinting" : ""}`}>
      <header className="appbar">
        <a href="#/inbox" className="logo" onClick={() => goTab("inbox")} aria-label="DELT inbox">
          <span>DELT</span>
          <i />
        </a>
        {/* #76: on wide screens the bar spans the window and holds the sections and search */}
        {wide && <TopTabs tab={route.tab} unread={badge} dueCount={dueCount} />}
        {wide && (
          <SearchBox
            query={query}
            onChange={(q) => {
              setFilters({ query: q });
              if (route.tab !== "inbox") goTab("inbox");
            }}
          />
        )}
        <button className={`sync ${syncProblem && !syncing ? "warn" : ""}`} onClick={() => sync(true)} disabled={syncing} title={syncProblem ? `${syncProblem}. Tap to try again.` : "Check for new mail"}>
          <span className={syncing ? "spin" : ""} aria-hidden="true">↻</span>
          <span className="lights" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>{backlog > 0 ? "Bringing in older mail…" : syncing ? "Checking…" : syncProblem ? "Last check had a problem" : syncedAt ? `Updated ${ago(syncedAt, now)}` : "Check for mail"}</span>
        </button>
        <div className="appbar-r">
          {!wide && look !== "minimal" && searchButton}
          <Appearance />
          <AccountMenu name={name} email={email} signOutAction={signOutAction} onSettings={openSettings} />
        </div>
      </header>

      <Banners aiConsent={data.aiConsent} onAnswerAi={answerAi} offline={offline} savedAt={data.savedAt} now={now} reauth={data.reauth} signInAction={signInAction} />

      {pull > 0 && (
        <div className="pull" style={{ height: pull }} aria-hidden="true">
          <span>{pull >= PULL_AT ? "Release to check for mail" : "Pull to check for mail"}</span>
        </div>
      )}
      {/* #102: Minimal's top bar is full (its status text is in spaced capitals), but its section titles leave room
          for search; Glyph (no titles on a phone) and Grid (titles fill the row) keep it in the top bar */}
      {!wide && (look !== "minimal" ? (
        <TopTabs tab={route.tab} unread={badge} dueCount={dueCount} />
      ) : (
        <div className="mastrow">
          <TopTabs tab={route.tab} unread={badge} dueCount={dueCount} />
          {searchButton}
        </div>
      ))}

      {mails === null && loadError && (
        <main className="page">
          <LoadError onRetry={() => void load()} />
        </main>
      )}
      {route.tab === "inbox" && !(mails === null && loadError) && (
        <InboxList
          key="inbox"
          filters={filters}
          setFilters={setFilters}
          loaded={mails !== null}
          total={all.length}
          shown={shown}
          pinned={pinned}
          days={days}
          counts={counts}
          posOf={posOf}
          searching={searching}
          more={data.more}
          loadingOlder={data.loadingOlder}
          loadOlder={data.loadOlder}
          onMarkAllRead={markAllRead}
          swipeHint={swipeHint}
          dismissSwipeHint={dismissSwipeHint}
          rowActions={rowActions}
          currentId={route.mailId}
          now={now}
          look={look}
          hover={canHover}
          searchInBar={wide}
          searchOpen={searchOpen}
          onCloseSearch={() => setSearchOpen(false)}
        />
      )}
      {route.tab === "deadlines" && !(mails === null && loadError) && <DeadlinesList key="deadlines" loaded={mails !== null} buckets={buckets} now={now} onOpen={(m) => openMail(m)} onPatch={(id, p) => patch(id, p)} />}

      <TabBar tab={route.tab} unread={badge} dueCount={dueCount} />

      {/* #68: on a wide screen the list keeps its column and the space beside it waits for a mail */}
      {wide && !route.mailId && (
        <Overview
          unread={counts.all.unread}
          needs={needsAll}
          dueThisWeek={dueCount}
          next={BUCKETS.flatMap((b) => (b === "Done" ? [] : buckets[b]))[0] ?? null}
          now={now}
          onOpen={(m) => openMail(m)}
        />
      )}
      {route.mailId && (
        <MailView
          pane={wide}
          onStep={(dir) => {
            const to = at < 0 ? null : order[at + dir];
            if (to) openMail(to, true);
            return !!to;
          }}
          position={at < 0 ? null : { index: at, total: order.length }}
          id={route.mailId}
          row={open}
          now={now}
          gmailLink={open ? `${gmailHome}#all/${open.thread_id ?? open.id}` : gmailHome}
          onClose={closeMail}
          onPatch={(p) => patch(route.mailId!, p)}
          onReauth={() => setReauth(true)}
          restoreFocus={() => (openedFrom.current ? document.querySelector<HTMLElement>(`[data-mail="${CSS.escape(openedFrom.current)}"] .row-main`) : null)}
        />
      )}

      <Welcome ready={mails !== null && mails.length > 0} />
      <Settings open={settingsOpen} section={settingsSection} onClose={() => transition(() => setSettingsOpen(false))} onToast={(text) => setToast({ text })} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
