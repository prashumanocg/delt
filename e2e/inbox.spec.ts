// Issue #12: the main screens in a real browser, with fake mail (see mock.ts).
import { expect, test } from "@playwright/test";
import { bigInbox, mockApi, searchBox, smallInbox, swipe } from "./mock";

const row = (id: string) => `li.row[data-mail="${id}"]`;

test.describe("swiping (phone)", () => {
  test.skip(({ isMobile }) => !isMobile, "swipes are a touch gesture");

  test("swipe right marks read, swipe right again marks unread", async ({ page }) => {
    const api = await mockApi(page, smallInbox());
    await page.goto("/e2e");
    // #50: a one-time hint, gone after the first real swipe
    await expect(page.getByText("swipe a mail right to mark it read")).toBeVisible();
    await expect(page.locator(row("cat1"))).toHaveClass(/unread/);
    await swipe(page, row("cat1"), 130);
    await expect(page.locator(row("cat1"))).not.toHaveClass(/unread/);
    await expect(page.getByRole("status").filter({ hasText: "Marked read" })).toBeVisible();
    expect(api.patches).toContainEqual({ id: "cat1", read: true });
    await expect(page.getByText("swipe a mail right to mark it read")).toHaveCount(0);
    await swipe(page, row("cat1"), 130);
    await expect(page.locator(row("cat1"))).toHaveClass(/unread/);
  });

  test("swipe left marks done, and Undo puts it back", async ({ page }) => {
    const api = await mockApi(page, smallInbox());
    await page.goto("/e2e");
    await swipe(page, row("hack"), -130);
    await expect(page.locator(row("hack"))).toHaveClass(/done/);
    expect(api.patches).toContainEqual({ id: "hack", is_done: true });
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(row("hack"))).not.toHaveClass(/done/);
  });

  test("a short drag does nothing, and a swipe never opens the mail", async ({ page }) => {
    const api = await mockApi(page, smallInbox());
    await page.goto("/e2e");
    await swipe(page, row("club"), 40);
    await swipe(page, row("club"), 130);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(api.patches.filter((p) => p.id === "club")).toEqual([{ id: "club", read: true }]);
  });
});

test("open a mail, read it, and go back (button and browser Back)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator(row("cat1")).locator(".row-main").click();
  const dialog = page.getByRole("dialog", { name: "CAT-1 exam schedule released" });
  await expect(dialog).toBeVisible();
  await expect(page.frameLocator(".mv-frame").getByText("Full text of")).toBeVisible();
  await expect(page).toHaveURL(/#\/mail\/cat1$/);
  // opening marks it read
  await expect(dialog.getByRole("button", { name: "Mark unread" })).toBeVisible();

  await dialog.getByRole("button", { name: "Back to list" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(row("cat1"))).not.toHaveClass(/unread/);

  await page.locator(row("fee")).locator(".row-main").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(row("fee"))).toBeVisible();
});

