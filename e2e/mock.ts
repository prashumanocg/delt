// Fake mail and a fake API for the browser tests. Every /api call the app makes is answered here,
// so the tests never need a Google account, Supabase or the internet.
import { expect, type Page, type Request } from "@playwright/test";

export type FakeMail = {
  id: string;
  user_email: string;
  thread_id: string;
  from_name: string;
  from_address: string;
  subject: string;
  snippet: string;
  summary: string;
  received_at: string;
  priority: "very_important" | "priority" | "later" | "noise";
  category: string;
  deadline: string | null;
  reason: string;
  user_corrected: boolean;
  is_done: boolean;
  gmail_labeled: boolean;
  sorted_by: "rules" | "ai";
  unread: boolean;
  deadline_choice: null;
};

const H = 3600_000;
const ME = "test.student2026@vitstudent.ac.in";

function mail(id: string, hoursAgo: number, p: Partial<FakeMail> = {}): FakeMail {
  return {
    id,
    user_email: ME,
    thread_id: id,
    from_name: "Office of DSW",
    from_address: "dsw@vit.ac.in",
    subject: `Mail ${id}`,
    snippet: "",
    summary: "",
    received_at: new Date(Date.now() - hoursAgo * H).toISOString(),
    priority: "later",
    category: "other",
    deadline: null,
    reason: "",
    user_corrected: false,
    is_done: false,
    gmail_labeled: true,
    sorted_by: "rules",
    unread: false,
    deadline_choice: null,
    ...p,
  };
}

/** A small, varied inbox: every pile, unread and read, one deadline. */
/** #71: a typical college circular: white table, grey footer, red date, a dark header block, a link. */
export const CIRCULAR = `<table width="100%" style="background:#ffffff;border:1px solid #dddddd"><tr><td style="background:#1f2a44;color:#ffffff;padding:12px"><b>VIT Library</b></td></tr><tr><td style="padding:12px;color:#333333"><p>Library timings this week are changed.</p><p style="color:#c00000"><b>Closed on 12 Nov.</b></p><p style="background:#fff8e1;color:#7a5c00">Return books before the break.</p><p><a href="https://vit.ac.in" style="color:#1a73e8">Library portal</a></p><p style="color:#999999;font-size:12px">This is an automated mail. Do not reply.</p><p style="color:#cccccc;font-size:11px">Unsubscribe from library notices</p><img alt="Library seal" width="60" height="30" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="></td></tr></table>`;

