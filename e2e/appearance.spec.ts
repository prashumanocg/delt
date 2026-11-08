// Issue #12: every option in the Appearance panel applies, survives a reload, and doesn't break the layout.
import { expect, test, type Page } from "@playwright/test";
import { mockApi, smallInbox } from "./mock";

const html = (page: Page) => page.locator("html");
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function openPanel(page: Page) {
  await page.getByRole("button", { name: "Appearance" }).click();
  const panel = page.getByRole("dialog", { name: "Appearance" });
  await expect(panel).toBeVisible();
  return panel;
}

for (const look of ["Minimal", "Glyph"] as const) {
  test(`${look}: every theme applies, with no sideways scrolling`, async ({ page }) => {
    await mockApi(page, smallInbox());
    await page.goto("/e2e");
    const panel = await openPanel(page);
    await panel.getByRole("radio", { name: new RegExp(look) }).click();
    await expect(html(page)).toHaveAttribute("data-look", look.toLowerCase());

    const themes = [
      ["Light", "light", "normal"],
      ["Dark", "dark", "normal"],
      ["Extra dark", "dark", "black"],
    ] as const;
    for (const [name, theme, tone] of themes) {
      await panel.getByRole("radio", { name, exact: true }).click();
      await expect(html(page)).toHaveAttribute("data-theme", theme);
      await expect(html(page)).toHaveAttribute("data-tone", tone);
      expect(await noSideScroll(page)).toBe(true);
    }

    // Auto follows the phone's setting, live
    await page.emulateMedia({ colorScheme: "dark" });
    await panel.getByRole("radio", { name: "Auto", exact: true }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).toHaveAttribute("data-theme", "light");

    // the background really changes between light and extra dark
    await panel.getByRole("radio", { name: "Light", exact: true }).click();
    await page.waitForTimeout(450); // colours cross-fade
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await panel.getByRole("radio", { name: "Extra dark", exact: true }).click();
    await page.waitForTimeout(450);
    const blackBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(blackBg).not.toBe(lightBg);
  });
}

