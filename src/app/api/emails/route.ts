import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { serverError } from "@/lib/api-error";
import { db, type Priority } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/types";
import { PAGE_SIZE, searchPattern } from "@/lib/inbox";
import { ensureLabels, getAccessToken, markRead, markUnread, setPriorityLabel } from "@/lib/gmail";
import { limited } from "@/lib/rate-limit";
import { seenIsStale } from "@/lib/schedule";

// user_email stays: the database tests use it to prove no student ever gets another's mail
const LIST_COLUMNS = "id, user_email, thread_id, from_name, from_address, subject, snippet, received_at, priority, summary, deadline, reason, user_corrected, is_done, unread";

async function currentUser() {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}

// GET /api/emails                       newest mail, one page
//     ?before=<received_at>             the next older page (scrolling down)
//     ?q=<words>                        search all stored mail, not just what's loaded
//     ?due=1                            mail with an open or recent deadline, however old
//     ?priority=…&days=…&limit=…        optional narrowing
// Answers { emails, more, reauth }. `more` = there is an older page.
export async function GET(req: NextRequest) {
  const email = await currentUser();
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const tooMany = limited(email, "emails");
  if (tooMany) return tooMany;

  const p = req.nextUrl.searchParams;
  const priority = p.get("priority");
  const days = Number(p.get("days"));
  const before = p.get("before");
  const pattern = searchPattern(p.get("q") ?? "");
  const due = p.get("due") === "1";
  const limit = Math.min(500, Math.max(1, Number(p.get("limit")) || PAGE_SIZE));

  // #120: only what the app shows (not user_email, gmail_labeled, notified, reminded, created_at, …)
  let query = db.from("emails").select(LIST_COLUMNS).eq("user_email", email);
  if (days > 0) query = query.gte("received_at", new Date(Date.now() - days * 86400_000).toISOString());
  // lte, not lt: mails sharing the edge time aren't skipped; the app drops the repeats
  if (before && !Number.isNaN(Date.parse(before))) query = query.lte("received_at", new Date(before).toISOString());
  if (priority) query = query.eq("priority", priority);
  if (due) query = query.not("deadline", "is", null).gte("deadline", new Date(Date.now() - 7 * 86400_000).toISOString());
  if (pattern) query = query.or(["subject", "from_name", "from_address", "summary"].map((c) => `${c}.ilike.${pattern}`).join(","));

  const { data, error } = await query.order("received_at", { ascending: false }).limit(limit + 1);
  if (error) return serverError("emails", error);
  const more = (data?.length ?? 0) > limit;

  // Opening the app marks the student as active, so background sync checks them more often.
  let reauth = false;
  let aiConsent: boolean | null | undefined;
  let syncProblem: string | null = null;
  if (!before && !pattern && !due) {
    // #119: one read; "last seen" is written only when it's an hour old (it only needs to say
    // "active this week"), not on every load
    const { data: u, error: userError } = await db.from("users").select("access_revoked, ai_consent, last_sync_error, last_seen_at").eq("email", email).maybeSingle();
    // #130: the account was deleted on another device; the app reloads and lands on sign-in
    if (!userError && !u) return NextResponse.json({ error: "Signed out", gone: true }, { status: 401 });
    if (userError || seenIsStale(u?.last_seen_at, Date.now())) await db.from("users").update({ last_seen_at: new Date().toISOString() }).eq("email", email);
    reauth = !!u?.access_revoked; // issue #10
    aiConsent = u ? (u.ai_consent ?? null) : undefined; // #31: null = not asked yet
    syncProblem = u?.last_sync_error ?? null; // #40
  }
  return NextResponse.json({ emails: (data ?? []).slice(0, limit), more, reauth, aiConsent, syncProblem });
}

const Patch = z.object({
  id: z.string(),
  priority: z.enum(["very_important", "priority", "later", "noise"]).optional(),
  category: z.enum(CATEGORIES).optional(),
  is_done: z.boolean().optional(),
  read: z.boolean().optional(),
  /** false = move only this mail, don't make a rule for the sender (#46) */
  teach: z.boolean().optional(),
  /** null = "Wrong date? Remove" (#55); an ISO date puts it back (Undo) */
  deadline: z
    .string()
    .datetime({ offset: true })
    // #113: within two years either way (Undo can put back a past deadline)
    .refine((d) => Math.abs(Date.parse(d) - Date.now()) < 2 * 366 * 86400_000, "Deadline out of range")
    .nullable()
    .optional(),
});

// PATCH: move a mail or recategorise it (teaches the sorter), mark it done,
// read or unread (mirrored in Gmail).
export async function PATCH(req: NextRequest) {
  const email = await currentUser();
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const tooMany = limited(email, "patch");
  if (tooMany) return tooMany;

  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { id, priority, category, is_done, read, teach, deadline } = parsed.data;

  const update: Record<string, unknown> = {};
  // #111: a new pile is "not yet in Gmail" until Gmail confirms, so sync retries a failure
  if (priority) Object.assign(update, teach === false ? { priority, user_corrected: false, sorted_by: "manual", gmail_labeled: false } : { priority, user_corrected: true, gmail_labeled: false });
  if (category) Object.assign(update, { category, user_corrected: true });
  if (is_done !== undefined) update.is_done = is_done;
  if (deadline !== undefined) update.deadline = deadline;
  if (read !== undefined) update.unread = !read;

  const { data: changed, error } = await db.from("emails").update(update).eq("id", id).eq("user_email", email).select("id");
  if (error) return serverError("emails", error);
  // #112: a stale id (mail purged, or removed on another device) is not a silent success
  if (!changed?.length) return NextResponse.json({ error: "Mail not found" }, { status: 404 });

  if (priority || read !== undefined) {
    // Keep Gmail in step with the website: priority label and read state.
    const { data: user } = await db.from("users").select("refresh_token").eq("email", email).single();
    let gmail = !!user;
    if (user) {
      // #111: one retry, then tell the app instead of failing silently
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const token = await getAccessToken(user.refresh_token);
          if (priority) {
            await setPriorityLabel(token, id, priority as Priority, await ensureLabels(token));
            await db.from("emails").update({ gmail_labeled: true }).eq("id", id).eq("user_email", email);
          }
          if (read === true) await markRead(token, id);
          if (read === false) await markUnread(token, id);
          gmail = true;
          break;
        } catch (e) {
          gmail = false;
          console.error("Gmail update failed:", (e as Error).message);
        }
      }
    }
    return NextResponse.json({ ok: true, gmail });
  }
  return NextResponse.json({ ok: true });
}