/** #72: the hackathon mail carries a poster inside its text, two photos, a PDF, a Word file and a file too big to pass on. */
export const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export const FILES = [
  { part: "0.1", name: "image.png", size: 2000, type: "image/png", cid: "poster@vit" },
  { part: "1", name: "Brochure.pdf", size: 90_000, type: "application/pdf", cid: null },
  { part: "2", name: "team.jpg", size: 300_000, type: "image/jpeg", cid: null },
  { part: "3", name: "stage.png", size: 200_000, type: "image/png", cid: null },
  { part: "4", name: "Rules.docx", size: 40_000, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", cid: null },
  { part: "5", name: "Recording.zip", size: 9_000_000, type: "application/zip", cid: null },
];

export function smallInbox(): FakeMail[] {
  return [
    mail("cat1", 1, { subject: "CAT-1 exam schedule released", from_name: "COE", priority: "very_important", unread: true, summary: "Exams start 18 Nov. Check your slot." }),
    mail("fee", 3, { subject: "Hostel fee payment: last date", priority: "very_important", unread: true, deadline: new Date(Date.now() + 30 * H).toISOString(), summary: "Pay by tomorrow evening." }),
    mail("hack", 5, { subject: "Hackathon registrations open", from_name: "ACM-VIT", from_address: "acm@vitstudent.ac.in", priority: "priority", unread: true }),
    mail("notice", 26, { subject: "Library timings this week", priority: "priority" }),
    mail("club", 30, { subject: "Photography club meetup", from_name: "Photo Club", priority: "later", unread: true }),
    mail("webinar", 50, { subject: "Webinar on careers in design", priority: "later" }),
    mail("promo", 52, { subject: "50% off on online courses", from_name: "Coursera", from_address: "no-reply@coursera.org", priority: "noise" }),
    mail("news", 80, { subject: "Weekly newsletter", from_name: "Campus News", priority: "noise" }),
  ];
}

/** A busy inbox for paging: n mails, one every 2 hours, plus one very old mail only search can find. */
export function bigInbox(n = 450): FakeMail[] {
  const list = Array.from({ length: n }, (_, i) =>
    mail(`m${i}`, 1 + i * 2, { subject: `Notice number ${i}`, priority: (["very_important", "priority", "later", "noise"] as const)[i % 4] }),
  );
  list.push(mail("ancient", 24 * 400, { subject: "Scholarship renewal form", from_name: "Scholarships Office" }));
  return list;
}

export type Api = {
  mails: FakeMail[];
  patches: Record<string, unknown>[];
  deleted: unknown[];
  emailRequests: string[];
  forgotten: string[];
  bulk: { ids: string[]; read?: boolean }[];
  attachments: string[];
  sync: { status: number; body: Record<string, unknown> };
};

/** Answers every /api call from `mails`. Returns the fake server's state for assertions. */
export async function mockApi(page: Page, mails: FakeMail[], opts: { reauth?: boolean; aiConsent?: boolean | null; syncProblem?: string; welcome?: boolean } = {}): Promise<Api> {
  // the one-time welcome panel (#56) would cover every test; it has its own test
  if (!opts.welcome) await page.addInitScript(() => localStorage.setItem("delt-welcomed", "1"));
  let consent = opts.aiConsent === undefined ? true : opts.aiConsent;
  const api: Api = {
    mails,
    patches: [],
    deleted: [],
    emailRequests: [],
    forgotten: [],
    bulk: [],
    attachments: [],
    sync: opts.reauth ? { status: 409, body: { error: "Google access was removed.", reauth: true } } : { status: 200, body: { fetched: 0 } },
  };
  const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/api/**", async (route, req: Request) => {
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === "/api/sync") return route.fulfill(json(api.sync.body, api.sync.status));
    if (path === "/api/settings/ai") {
      if (method === "POST") consent = (req.postDataJSON() as { consent?: boolean }).consent ?? consent;
      return route.fulfill(json({ consent, ownKey: false, sharedAvailable: true, leftToday: 25, perDay: 25, status: "shared" }));
    }
    if (path === "/api/push") return route.fulfill(json({ enabled: false, publicKey: null }));
    if (path === "/api/account" && method === "DELETE") {
      api.deleted.push(req.postDataJSON());
      return route.fulfill(json({ ok: true }));
    }
    if (path === "/api/emails/bulk") {
      const b = req.postDataJSON() as { ids: string[]; read?: boolean };
      api.bulk.push(b);
      for (const x of api.mails) if (b.ids.includes(x.id) && b.read !== undefined) x.unread = !b.read;
      return route.fulfill(json({ ok: true }));
    }
    if (path === "/api/rules") {
      if (method === "DELETE") {
        const from = url.searchParams.get("from") ?? "";
        api.forgotten.push(from);
        for (const m of api.mails) if (m.from_address.toLowerCase() === from) m.user_corrected = false;
        return route.fulfill(json({ ok: true }));
      }
      const seen = new Map<string, { from: string; name: string; priority: string; mails: number }>();
      for (const m of api.mails.filter((m) => m.user_corrected)) {
        const k = m.from_address.toLowerCase();
        if (!seen.has(k)) seen.set(k, { from: k, name: m.from_name, priority: m.priority, mails: 1 });
      }
      return route.fulfill(json({ rules: [...seen.values()] }));
    }

    const att = path.match(/^\/api\/emails\/([^/]+)\/attachments\/([\d.]+)$/);
    if (att) {
      api.attachments.push(att[2]);
      const m = api.mails.find((x) => x.id === decodeURIComponent(att[1]));
      const file = FILES.find((x) => x.part === att[2]);
      if (!m || m.id !== "hack" || !file) return route.fulfill(json({ error: "Not found" }, 404));
      if (file.type === "application/pdf") return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" });
      if (file.type.startsWith("image/")) return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PNG, "base64") });
      return route.fulfill({ status: 200, contentType: "application/octet-stream", headers: { "Content-Disposition": `attachment; filename="${file.name}"` }, body: "file" });
    }
    if (path.startsWith("/api/emails/")) {
      const id = decodeURIComponent(path.slice("/api/emails/".length));
      const m = api.mails.find((x) => x.id === id);
      if (!m) return route.fulfill(json({ error: "Not found" }, 404));
      return route.fulfill(
        json({ subject: m.subject, from: m.from_name, to: ME, cc: "", date: m.received_at, html: m.id === "hack" ? `<p>Poster below.</p><img src="cid:poster@vit" alt="Hackathon poster" width="200" height="120">` : /library/i.test(m.subject) ? CIRCULAR : /webinar/i.test(m.subject) ? `<p>Join us online.</p><img src="https://tracker.example/pixel.gif" alt=""><meta http-equiv="refresh" content="0;url=https://phish.example/">` : /newsletter/i.test(m.subject) ? Array.from({ length: 40 }, (_, i) => `<p>Paragraph ${i + 1} of a long newsletter.</p>`).join("") : `<p>Full text of <b>${m.subject}</b>.</p>`, text: null, attachments: m.id === "hack" ? FILES : [], unsubscribe: null }),
      );
    }

    if (path === "/api/emails" && method === "PATCH") {
      const p = req.postDataJSON() as { id: string; read?: boolean; is_done?: boolean; priority?: FakeMail["priority"]; teach?: boolean; deadline?: string | null };
      api.patches.push(p);
      const m = api.mails.find((x) => x.id === p.id);
      if (m) {
        if (p.read !== undefined) m.unread = !p.read;
        if (p.is_done !== undefined) m.is_done = p.is_done;
        if (p.priority) Object.assign(m, { priority: p.priority, user_corrected: p.teach !== false });
        if (p.deadline !== undefined) m.deadline = p.deadline;
      }
      return route.fulfill(json({ ok: true }));
    }

    if (path === "/api/emails") {
      api.emailRequests.push(url.search);
      const q = url.searchParams;
      const limit = Number(q.get("limit")) || 200;
      let list = [...api.mails].sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));
      const before = q.get("before");
      if (before) list = list.filter((m) => Date.parse(m.received_at) <= Date.parse(before));
      if (q.get("due") === "1") list = list.filter((m) => m.deadline);
      const words = (q.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length) list = list.filter((m) => words.every((w) => `${m.subject} ${m.from_name} ${m.from_address} ${m.summary}`.toLowerCase().includes(w)));
      return route.fulfill(json({ emails: list.slice(0, limit), more: list.length > limit, reauth: !!opts.reauth && !before && !q.get("q"), aiConsent: consent, syncProblem: opts.syncProblem ?? null }));
    }
    return route.fulfill(json({ error: `not mocked: ${method} ${path}` }, 500));
  });
  return api;
}

/** The search box. On a phone it is folded into the top bar's search button until opened (#102). */
export async function searchBox(page: Page) {
  const box = page.getByRole("textbox", { name: "Search mail" });
  if (!(await box.isVisible())) await page.getByRole("button", { name: "Search mail" }).click();
  await expect(box).toBeVisible();
  return box;
}

/** Drags a mail row sideways like a finger would (the app ignores mouse drags on purpose). */
export async function swipe(page: Page, rowSelector: string, dx: number) {
  await page.locator(`${rowSelector} .row-slide`).evaluate(async (el, dx) => {
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y = r.top + r.height / 2;
    const fire = (type: string, x: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y }));
    fire("pointerdown", x0);
    for (let i = 1; i <= 8; i++) {
      fire("pointermove", x0 + (dx * i) / 8);
      await new Promise((ok) => requestAnimationFrame(ok));
    }
    fire("pointerup", x0 + dx);
  }, dx);
}