test("move a mail to another pile, then find it under that pile and under All", async ({ page }) => {
  const api = await mockApi(page, smallInbox());
  await page.goto("/e2e");
  const chips = page.getByRole("navigation", { name: "Filter by pile" });
  await page.locator(row("cat1")).locator(".row-main").click();
  await page.getByRole("radio", { name: "Noise" }).click();
  await expect(page.getByRole("radio", { name: "Noise" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("status").filter({ hasText: "Moved to Noise. New mail from COE will go there too." })).toBeVisible();
  expect(api.patches).toContainEqual({ id: "cat1", priority: "noise" });
  await page.getByRole("button", { name: "Back to list" }).click();

  await chips.getByRole("button", { name: /^Noise/ }).click();
  await expect(page.locator(row("cat1"))).toBeVisible();
  await chips.getByRole("button", { name: /^Urgent/ }).click();
  await expect(page.locator(row("cat1"))).toHaveCount(0);
  await expect(page.locator(row("fee"))).toBeVisible();
  await chips.getByRole("button", { name: /^All/ }).click();
  await expect(page.locator(row("cat1"))).toBeVisible();
});

test("Deadlines tab lists mail with a due date", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.getByRole("navigation", { name: "Sections" }).first().getByRole("button", { name: /Deadlines/ }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/#\/deadlines$/);
  await expect(page.locator("main").getByText("Hostel fee payment: last date")).toBeVisible();
  await expect(page.locator("main").getByText("CAT-1 exam schedule released")).toHaveCount(0);
});

test("a busy inbox loads older mail on scroll, and search finds mail that isn't loaded", async ({ page }) => {
  test.setTimeout(90_000); // 450 mails
  const api = await mockApi(page, bigInbox(450));
  await page.goto("/e2e");
  await expect(page.locator(row("m0"))).toBeVisible();
  await expect(page.locator("li.row")).toHaveCount(200);

  await page.getByRole("button", { name: "Load older mail" }).scrollIntoViewIfNeeded();
  await expect(page.locator(row("m398"))).toBeAttached(); // pages overlap by one mail on purpose
  await page.getByRole("button", { name: "Load older mail" }).scrollIntoViewIfNeeded();
  await expect(page.locator(row("ancient"))).toBeAttached();
  await expect(page.getByText("That's all your mail in DELT")).toBeVisible();
  expect(new Set(await page.locator("li.row").evaluateAll((els) => els.map((e) => e.getAttribute("data-mail")))).size).toBe(451);
  expect(api.emailRequests.some((s) => s.includes("before="))).toBe(true);

  // a fresh start (from the top, so the restored scroll position doesn't load an older page), then search reaches the old mail on the server
  await page.evaluate(() => scrollTo(0, 0));
  await page.reload();
  await expect(page.locator("li.row")).toHaveCount(200);
  await (await searchBox(page)).fill("scholarship");
  await expect(page.locator(row("ancient"))).toBeVisible();
  expect(api.emailRequests.some((s) => s.includes("q=scholarship"))).toBe(true);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(row("ancient"))).toHaveCount(0);
});

test("removed Google access shows a Sign in again banner", async ({ page }) => {
  await mockApi(page, smallInbox(), { reauth: true });
  await page.goto("/e2e");
  const banner = page.getByRole("alert").filter({ hasText: "can't reach your Gmail" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Sign in again" })).toBeVisible();
});

test("Delete my data asks first, then deletes and signs out", async ({ page }) => {
  const api = await mockApi(page, smallInbox());
  await page.route("**/?deleted=1", (r) => r.fulfill({ contentType: "text/html", body: "<p>deleted page</p>" }));
  await page.goto("/e2e");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Delete my data" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: "Delete my data" }).click();
  await expect(dialog.getByText("This can't be undone.")).toBeVisible();
  expect(api.deleted).toHaveLength(0);
  await dialog.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL(/\?deleted=1$/);
  expect(api.deleted).toEqual([{ removeLabels: true }]);
});

test("sorting rules: moving a mail adds a rule for that sender, and it can be removed (#13)", async ({ page }) => {
  const api = await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator(row("promo")).locator(".row-main").click();
  await page.getByRole("radio", { name: "Later" }).click();
  await page.getByRole("button", { name: "Back to list" }).click();

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sorting rules" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const rule = dialog.getByRole("listitem").filter({ hasText: "Coursera" });
  await expect(rule).toContainText("Later");
  await rule.getByRole("button", { name: /Remove rule/ }).click();
  await expect(rule).toHaveCount(0);
  await expect(dialog.getByText("None yet.")).toBeVisible();
  expect(api.forgotten).toEqual(["no-reply@coursera.org"]);
});

test("offline: the saved inbox shows, marked offline, and changes are paused (#14)", async ({ page, context }) => {
  await mockApi(page, smallInbox());
  await page.route("**/api/app-version", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ build: 6 }) }));
  await page.goto("/e2e?app=6"); // the installed app keeps an offline copy; a browser tab doesn't (#38)
  await expect(page.locator(row("cat1"))).toBeVisible();
  await page.waitForTimeout(1200); // the copy is saved shortly after the list loads

  // a fresh start with no connection to the API: the saved list appears straight away
  await page.unroute("**/api/**");
  await page.route("**/api/**", (r) => r.abort("internetdisconnected"));
  await page.reload();
  await expect(page.locator(row("cat1"))).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toBeVisible();

  await page.locator(row("hack")).locator(".row-main").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Changes are paused until you're back online.").last()).toBeVisible();
  await expect(page.locator(row("hack"))).toHaveClass(/unread/);

  // back online: the banner goes
  await page.unroute("**/api/**");
  await mockApi(page, smallInbox());
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "You're offline" })).toHaveCount(0);
});

