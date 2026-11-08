import "server-only";
import { NextResponse } from "next/server";

// #133: what went wrong is logged on the server; the browser gets a short fixed message, never
// database or Google internals.
export function serverError(where: string, e: unknown, status = 500, text = "Something went wrong on DELT's side. Try again.") {
  console.error(`${where}:`, (e as { message?: string } | null)?.message ?? e);
  return NextResponse.json({ error: text }, { status });
}
export const GMAIL_DOWN = "Gmail didn't answer. Try again in a moment.";

/** #150: errors from Google's side (Gmail calls, token refresh, their timeouts) start with "Gmail" or
 *  "Google" (see gmail.ts). Anything else in a sync is DELT's own problem (database, a bug). */
export const fromGoogle = (e: unknown) => /^(Gmail|Google)\b/.test((e as { message?: string } | null)?.message ?? "");
