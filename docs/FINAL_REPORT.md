# ExpenseTrack: Debug & Professionalize: final report

Branch `fix/professional-overhaul` (base `e82754f`). Nothing has been pushed, merged to `main`, or deployed.
Tests at the last run (two full runs in a row): 142 unit, 80 Firestore-rules (emulator), 169 browser (Playwright, Chrome). All pass. The 2 real-Google-popup tests moved to `npm run test:network` (internet needed, can be flaky); they passed too.

## 1. Bugs and rules

| ID | What was wrong | Status |
|---|---|---|
| B1 | Custom-category form called the data layer with wrong arguments, so saving or editing always threw | Fixed |
| B2 | Budget Setup hid custom categories (filtered on a flag that is never set) | Fixed |
| B3 | Stored XSS: names, icons, colours, ids put into `innerHTML` unescaped | Fixed |
| B4 | Failed saves showed a success toast; in-memory state not rolled back | Fixed |
| B5 | Amounts rounded to whole rupees (49.50 became 50) | Fixed |
| B6 | Budget cap of 0 accepted, silently stored as 12,000, reverted after reload | Fixed |
| B7 | Allocation counted caps of archived or unknown categories | Fixed |
| B8 | Clear-all and migration used one batch, which fails above 500 writes | Fixed (chunks of 450) |
| B9 | Misleading insights: "leader" at 0, wrong daily average, 10-day "Week 4", future months | Fixed |
| B10 | Emergency card claimed to be auto-saved | Fixed |
| B11 | No limits on amount, note length or date | Fixed (amount â‰¤ 10,00,000, note â‰¤ 100, date 2000 to today) |
| B12 | False copy, hardcoded numbers that disagreed with defaults, permanent bell dot | Fixed |
| B13 | Two "Coming Soon" toggles that saved a setting and did nothing | Fixed (removed; stored keys are harmless) |
| B14 | Previous user's cached data and old localStorage data leaked into the next sign-in | Fixed (cache cleared on sign-out; legacy data needs an explicit import/delete choice) |
| B15 | Duplicate data listeners, jumped back to dashboard, full re-renders | Fixed |
| B16 | A failed first read skipped the live listeners | Fixed (offline banner added) |
| B17 | `alert`/`confirm` dialogs, destructive actions without a safety net | Fixed (in-app dialog, 6 s Undo, typed DELETE for clear-all) |
| B18 | Accessibility: dialogs, labels, focus, swatches, chart alternatives, reduced motion | Fixed |
| B19 | Fuzzy category matching swallowed unknown names; unknown shown as Food | Fixed (exact match; shown as Uncategorized) |
| B20 | Chart.js unpinned and unchecked | Fixed (4.5.1, SRI hash; a test compares it with the real CDN file) |
| B21 | Offline-cache-in-use logged as a warning | Fixed (info log). The move to the modular SDK is not done |
| B22 | Third-party images and ui-avatars.com (sends names to a third party) | Fixed (drawn locally) |
| B23 | Missing or relative share-card metadata | Fixed (absolute OG/Twitter/canonical, 1200Ã—630 image) |
| B24 | Icon names flashed as text | Fixed (`display=block`, preload) |
| B25 | `render.yaml` wrong service name, no rewrites, no security headers | Fixed in the file; **Needs owner action** to confirm Render applies it (section 4) |
| B26 | README out of date | Fixed |
| B27 | Vulnerable dependency tree | Fixed for what ships (root `npm audit`: 0). Advisories remain in dev-only test tooling; **Won't fix** (not shipped, upgrades would break the emulator tooling) |
| B28 | Login page: double redirect, raw errors, in-app browsers | Fixed |
| Rules | Any signed-in user could write any shape of data to their own path | Fixed in `firestore.rules` (80 emulator tests); **Needs owner action** to publish (section 4) |

Every fix has a test that failed on the old source and passes now.

## 2. Features added

**P1:** payment method on expenses (UPI, Cash, Card, Wallet, Other, optional); an All Transactions page (search, filters, sort, month and day groups, paging); CSV export and import with a preview and duplicate detection; alerts at 80% and 100%, overall and per category; exact cap boxes with optional scaling when the monthly budget changes; loading, error and sync states (Synced, Saving, Offline, This browser); 44 px touch targets and a six-item mobile bar that fits at 320 px.

**P2:** dark mode (system, light, dark; WCAG AA contrast tested); preferences (currency symbol, week start, budget period start day 1â€“28, warning threshold); recurring expenses (monthly, weekly); savings goals with contributions; analytics comparison, six-period totals and month-end projection; installable app and offline use (manifest, service worker, install and update prompts); delete my account.

