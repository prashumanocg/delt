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
