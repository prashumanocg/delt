"use client";

// A05: on a laptop with no mail open, the reading pane shows today at a glance instead of an empty box:
// what's unread, what needs you, the next deadline. Every item opens its mail.
import type { EmailRow } from "@/lib/supabase";
import { cleanSender, cleanSubject, dueLabel } from "@/lib/inbox";

type Props = { unread: number; needs: EmailRow[]; dueThisWeek: number; next: EmailRow | null; now: number; onOpen: (m: EmailRow) => void };

export default function Overview({ unread, needs, dueThisWeek, next, now, onOpen }: Props) {
  return (
    <section className="mv-empty overview" aria-labelledby="ov-title">
      <div className="ov-page">
        <h2 id="ov-title" className="ov-title">Today</h2>
        <dl className="ov-stats">
          <div>
            <dt>Unread</dt>
            <dd>{unread}</dd>
          </div>
          <div className={needs.length ? "hot" : ""}>
            <dt>Needs you</dt>
            <dd>{needs.length}</dd>
          </div>
          <div>
            <dt>Due this week</dt>
            <dd>{dueThisWeek}</dd>
          </div>
        </dl>

        {next && (
          <>
            <h3 className="ov-head">Next deadline</h3>
            <button className="ov-item" onClick={() => onOpen(next)}>
              <b>{cleanSubject(next.subject)}</b>
              <span className="ov-due">{dueLabel(next.deadline!, now)}</span>
              <span className="muted">{cleanSender(next.from_name)}</span>
            </button>
          </>
        )}

        {needs.length > 0 && (
          <>
            <h3 className="ov-head">Needs you</h3>
            <ul className="ov-list">
              {needs.slice(0, 3).map((m) => (
                <li key={m.id}>
                  <button className="ov-item" onClick={() => onOpen(m)}>
                    <b>{cleanSubject(m.subject)}</b>
                    <span className="muted">{cleanSender(m.from_name)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {!next && !needs.length && <p className="muted ov-calm">Nothing needs you right now.</p>}
        <p className="muted ov-hint">Pick a mail from the list. J and K move to the next and previous mail.</p>
      </div>
    </section>
  );
}
