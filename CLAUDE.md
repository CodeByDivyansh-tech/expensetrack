# CLAUDE.md: working on ExpenseTrack

Read this first. It is the project guide for Claude Code (and anyone else) working in this repo.

## What this is

- **ExpenseTrack**: a student expense tracker (Dashboard, Transactions, Analytics, Budget Setup, Savings goals,
  Recurring, Settings & Profile).
- GitHub repo (public): https://github.com/CodeByDivyansh-tech/expensetrack
- Branch `main` (base commit e82754f). All work happens on `fix/professional-overhaul`; the final report is in
  `docs/FINAL_REPORT.md`.
- Live site: https://expensetrack-app.onrender.com (Render Static Site, auto-deploys from `main`).
- Stack: plain HTML + vanilla JS, Tailwind CSS 3 (built with npm), Chart.js (CDN, loaded only when Analytics
  opens), Firebase 10.13 compat SDK (Google sign-in + Cloud Firestore, project `expensetrack-bff94`).
  esbuild is a build-time dev dependency only (it minifies our own scripts).

## Layout

| Path | What |
|---|---|
| `index.html` | The app shell: sidebar, views (dashboard, transactions, budget-setup, analytics, recurring, goals, profile-&-settings), modals |
| `login.html`, `login.js` | Google sign-in page and its script (no inline scripts: the CSP forbids them) |
| `text-fx.js` | Animated letters: page titles (`h1`, `[data-fx-title]`) rise in letter by letter when their page opens; `[data-fx-num]` amounts settle in when they change; `.fx-shimmer` wordmark sweep (CSS). Text content and accessible names never change; off with reduced motion |
| `app.js` | UI logic, rendering, state, modal manager, delegated events (`data-action` / `data-click`). Exposes `window.ExpenseTrackApp` |
| `data-layer.js` | Data access layer (Firestore + localStorage fallback). UMD, also loads in Node. Exposes `window.ExpenseTrackDataLayer` |
| `budget-calculator.js` | Pure maths: allocation, caps, alerts, budget periods, currency display, analytics totals. UMD |
| `expense-tools.js` | Pure helpers: dates, filter/sort/group, CSV export and import, recurring dates, goals, `friendlyError`. UMD |
| `firebase-config.js` | Firebase init + `window.FirebaseService` (sign-in, reauthenticate, delete account, sign-out that clears the cache) |
| `firestore.rules` | Validating rules: per-user access plus the shape, type and size of every document (see below) |
| `theme-init.js` | Runs first: applies dark mode, sends signed-out visitors to `login.html`, releases the icon font |
| `sw.js`, `pwa.js`, `manifest.webmanifest` | Installable app: service worker, install and update prompts |
| `src/styles.css`, `tailwind.config.js` | Tailwind input and design tokens (see `DESIGN.md`); colours are `--c-*` CSS variables for dark mode. The look is **monochrome glass**: white/grey light theme, true-black dark theme, no blue tints; cards, sidebar, bars and dialogs are frosted glass (`--glass-*` variables, "GLASS PANELS" section). Red and amber stay for warnings and errors only |
| `build.js` | Minifies our scripts with esbuild, stamps the service-worker build hash, copies the website into `public/` |
| `render.yaml` | Render static-site config: build command, publish `public`, rewrites for `/login` and `/dashboard`, security headers incl. a strict CSP |
| `tests/` | Test suite (its own `package.json`): unit, rules, browser |
| `docs/` | Final report and screenshots |
| `dist/`, `public/` | Build output, git-ignored. Never edit by hand |

## Commands

```bash
npm install && npm run build      # tailwind -> dist/styles.css, then build.js (esbuild minify) -> public/
npm test                          # everything below except test:network; all must pass
npx serve public                  # serve the built site (http://localhost:3000)
```

`npm test` at the root installs `tests/` and runs `test:all`. Inside `tests/`:

| Command | What | Last count |
|---|---|---|
| `npm test` | Unit tests (`node:test`, in-memory fake Firestore) + module-load check | 149 + 1 check |
| `npm run test:rules` | `firestore.rules` in the Firestore emulator (needs Java 11+) | 80 |
| `npm run test:e2e` | Builds, then Playwright against `public/` in installed Chrome, Firebase stubbed | 169 |
| `npm run test:all` | The three above | |
| `npm run test:network` | The real Firebase SDK and Google's popup (CSP check, CDN hash check). Needs internet, can be flaky, so it is **not** in `npm test` | 2 |

