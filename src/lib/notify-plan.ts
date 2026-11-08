// What to send as phone notifications (issue #6). Pure, tested in tests/notify.test.ts.
// - New Urgent mail you haven't read, from the last day.
// - A deadline from your mail that is due within 24 hours (once per mail).
// A few at most per run, so nobody's phone gets flooded.

import { cleanSender, cleanSubject, dueLabel } from "./inbox";

export const MAX_PER_RUN = 3;
const DAY = 86400_000;

export type NotifyMail = {
  id: string;
  subject: string | null;
  from_name: string | null;
  summary: string;
  priority: "very_important" | "priority" | "later" | "noise";
  received_at: string;
  deadline: string | null;
  unread: boolean;
  is_done: boolean;
  notified: boolean;
  reminded: boolean;
};
export type Push = { id: string; kind: "urgent" | "deadline"; title: string; body: string; url: string; tag: string };

export function planNotifications(mails: NotifyMail[], now: number): Push[] {
  const out: Push[] = [];
  const urgent = mails
    .filter((m) => m.priority === "very_important" && !m.notified && m.unread && !m.is_done && now - Date.parse(m.received_at) < DAY)
    .sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));
  for (const m of urgent) {
    out.push({
      id: m.id,
      kind: "urgent",
      title: cleanSubject(m.subject),
      body: `${cleanSender(m.from_name)}${m.summary ? `: ${m.summary}` : ""}`.slice(0, 180),
      url: `/#/mail/${encodeURIComponent(m.id)}`,
      tag: `mail-${m.id}`,
    });
  }
  const due = mails
    .filter((m) => m.deadline && m.priority !== "noise" && !m.is_done && !m.reminded)
    .filter((m) => {
      const t = Date.parse(m.deadline!);
      return t > now && t - now <= DAY;
    })
    .sort((a, b) => Date.parse(a.deadline!) - Date.parse(b.deadline!));
  for (const m of due) {
    out.push({
      id: m.id,
      kind: "deadline",
      title: dueLabel(m.deadline!, now),
      body: cleanSubject(m.subject),
      url: `/#/mail/${encodeURIComponent(m.id)}`,
      tag: `due-${m.id}`,
    });
  }
  return out.slice(0, MAX_PER_RUN);
}
