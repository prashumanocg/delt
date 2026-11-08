import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { GMAIL_DOWN, fromGoogle, serverError } from "@/lib/api-error";
import { db } from "@/lib/supabase";
import { claimSync, claimSyncLater, finishSync, finishSyncLater, syncUser } from "@/lib/sync";
import { AccessRevoked } from "@/lib/gmail";
import { limited } from "@/lib/rate-limit";
import { dueForSync } from "@/lib/schedule";
import { markSeen, notifyStudent } from "@/lib/notify";
import { purgeIfDue } from "@/lib/retention";
import { timingSafeEqual } from "node:crypto";
import { allRows } from "@/lib/all-rows";

// #34: compare the cron secret in constant time
function cronAllowed(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const maxDuration = 120;

// POST: the refresh button and auto-refresh in the app. Syncs the signed-in student.
export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // #21: the app first runs a quick sync and shows the new mail, then starts ?phase=later
  // (AI re-checks, Gmail labels) without waiting for it.
  if (req.nextUrl.searchParams.get("phase") === "later") {
    const tooMany = limited(email, "ai");
    if (tooMany) return tooMany;
    // #106: another tab or device is already running it for this student
    if (!(await claimSyncLater(email))) return NextResponse.json({ busy: true, resorted: 0, labeled: 0 }, { status: 429 });
    try {
      const r = await syncUser(email, "later");
      return NextResponse.json({ resorted: r.rechecked, labeled: r.labeled });
    } catch (e) {
      return e instanceof AccessRevoked ? NextResponse.json({ error: e.message, reauth: true }, { status: 409 }) : serverError("sync later", e);
    } finally {
      await finishSyncLater(email);
    }
  }
  // At most one sync per student every 10 s, and never two at once (#30): extra taps and tabs
  // get a quick answer instead of another round of Gmail and AI calls.
  if (!(await claimSync(email, 10))) {
    return NextResponse.json({ busy: true, fetched: 0, backlog: 0, retryAfter: 10 }, { status: 429, headers: { "Retry-After": "10" } });
  }
  try {
    const result = await syncUser(email, "quick");
    await markSeen(email); // they're looking at it, no need to ping their phone
    return NextResponse.json(result);
  } catch (e) {
    // Google access removed: the app shows "Sign in again" (issue #10).
    if (e instanceof AccessRevoked) return NextResponse.json({ error: e.message, reauth: true }, { status: 409 });
    // #150: say whose side failed, so a DELT bug isn't blamed on Gmail
    return fromGoogle(e) ? serverError("sync", e, 502, GMAIL_DOWN) : serverError("sync", e);
  } finally {
    await finishSync(email);
  }
}

// Time for one call; the GitHub Actions job (.github/workflows/sync.yml) calls again while students are left.
const BUDGET_MS = 90_000;
// Students synced at the same time per call (#36).
const PARALLEL_STUDENTS = 4;

// GET: background sync. Called by GitHub Actions every ~15 minutes and by the daily Vercel cron,
// both with "Authorization: Bearer <CRON_SECRET>". Syncs whoever is due (see lib/schedule.ts),
// then sends phone notifications for urgent mail and deadlines due within a day.
export async function GET(req: NextRequest) {
  if (!cronAllowed(req.headers.get("authorization"))) { // Bearer CRON_SECRET
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  // #82: every student, a page at a time (one select stops at 1,000 rows)
  let { data: users, error } = await allRows<{ email: string; last_synced_at: string | null; last_seen_at: string | null; access_revoked: boolean | null }>((a, b) =>
    db.from("users").select("email, last_synced_at, last_seen_at, access_revoked").order("email").range(a, b),
  );
  if (error) {
    // Database not updated yet (no last_seen_at): treat everyone as daily.
    const r = await allRows<{ email: string; last_synced_at: string | null }>((a, b) => db.from("users").select("email, last_synced_at").order("email").range(a, b));
    users = (r.data ?? []).map((u) => ({ ...u, last_seen_at: null, access_revoked: null }));
    error = r.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const queue = dueForSync(users ?? [], started);
  const results: { email: string; fetched?: number; notified?: number; error?: string }[] = [];
  // #36: several students at once (each student's own Gmail limits are separate), within the budget.
  const processed = new Set<string>();
  let next = 0;
  const worker = async () => {
    while (next < queue.length && Date.now() - started < BUDGET_MS) {
      const u = queue[next++];
      processed.add(u.email);
      // the student's own app may be syncing them right now: skip, they're up to date
      if (!(await claimSync(u.email, 60))) {
        results.push({ email: mask(u.email), error: "busy" });
        continue;
      }
      try {
        const r = await syncUser(u.email);
        results.push({ email: mask(u.email), fetched: r.fetched, notified: await notifyStudent(u.email) });
      } catch (e) {
        // Revoked Google access is flagged by syncUser, so that student is skipped from now on.
        // Any other failure: try again next round. last_synced_at is NOT moved, or mail in the
        // window would be skipped for good (#28); claim_sync's gap stops tight retry loops.
        await db.from("users").update({ last_sync_error: (e as Error).message.slice(0, 160) }).eq("email", u.email); // #40
        results.push({ email: mask(u.email), error: (e as Error).message.slice(0, 120) });
      } finally {
        await finishSync(u.email);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_STUDENTS }, worker));
  // Deadline reminders for students who weren't due for a sync this round.
  const synced = new Set(processed);
  for (const u of users ?? []) if (u.access_revoked) synced.add(u.email); // no reminders for students who left
  let reminders = 0;
  const { data: subscribed } = await allRows<{ user_email: string }>((a, b) => db.from("push_subscriptions").select("user_email").order("endpoint").range(a, b));
  for (const email of new Set((subscribed ?? []).map((s) => s.user_email as string))) {
    if (synced.has(email) || Date.now() - started > BUDGET_MS + 20_000) continue;
    reminders += await notifyStudent(email);
  }
  // #38, #90: drop mail previews older than 6 months (not the ones a student moved), once a day
  const purged = await purgeIfDue();
  return NextResponse.json({ purged, synced: results.length, remaining: Math.max(0, queue.length - processed.size), reminders, results });
}

// Logs shouldn't carry full addresses.
const mask = (e: string) => e.replace(/^(.{3}).*(@.*)$/, "$1…$2");
