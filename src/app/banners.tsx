"use client";

// The notices above the list: signed out, app update, the AI question, offline, and lost Gmail access.
import { useEffect, useState } from "react";
import { ago } from "@/lib/inbox";
import { APK_URL, checkAppUpdate, openedAsTab, snoozeAppUpdate } from "@/lib/app-update";

type Props = {
  aiConsent: boolean | null | undefined;
  onAnswerAi: (consent: boolean) => void;
  offline: boolean;
  savedAt: number | null;
  now: number;
  reauth: boolean;
  signedOut?: boolean;
  signInAction?: () => Promise<void>;
};

export default function Banners({ aiConsent, onAnswerAi, offline, savedAt, now, reauth, signedOut = false, signInAction }: Props) {
  // Android app: a newer build is on GitHub (see lib/app-update.ts)
  const [appUpdate, setAppUpdate] = useState<{ installed: number; latest: number } | null>(null);
  useEffect(() => {
    checkAppUpdate().then(setAppUpdate);
  }, []);
  // #78: the app fell back to a Chrome tab (address bar showing)
  const [asTab, setAsTab] = useState(false);
  useEffect(() => {
    setAsTab(openedAsTab(location.search, matchMedia("(display-mode: standalone)").matches));
  }, []);

  // #235: one banner at a time, the most important first, so the list isn't pushed off the screen
  const which = signedOut ? "signedOut" : reauth ? "reauth" : offline ? "offline" : appUpdate ? "update" : asTab ? "asTab" : aiConsent === null ? "ai" : null;
  return (
    <>
      {which === "asTab" && (
        <section className="banner update" aria-labelledby="as-tab">
          <span>
            <b id="as-tab">Chrome is showing DELT with its address bar.</b> Update Chrome from the Play Store, then in Settings → Apps → DELT → Storage, clear storage and open DELT again.
          </span>
          <span className="ask-btns">
            <button className="pillbtn" onClick={() => setAsTab(false)}>OK</button>
          </span>
        </section>
      )}
      {which === "update" && appUpdate && (
        <section className="banner update" aria-labelledby="app-update">
          <span>
            <b id="app-update">A new version of the DELT app is ready.</b> Tap Update, then Install when Android asks. You stay signed in.
          </span>
          <span className="ask-btns">
            <a className="pillbtn on" href={APK_URL} onClick={() => setTimeout(() => setAppUpdate(null), 500)}>
              Update
            </a>
            <button
              className="pillbtn"
              onClick={() => {
                snoozeAppUpdate();
                setAppUpdate(null);
              }}
            >
              Later
            </button>
          </span>
        </section>
      )}
      {which === "ai" && (
        <section className="banner ask" aria-labelledby="ai-ask">
          <span>
            <b id="ai-ask">Let AI double-check unclear mail?</b> DELT sorts with simple rules. For mail they aren&apos;t sure about, it can send that mail&apos;s sender, subject and opening
            text to Google&apos;s Gemini (free tier), which may use it to improve its models.{" "}
            <a className="link" href="/privacy" target="_blank">
              Privacy
            </a>
          </span>
          <span className="ask-btns">
            {/* #44: a consent question gets two equal answers, no nudge; the one that shares nothing comes first */}
            <button className="pillbtn" onClick={() => onAnswerAi(false)}>
              Rules only
            </button>
            <button className="pillbtn" onClick={() => onAnswerAi(true)}>
              Allow AI
            </button>
          </span>
        </section>
      )}
      {which === "offline" && (
        <div className="banner offline" role="status">
          <span>
            <b>You&apos;re offline.</b> {savedAt ? `Showing your inbox from ${ago(savedAt, now)}.` : "Nothing saved on this phone yet."} Changes are paused until you&apos;re back online.
          </span>
        </div>
      )}
      {which === "signedOut" && (
        <div className="banner" role="alert">
          <span>
            <b>You&apos;ve been signed out.</b> New mail and changes are paused until you sign in again.
          </span>
          {signInAction && (
            <form action={signInAction}>
              <button className="pillbtn on">Sign in again</button>
            </form>
          )}
        </div>
      )}
      {which === "reauth" && (
        <div className="banner" role="alert">
          <span>
            <b>DELT can&apos;t reach your Gmail.</b> Its access was removed in your Google account, so new mail won&apos;t show up. Sign in again to fix it.
          </span>
          {signInAction && (
            <form action={signInAction}>
              <button className="pillbtn on">Sign in again</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
