# CLAUDE.md: working on ExpenseTrack

Read this first. It is the project guide for Claude Code (and anyone else) working in this repo.

## What this is

- **ExpenseTrack**: a student expense tracker (Dashboard, Budget Setup, Analytics, Settings & Profile).
- GitHub repo (public): https://github.com/CodeByDivyansh-tech/expensetrack
- Branch `main` (base commit e82754f). All work happens on `fix/professional-overhaul`.
- Live site: https://expensetrack-app.onrender.com (Render Static Site, auto-deploys from `main`).
- Stack: plain HTML + vanilla JS, Tailwind CSS 3 (built with npm), Chart.js (CDN), Firebase 10.13 compat
  SDK (Google sign-in + Cloud Firestore, project `expensetrack-bff94`).

## Layout

| Path | What |
|---|---|
| `index.html` | The app shell: sidebar, 4 views (dashboard, budget-setup, analytics, profile-&-settings), modals |
| `login.html` | Google sign-in page |
| `app.js` | UI logic, rendering, state, modals, auth guard. Exposes `window.ExpenseTrackApp` |
| `data-layer.js` | Data access layer (Firestore + localStorage fallback). UMD, also loads in Node. Exposes `window.ExpenseTrackDataLayer` |
| `budget-calculator.js` | Pure `computeAllocation()`. UMD, also loads in Node |
| `firebase-config.js` | Firebase init + `window.FirebaseService` (auth helpers) |
| `firestore.rules` | Per-user access: only `users/{uid}/**` for the signed-in uid |
| `src/styles.css`, `tailwind.config.js` | Tailwind input and design tokens (see `DESIGN.md`) |
| `build.js` | Copies the website files into `public/` |
| `render.yaml` | Render static-site config (`npm install && npm run build`, publish `public`) |
| `tests/` | Node test suite (its own `package.json`) |
| `dist/`, `public/` | Build output, git-ignored. Never edit by hand |

## Commands

```bash
npm install && npm run build      # tailwind -> dist/styles.css, then build.js -> public/
cd tests && npm test              # 17 tests (node:test) + module-load check; all must pass
npx serve public                  # serve the built site (http://localhost:3000)
```

`public/` must contain only website files: html, js, icons, `assets/`, `dist/styles.css`.
Re-run `npm run build` after any Tailwind class change or any edit to a file that `build.js` copies,
then reload the served site.

## Firestore data model

```
users/{uid}                       (document)
  budget:           { overallCap: number, categories: { [categoryId]: number } }
  settings:         { notify80: bool, weeklyDigest: bool, roommateAlert: bool }
  customCategories: { [id]: { id, name, icon, color, defaultCap, isDefault:false, isArchived, ... } }
  updatedAt:        number (ms)

users/{uid}/expenses/{id}         (documents)
  id:        string   e.g. "exp-<timestamp>-<n>"
  amount:    number
  category:  string   category id ("food", "groceries", ..., or "custom_<ts>_<n>")
  date:      string   "YYYY-MM-DD", LOCAL date (never UTC; use localDateString / parseLocalDate)
  note:      string
  createdAt: number (ms)
```

Seven built-in categories live in code (`DEFAULT_CATEGORIES`): food, groceries, transport, textbooks,
entertainment, personal, emergency. Deleting a custom category that has expenses archives it
(`isArchived: true`); expenses are never deleted with it.

## Rules (do not break these)

1. Keep the stack: vanilla JS + Tailwind + Firebase compat. No frameworks, no bundler, no new runtime dependencies.
2. Keep existing user data backward compatible. Old documents and old expense shapes must still load;
   add fields, never rename or remove them, and default anything missing.
3. Never change the Firebase config values in `firebase-config.js`.
4. Run `npm run build` after Tailwind class changes (and before looking at the site).
5. Write a test for every bug fix (in `tests/`, `node:test`). Logic that needs testing belongs in
   `data-layer.js` or `budget-calculator.js`, which load in Node.
6. Work only on the fix branch `fix/professional-overhaul`. Never commit to `main`. Never push and never
   deploy without asking the owner first.
7. Dates are local `YYYY-MM-DD` strings. Do not use `toISOString()` for dates.
8. Escape user text (`escapeHtml`) before putting it in `innerHTML`.
