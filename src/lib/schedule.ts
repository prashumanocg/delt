// Who the background sync should check next (issues #4 and #5).
// - Active students (opened DELT in the last week): about every 15 minutes, so new mail shows up quickly.
// - Everyone else: at least once a day.
// Pure function, tested in tests/schedule.test.ts.

export const ACTIVE_WINDOW_MS = 7 * 86400_000;
export const ACTIVE_EVERY_MS = 14 * 60_000;
export const DAILY_EVERY_MS = 20 * 3600_000;
/** #119: "last seen" only decides active (seen within 7 days) or not, so the inbox writes it at
 *  most once an hour instead of on every load. */
export const SEEN_EVERY_MS = 3600_000;
export const seenIsStale = (lastSeen: string | null | undefined, now: number) => !lastSeen || now - Date.parse(lastSeen) >= SEEN_EVERY_MS;

export type SyncCandidate = { email: string; last_synced_at: string | null; last_seen_at: string | null; access_revoked?: boolean | null };

/** Students due for a sync, most overdue first. Students who removed DELT's Google access are
 *  skipped until they sign in again (issue #10). */
export function dueForSync<T extends SyncCandidate>(users: T[], now: number): T[] {
  const due = users
    .filter((u) => !u.access_revoked)
    .map((u) => {
      const synced = u.last_synced_at ? Date.parse(u.last_synced_at) : 0;
      const active = !!u.last_seen_at && now - Date.parse(u.last_seen_at) < ACTIVE_WINDOW_MS;
      const every = active ? ACTIVE_EVERY_MS : DAILY_EVERY_MS;
      return { u, overdue: now - synced - every };
    })
    .filter((x) => x.overdue >= 0);
  return due.sort((a, b) => b.overdue - a.overdue).map((x) => x.u);
}

// ---------- #40: is background sync keeping up? ----------
export type HealthRow = { last_synced_at: string | null; last_seen_at: string | null; last_sync_error?: string | null; access_revoked?: boolean | null };
export function syncHealth(users: HealthRow[], now: number) {
  const live = users.filter((u) => !u.access_revoked);
  const active = live.filter((u) => u.last_seen_at && now - Date.parse(u.last_seen_at) < ACTIVE_WINDOW_MS);
  const age = (u: HealthRow) => (u.last_synced_at ? now - Date.parse(u.last_synced_at) : Infinity);
  const oldestActive = active.length ? Math.max(...active.map(age)) : 0;
  return {
    students: live.length,
    active: active.length,
    syncedLastHour: live.filter((u) => age(u) < 3600_000).length,
    oldestActiveMinutes: Number.isFinite(oldestActive) ? Math.round(oldestActive / 60_000) : null,
    withProblems: live.filter((u) => u.last_sync_error).length,
    revoked: users.length - live.length,
  };
}
