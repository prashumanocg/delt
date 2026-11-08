# About this fork

This is [prashumanocg/delt](https://github.com/prashumanocg/delt), a personal fork of
[pranavvehmid/delt](https://github.com/pranavvehmid/delt). Upstream is the real project; this fork
tracks it closely and adds a few personal changes on top.

## What's different here

| Change | Where | Why |
|---|---|---|
| **Slate**: a cooler, softer version of Minimal's dark theme | `src/app/styles/look-slate.css`, `tests/slate.test.ts` | Dark mode is what I use. Raised panels and filled buttons read better on a dark screen than hairline boxes and outlined buttons |
| Servers in Mumbai (`bom1`) instead of Dublin | `vercel.json` | This copy's database is in Mumbai and its user is in Vellore (upstream #93) |
| Background sync reads the site from the `DELT_SITE` variable | `.github/workflows/sync.yml` | So this fork's sync job calls this fork's site, not upstream's. Also suitable for upstream: branch `fix/sync-site-variable` |

Everything else (sorting, sync, privacy, the other looks) is upstream's code, unchanged.

### How Slate is built
- It only applies to `data-look="minimal"` + `data-theme="dark"` + `data-tone="normal"`. Minimal Light,
  Extra dark, Glyph and Grid look exactly as they do upstream.
- It's one file, imported last in `src/app/app.css`, so it changes tokens and a few components without
  editing upstream's style files. That keeps merges from upstream small.
- It overrides some of Minimal's `!important` rules (square corners, spaced capitals), so it needs
  `!important` in those places too. Each one has a comment saying which rule it beats.
- `tests/slate.test.ts` checks Slate's text colours against WCAG on the page and on both panel colours.

## Branches and remotes

```
upstream  https://github.com/pranavvehmid/delt     (read only for us)
origin    https://github.com/prashumanocg/delt     (this fork)
```

| Branch | Holds |
|---|---|
| `main` | upstream's `main` plus our custom work |
| `custom/<name>` | a personal change, merged into our `main` |
| `upstream/<issue>-<name>` | a fix meant for upstream, branched from `upstream/main`, with **no** personal changes |

### Pulling in upstream
```bash
git fetch upstream
git switch main
git merge upstream/main
npm test
```

### Sending a fix upstream
1. Check the issue is still open and that upstream hasn't already fixed it in a recent commit.
2. `git switch -c upstream/<issue>-<name> upstream/main`
3. Make only that change, with a test, following upstream's `CONTRIBUTING.md`.
4. Open the PR from this fork against `pranavvehmid/delt`, referencing the issue.

## Sent upstream
| PR | Branch | Fixes |
|---|---|---|
| [#287](https://github.com/pranavvehmid/delt/pull/287) | `upstream/102-phone-inbox-header` | #102 (search part) |
| [#288](https://github.com/pranavvehmid/delt/pull/288) | `upstream/schema-users-name` | fresh databases rejected sign-in (`users.name`) |
| [#289](https://github.com/pranavvehmid/delt/pull/289) | `upstream/due-overdue-wording` | "Due overdue" wording |
| [#290](https://github.com/pranavvehmid/delt/pull/290) | `upstream/212-undo-stack` | #212 |
| [#291](https://github.com/pranavvehmid/delt/pull/291) | `upstream/101-mail-text-higher` | #101, part of #169 |
| [#292](https://github.com/pranavvehmid/delt/pull/292) | `upstream/236-skip-links` | #236 (skip links, F6) |

#287 and #292 both edit `inbox-app.tsx` and `base.css`; whichever merges second will need a rebase
(the same conflict was resolved on our `main` in 0069d6c).

## Upstream queue
Triaged 2026-11-08 from the 168 open issues on pranavvehmid/delt. Upstream `main` was still at
`414de98` (no new commits, no PRs of Pranav's own), so nothing below is already covered there.
Easiest first. Size: S = under an hour, M = a day, L = more.

**Pace:** 6 of our PRs (#287–#292) are open with no review, which is over the limit of 3. New fixes
get a branch on this fork and a pre-filled PR link in "PRs waiting to be sent"; they are opened only
when the open count drops below 3.

| # | Title | Size | Do? | Status / why |
|---|---|---|---|---|
| 185 | Package still named vit-mail-organizer | S | do | |
| 180 | README test badge says 231 tests | S | do | drop the hard-coded number |
| 171 | Throwaway `zz-*` specs run with the real suite | S | do | |
| 149 | Search requests can pile up | S | do | |
| 182 | DESIGN.md's code map is out of date | S | do | |
| 121 | Missing indexes for sync's filters | S | do | additive `create index if not exists` |
| 170 | Local browser tests run on the dev server | S | do | |
| 165 | The 30-second clock re-renders every row | M | do | |
| 152 | Session expiring mid-use reloads the page | M | do | |
| 150 | Every sync failure says "Couldn't reach Gmail" | M | do | |
| 106 | "later" sync phase has no lock | M | do | needs a schema column; Pranav applies it |
| 119 | Every inbox load writes "last seen" | M | do | |
| 118 | Each sync writes the users row 3–4 times | M | do | |
| 166 | Dark mail recolouring is one long task | M | do | |
| 134 | CSP allows inline scripts | M | do | nonces; needs care with Next's inline scripts |
| 155 | "Large text" uses CSS zoom | L | do | |
| 164 | Long lists render every row | L | do | |
| 173 | API route handlers have no runtime tests | L | do | |
| 154 | Launch colours are always light | S | skip | which colour is a design call for Pranav |
| 141 | AI model name is an alias | S | skip | pinning needs an eval run with a real Gemini key |
| 123 | Unused `deadlines` table | S | skip | drops a table on the live database; Pranav's call |
| 167 | Attachments re-download the message | M | skip | can't verify `format=metadata` without a real inbox |
| 101, 102, 212, 236 | | | covered | our PRs #291, #287, #290, #292 |
| 1, 15, 17, 78, 148, 163, 172 | real inboxes, other people, real phones, Windows | | skip | need hardware or people we don't have |
| 37, 79, 93–99, 137, 140, 176–179 | accounts, Google verification, infra, money | | skip | Pranav's accounts or paid/verified services |
| 83, 105, 122, 124, 126, 127, 136, 135 | schema or security redesigns | L | skip | need a design decision from Pranav first |
| 88, 100, 115, 128, 131, 143–147, 151, 153, 156–161, 168, 169, 174, 175, 181, 183, 184 | | M–L | skip for now | product or design decisions, or large rewrites that would clash with Pranav's work |
| 186–233 (frontend audit) | | M–L | skip for now | mostly layout and design decisions |
| 237–286 | feature ideas | | skip | none is tiny |

## PRs waiting to be sent
Open these when fewer than 3 of ours are open upstream.

| Branch | Fixes | Pre-filled PR link |
|---|---|---|

## Log
Newest first. One line per change: what and why.

- 2026-11-08 Merged `upstream/236-skip-links`: skip buttons and F6 between list and mail (#236). Meant for upstream.
- 2026-11-08 Merged `upstream/101-mail-text-higher`: report link under the mail, Summary on one line; mail text ~80px higher on phones (#101). Meant for upstream.
- 2026-11-08 Merged `upstream/212-undo-stack`: Undo history, so a second action no longer drops the first Undo (#212). Meant for upstream.
- 2026-11-08 Merged `upstream/due-overdue-wording`: missed deadlines said "Due overdue". Meant for upstream.
- 2026-11-08 Merged `upstream/schema-users-name`: schema.sql was missing `users.name`, so a fresh database rejected every sign-in. Meant for upstream.
- 2026-11-08 Merged `upstream/102-phone-inbox-header` (phone search behind a button). Waiting for approval before a PR to upstream.
- 2026-11-08 Moved functions to Mumbai; sync job reads `DELT_SITE`.
- 2026-11-08 Added Slate (Minimal dark refinement) and its contrast test.
- 2026-11-08 Forked from upstream at `414de98`.
