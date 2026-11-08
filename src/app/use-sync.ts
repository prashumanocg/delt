"use client";

// Checking Gmail for new mail: on open, every 5 minutes, on coming back to the app, and
// when the connection returns. Only one open tab checks at a time (#30).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastMsg } from "./toast";

const SYNC_EVERY = 5 * 60_000;

type Deps = {
  load: (newMail?: boolean) => Promise<boolean>;
  setReauth: (on: boolean) => void;
  setOffline: (on: boolean) => void;
  say: (t: ToastMsg) => void;
};

export function useSync({ load, setReauth, setOffline, say }: Deps) {
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [backlog, setBacklog] = useState(0); // #56: a big first sync is still bringing in older mail
  const syncedRef = useRef<number | null>(null);
  syncedRef.current = syncedAt;
  const busy = useRef(false);
  const sync = useCallback(
    async (loud = false, force = false) => {
      if (busy.current) return;
      // A tap on ↻, or fetching the rest of a big first sync, always goes through.
      try {
        const last = Number(localStorage.getItem("delt-sync-at") || 0);
        if (!loud && !force && Date.now() - last < 60_000) return;
        localStorage.setItem("delt-sync-at", String(Date.now()));
      } catch {}
      busy.current = true;
      setSyncing(true);
      try {
        const r = await fetch("/api/sync", { method: "POST" });
        const d = await r.json().catch(() => ({}));
        if (d.reauth) setReauth(true);
        // #152: signed out: load() puts up the Sign in again banner; no "Couldn't reach Gmail"
        if (r.status === 401) return void (await load());
        if (r.status === 429) {
          // another check for this student is running or just ran: nothing to do
          if (loud) say({ text: "Already checking for mail" });
          return;
        }
        if (!(await load(d.fetched > 0))) throw new Error("offline");
        setSyncedAt(Date.now());
        // AI re-checks and Gmail labels run after, without holding up the list (#21)
        if (!d.reauth && !d.backlog)
          fetch("/api/sync?phase=later", { method: "POST", keepalive: true })
            .then((r) => r.json())
            .then((x) => x?.resorted > 0 && load(true))
            .catch(() => {});
        // A big first sync comes in batches (#28): fetch the rest once the 10 s gap has passed.
        setBacklog(d.backlog ?? 0);
        if (d.backlog > 0) setTimeout(() => sync(false, true), 11_000);
        if (!d.reauth && (loud || d.fetched > 0)) say({ text: d.fetched > 0 ? `${d.fetched} new mail${d.fetched > 1 ? "s" : ""}` : "No new mail" });
      } catch {
        if (!navigator.onLine) setOffline(true);
        if (loud) say({ text: navigator.onLine ? "Couldn't reach Gmail" : "You're offline" });
      } finally {
        busy.current = false;
        setSyncing(false);
      }
    },
    [load, setReauth, setOffline, say],
  );

  useEffect(() => {
    const loadThenSync = () => void load().then((ok) => {
      if (ok) sync();
    });
    loadThenSync();
    const auto = setInterval(() => document.visibilityState === "visible" && sync(), SYNC_EVERY);
    const back = () => {
      if (document.visibilityState !== "visible") return;
      const t = syncedRef.current;
      if (!t || Date.now() - t > 2 * 60_000) sync();
    };
    const down = () => setOffline(true);
    const up = () => {
      setOffline(false);
      loadThenSync();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      clearInterval(auto);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
    };
  }, [load, sync, setOffline]);

  return { sync, syncing, syncedAt, backlog };
}

/** The current time, updated every 30 seconds and on coming back to the app. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const back = () => document.visibilityState === "visible" && setNow(Date.now());
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);
  return now;
}