**Not built:** P3 (splitting expenses, weekly digest). It needs your decision, and the digest needs a backend or paid scheduler.

Screenshots (desktop 1280 px and mobile 390 px, light, plus dark for Dashboard and Analytics) are in `docs/report-screenshots/`:
`desktop-light-{dashboard,transactions,budget-setup,analytics,recurring,goals,profile--settings}.png`, the same seven for `mobile-light-*`, and `desktop-dark-{dashboard,analytics}.png`, `mobile-dark-{dashboard,analytics}.png`.

## 3. Data migrations

No one-time rewrite of existing Firestore data was needed, and none was written. All new fields (`paymentMethod`, `recurringId`, `settings.*`, `recurring`, `goals`) are optional, so old documents keep working.

| Change | Safety | How tested |
|---|---|---|
| Legacy localStorage import (B14) | Never automatic; the user chooses import, delete or later. Chunked writes. `legacyImportHandled` on the user doc stops it asking again | Unit and browser tests, including partial failure and a second run |
| Recurring expenses | Each occurrence has the fixed id `rec-<rule>-<date>`, so running it twice or on two devices makes one copy; edited occurrences are not overwritten and deleted ones are not revived | Unit tests run it repeatedly, resume after pause, two simulated devices |
| Settings | Values are clamped on read and save; old docs without settings get defaults | Unit tests |
| Category caps and budget cap | An unchanged legacy cap is left alone, so old data still saves | Unit tests |

**Caveat:** the new rules reject documents that break the schema (for example an expense note over 200 characters or an amount over 10,00,000). Old documents like that remain readable, but editing one would be refused until it is fixed. I did not scan the live database; I cannot reach it.

## 4. Manual steps for the owner

1. Review `firestore.rules`. Back up or export Firestore from the console first.
2. Publish the rules: Firebase console, project `expensetrack-bff94`, Firestore Database, Rules, paste the file, Publish. (Or `firebase deploy --only firestore:rules` from a logged-in machine.)
3. In Firebase console, Authentication, Settings, Authorized domains: make sure `expensetrack-app.onrender.com` is listed.
4. In Render, confirm the static site is `expensetrack-app` with build command `npm install && npm run build` and publish directory `public`, and that it picks up `render.yaml` (headers, rewrites for `/login` and `/dashboard`, CSP). If the service was created by hand rather than from a Blueprint, copy the headers and rewrites into the dashboard or sync the Blueprint.
5. Review the branch, then merge to `main` yourself when happy. Render deploys from `main`. I have not pushed anything.
6. After deploy, sign in with Google once on the live site, add an expense, delete it with Undo, open Analytics and Settings. Check the browser console for errors. This is the one path I could only test with a stub (see section 5).
7. Paste the live URL into a share-preview tool (for example LinkedIn Post Inspector) to confirm the card image.
8. If the live rules refuse an old document (see the caveat in section 3), fix that document in the console.

## 5. What I am unsure about, and what next

**Lighthouse (local servers, Lighthouse CLI, throttled mobile and desktop):**

| Page | Before (mobile / desktop) | After (mobile / desktop) |
|---|---|---|
| Sign-in (`/login`) | 69â€“74 / 98 | 100 / 100 |
| Signed-in app (demo data) | 59â€“64 / 90 | 92 / 99â€“100 |

Accessibility, Best Practices and SEO are 100 on both pages after (SEO was 92 before). Mobile performance varies by about 10 points run to run, so treat 92 as "around 90". The signed-out `/` redirects to sign-in before any app code downloads (Best Practices 96 there, because of that redirect).

**Not verified:**
- Real Google sign-in end to end, the real re-authentication popup for account deletion, and real install and update flows. They were tested with a stubbed Firebase. The only real-SDK tests check that the CSP lets the popup open.
- Firefox and Safari (WebKit). Only Chrome was tested; those browsers are not installed here and downloading them needs your OK.
- The Lighthouse numbers come from a stubbed signed-in demo on localhost, not the live site.

**Known limits:**
- Validation messages say â‚¹ whatever the currency setting is. The currency setting changes the symbol and grouping only; amounts are never converted.
- `enablePersistence` (compat SDK) is deprecated upstream; the move to the modular SDK is left as a follow-up.
- esbuild is a new build-time dev dependency; its install script shows a warning on this machine but works.

**Next:** (1) work through the manual steps above; (2) decide on P3 and, for the weekly digest, whether you accept a backend or paid scheduler; (3) if you want, I can install Firefox and WebKit for Playwright and run the suite there.
