// Issue #8: the main tasks work with a keyboard only, and axe finds no serious problems
// for screen reader users in either look, light or dark.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { bigInbox, mockApi, smallInbox } from "./mock";

async function axe(page: Page, what: string) {
  // measure the finished screen, not a fade-in halfway through
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const { violations } = await new AxeBuilder({ page } as never).exclude(".mv-frame").analyze(); // the mail itself is the sender's HTML
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${what}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function setLook(page: Page, look: "minimal" | "glyph" | "grid", mode: "light" | "dark" | "black") {
  await page.addInitScript(([look, mode]) => localStorage.setItem("delt-prefs", JSON.stringify({ look, mode, accent: "auto", size: "normal", density: "comfortable" })), [look, mode]);
}

test.describe("axe", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
for (const [look, modes] of [["minimal", ["light", "dark", "black"]], ["glyph", ["light", "dark", "black"]], ["grid", ["dark", "black"]]] as const) {
  for (const mode of modes) {
    test(`axe: ${look} ${mode}: inbox, mail, deadlines, settings`, async ({ page }) => {
      await setLook(page, look, mode);
      await mockApi(page, smallInbox());
      await page.goto("/e2e");
      await expect(page.locator('li.row[data-mail="cat1"]')).toBeVisible();
      await page.waitForTimeout(400);
      await axe(page, "inbox");

      await page.locator('li.row[data-mail="fee"] .row-main').click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await axe(page, "mail");
      await page.keyboard.press("Escape");

      await page.goto("/e2e#/deadlines");
      await expect(page.locator("main").getByText("Hostel fee payment: last date")).toBeVisible();
      await axe(page, "deadlines");

      await page.getByRole("button", { name: "Account" }).click();
      await page.getByRole("button", { name: "Settings" }).click();
      await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
      await axe(page, "settings");
    });
  }
}

});

test.describe("keyboard only", () => {
  test.skip(({ isMobile }) => !!isMobile, "keyboard tests run on the desktop layout");

  test("open a mail with Enter, act on it, close with Esc, and land back on the same row", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 860 }); // full-screen mail; wide screens use a pane (#48)
    const api = await mockApi(page, smallInbox());
    await page.goto("/e2e");
    const first = page.locator('li.row[data-mail="cat1"] .row-main');
    await expect(first).toBeVisible();
    await first.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "CAT-1 exam schedule released" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#mv-title")).toBeFocused();

    // mark done and move pile from the keyboard
    await dialog.getByRole("button", { name: "Done", exact: true }).focus();
    await page.keyboard.press("Enter");
    await dialog.getByRole("radio", { name: "Later" }).focus();
    await page.keyboard.press("Space");
    // the PATCH requests reach the fake API a moment after the key press: wait for them
    await expect.poll(() => api.patches).toEqual(expect.arrayContaining([{ id: "cat1", is_done: true }, { id: "cat1", priority: "later" }]));

    // Tab stays inside the open mail
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".mailview"))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(first).toBeFocused();
  });

  test("row buttons show up when tabbed to, so read/done work without a mouse or swipe", async ({ page }) => {
    const api = await mockApi(page, smallInbox());
    await page.goto("/e2e");
    await page.locator('li.row[data-mail="hack"] .row-main').focus();
    await page.keyboard.press("Tab");
    const btn = page.locator('li.row[data-mail="hack"] .row-acts button').first();
    await expect(btn).toBeFocused();
    await expect(page.locator('li.row[data-mail="hack"] .row-acts')).toHaveCSS("opacity", "1");
    await page.keyboard.press("Enter");
    await expect.poll(() => api.patches).toContainEqual({ id: "hack", read: true });
  });

  test("account menu opens from the keyboard and closes with Esc", async ({ page }) => {
    await mockApi(page, smallInbox());
    await page.goto("/e2e");
    const avatar = page.getByRole("button", { name: "Account" });
    await avatar.focus();
    await page.keyboard.press("Enter");
    await expect(avatar).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(avatar).toHaveAttribute("aria-expanded", "false");
    await expect(avatar).toBeFocused();
  });

  test("every row says what it is to a screen reader", async ({ page }) => {
    await mockApi(page, smallInbox());
    await page.goto("/e2e");
    await expect(page.getByRole("button", { name: /^Unread\. COE: CAT-1 exam schedule released\. Urgent, / })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hostel fee payment: last date\. Urgent, .*Due / })).toBeVisible();
  });
});