test("iPhone: tapping search doesn't zoom the page, and nothing scrolls sideways (#17)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone screens only");
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  const box = await searchBox(page);
  expect(await box.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.locator(row("cat1")).locator(".row-main").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("AI is off until the student answers, once (#31)", async ({ page }) => {
  await mockApi(page, smallInbox(), { aiConsent: null });
  await page.goto("/e2e");
  const ask = page.getByRole("region", { name: "Let AI double-check unclear mail?" });
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  // both answers look the same (#44)
  const look = (name: string) => ask.getByRole("button", { name }).evaluate((b) => { const s = getComputedStyle(b); return [s.backgroundColor, s.color, s.fontWeight, s.borderTopWidth].join(); });
  expect(await look("Allow AI")).toBe(await look("Rules only"));
  await ask.getByRole("button", { name: "Rules only" }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("checkbox", { name: "Use AI for unclear mail" })).not.toBeChecked();
});

test("the Android app offers its own update when a newer build is out", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.route("**/api/app-version", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ build: 6 }) }));
  await page.goto("/e2e?app=4#/inbox");
  const banner = page.getByRole("region", { name: "A new version of the DELT app is ready." });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: "Update" })).toHaveAttribute("href", "https://github.com/pranavvehmid/delt/releases/download/app-latest/DELT.apk");
  await banner.getByRole("button", { name: "Later" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.locator(row("cat1"))).toBeVisible();
  await expect(banner).toHaveCount(0); // snoozed for a few days
});

test("no update banner for an up-to-date app or a normal browser", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.route("**/api/app-version", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ build: 6 }) }));
  await page.goto("/e2e?app=6#/inbox");
  await expect(page.locator(row("cat1"))).toBeVisible();
  await expect(page.getByText("A new version of the DELT app is ready.")).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await page.goto("/e2e#/inbox");
  await expect(page.locator(row("cat1"))).toBeVisible();
  await expect(page.getByText("A new version of the DELT app is ready.")).toHaveCount(0);
});

test("the mail frame fits the mail: short mail, short box; long mail, all of it (#45)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator(row("cat1")).locator(".row-main").click();
  await expect(page.frameLocator(".mv-frame").getByText("Full text of")).toBeVisible();
  await expect.poll(async () => (await page.locator(".mv-frame").boundingBox())!.height).toBeLessThan(140);
  await page.getByRole("button", { name: "Back to list" }).click();
  await page.locator(row("news")).locator(".row-main").click();
  await expect(page.frameLocator(".mv-frame").getByText("Paragraph 40 of")).toBeAttached();
  await expect.poll(async () => (await page.locator(".mv-frame").boundingBox())!.height).toBeGreaterThan(900);
});

test("moving a mail says it makes a rule, and 'Just this one' moves it without one (#46)", async ({ page }) => {
  const api = await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator(row("promo")).locator(".row-main").click();
  await page.getByRole("radio", { name: "Later" }).click();
  const toast = page.getByRole("status").filter({ hasText: "New mail from Coursera will go there too." });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Just this one" }).click();
  await expect(page.getByRole("status").filter({ hasText: "no rule for Coursera" })).toBeVisible();
  expect(api.patches.at(-1)).toEqual({ id: "promo", priority: "later", teach: false });
  await page.getByRole("button", { name: "Back to list" }).click();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sorting rules" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByText("None yet.")).toBeVisible();
});

