// #67–#70: the layout is measured, not eyeballed. Edges, baselines and sizes that should match do.
import { expect, test, type Page } from "@playwright/test";
import { mockApi, searchBox, smallInbox } from "./mock";

const LOOKS = ["minimal", "glyph", "grid"] as const;

async function open(page: Page, look: (typeof LOOKS)[number]) {
  await page.addInitScript((l) => {
    localStorage.setItem("delt-prefs", JSON.stringify({ look: l, mode: l === "grid" ? "dark" : "light", accent: "auto", size: "normal", density: "comfortable" }));
    localStorage.setItem("delt-welcomed", "1");
  }, look);
  await mockApi(page, smallInbox());
  await page.goto("/e2e");
  await expect(page.locator("li.row").first()).toBeVisible();
  // rows draw only the parts their look shows (#61); wait until they're the right look's rows
  const part = { minimal: ".when", glyph: ".avatar", grid: ".pos" }[look];
  await expect(page.locator(`li.row ${part}`).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // rows drawn a moment later (#60) slide in; measure where they end up
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => null))),
  );
}

const box = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
const near = (a: number, b: number, what: string, tol = 1) => expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);

for (const look of LOOKS) {
  test(`${look}: header, search and rows share the same left and right edges (#67)`, async ({ page }) => {
    await open(page, look);
    await searchBox(page); // #102: on a phone, open it from the top bar first
    const [logo, search, avatar, row] = await Promise.all([box(page, ".logo"), box(page, ".searchbar"), box(page, ".avatar.me"), box(page, "li.row")]);
    const width = await page.evaluate(() => innerWidth);
    if (width >= 1000) {
      // #76: on a laptop the bar spans the window: the logo lines up with the list, the account sits 24px from the right edge
      near(logo.left, row.left, "logo / row left");
      near(width - avatar.right, 24, "avatar / window right");
    } else {
      near(logo.left, search.left, "logo / search left");
      near(row.left, search.left, "row / search left");
      near(avatar.right, search.right, "avatar / search right");
    }
    // header controls are one height
    const sync = await box(page, ".sync");
    near(sync.height, avatar.height, "status chip / avatar height");
    near(sync.top + sync.height / 2, avatar.top + avatar.height / 2, "status chip / avatar centre");
  });

  test(`${look}: in a row, the sender and the subject start on one edge, read or unread (#67)`, async ({ page }) => {
    await open(page, look);
    const edges = await page.locator("li.row").evaluateAll((rows) =>
      rows.map((r) => {
        // Grid starts the line with the sender's short code (like a driver's three letters)
        const from = r.querySelector(".code") ?? r.querySelector(".from")!, subj = r.querySelector(".subj")!;
        // where the words start: the first text node, not a marker drawn before it
        const range = document.createRange();
        const textOf = (el: Element) => [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent!.trim()) ?? el;
        range.selectNodeContents(textOf(from));
        const f = range.getBoundingClientRect().left;
        range.selectNodeContents(textOf(subj));
        return { f, s: range.getBoundingClientRect().left, unread: r.classList.contains("unread"), id: r.getAttribute("data-mail") + " pos=" + !!r.querySelector(".pos") + " " + r.className };
      }),
    );
    for (const e of edges) near(e.s, e.f, `subject / sender (${e.unread ? "unread" : "read"})`, 1.5);
    const subjects = edges.map((e) => e.s);
    near(Math.min(...subjects), Math.max(...subjects), "every subject's left edge " + JSON.stringify(edges.map((e) => [e.id, e.s])), 1.5);
  });
}

for (const look of ["minimal", "grid"] as const) {
  test(`${look}: the time lines up with the sender, not between sender and subject (#67)`, async ({ page }) => {
    await open(page, look);
    const pairs = await page.locator("li.row").evaluateAll((rows) =>
      rows.map((r) => ({ when: r.querySelector(".when")?.getBoundingClientRect().top ?? null, from: r.querySelector(".from")?.getBoundingClientRect().top ?? null })),
    );
    for (const p of pairs) if (p.when !== null && p.from !== null) near(p.when, p.from, "time / sender top", 2);
  });
}

test("Deadlines: Calendar and Done put their icons and labels on the same lines (#67)", async ({ page }) => {
  await open(page, "minimal");
  await page.locator("button:visible", { hasText: /^Deadlines/ }).first().click();
  const [cal, done] = await page.locator(".iconbtn.labelled").evaluateAll((els) =>
    els.slice(0, 2).map((b) => ({ svg: b.querySelector("svg")!.getBoundingClientRect().top, label: b.querySelector("small")!.getBoundingClientRect().top })),
  );
  near(cal.svg, done.svg, "icon tops");
  near(cal.label, done.label, "label tops");
});

test("Glyph: the two section tabs are the same width; on a wide screen they sit at the top (#67)", async ({ page }, info) => {
  await open(page, "glyph");
  if (info.project.name === "desktop") {
    await expect(page.locator(".tabbar")).toBeHidden();
    await expect(page.locator(".mast")).toBeVisible();
    const mast = await box(page, ".mast button");
    expect(mast.top).toBeLessThan(140);
    return;
  }
  const widths = await page.locator(".tabbar button").evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().width));
  near(widths[0], widths[1], "tab widths");
});

