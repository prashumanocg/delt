# About this fork

This is [prashumanocg/delt](https://github.com/prashumanocg/delt), a personal fork of
[pranavvehmid/delt](https://github.com/pranavvehmid/delt). Upstream is the real project; this fork
tracks it closely and adds a few personal changes on top.

## What's different here

| Change | Where | Why |
|---|---|---|
| **Slate**: a cooler, softer version of Minimal's dark theme | `src/app/styles/look-slate.css`, `tests/slate.test.ts` | Dark mode is what I use. Raised panels and filled buttons read better on a dark screen than hairline boxes and outlined buttons |

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

## Log
Newest first. One line per change: what and why.

- 2026-11-08 Added Slate (Minimal dark refinement) and its contrast test.
- 2026-11-08 Forked from upstream at `414de98`.