test("Mark all read can be undone (#47)", async ({ page }) => {
  const api = await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await expect(page.locator("li.row.unread")).toHaveCount(4);
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.locator("li.row.unread")).toHaveCount(0);
  await page.getByRole("status").filter({ hasText: "4 marked read" }).getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("li.row.unread")).toHaveCount(4);
  await expect.poll(() => api.bulk.length).toBe(2);
  expect(api.bulk[1].read).toBe(false);
  expect(new Set(api.bulk[1].ids)).toEqual(new Set(api.bulk[0].ids));
});

test("All starts with what needs you: due soon first, then unread urgent; not shown when filtering (#23)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  const needs = page.getByRole("region", { name: "Needs you" });
  await expect(needs.locator("li.row")).toHaveCount(2);
  await expect(needs.locator("li.row").first()).toHaveAttribute("data-mail", "fee");
  await expect(needs.locator("li.row").nth(1)).toHaveAttribute("data-mail", "cat1");
  await expect(page.locator('li.row[data-mail="fee"]')).toHaveCount(1); // moved up, not repeated
  await page.getByRole("navigation", { name: "Filter by pile" }).getByRole("button", { name: /^Urgent/ }).click();
  await expect(needs).toHaveCount(0);
  await page.getByRole("navigation", { name: "Filter by pile" }).getByRole("button", { name: /^All/ }).click();
  await (await searchBox(page)).fill("hostel");
  await expect(needs).toHaveCount(0);
});

test("a mail fetches nothing from the sender until Load images, and can't redirect itself (#32)", async ({ page }) => {
  await mockApi(page, smallInbox());
  const hits: string[] = [];
  await page.route("https://tracker.example/**", (r) => (hits.push(r.request().url()), r.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAAAAACw=", "base64") })));
  await page.route("https://phish.example/**", (r) => (hits.push(r.request().url()), r.fulfill({ body: "phish" })));
  await page.goto("/e2e");
  await page.locator(row("webinar")).locator(".row-main").click();
  await expect(page.frameLocator(".mv-frame").getByText("Join us online.")).toBeVisible();
  await page.waitForTimeout(800);
  expect(hits).toEqual([]);
  await page.getByRole("button", { name: "Load images" }).click();
  await expect.poll(() => hits.filter((h) => h.includes("tracker")).length).toBeGreaterThan(0);
  expect(hits.some((h) => h.includes("phish"))).toBe(false);
});

test("security headers: DELT can't be framed, and only loads its own scripts (#34)", async ({ request }) => {
  for (const path of ["/", "/privacy", "/e2e"]) {
    const h = (await request.get(path)).headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  }
});

test("a plain browser tab keeps no copy of the inbox (#38)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await expect(page.locator(row("cat1"))).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("delt-inbox:")))).toEqual([]);
});

test("a sync problem is shown in the header, not hidden (#40)", async ({ page }) => {
  await mockApi(page, smallInbox(), { syncProblem: "Gmail /messages failed (500)" });
  await page.goto("/e2e");
  const btn = page.locator("header .sync");
  await expect(btn).toContainText("Last check had a problem");
  await expect(btn).toHaveAttribute("title", "Gmail /messages failed (500). Tap to try again.");
});

test("on a wide screen a mail opens beside the list, and you can click straight through (#48)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator(row("cat1")).locator(".row-main").click();
  const pane = page.locator(".mailview.pane");
  await expect(pane).toBeVisible();
  await expect(page.locator(row("fee"))).toBeVisible(); // the list is still there
  expect((await pane.boundingBox())!.x).toBeGreaterThan(400);
  await expect(page.locator(row("cat1")).locator(".row-main")).toHaveAttribute("aria-current", "true");
  await page.locator(row("fee")).locator(".row-main").click();
  await expect(page.locator("#mv-title")).toHaveText("Hostel fee payment: last date");
  await page.keyboard.press("Escape");
  await expect(pane).toHaveCount(0);
});

test("on a phone a mail still covers the screen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator(row("cat1")).locator(".row-main").click();
  await expect(page.locator(".mailview:not(.pane)")).toBeVisible();
});