// #62: on a touch screen every control can be hit with a finger: at least 44 x 44 px,
// counting the invisible ::after that widens small words and chips.
for (const look of ["minimal", "glyph", "grid"] as const) {
  test(`every control in the ${look} inbox and deadlines is at least 44 px to tap (#62)`, async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "touch screens only");
    await page.addInitScript((l) => localStorage.setItem("delt-prefs", JSON.stringify({ look: l, mode: "light", accent: "auto", size: "normal", density: "comfortable" })), look);
    await mockApi(page, smallInbox());
    for (const tab of ["", "#/deadlines"]) {
      await page.goto("/e2e" + tab);
      await expect(page.locator("li.row").first()).toBeVisible();
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("a, button, input, select, label, [role=button]")) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
          if (el.closest("label") && el.tagName === "INPUT") continue; // the label is the target
          if (el.closest(".row-main") && !el.matches(".row-main")) continue;
          const a = getComputedStyle(el, "::after");
          const hit = a.position === "absolute" && a.content !== "none" ? { w: parseFloat(a.width), h: parseFloat(a.height) } : { w: 0, h: 0 };
          const w = Math.max(r.width, hit.w), h = Math.max(r.height, hit.h);
          if (w < 43.5 || h < 43.5) out.push(`${el.tagName} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20)} ${Math.round(w)}x${Math.round(h)}`);
        }
        return out;
      });
      expect(small, tab || "inbox").toEqual([]);
    }
  });
}

// #63: no text that carries information is under 12.5 px on a phone, in any look.
for (const look of ["minimal", "glyph", "grid"] as const) {
  test(`no information text under 12.5 px in the ${look} inbox and deadlines (#63)`, async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "phones only");
    await page.addInitScript((l) => localStorage.setItem("delt-prefs", JSON.stringify({ look: l, mode: "light", accent: "auto", size: "normal", density: "comfortable" })), look);
    await mockApi(page, smallInbox());
    for (const tab of ["", "#/deadlines"]) {
      await page.goto("/e2e" + tab);
      await expect(page.locator("li.row").first()).toBeVisible();
      const small = await page.evaluate(() => {
        const out: string[] = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const t = w.currentNode as Text;
          const el = t.parentElement!;
          if (!t.data.trim() || el.closest(".sr-only")) continue;
          if (!el.getBoundingClientRect().width || getComputedStyle(el).visibility === "hidden") continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 12.5) out.push(`${el.className || el.tagName} "${t.data.trim().slice(0, 20)}" ${size}px`);
        }
        return [...new Set(out)];
      });
      expect(small, tab || "inbox").toEqual([]);
    }
  });
}

// #64: the selected All chip is readable in Glyph in every mode
for (const mode of ["light", "dark", "black"] as const) {
  test(`the selected All chip has enough contrast in Glyph ${mode} (#64)`, async ({ page }) => {
    await page.addInitScript((m) => localStorage.setItem("delt-prefs", JSON.stringify({ look: "glyph", mode: m, accent: "auto", size: "normal", density: "comfortable" })), mode);
    await mockApi(page, smallInbox());
    await page.goto("/e2e");
    await expect(page.locator(".fchip.p-all.on")).toBeVisible();
    const r = await new AxeBuilder({ page } as never).include(".fchip.p-all.on").withRules(["color-contrast"]).analyze();
    expect(r.violations.map((v) => v.nodes.map((n) => n.failureSummary))).toEqual([]);
  });
}