test("accent, text size and spacing apply and are remembered after a reload", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  let panel = await openPanel(page);
  for (const [name, key] of [["Purple", "purple"], ["Blue", "blue"], ["Green", "green"], ["Red", "red"], ["Gold", "gold"], ["Default", "auto"]] as const) {
    await panel.getByRole("radio", { name, exact: true }).click();
    await expect(html(page)).toHaveAttribute("data-accent", key);
  }
  await panel.getByRole("radio", { name: "Blue", exact: true }).click();
  await panel.getByRole("radio", { name: "Large", exact: true }).click();
  await expect(html(page)).toHaveAttribute("data-size", "large");
  await panel.getByRole("radio", { name: "Compact", exact: true }).click();
  await expect(html(page)).toHaveAttribute("data-density", "compact");
  await panel.getByRole("radio", { name: /Glyph/ }).click();
  await panel.getByRole("radio", { name: "Dark", exact: true }).click();
  expect(await noSideScroll(page)).toBe(true);

  await page.reload();
  // applied before the first paint, from what was saved
  await expect(html(page)).toHaveAttribute("data-look", "glyph");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-accent", "blue");
  await expect(html(page)).toHaveAttribute("data-size", "large");
  await expect(html(page)).toHaveAttribute("data-density", "compact");
  panel = await openPanel(page);
  await expect(panel.getByRole("radio", { name: "Large", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("the panel closes with Done, Esc, or a tap outside", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  let panel = await openPanel(page);
  await panel.getByRole("button", { name: "Done" }).click();
  await expect(panel).toHaveCount(0);
  panel = await openPanel(page);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  panel = await openPanel(page);
  await page.locator(".veil").click({ position: { x: 10, y: 10 } });
  await expect(panel).toHaveCount(0);
});

test("Extra dark: the mail itself is shown dark, with a switch back to original colours (#26)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("delt-prefs", JSON.stringify({ look: "minimal", mode: "black", accent: "auto", size: "normal", density: "comfortable" })));
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  expect(await page.locator('meta[name="theme-color"]').first().getAttribute("content")).toBe("#000000");
  await page.locator('li.row[data-mail="fee"] .row-main').click();
  const frame = page.locator(".mv-frame");
  await expect(frame).toHaveClass(/dim/);
  await page.getByRole("button", { name: "Original colours" }).click();
  await expect(frame).not.toHaveClass(/dim/);
  await page.getByRole("button", { name: "Show dark" }).click();
  await expect(frame).toHaveClass(/dim/);
});

// #71: every piece of text in the mail passes 4.5:1 on the colour it actually sits on, in every dark theme
for (const [look, mode] of [["minimal", "black"], ["minimal", "dark"], ["glyph", "dark"], ["glyph", "black"], ["grid", "dark"], ["grid", "black"]] as const) {
  test(`${look} ${mode}: every line of a dark mail is readable (#71)`, async ({ page }) => {
    await page.addInitScript(([l, m]) => {
      localStorage.setItem("delt-prefs", JSON.stringify({ look: l, mode: m, accent: "auto", size: "normal", density: "comfortable" }));
      localStorage.setItem("delt-welcomed", "1");
    }, [look, mode]);
    await mockApi(page, smallInbox());
    await page.goto("/e2e");
    await page.locator('li.row[data-mail="notice"] .row-main').click();
    const frame = page.frameLocator(".mv-frame");
    await expect(frame.getByText("Closed on 12 Nov.")).toBeVisible();
    await expect(frame.locator("body[data-dark]")).toHaveCount(1);
    const page_bg = await page.locator(".mv-frame").evaluate((f) => {
      for (let e: Element | null = f.parentElement; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
      }
      return getComputedStyle(document.body).backgroundColor;
    });
    const results = await frame.locator("body").evaluate((body, pageBg) => {
      const parse = (s: string) => s.match(/[\d.]+/g)!.map(Number);
      const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const out: { text: string; ratio: number; bg: string }[] = [];
      const win = body.ownerDocument.defaultView!;
      for (const el of body.querySelectorAll("*")) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim()).map((n) => n.textContent!.trim()).join(" ");
        if (!own) continue;
        let bg = parse(pageBg);
        for (let e: Element | null = el; e; e = e.parentElement) {
          const c = parse(win.getComputedStyle(e).backgroundColor);
          if (c.length < 4 || c[3] > 0.5) { bg = c; break; }
        }
        const fg = parse(win.getComputedStyle(el).color);
        const [a, b] = [lum(fg), lum(bg)];
        out.push({ text: own.slice(0, 30), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), bg: bg.join(",") });
      }
      return out;
    }, page_bg);
    expect(results.length).toBeGreaterThanOrEqual(6);
    for (const r of results) expect(r.ratio, `"${r.text}" on ${r.bg}`).toBeGreaterThanOrEqual(4.5);
    // white boxes became dark, not a bright block on a dark screen
    for (const r of results) expect(Math.max(...r.bg.split(",").slice(0, 3).map(Number)), `"${r.text}" box ${r.bg}`).toBeLessThan(90);
  });
}

test("Light theme: mail keeps its own colours", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator('li.row[data-mail="fee"] .row-main').click();
  await expect(page.locator(".mv-frame")).not.toHaveClass(/dim/);
  await expect(page.getByRole("button", { name: "Original colours" })).toHaveCount(0);
});

