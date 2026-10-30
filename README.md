# ExpenseTrack

A simple monthly budget and expense tracker for students (amounts in ₹). Sign in with Google, log what
you spend, set a monthly budget with per-category caps, and see where the money goes.

**Live site:** https://expensetrack-app.onrender.com

## How it is built

Plain HTML and vanilla JavaScript, with no framework and no bundler.

| Part | Choice |
|---|---|
| UI | `index.html` (the app) and `login.html`, styled with **Tailwind CSS 3** compiled by `npm run build` |
| Charts | **Chart.js 4.5.1** from jsDelivr, pinned and checked with a Subresource Integrity hash |
| Sign-in and data | **Firebase 10.13** (compat SDK): Google sign-in and **Cloud Firestore**, project `expensetrack-bff94` |
| Hosting | **Render** static site, deployed from `main`, configured by `render.yaml` |

Your data lives in your own Firestore space (`users/{uid}`) and is protected by `firestore.rules`.
The app keeps working offline and syncs when the connection returns.

### Files

| File | What it does |
|---|---|
| `index.html`, `app.js` | The app screens (Dashboard, Budget Setup, Analytics, Settings) and their logic |
| `login.html`, `login.js` | Google sign-in page |
| `data-layer.js` | Everything that reads or writes data: expenses, budget, settings, custom categories, validation, rollback when a save fails |
| `budget-calculator.js` | Pure functions: allocation maths, rupee formatting, the monthly cap rule, weekly buckets |
| `firebase-config.js` | Firebase initialisation and sign-in/sign-out helpers |
| `firestore.rules` | Security rules (who can read and write what, and what a valid document looks like) |
| `render.yaml` | Render settings: build command, URL rewrites and security headers (including the Content-Security-Policy) |
| `build.js` | Copies only the website files into `public/` |
| `404.html` | Page shown for unknown addresses |
| `src/styles.css`, `tailwind.config.js` | Tailwind input and the "Fresh Student Wealth" design tokens (see `DESIGN.md`) |
| `tests/` | All automated tests (see below) |

`public/` and `node_modules/` are build output and are not committed.

### Data model

```
users/{uid}                       budget, settings, customCategories, updatedAt, legacyImportHandled
users/{uid}/expenses/{id}         id, amount, category, date ("YYYY-MM-DD", local), note, createdAt
                                  (optional: updatedAt, paymentMethod)
```

Money is stored in rupees with up to two decimals. Dates are local calendar dates, never UTC. The seven
built-in categories live in code; custom categories are stored on the user document and are archived, not
deleted, when they still have expenses.

## Run it locally

You need Git and Node.js 18 or newer.

```bash
npm install
npm run build
node tests/helpers/static-server.js 4173
```

Open http://127.0.0.1:4173. That server sends the same headers as production, so a problem with the
Content-Security-Policy shows up here too. `localhost` is already an authorised domain for Google sign-in;
if you use `127.0.0.1`, use `localhost` instead when you want to sign in.

After changing any Tailwind class or any site file, run `npm run build` again.

## Tests

One command runs everything (unit tests, the Firestore rules tests in the emulator, and the browser tests):

```bash
npm test
```

| Command (in `tests/`) | What it runs |
|---|---|
| `npm test` | Unit tests for the data layer and calculator, with an in-memory fake Firestore |
| `npm run test:rules` | Security-rules tests in the Firestore emulator (needs Java 11 or newer) |
| `npm run test:e2e` | Builds, then runs Playwright against `public/` in Chrome, with Firebase stubbed |
| `npm run test:all` | All of the above |

Two browser tests use the real Firebase SDK and Google's sign-in popup to prove the Content-Security-Policy
does not block sign-in; they skip themselves when there is no internet.

## Deploying

Render deploys `main` automatically (`npm install && npm run build`, publishing `public/`). Do not push to
`main` without review. The Firestore rules are **not** deployed by Render: publish `firestore.rules` in the
Firebase console (Firestore Database, Rules) or with `firebase deploy --only firestore:rules`.

Firebase settings that must stay in place:

- Authentication, Settings, Authorized domains: `expensetrack-app.onrender.com` and `localhost`.
- Firestore rules published from this repository's `firestore.rules`.

## Security notes

- Every user value is escaped before it is put in the page, and icons and colours are checked against an
  allowed list, so a category name cannot run script.
- The Content-Security-Policy allows scripts only from this site, Google (gstatic, apis.google.com) and
  jsDelivr, and there are no inline scripts or handlers.
- The Firebase web config in `firebase-config.js` is public by design. Access is controlled by the security
  rules, not by keeping that config secret.

## License

Student project. See the repository for details.
