> **Fork note:** this is a personal fork of [pranavvehmid/delt](https://github.com/pranavvehmid/delt) with a few changes of my own (a refined dark theme, for now). What differs and why: [FORK.md](FORK.md). For the real app, issues and releases, go upstream.

<p align="center">
  <img src="assets/banner.svg" alt="DELT: college mail, sorted by what needs you first" width="100%">
</p>

<p align="center">
  <a href="https://github.com/pranavvehmid/delt/releases/latest/download/DELT.apk">
    <img src="assets/download.svg" alt="Download DELT for Android" width="100%">
  </a>
</p>

<p align="center">
  <a href="https://delt-mu.vercel.app"><img alt="Web app" src="https://img.shields.io/badge/web-delt--mu.vercel.app-1c1917?style=flat-square"></a>
  <a href="https://github.com/pranavvehmid/delt/releases/latest"><img alt="Android release" src="https://img.shields.io/github/v/release/pranavvehmid/delt?style=flat-square&label=android&color=1c1917"></a>
  <a href="#tests"><img alt="231 tests passing" src="https://img.shields.io/badge/tests-231%20passing-1c1917?style=flat-square"></a>
  <img alt="Free" src="https://img.shields.io/badge/cost-free-c8102e?style=flat-square">
</p>

DELT reads your VIT Gmail and sorts every mail into four piles, so exams, registrations, fees and deadlines are always at the top. It works for any `@vitstudent.ac.in` account and costs nothing to run.

<p align="center">
  <img src="assets/stats.svg" alt="231 tests passing · 14 mail apps studied · 3000 random mails, no crash · 0 rupees to run" width="100%">
</p>

## How it sorts

<p align="center">
  <img src="assets/sorting.svg" alt="Each mail is printed darker the more it matters" width="100%">
</p>

| Pile | What goes here |
|---|---|
| **Urgent** | exams, quizzes, CBTs, course and mock registration, FFCS, interviews, fee payments, anything with a deadline that applies to you |
| **Priority** | hackathons and contests, official notices: timetable changes, holidays, hostel and mess, transport, results |
| **Later** | achievements, guest lectures, webinars, club events, study-abroad programmes, scholarships |
| **Noise** | promotions, sales, admissions for other programmes |

Your register number (for example `26BCE…`) is in your Google name, so DELT knows your batch. Mail meant for other batches or seniors goes to Later.

If you move a mail to a different pile, DELT does the same for that sender from then on. You can see and remove these rules under **Account menu → Sorting rules**.

Most mail is sorted by simple rules. When the rules aren't sure, Google Gemini's free tier takes a second look.

## Who can sign in

- **VIT students** with an `@vitstudent.ac.in` Google account: yes.
- **VIT staff** (`@vit.ac.in`): not yet confirmed. DELT allows the address, but its Google sign-in is set to "Internal" inside the student Google organisation, and staff accounts are probably a separate organisation that Google blocks. If you have a staff account, please try it and comment on [#15](https://github.com/pranavvehmid/delt/issues/15).
- Personal Gmail and other colleges: no.

## Using it

<p align="center">
  <img src="assets/tabs.svg" alt="Inbox and Deadlines" width="100%">
</p>

- **Inbox** has all your mail in DELT, newest first. Older mail loads as you scroll. Filter by pile, show unread only, or search (search covers older mail too).
- **Tap a mail** to read the whole thing inside DELT. You can move it to another pile, add its deadline to Google Calendar, or mark it done.
- **Deadlines** lists the due dates found in your mail: overdue, today, tomorrow, this week, later.
- On a phone, swipe right to mark read, swipe left to mark done. You can undo either.
- **Wrong pile?** Each open mail has a link that starts a GitHub issue with only the sender's domain and the pile filled in, never the subject.
- **Offline**, DELT shows the last inbox it loaded and pauses changes until you're back online.

New mail is checked when you open the app and every 5 minutes while it's open. In the background, a free GitHub Actions job checks students who used DELT this week about every 15 minutes, and everyone else at least once a day.

**How far that goes:** each background call syncs 4 students at a time for 90 seconds, and the job makes up to 8 calls every 15 minutes. A check with no new mail takes about 3 to 5 seconds, so that is roughly 500 to 900 student checks per 15 minutes on the free plans. Past about 500 students who open DELT every week, active students will be checked less often than every 15 minutes; the next step then is skipping students with no new mail via Gmail's history id (see [#36](https://github.com/pranavvehmid/delt/issues/36)).

### Settings

Account menu → Settings:

- **Notifications:** a phone alert for new urgent mail, and a reminder for any deadline due within a day.
- **Sorting rules:** the senders you moved, and where their mail goes. Remove any you don't want.
- **Your data:** delete everything DELT keeps about you.
- **AI sorting:** DELT shares one free Gemini key between students, with a daily allowance each. You can add your own free key from [Google AI Studio](https://aistudio.google.com/apikey); it's stored encrypted and only used for your mail.

### Appearance

Tap ◐ in the top bar.

| Setting | Options |
|---|---|
| Look | **Minimal**: black and white, one typeface. More important mail is printed darker, and urgent mail gets a small red mark. **Glyph**: purple and gold, dot-matrix type. **Grid**: F1-inspired race dark. Piles are flags (red Urgent, yellow Priority, green Later, blue Noise), mail sits in a timing tower, with italic racing type and a kerb under the top bar |
| Theme | Light, Dark, Extra dark (pure black, Nothing OS style: dot-matrix section names, mail shown dark), Auto. Grid is always dark |
| Accent | Default, Purple, Blue, Green, Red, Gold. In Grid, a driver colour: Race red, Papaya, Teal, Navy, Racing green, Sky, Pink, Black and gold |
| Text | Normal, Large |
| Spacing | Comfortable, Compact |

## Install

**Android:** download [DELT.apk](https://github.com/pranavvehmid/delt/releases/latest/download/DELT.apk), open it (allow installs from your browser if Android asks), and sign in with your VIT account. The app opens the website full screen in Chrome, so updates arrive without reinstalling. GitHub Actions builds a new APK whenever the Android code changes.

**iPhone:** open [delt-mu.vercel.app](https://delt-mu.vercel.app) in Safari, then Share → Add to Home Screen.

## Privacy

- DELT reads your mail, adds labels and marks mail read or unread. Google's `gmail.modify` permission would also allow moving mail to Trash (never permanent deletion); DELT doesn't use that.
- AI sorting is off until you say yes in the app. Full details: [the privacy page](https://delt-mu.vercel.app/privacy).
- It stores a short preview and a one-line summary of each mail, not the full text. The full mail and its photos and files are fetched from Gmail when you open them, and never saved.
- Every student sees only their own mail. Each database query is tied to the signed-in account, and the tests check this.
- Google may use what is sent to Gemini's free tier to improve its models. Each student chooses "Allow AI" or "Rules only"; nothing is sent before they choose. Leave `GEMINI_API_KEY` empty to turn AI off for everyone.
- If you add your own Gemini key, it's encrypted before it's stored.
- Notifications use your browser's own push service. Turning them off removes the device from DELT.
- **Account menu → Delete my data** removes everything DELT keeps about you and cancels its access to your Gmail.

## Run your own copy

```bash
git clone https://github.com/pranavvehmid/delt && cd delt
npm install
cp .env.example .env.local   # Google OAuth, Supabase and Gemini keys (all free)
npm run dev
```

Create the tables by running [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. Then `bash scripts/push-secrets.sh` copies the notification keys to Vercel and the sync secret to GitHub.

## Tests

`npm test` runs 192 checks in a few seconds:

- 80+ real VIT mails and the pile each should land in
- dates in the formats VIT uses (`15/11/2026`, `15th Nov`, `Nov 15`, `tomorrow 6 PM`), year rollover, impossible dates like 31 Feb
- HTML mail, nested attachments, group senders, ₹ and Tamil text
- 3,000 random mails: no crashes, search and filters never lose a mail, every deadline lands in one group
- other batches, branches and staff accounts
- every API route checks sign-in, and every mail query is limited to the signed-in student
- every combination of appearance settings
- who background sync picks, the shared AI allowance, encrypted keys, and which notifications get sent
- text contrast for every pile in every theme, read straight from the CSS
- deleting a student's data leaves nothing behind

`npm run e2e` runs 39 browser checks (Playwright) on a phone and a desktop screen with fake mail: swiping, reading a mail, moving piles, every Appearance option, scrolling back through 450 mails, search, keyboard-only use, and accessibility checks (axe). GitHub Actions runs both on every push.

`scripts/eval.ts` compares the rules against Gemini and your own corrections on your inbox. It only reads.

## Contributing

Open tasks are in [Issues](https://github.com/pranavvehmid/delt/issues). Ones marked [good first issue](https://github.com/pranavvehmid/delt/labels/good%20first%20issue) are small. If you're a VIT student, the most useful thing is trying it on your own inbox: see [docs/TESTING.md](docs/TESTING.md).

Setup steps and rules for pull requests are in [CONTRIBUTING.md](CONTRIBUTING.md). Running DELT, its secrets, and handing it over: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## More

- [docs/DESIGN.md](docs/DESIGN.md): what the app is for, how sorting works, why it looks the way it does
- [docs/RESEARCH.md](docs/RESEARCH.md): 14 open-source mail apps and what DELT took from each
- [LICENSE](LICENSE): MIT

<p align="center">
  <img src="assets/footer.svg" alt="DELT, for VIT students. Free and open source." width="100%">
</p>

<p align="center"><sub>Next.js · Supabase · Gmail API · Vercel · Android TWA · pictures drawn by <code>tools/make_art.mjs</code></sub></p>
