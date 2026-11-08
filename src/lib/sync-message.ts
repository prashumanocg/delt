// #150: what the app says when checking for mail fails. Each cause gets its own words, so students
// don't blame Gmail or their connection for a problem on DELT's side.

/** status: the /api/sync answer's HTTP status, or null if the request never got an answer.
 *  error: the server's own short message (#133: fixed texts, never internals). */
export function syncFailureText(f: { online: boolean; status: number | null; error?: string }): string {
  if (!f.online) return "You're offline";
  if (f.status === null) return "Couldn't reach DELT. Check your connection.";
  if (f.status === 502) return f.error || "Gmail didn't answer. Try again in a moment.";
  if (f.status === 504) return "Checking took too long. Try again.";
  return f.error || "Something went wrong on DELT's side. Try again.";
}