test("next and previous mail from inside a mail, by button and J/K; Back still goes to the list (#49)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.getByRole("navigation", { name: "Filter by pile" }).getByRole("button", { name: /^Priority/ }).click();
  await page.locator(row("hack")).locator(".row-main").click();
  await expect(page.locator("#mv-title")).toHaveText("Hackathon registrations open");
  await expect(page.getByRole("button", { name: "Previous mail" })).toBeDisabled();
  await page.getByRole("button", { name: "Next mail" }).click();
  await expect(page.locator("#mv-title")).toHaveText("Library timings this week");
  await expect(page.getByRole("button", { name: "Next mail" })).toBeDisabled();
  await page.locator("body").press("k");
  await expect(page.locator("#mv-title")).toHaveText("Hackathon registrations open");
  await page.goBack();
  await expect(page.locator(".mailview")).toHaveCount(0);
});

test("pull down at the top of the list to check for mail (#51)", async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName === "webkit", "touch only; WebKit doesn't let scripts create Touch objects");
  const api = await mockApi(page, smallInbox());
  let checks = 0;
  await page.route("**/api/sync", (r) => (checks++, r.fulfill({ contentType: "application/json", body: JSON.stringify({ fetched: 0 }) })));
  await page.goto("/e2e");
  await expect(page.locator(row("cat1"))).toBeVisible();
  await page.waitForTimeout(500);
  const before = checks;
  await page.evaluate(async () => {
    const t = (y: number) => [new Touch({ identifier: 1, target: document.body, clientX: 200, clientY: y })];
    window.dispatchEvent(new TouchEvent("touchstart", { touches: t(100) }));
    for (let y = 110; y <= 300; y += 20) window.dispatchEvent(new TouchEvent("touchmove", { touches: t(y) }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new TouchEvent("touchend", { touches: [] }));
  });
  await expect.poll(() => checks).toBeGreaterThan(before);
  void api;
});

test("Minimal marks unread mail with a square, and read mail without (#52)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  const mark = (id: string) => page.locator(`${row(id)} .row-text`).evaluate((el) => getComputedStyle(el, "::before").content);
  expect(await mark("hack")).toBe('""');
  expect(await mark("notice")).toBe("none");
});

test("the account menu keeps Delete my data apart, last (#53)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.getByRole("button", { name: "Account" }).click();
  const items = await page.locator("#acct-menu .menu-item").allTextContents();
  expect(items.map((x) => x.trim())).toEqual(["Settings", "Sorting rules", "Open Gmail ↗", "Sign out", "Delete my data"]);
  await expect(page.locator("#acct-menu .menu-sep")).toHaveCount(2);
});

test("deadlines say only what the heading doesn't, label their icons, and a wrong date can be removed (#55)", async ({ page }) => {
  const api = await mockApi(page, smallInbox());
  await page.goto("/e2e#/deadlines");
  const r = page.locator('li.row[data-mail="fee"]');
  await expect(r.locator(".due")).not.toContainText(/tomorrow/i);
  await expect(r.getByText("Calendar")).toBeVisible();
  await expect(page.getByText("Nothing else is due")).toBeVisible();
  await r.locator(".row-main").click();
  await page.getByRole("button", { name: "Wrong date? Remove" }).click();
  expect(api.patches.at(-1)).toEqual({ id: "fee", deadline: null });
  await page.getByRole("button", { name: "Back to list" }).click();
  await expect(page.locator('li.row[data-mail="fee"]')).toHaveCount(0);
});

test("a first-time student gets a short welcome, once (#56)", async ({ page }) => {
  await mockApi(page, smallInbox(), { welcome: true });
  await page.goto("/e2e");
  const w = page.getByRole("dialog", { name: "Welcome to DELT" });
  await expect(w).toBeVisible();
  await expect(w.getByText("Moving a mail teaches DELT.")).toBeVisible();
  await w.getByRole("button", { name: "Got it" }).click();
  await expect(w).toHaveCount(0);
  await page.reload();
  await expect(page.locator(row("cat1"))).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Welcome to DELT" })).toHaveCount(0);
});

test("an empty search says what was searched and offers to widen it; matches are marked (#57)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.getByRole("navigation", { name: "Filter by pile" }).getByRole("button", { name: /^Noise/ }).click();
  await (await searchBox(page)).fill("hostel");
  await expect(page.getByText("Nothing matches “hostel” in Noise")).toBeVisible();
  await page.getByRole("button", { name: "Search all piles" }).click();
  await expect(page.locator(row("fee"))).toBeVisible();
  await expect(page.locator(row("fee")).locator("mark")).toHaveText("Hostel");
});