// #65: Grid's slanted buttons don't stick out of their container or overlap each other
test("Grid's slanted buttons stay inside their box (#65)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("delt-prefs", JSON.stringify({ look: "grid", mode: "dark", accent: "auto", size: "normal", density: "comfortable" })));
  await mockApi(page, smallInbox());
  const check = () =>
    page.evaluate(() => {
      const bad: string[] = [];
      const pills = [...document.querySelectorAll<HTMLElement>(".pillbtn")].filter((p) => p.getBoundingClientRect().width > 0);
      for (const p of pills) {
        const r = p.getBoundingClientRect(), box = p.parentElement!.getBoundingClientRect();
        if (r.left < box.left - 0.5 || r.right > box.right + 0.5) bad.push(`${p.textContent} sticks out of its box`);
        const s = p.nextElementSibling?.getBoundingClientRect();
        if (s && s.width && s.top < r.bottom && s.bottom > r.top && s.left < r.right - 0.5 && s.left > r.left) bad.push(`${p.textContent} overlaps the next control`);
      }
      return { n: pills.length, bad };
    });
  await page.goto("/e2e");
  await page.locator("li.row .row-main").first().click();
  let r = await check();
  expect(r.n).toBeGreaterThan(0);
  expect(r.bad).toEqual([]);
  // and on a small phone
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(500);
  r = await check();
  expect(r.bad).toEqual([]);
  await page.setViewportSize(size);
  await page.getByRole("button", { name: "Back to list" }).click();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  r = await check();
  expect(r.bad).toEqual([]);
});

test("Esc closes the mail even when focus is on a link inside the mail itself", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 860 });
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator('li.row[data-mail="notice"] .row-main').click();
  const dialog = page.getByRole("dialog", { name: "Library timings this week" });
  await expect(dialog).toBeVisible();
  const link = page.frameLocator(".mv-frame").getByRole("link", { name: "Library portal" });
  await link.focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

// #236: in the laptop's split view, keyboard users skip the header and the list, and F6 moves between list and mail
test.describe("skip to the list or the open mail (#236)", () => {
  test.skip(({ isMobile }) => !!isMobile, "the split view is a laptop layout");

  test("the first Tab stops skip to the list, then to the open mail; F6 moves between them", async ({ page }) => {
    await mockApi(page, bigInbox(60));
    await page.goto("/e2e");
    const firstRow = page.locator("li.row .row-main").first();
    await expect(firstRow).toBeVisible();

    // nothing open: one skip button, off screen until it has focus, and it lands on the first mail
    const toList = page.getByRole("button", { name: "Skip to mail list" });
    expect(await toList.evaluate((b) => b.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
    await page.keyboard.press("Tab");
    await expect(toList).toBeFocused();
    expect(await toList.evaluate((b) => b.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Enter");
    await expect(firstRow).toBeFocused();

    // open a mail further down the list
    const row = page.locator("li.row .row-main").nth(20);
    const id = await row.evaluate((el) => el.closest("li")!.dataset.mail!);
    await row.click();
    await expect(page.locator("#mv-title")).toBeVisible();

    // arriving with that mail open (a reload keeps it): skip to the list, then the open mail, in two Tabs
    await page.reload();
    await expect(page.locator("#mv-title")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(toList).toBeFocused();
    await page.keyboard.press("Tab");
    const toMail = page.getByRole("button", { name: "Skip to open mail" });
    await expect(toMail).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#mv-title")).toBeFocused();

    // F6: back to that mail's own row, and over to the mail again
    await page.keyboard.press("F6");
    await expect(page.locator(`li.row[data-mail="${id}"] .row-main`)).toBeFocused();
    await page.keyboard.press("F6");
    await expect(page.locator("#mv-title")).toBeFocused();
  });
});