Browser tests serve `public/` through `tests/helpers/static-server.js`, which sends exactly the headers and
rewrites in `render.yaml`. `tests/helpers/audit-server.js` serves a signed-in demo for Lighthouse.

`public/` must contain only website files: html, js, icons, `assets/`, `dist/styles.css`.
Re-run `npm run build` after any Tailwind class change or any edit to a file that `build.js` copies,
then reload the served site.

## Firestore data model

```
users/{uid}                       (document)
  budget:           { overallCap: number, categories: { [categoryId]: number } }
  settings:         { notify80, weeklyDigest, roommateAlert: bool,       (older keys, still stored)
                      theme: 'system'|'light'|'dark', currency: code, weekStart: 0-6,
                      monthStartDay: 1-28, alertWarnPct: number }         (all optional; clamped on read and save)
  customCategories: { [id]: { id, name, icon, color, defaultCap, isDefault:false, isArchived, ... } }
  updatedAt:        number (ms)
  legacyImportHandled: bool         (set once the user chose what to do with old browser-only data)

users/{uid}/expenses/{id}         (documents)
  id, amount, category, date ("YYYY-MM-DD" LOCAL), note, createdAt
  paymentMethod?: 'UPI'|'Cash'|'Card'|'Wallet'|'Other'     (optional; older expenses have none)
  recurringId?:   string                                    (set on expenses generated by a recurring rule)
  updatedAt?:     number

users/{uid}/recurring/{id}        rule: name, amount, category, frequency ('monthly'|'weekly'), startDate,
                                  lastGenerated, active, createdAt
users/{uid}/goals/{id}            name, target, saved, contributions[] (max 200, newest kept), createdAt
```

Recurring expenses get the fixed id `rec-<ruleId>-<YYYY-MM-DD>`, so generating twice, or on two devices, can only
ever make one copy. Never change that id format.

Seven built-in categories live in code (`DEFAULT_CATEGORIES`): food, groceries, transport, textbooks,
entertainment, personal, emergency. Deleting a custom category that has expenses archives it
(`isArchived: true`); expenses are never deleted with it.

Limits (enforced in the data layer and again in the rules): amount > 0 and ≤ 10,00,000 with two decimals; note
≤ 100 characters in the app (rules allow 200); date from 2000-01-01 to today; budget cap whole rupees 500 to 10,00,000.

## firestore.rules

Validating, deny by default. Only `users/{uid}` and its `expenses`, `recurring` and `goals` subcollections for the
signed-in uid are readable and writable, and only with the known fields, types and sizes above (unknown fields,
wrong types, a mismatched `id`, oversized strings or maps are refused). Any new field must be added to the rules
**and** to `tests/rules/firestore.rules.test.js`, and the owner must publish the rules in the Firebase console
(nothing deploys them automatically).

## Rules (do not break these)

1. Keep the stack: vanilla JS + Tailwind + Firebase compat. No frameworks, no bundler, no new runtime dependencies.
2. Keep existing user data backward compatible. Old documents and old expense shapes must still load;
   add fields, never rename or remove them, and default anything missing.
3. Never change the Firebase config values in `firebase-config.js`.
4. Run `npm run build` after Tailwind class changes (and before looking at the site).
5. Write a test for every bug fix. Logic that needs testing belongs in `data-layer.js`, `budget-calculator.js`
   or `expense-tools.js`, which load in Node; behaviour in the page gets a Playwright test.
6. Work only on the fix branch `fix/professional-overhaul`. Never commit to `main`. Never push or deploy
   without the owner saying so.
7. Dates are local `YYYY-MM-DD` strings. Do not use `toISOString()` for dates.
8. Escape user text (`escapeHtml`) before putting it in `innerHTML`. No inline scripts or `onclick`: the CSP blocks them
   (use `data-action` / `data-click`).
9. Show errors to people in plain words: use `friendlyError` (via `errorDetail` in `app.js`), never raw Firebase codes.
10. Do not write files with PowerShell `Set-Content` / `Out-File` on Windows: they add a BOM and break ₹, × and ≤.
    Use the editor tools.
11. Console changes (Firebase rules, authorized domains, Render settings) are the owner's; list them, do not attempt them.
