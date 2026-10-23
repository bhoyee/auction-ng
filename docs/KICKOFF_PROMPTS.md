# Kickoff prompts for Claude Code / Codex

## Before the first prompt (you do this once, about 10 minutes)

1. Create an empty GitHub repository, e.g. `auction-ng`, and clone it to your computer.
2. Put the files in place:
   - `AGENTS.md` → repo root
   - `CLAUDE.md` → repo root
   - `TASKS.md` → `docs/TASKS.md`
   - `decisions.md` → `docs/decisions.md`
   - `DESIGN.md` → `docs/DESIGN.md`
   - Any approved mockups or screenshots → `docs/design/` (e.g. `home-mobile.png`, `lot-page-desktop.png`)
   - Export the blueprint doc as Markdown and save it as `docs/blueprint.md`
3. Install on your computer: Node.js 22 LTS, pnpm, Docker Desktop, Git, and Claude Code or Codex CLI.
4. Commit these files: `git add . && git commit -m "docs: project rules and plan" && git push`.
5. Open the repo folder in Claude Code (`claude`) or Codex (`codex`) and paste Prompt 1.

---

## Prompt 1 — Start the project (task T01)

```
You are the lead engineer for Auction NG, a daily liquidation-auction marketplace for Nigeria
(web + Android/iOS apps, wallet funded by bank transfer, warehouse pickup, later delivery).

Before doing anything:
1. Read AGENTS.md completely. Its rules override anything else, including this prompt.
2. Read docs/blueprint.md (especially "Architecture for speed", "Tech stack",
   "Hosting and deployment" and "Building it with Claude or Codex").
3. Read docs/TASKS.md, docs/decisions.md and docs/DESIGN.md.

Quality bar: this must look and feel like a product built by a top professional team for
Nigerian buyers — fast, trustworthy, well structured, with a distinct brand. It must NOT look
AI-generated or templated. DESIGN.md defines the brand, components, UX rules and a checklist
of things that make a site look generated; treat those as hard rules from the very first commit
(for T01 that means: set up the font, the design tokens package and Tailwind theme wiring, and
make the placeholder pages use them instead of default Next.js/Expo starter screens).

Your task now is T01 only: "Monorepo skeleton and local services".

Work like this:
- First, give me a short plan: the folders and files you will create, the exact package
  versions you intend to use, and any question you need answered. Wait for my "go".
- Then build it in small commits on a branch called task/t01-monorepo.
- Use only the stack in AGENTS.md §2. Do not add other frameworks or paid services.
- Make every command in AGENTS.md §4 work (stub db:migrate and db:seed if Prisma isn't set up
  yet, and say so).
- Set up GitHub Actions CI running install, lint, typecheck, test and build.
- Run pnpm lint, pnpm typecheck, pnpm test and pnpm build yourself and fix failures.

When finished, reply with:
- what you built, file by file at a high level,
- the exact commands I should run to see it working on my machine,
- anything you could not finish, and any decisions you logged in docs/decisions.md,
- then mark T01 as done in docs/TASKS.md.
Do not start T02.
```

---

## Prompt 2 — Every task after that (replace TXX)

```
Read AGENTS.md, then the TXX section of docs/TASKS.md, the related parts of docs/blueprint.md,
and docs/decisions.md. Look at the existing code you will touch before changing anything.

Do task TXX only, on a branch called task/txx-<short-name>.
1. Give me a short plan (files to change, approach, tests you'll write, open questions). Wait for "go".
2. Build it with tests in the same change. For bid or money code, write the tests first.
3. Run pnpm lint, pnpm typecheck and pnpm test until they pass.
4. Check every item in the Definition of done (AGENTS.md §11).
5. Summarise: what changed, how you tested it, how I can try it, open questions.
   If this is a MONEY/BID task, say so at the top of the summary.
Do not start the next task.
```

---

## Prompt 2b — Any task that builds screens (D01, T13, T14, T15)

Use this instead of Prompt 2 for UI work.