test("the open mail's Back arrow lines up with the mail text (#67)", async ({ page }) => {
  await open(page, "minimal");
  await page.locator('li.row[data-mail="cat1"] .row-main').click();
  await expect(page.locator("#mv-title")).toBeVisible();
  // the chevron is drawn from x=8 of its 24-unit box
  const arrow = await page.locator(".mv-back svg").evaluate((s) => { const b = s.getBoundingClientRect(); return b.left + (b.width * 8) / 24; });
  const title = await box(page, "#mv-title");
  near(arrow, title.left, "Back arrow / mail title", 2);
});

test("the sign-in wordmark starts on the text's left edge (#67)", async ({ page }) => {
  await page.goto("/");
  const ink = await page.locator(".signin .logo").evaluate((l) => {
    const cs = getComputedStyle(l);
    const c = document.createElement("canvas").getContext("2d")!;
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return l.getBoundingClientRect().left - c.measureText("D").actualBoundingBoxLeft;
  });
  const text = await page.locator(".signin h1").evaluate((h) => {
    const cs = getComputedStyle(h);
    const c = document.createElement("canvas").getContext("2d")!;
    c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return h.getBoundingClientRect().left - c.measureText(h.textContent!.trim()[0]).actualBoundingBoxLeft;
  });
  near(ink, text, "wordmark ink / heading ink", 1.5);
});

test("Minimal: the unread square is centred on the subject's first line, left of its edge (#67)", async ({ page }) => {
  await open(page, "minimal");
  const m = await page.locator('li.row.unread[data-mail="hack"] .row-text').evaluate((el) => {
    const cs = getComputedStyle(el, "::before");
    const t = el.getBoundingClientRect();
    const subj = el.querySelector(".subj")!;
    const lh = parseFloat(getComputedStyle(subj).lineHeight);
    const s = subj.getBoundingClientRect();
    return { top: t.top + parseFloat(cs.top), size: parseFloat(cs.height), left: t.left + parseFloat(cs.left), lineMid: s.top + lh / 2, subjLeft: s.left, rowLeft: el.closest("li")!.getBoundingClientRect().left };
  });
  near(m.top + m.size / 2, m.lineMid, "square centre / first line centre", 1.5);
  expect(m.left + m.size).toBeLessThan(m.subjLeft);
  expect(m.left).toBeGreaterThan(m.rowLeft);
});

// #68: spacing comes from one scale (4px steps; 1–2px only as hairline nudges)
for (const look of LOOKS) {
  test(`${look}: every padding, margin and gap on the inbox, Settings and Appearance is on the 4px scale (#68)`, async ({ page }) => {
    await open(page, look);
    const off = async (where: string) =>
      page.evaluate((where) => {
        const props = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "rowGap", "columnGap"] as const;
        const bad: string[] = [];
        for (const el of document.querySelectorAll("body *")) {
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          const cs = getComputedStyle(el);
          for (const p of props) {
            const v = cs[p];
            if (!v.endsWith("px")) continue;
            const n = Math.abs(parseFloat(v));
            if (![0, 1, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96].includes(Math.round(n * 100) / 100)) bad.push(`${where} ${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${p}=${v}`);
          }
        }
        return bad;
      }, where);
    const bad = [...(await off("inbox"))];
    await page.getByRole("button", { name: "Account" }).click();
    await page.locator("#acct-menu .menu-item", { hasText: /^Settings$/ }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    bad.push(...(await off("settings")));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Appearance/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Appearance" })).toBeVisible();
    bad.push(...(await off("appearance")));
    expect(bad, bad.join("\n")).toEqual([]);
  });
}

test("on a wide screen the list keeps its column and an empty pane waits beside it (#68)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "wide screens only");
  await open(page, "minimal");
  const pane = page.locator(".mv-empty");
  await expect(pane).toBeVisible();
  await expect(pane).toContainText("Today"); // A05: the overview
  const list = await box(page, "li.row");
  expect(list.right).toBeLessThanOrEqual(520); // #76: the list column scales up to 520px
  await page.locator('li.row[data-mail="cat1"] .row-main').click();
  await expect(pane).toHaveCount(0);
  await expect(page.locator(".mailview.pane")).toBeVisible();
});

