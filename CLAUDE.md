# DELT: working notes for Claude Code

> **This checkout is the fork prashumanocg/delt.** Read `FORK.md` first. In this fork, these rules
> replace the Git section below: commit as `prashumanocg`, never as Pranav; don't push, open PRs or
> file issues without the owner's approval; keep personal changes out of `upstream/*` branches.
> End every reply with a short **What you need to do** list: numbered steps for the owner, or
> "Nothing, I'm continuing with …" when there are none.

Read this file and `docs/PROJECT_STATE.md` first. Open other files only when the task needs them.

## What DELT is
A free Gmail sorter for VIT students (`@vitstudent.ac.in`). It sorts mail into four piles
(Urgent, Priority, Later, Noise), finds deadlines, and shows them in a web app and an Android app.
- Web: https://delt-mu.vercel.app (Vercel Hobby). Repo: github.com/pranavvehmid/delt
- Android: a Trusted Web Activity in `android/`, built by `.github/workflows/android.yml`, published as the `app-latest` release.
- Everything must stay free. No paid services.

## Stack
Next.js 15 App Router + React 19 + TypeScript, Tailwind v4 (barely used; styles are plain CSS),
next-auth v5 beta (Google), Supabase (Postgres), Gmail REST, Gemini free tier (optional AI check),
web-push, GitHub Actions (tests, 5-minute mail sync, Android build).

## Commands
- `npm run dev`: dev server (slow and flaky for browser tests; prefer the build)
- `npm run build`: production build. Run it before browser tests.
- `npm test`: unit tests (node:test via tsx, `--conditions=react-server`)
- `CI=1 npx playwright test --project=phone --project=desktop`: browser tests on the built app
  (`/e2e` shows the inbox with fake mail; `DELT_E2E=1`). The `iphone` (WebKit) project hangs
  on this Windows machine when animations are on; CI on Linux is the judge for it.
- Long suites: run in the background, keep working, fix failures at the end.

## Folder map
- `src/app/`: pages and client components (`inbox-app.tsx` is the shell; `mail-view.tsx`,
  `mail-frame.tsx`, `mail-attachments.tsx`, `mail-row.tsx`, `inbox-list.tsx`, `deadlines-list.tsx`,
  `settings*.tsx`, `appearance.tsx`, `banners.tsx`, `use-*.ts` hooks, `motion.ts`)
- `src/app/api/`: routes (emails, emails/[id], emails/[id]/attachments/[part], sync, rules, push, settings/ai, account, health)
- `src/app/styles/`: CSS in cascade order: `base.css`, `look-shared.css` (Minimal + Grid), `look-minimal.css`,
  `look-glyph.css`, `themes.css`, `look-grid.css`. `base.css` must hold no look-specific rules (a test checks).
- `src/app/fonts/`: every font ships with the app (OFL). `src/lib/`: sorting (`rules.ts`, `classify.ts`),
  Gmail, sync, inbox helpers, attachments, prefs.
- `tests/` unit, `e2e/` browser; throwaway probes go in `e2e-scratch/` (gitignored; run with `PW_SCRATCH=1`), `docs/` notes.

## Looks and themes
Three looks via `data-look`: `minimal` (Swiss), `glyph` (playful cards, dot-matrix titles),
`grid` (F1-inspired, always dark). Themes: `data-theme` light/dark, `data-tone="black"` = Extra dark,
`data-accent`. See `docs/THEMES.md`.

## Rules for every task
- Translate short prompts into a brief (Goal, Context, Requirements, Non-goals, Acceptance, Risks),
  show it in 10 lines or fewer, save it to `docs/briefs/YYYY-MM-DD-<name>.md`, then execute.
- Audit first, then fix one item at a time: verify (build, tests, desktop and phone screenshots),
  mark it in `docs/AUDIT.md`, commit, push.
- Every UI task runs the checklist in `docs/MY_BUILD_STYLE.md` (alignment, spacing scale, type scale,
  hierarchy, no clutter, no rough textures).
- Values live in tokens: colours, fonts, spacing, radii, motion as CSS custom properties.
  Spacing scale: 0 1 2 4 8 12 16 20 24 32 40 48 64 96. Type scale: 12.5 14 16 18 22 28 34 44.
  Nothing under 12.5px; no weight under 400. Tests enforce both.
- Respect `prefers-reduced-motion`; text passes WCAG 4.5:1 (3:1 only at 24px+).
- At the end of a task, update `docs/PROJECT_STATE.md`, `docs/CHANGELOG.md`, and `docs/DECISIONS.md` if a decision was made.
  Write a short "how it works" note in `docs/LEARNING_NOTES.md` for non-trivial features.

## Git
- Commit as `Pranav <pranavvehmid@users.noreply.github.com>` (that noreply address is on the
  GitHub account, so commits count on the contribution graph). End messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Small commits, one logical change each, pushed right away. File a GitHub issue per problem and
  close it with the commit SHA. Never force-push, backdate or make empty commits.
- Never commit secrets (`.env.local`, the signing key in `../delt-signing`), real register numbers,
  or personal email addresses.
- Production deploys (`npx vercel deploy --prod`) need the user's explicit go-ahead each time.

## Writing
Plain, short, non-AI-sounding text in the UI, docs and commits. No hype words.