```
Read AGENTS.md (especially §13), docs/DESIGN.md in full, the TXX section of docs/TASKS.md,
and look at any mockups in docs/design/ for the screens in this task.

You are acting as a senior product designer and front-end engineer. The goal is a well-structured,
modern, professional interface for Nigerian buyers that does not look AI-generated or templated.
The brand, tokens, components, UX rules and copy rules in DESIGN.md are hard requirements.

Do task TXX only, on a branch called task/txx-<short-name>.
1. Plan first: for each screen, list its sections in order, the packages/ui components it uses
   (and any new ones you must add to packages/ui), its loading/empty/error/offline/success states,
   and the exact UI copy for headings, buttons and errors. Wait for my "go".
2. Build from packages/ui tokens and components only. No hex values, no one-off styles,
   no new fonts, icons or UI libraries. Use realistic Nigerian seed data, never lorem ipsum.
3. Screenshot every screen at 360, 768 and 1280 px (Playwright for web, emulator for mobile).
   Review each screenshot against DESIGN.md and its §8 anti-"AI-generated" checklist,
   as a demanding design lead would. Fix what fails and screenshot again.
4. Check performance budgets (AGENTS.md §7), accessibility (contrast, focus, 44 px targets,
   screen-reader labels) and that lint, typecheck and tests pass.
5. Summarise what you built, attach the final screenshots, list any design decisions you made
   that DESIGN.md didn't cover, and anything you'd improve with more time.
Do not start the next task.
```

---

## Prompt 3 — Review before merging (use a fresh session)

Use this on every task marked MONEY/BID, and any time something feels off.

```
You are reviewing a pull request for Auction NG. Read AGENTS.md first, especially §5 (money rules)
and §6 (bid rules). Then review the diff of branch task/txx-<name> against main.

Look only for:
- ways money could be created, lost, double-charged or double-credited,
- race conditions and missing transactions or locks,
- missing idempotency, unverified webhooks, floats used for money,
- bid rule violations (increments, proxy logic, soft close, holds),
- security problems (auth, roles, rate limits, secrets, personal data in logs).

List each problem with file, line, why it matters and a suggested fix, ordered by severity.
Say clearly if you find nothing serious. Do not edit code.
```

---

## Prompt 3b — Design review (fresh session, for UI tasks)

```
You are a demanding senior product designer reviewing the UI built on branch task/txx-<name>
for Auction NG, a Nigerian online auction marketplace. Read docs/DESIGN.md first.
Run the app, screenshot each changed screen at 360, 768 and 1280 px, and review them for:
- anything that makes it look AI-generated or templated (DESIGN.md §8),
- brand consistency (tokens, type, icons, radius, yellow used only for live states),
- hierarchy and layout: is the price, timer and bid action the clearest thing on lot screens?
- UX: bid in two taps, total shown before confirming, clear outbid/winning states,
  loading/empty/error/offline states present,
- copy: plain, specific, sentence case, Naira formatting, no banned words,
- accessibility: contrast, touch targets, focus, screen-reader labels.
List each problem with the screen, what's wrong, why it matters and the fix, worst first.
Do not edit code.
```

---

## Prompt 4 — When something breaks

```
Something is broken: <describe what you did, what you expected, what happened, paste the error>.
Read AGENTS.md first. Find the root cause before changing code: explain what is wrong and why,
then propose the smallest fix and a test that would have caught it. Wait for "go" before
changing money or bid code.
```

---

## Tips

- Keep one task per session. Start a new session for the next task so the agent re-reads the rules.
- Always say "go" only after reading the plan. Most mistakes are cheaper to catch in the plan.
- Merge only when CI is green. Never let an agent push directly to `main`.
- If an agent keeps repeating a mistake, add a rule to AGENTS.md so every future session follows it.
- Agents follow pictures better than words. Approve mockups of the key screens (home, lot page,
  bid sheet, wallet, my bids) before D01 and put them in docs/design/ — then agents copy a target
  instead of inventing one.
- Do D01 (design system) and get it right before building screens. Fixing the look later means
  touching every screen.