// #69: one type scale per look, no faint weights, and the dot-matrix face only for short display text
const SIZES = [12.5, 14, 16, 18, 21, 22, 28, 34, 44];
for (const look of LOOKS) {
  test(`${look}: every text size on the inbox and in a mail is on the type scale, weight 400 or more (#69)`, async ({ page }) => {
    await open(page, look);
    const scan = (where: string) =>
      page.evaluate(
        ([where, sizes]) => {
          const bad: string[] = [];
          for (const el of document.querySelectorAll("body *")) {
            if (el.closest("iframe, svg, .sr-only")) continue;
            const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
            const b = el.getBoundingClientRect();
            if (!own || !b.width || !b.height) continue;
            const cs = getComputedStyle(el);
            const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight);
            const name = `${where} ${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${el.textContent!.trim().slice(0, 20)}"`;
            if (!(sizes as number[]).includes(size)) bad.push(`${name} size ${size}`);
            if (weight < 400) bad.push(`${name} weight ${weight}`);
            if (/dot/i.test(cs.fontFamily) && el.textContent!.trim().length > 16) bad.push(`${name} long text in the dot font`);
          }
          return bad;
        },
        [where, SIZES] as const,
      );
    const bad = await scan("inbox");
    await page.locator('li.row[data-mail="cat1"] .row-main').click();
    await expect(page.locator("#mv-title")).toBeVisible();
    bad.push(...(await scan("mail")));
    expect(bad, bad.join("\n")).toEqual([]);
  });
}

test("Minimal: day headings and sender names don't share a style (#69)", async ({ page }) => {
  await open(page, "minimal");
  const style = (sel: string) => page.locator(sel).first().evaluate((e) => { const c = getComputedStyle(e); return `${c.fontSize} ${c.fontWeight} ${c.textTransform} ${c.letterSpacing}`; });
  expect(await style(".dayhead")).not.toEqual(await style(".from"));
});

// #70: small details
test("the icons in the header and search bar are one size (#70)", async ({ page }) => {
  await open(page, "minimal");
  await searchBox(page);
  const sizes = await page.locator(".appbar svg:visible, .searchbar svg:visible").evaluateAll((s) => [...new Set(s.map((e) => Math.round(e.getBoundingClientRect().width)))]);
  expect(sizes).toEqual([20]);
});

for (const look of LOOKS) {
  test(`${look}: the summary and the mail under it are boxed the same way (#70)`, async ({ page }) => {
    await open(page, look);
    await page.locator('li.row[data-mail="cat1"] .row-main').click();
    await expect(page.locator(".mv-frame")).toBeVisible();
    const style = (sel: string) => page.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return { radius: c.borderTopLeftRadius, left: c.borderLeftWidth }; });
    const [sum, frame] = [await style(".mv-sum"), await style(".mv-frame")];
    expect(sum.radius).toBe(frame.radius);
    expect(sum.left).toBe(frame.left);
  });
}

test("Appearance: each look's description fits on one line (#70)", async ({ page }) => {
  await open(page, "minimal");
  await page.getByRole("button", { name: /Appearance/ }).first().click();
  const lines = await page.locator(".look-card small").evaluateAll((s) => s.map((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))));
  expect(lines).toEqual(lines.map(() => 1));
});

for (const look of ["minimal", "grid"] as const) {
  test(`${look}: A12: segmented choices start and end on the sheet's content edge`, async ({ page }) => {
    await open(page, look);
    await page.getByRole("button", { name: /Appearance/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "Appearance" });
    await expect(sheet).toBeVisible();
    const seg = sheet.locator(".seg").first();
    const [s, first, last] = [await seg.boundingBox(), await seg.locator("button").first().boundingBox(), await seg.locator("button").last().boundingBox()];
    expect(Math.abs(first!.x - s!.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(last!.x + last!.width - (s!.x + s!.width))).toBeLessThanOrEqual(0.5);
  });
}

test("A03: on a laptop, Minimal's unread count sits at the top of its title, not below", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await open(page, "minimal");
  const [b, sup] = [await box(page, ".appbar .mast button.on"), await box(page, ".appbar .mast button.on sup")];
  const word = await page.locator(".appbar .mast button.on").evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el.firstChild!);
    return r.getBoundingClientRect().toJSON() as DOMRect;
  });
  expect(sup.top).toBeLessThanOrEqual(word.top + word.height * 0.35);
  expect(sup.bottom).toBeLessThanOrEqual(word.bottom);
  expect(b.height).toBeGreaterThan(0);
});

test("A10: Minimal marks urgent mail with a red time and no floating dash", async ({ page }) => {
  await open(page, "minimal");
  const when = page.locator("li.row.ink-very_important .when").first();
  expect(await when.evaluate((e) => getComputedStyle(e, "::before").display)).toBe("none");
  const [c, other] = [await when.evaluate((e) => getComputedStyle(e).color), await page.locator("li.row:not(.ink-very_important) .when").first().evaluate((e) => getComputedStyle(e).color)];
  expect(c).not.toBe(other);
});

for (const look of LOOKS) {
  test(`${look}: A09: loading rows use the full row width`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem("delt-prefs", JSON.stringify({ look: l, mode: l === "grid" ? "dark" : "light", accent: "auto", size: "normal", density: "comfortable" })), look);
    await mockApi(page, smallInbox());
    await page.route("**/api/emails**", async (r) => { await new Promise((x) => setTimeout(x, 3000)); await r.fallback(); });
    await page.goto("/e2e");
    const sk = page.locator(".skeleton li").first();
    await expect(sk).toBeVisible();
    const [row, bar] = [await sk.boundingBox(), await sk.locator(".row-text .sk").nth(1).boundingBox()];
    expect(bar!.width).toBeGreaterThan(row!.width * 0.5);
  });
}
