"use client";

// The mail on screen: newest pages (loaded as you scroll), mail with a deadline (however old,
// so the Deadlines tab doesn't depend on how far you scrolled), and what the server says
// about the account. Also keeps the copy saved on this phone for offline use (#14).
import { useCallback, useEffect, useRef, useState } from "react";
import type { EmailRow } from "@/lib/supabase";
import { PAGE_SIZE, mergeFresh, mergeMore, oldestReceived } from "@/lib/inbox";
import { cacheKey, isInstalledApp, packCache, unpackCache } from "@/lib/offline";

export function useMail(email: string) {
  const [mails, setMails] = useState<EmailRow[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [due, setDue] = useState<EmailRow[]>([]);
  const [reauth, setReauth] = useState(false);
  const [syncProblem, setSyncProblem] = useState<string | null>(null); // #40
  // #31: null = not asked yet, so the app asks once; undefined = unknown (older database)
  const [aiConsent, setAiConsent] = useState<boolean | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // #210: the server answered with an error (not offline): say so instead of loading forever
  const [loadError, setLoadError] = useState(false);
  // #152: the session ran out while the app was open: say so and offer sign-in, keep the screen
  const [signedOut, setSignedOut] = useState(false);

  const mailsRef = useRef<EmailRow[] | null>(null);
  mailsRef.current = mails;
  const pagedOlder = useRef(false);
  // #92: the deadline list (up to 300 rows) is fetched on first load, when new mail came in, or
  // every 30 minutes, not on every refresh
  const dueAt = useRef(0);
  const load = useCallback(async (newMail = false) => {
    let r: Response, d: Response | null;
    const wantDue = newMail || Date.now() - dueAt.current > 30 * 60_000;
    try {
      [r, d] = await Promise.all([fetch(`/api/emails?limit=${PAGE_SIZE}`), wantDue ? fetch("/api/emails?due=1&limit=300") : Promise.resolve(null)]);
    } catch {
      setOffline(true); // no connection: keep showing the saved inbox
      return false;
    }
    if (r.status === 401) {
      setSignedOut(true);
      return false;
    }
    setSignedOut(false);
    setOffline(false);
    setLoadError(!r.ok);
    if (r.ok) {
      const j = await r.json();
      const page: EmailRow[] = j.emails ?? [];
      setMails((l) => (l && pagedOlder.current ? mergeFresh(l, page, j.more) : page));
      if (!pagedOlder.current || !j.more) setMore(!!j.more);
      if (!j.more) pagedOlder.current = false;
      setReauth(!!j.reauth);
      setAiConsent(j.aiConsent);
      setSyncProblem(j.syncProblem ?? null);
    }
    if (d?.ok) {
      setDue((await d.json()).emails ?? []);
      dueAt.current = Date.now();
    }
    if (r.ok) setSavedAt(Date.now());
    return r.ok;
  }, []);

  // Scrolling near the end loads the next older page (#11).
  const olderBusy = useRef(false);
  const loadOlder = useCallback(async () => {
    const cursor = oldestReceived(mailsRef.current ?? []);
    if (olderBusy.current || !cursor) return;
    olderBusy.current = true;
    setLoadingOlder(true);
    try {
      const r = await fetch(`/api/emails?before=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`);
      if (r.status === 401) setSignedOut(true);
      if (r.ok) {
        const j = await r.json();
        const page: EmailRow[] = j.emails ?? [];
        const have = new Set((mailsRef.current ?? []).map((m) => m.id));
        const added = page.filter((m) => !have.has(m.id)).length;
        pagedOlder.current = true;
        setMails((l) => mergeMore(l ?? [], page));
        setMore(!!j.more && added > 0);
      }
    } finally {
      olderBusy.current = false;
      setLoadingOlder(false);
    }
  }, []);

  // Show the saved inbox at once, then fetch the real one.
  useEffect(() => {
    try {
      const c = unpackCache<EmailRow>(localStorage.getItem(cacheKey(email)), Date.now());
      if (c) {
        setMails((l) => l ?? c.mails);
        setDue((l) => (l.length ? l : c.due));
        setSavedAt(c.at);
      }
    } catch {}
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      // #80: only the installed app may keep pages for offline use
      if (isInstalledApp()) navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: "installed" })).catch(() => {});
    }
  }, [email]);
  // Keep the saved copy up to date with what's on screen (read, done, moved).
  useEffect(() => {
    if (!mails || offline || !isInstalledApp()) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(cacheKey(email), packCache(mails, due, savedAt ?? Date.now()));
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [mails, due, offline, savedAt, email]);

  return { loadError, signedOut, mails, setMails, more, loadingOlder, due, setDue, reauth, setReauth, syncProblem, aiConsent, setAiConsent, offline, setOffline, savedAt, load, loadOlder };
}

/** Search covers all stored mail on the server, not only the loaded pages (#11). */
export function useSearch(query: string) {
  const [hits, setHits] = useState<EmailRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    // #149: a newer query cancels the request still out for the old one, so fast typing on a
    // slow connection doesn't send searches that pile up behind each other.
    const ctl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/emails?q=${encodeURIComponent(q)}&limit=200`, { signal: ctl.signal });
        if (r.ok) {
          const emails = (await r.json()).emails ?? [];
          if (!ctl.signal.aborted) setHits(emails);
        }
      } catch {}
      if (!ctl.signal.aborted) setSearching(false);
    }, 300);
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [query]);
  return { hits, setHits, searching };
}