test("the sign-in page shows a sorted example, Google's button and the Android app (#58)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "An example of a sorted inbox" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get the Android app" })).toHaveAttribute("href", /DELT\.apk$/);
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
});

test("small details: counts say what they count and Back has a word (#59)", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /^Inbox/ })).toHaveAttribute("title", /\d+ unread/);
  await page.locator(".row-main").first().click();
  await expect(page.getByRole("button", { name: "Back to list" })).toContainText("Back");
});

for (const look of ["minimal", "glyph", "grid"] as const) {
  test(`a ${look} row renders only what ${look} shows (#61)`, async ({ page }, info) => {
    await page.addInitScript((l) => localStorage.setItem("delt-prefs", JSON.stringify({ look: l, mode: "light", accent: "auto", size: "normal", density: "comfortable" })), look);
    await mockApi(page, smallInbox());
    await page.goto("/e2e");
    await expect(page.locator("li.row").first()).toBeVisible();
    const counts = await page.locator("li.row").evaluateAll((rows) => rows.map((r) => r.querySelectorAll("*").length + 1));
    // a phone has no hover buttons; a desktop adds 7 for them
    const limit = { minimal: 12, grid: 13, glyph: 16 }[look] + (info.project.name === "phone" ? 0 : 7);
    expect(Math.max(...counts)).toBeLessThanOrEqual(limit);
  });
}

test("a filter change draws the first rows at once and the rest right after (#60)", async ({ page }) => {
  await mockApi(page, bigInbox(120));
  await page.goto("/e2e");
  const chips = page.getByRole("navigation", { name: "Filter by pile" });
  await expect.poll(() => page.locator("li.row").count()).toBeGreaterThan(24);
  const total = await page.locator("li.row").count();
  await chips.getByRole("button", { name: /^Urgent/ }).click();
  await chips.getByRole("button", { name: /^All/ }).click();
  await expect(page.locator("li.row")).toHaveCount(total);
});

test("the privacy page has bullets and space between paragraphs (#66)", async ({ page }) => {
  await page.goto("/privacy");
  const doc = page.locator(".doc");
  expect(await doc.locator("ul").first().evaluate((el) => getComputedStyle(el).listStyleType)).toBe("disc");
  expect(await doc.locator("p + p").first().evaluate((el) => parseFloat(getComputedStyle(el).marginTop))).toBeGreaterThan(8);
});

test("a sheet over the reading pane: Esc closes only the sheet, and J/K wait (#41)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator(row("cat1")).locator(".row-main").click();
  const title = await page.locator("#mv-title").textContent();
  await page.getByRole("button", { name: "Account" }).click();
  await page.locator("#acct-menu .menu-item", { hasText: /^Settings$/ }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("j");
  await expect(page.locator("#mv-title")).toHaveText(title!);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".mailview.pane")).toBeVisible();
  await expect(page.locator("#mv-title")).toHaveText(title!);
});

test("on a phone, search waits behind a top-bar button so the list starts higher (#102)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone screens only; laptops keep search in the top bar");
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  const box = page.getByRole("textbox", { name: "Search mail" });
  const button = page.getByRole("button", { name: "Search mail" });
  await expect(page.locator(row("cat1"))).toBeVisible();
  await expect(box).toHaveCount(0);
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // opening puts the cursor straight in the box
  await button.click();
  await expect(box).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "true");

  // Esc folds it away again; so does tapping elsewhere while it's empty
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await button.click();
  await page.locator("main").click({ position: { x: 4, y: 4 } });
  await expect(box).toHaveCount(0);

  // a search in progress keeps it open, and clearing closes it
  await button.click();
  await box.fill("hostel");
  await page.locator("main").click({ position: { x: 4, y: 4 } });
  await expect(box).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(box).toHaveCount(0);
  await expect(page.locator(row("cat1"))).toBeVisible();
});