test("Grid (F1-inspired): always dark, its own driver colours, and back to Minimal cleanly", async ({ page }) => {
  test.setTimeout(60_000); // eight colour changes, each a cross-fade
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  const panel = await openPanel(page);
  await panel.getByRole("radio", { name: /Grid/ }).click();
  await expect(html(page)).toHaveAttribute("data-look", "grid");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  // only Dark and Extra dark
  await expect(panel.getByRole("radio", { name: "Light", exact: true })).toHaveCount(0);
  await panel.getByRole("radio", { name: "Extra dark", exact: true }).click();
  await expect(html(page)).toHaveAttribute("data-tone", "black");
  for (const [name, key] of [["Teal", "teal"], ["Navy", "navy"], ["Racing green", "racing"], ["Sky", "sky"], ["Pink", "pink"], ["Black and gold", "gold"], ["Race red", "auto"], ["Papaya", "papaya"]] as const) {
    await panel.getByRole("radio", { name, exact: true }).click();
    await expect(html(page)).toHaveAttribute("data-accent", key);
  }
  expect(await noSideScroll(page)).toBe(true);
  // #73: F1's broadcast type: upright, extra wide, Saira
  const mast = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".mast button")!);
    return { style: s.fontStyle, stretch: s.fontStretch, family: s.fontFamily };
  });
  expect(mast.style).toBe("normal");
  expect(mast.stretch).toBe("125%");
  expect(mast.family).toMatch(/race|Saira/i);

  // Minimal doesn't have papaya: it falls back to its default
  await panel.getByRole("radio", { name: /Minimal/ }).click();
  await expect(html(page)).toHaveAttribute("data-look", "minimal");
  await expect(html(page)).toHaveAttribute("data-accent", "auto");
});

test("the DELT logo is the same Minimal wordmark in every look and theme", async ({ page }) => {
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  const shape = () =>
    page.locator("header .logo").evaluate((el) => {
      const s = getComputedStyle(el), dot = getComputedStyle(el.querySelector("i")!);
      return { font: s.fontFamily.split(",")[0], weight: s.fontWeight, style: s.fontStyle, size: s.fontSize, spacing: s.letterSpacing, bg: s.backgroundColor, dot: dot.borderRadius, dotW: dot.width };
    });
  const reference = await shape();
  expect(reference.weight).toBe("700");
  const panel = await openPanel(page);
  for (const look of ["Glyph", "Grid", "Minimal"]) {
    await panel.getByRole("radio", { name: new RegExp(look) }).click();
    for (const theme of look === "Grid" ? ["Dark", "Extra dark"] : ["Light", "Dark", "Extra dark"]) {
      await panel.getByRole("radio", { name: theme, exact: true }).click();
      expect(await shape(), `${look} ${theme}`).toEqual(reference);
    }
  }
});

test.describe("with animations on", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });
  test("a second change during an animation doesn't raise an error (skipped transition)", async ({ page }) => {
    await mockApi(page, smallInbox());
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/e2e");
    const panel = await openPanel(page);
    // two theme changes in the same instant: the second view transition skips the first
    const clicked = await panel.evaluate((el) => {
      const radio = (name: string) => [...el.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent?.trim() === name);
      const [dark, light] = [radio("Dark"), radio("Light")];
      dark?.click();
      light?.click();
      return !!dark && !!light;
    });
    expect(clicked).toBe(true);
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test("opening and closing a mail, a panel, and switching theme all still work", async ({ page }) => {
    await mockApi(page, smallInbox());
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/e2e");
    await page.locator('li.row[data-mail="cat1"] .row-main').click();
    await expect(page.getByRole("dialog", { name: "CAT-1 exam schedule released" })).toBeVisible();
    await page.getByRole("button", { name: "Back to list" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const panel = await openPanel(page);
    await panel.getByRole("radio", { name: "Dark", exact: true }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test("#234: a chosen accent colour never changes the colour of urgency", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("delt-prefs", JSON.stringify({ look: "minimal", mode: "light", accent: "green", size: "normal", density: "comfortable" })));
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  const time = page.locator("li.row.ink-very_important .when").first();
  await expect(time).toBeVisible();
  const [urgent, accent] = await Promise.all([
    time.evaluate((e) => getComputedStyle(e).color),
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()),
  ]);
  expect(accent).toBe("#188038"); // green is really on
  expect(urgent).toBe("rgb(200, 16, 46)"); // still the urgency red
});

test("#205: in dark mail, pictures get a light backing so transparent logos stay visible", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("delt-prefs", JSON.stringify({ look: "minimal", mode: "black", accent: "auto", size: "normal", density: "comfortable" })));
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await page.locator('li.row[data-mail="notice"] .row-main').click();
  const frame = page.frameLocator(".mv-frame");
  await expect(frame.locator("body[data-dark]")).toHaveCount(1);
  expect(await frame.getByAltText("Library seal").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(245, 245, 245)");
});
