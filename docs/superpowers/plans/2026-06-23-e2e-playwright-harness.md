# E2E Playwright Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a committed Playwright E2E harness that runs against a dedicated, isolated Postgres, with a login smoke test and one create-booking critical-flow test.

**Architecture:** A new `e2e/` tree holds the Playwright config, a global-setup that pushes the Prisma schema + seeds a dedicated `hms_e2e` database (port 5434), an auth-setup project that logs in once and saves `storageState`, and two specs. Playwright launches the app via `next dev` on port 3100 (`reuseExistingServer: true`). Fully separate from the Vitest `tests/` suite and its DB.

**Tech Stack:** `@playwright/test`, Next.js 16 (`next dev`), Prisma 6 (`db push` + existing `tsx` seed scripts), Postgres 16 (Docker, `docker-compose.test.yml`).

---

## Context the engineer needs

- **Repo:** `/Users/rsalim/personal/hms-revamp`. Next.js 16 App Router, Prisma 6, Postgres.
- **Existing test infra (do NOT touch):** Vitest suite under `tests/` (unit + integration). Integration tests use Postgres on **port 5433** (`hms_test`, user/pass `test`/`test`), defined as service `test-db` in `docker-compose.test.yml`. They truncate tables mid-run, which is exactly why E2E needs its own DB.
- **Ports:** `5432` = dev DB, `5433` = integration test DB, **`5434` = new E2E DB (this plan)**. App dev server normally `3000`; **E2E uses `3100`**.
- **Seeds (reused as-is):**
  - `prisma/seed.ts` — admin user `admin@micasasuites.com` / `admin123`, RBAC, settings. Run via `tsx prisma/seed.ts`.
  - `prisma/seed-mock.ts` — tenants, rooms, durations, bookings, bills, email logs. Run via `tsx prisma/seed-mock.ts` (npm script `seed:mock`). It does NOT clear tables first, so it must run on a fresh DB.
- **Login form** (`src/app/(external)/(auth)/login/login-form.tsx`): `input[type="email"]` (placeholder `email@contoh.com`), `input[type="password"]` (placeholder `********`), submit button text **"Masuk"**. Successful login redirects to `/dashboard`.
- **Env the app needs** (from `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`. For E2E these are injected by the Playwright `webServer.env`.
- **Why `next dev` + `reuseExistingServer`:** user chose fast iteration. First navigation triggers route compilation, so timeouts are generous.

## File structure

| File | Responsibility |
|---|---|
| `docker-compose.test.yml` (modify) | Add `e2e-db` service (Postgres 16, `hms_e2e`, port 5434, tmpfs). |
| `e2e/playwright.config.ts` (create) | Playwright config: testDir, projects (setup + chromium), webServer (`next dev` on 3100), baseURL, timeouts, globalSetup. |
| `e2e/global-setup.ts` (create) | Once per run: `prisma db push` + seed `hms_e2e`. |
| `e2e/auth.setup.ts` (create) | Setup project: log in as admin via the form, save `storageState` to `e2e/.auth/admin.json`. |
| `e2e/fixtures/test-data.ts` (create) | Known constants specs assert against (admin creds, base URL paths). |
| `e2e/specs/smoke.spec.ts` (create) | Login + core pages render. |
| `e2e/specs/create-booking.spec.ts` (create) | Create-booking critical flow. |
| `package.json` (modify) | Add `@playwright/test` devDep + `test:e2e`, `test:e2e:ui`, `db:e2e` scripts. |
| `.gitignore` (modify) | Ignore `playwright-report/`, `test-results/`, `e2e/.auth/`. |

---

## Task 1: Add the dedicated E2E database service

**Files:**
- Modify: `docker-compose.test.yml`

- [ ] **Step 1: Add the `e2e-db` service**

Append under `services:` in `docker-compose.test.yml` (sibling of `test-db`):

```yaml
  e2e-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: e2e
      POSTGRES_PASSWORD: e2e
      POSTGRES_DB: hms_e2e
    ports:
      - "5434:5432"
    tmpfs:
      - /var/lib/postgresql/data
```

- [ ] **Step 2: Start the container and verify it accepts connections**

Run: `docker compose -f docker-compose.test.yml up -d e2e-db && sleep 3 && docker compose -f docker-compose.test.yml exec -T e2e-db pg_isready -U e2e`
Expected: `... accepting connections`

- [ ] **Step 3: Commit**

```bash
git add docker-compose.test.yml
git commit -m "test(e2e): add dedicated e2e-db postgres service (port 5434)"
```

---

## Task 2: Install Playwright and add scripts + gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install `@playwright/test` as a devDependency**

Run: `npm install -D @playwright/test --legacy-peer-deps`
Expected: `@playwright/test` appears in `devDependencies`.

(Note: `--legacy-peer-deps` matches the repo's CI install flag.)

- [ ] **Step 2: Install the Chromium browser binary**

Run: `npx playwright install chromium`
Expected: Chromium downloaded (or "is already installed").

- [ ] **Step 3: Add npm scripts**

In `package.json` `scripts`, add (after the existing `test:ci` line):

```json
    "test:e2e": "playwright test -c e2e/playwright.config.ts",
    "test:e2e:ui": "playwright test -c e2e/playwright.config.ts --ui",
    "db:e2e": "docker compose -f docker-compose.test.yml up -d e2e-db",
```

- [ ] **Step 4: Update `.gitignore`**

Append to `.gitignore`:

```
# playwright e2e
/playwright-report/
/test-results/
/e2e/.auth/
```

- [ ] **Step 5: Verify Playwright runs (no tests yet)**

Run: `npx playwright --version`
Expected: prints a version like `Version 1.x.x`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "test(e2e): add @playwright/test, scripts, and gitignore entries"
```

---

## Task 3: Test-data constants fixture

**Files:**
- Create: `e2e/fixtures/test-data.ts`

- [ ] **Step 1: Create the constants file**

```ts
// Known values the E2E database is seeded with (prisma/seed.ts + seed-mock.ts).
// Specs assert against these. If the seed scripts change, update here.

export const ADMIN = {
  email: "admin@micasasuites.com",
  password: "admin123",
} as const;

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  bookings: "/bookings",
  bills: "/bills",
  payments: "/payments",
  emailLogs: "/settings/email-logs",
} as const;

// Where the saved admin session is written by auth.setup.ts.
export const ADMIN_STORAGE_STATE = "e2e/.auth/admin.json";
```

- [ ] **Step 2: Commit**

```bash
git add e2e/fixtures/test-data.ts
git commit -m "test(e2e): add seed-derived test-data constants"
```

---

## Task 4: Global setup — push schema and seed the E2E database

**Files:**
- Create: `e2e/global-setup.ts`

This runs once before any spec. It points `DATABASE_URL` at `hms_e2e`, pushes the
Prisma schema, then runs the existing seed scripts via `tsx`. Because the E2E DB
is `tmpfs` and may already hold data from a previous run in the same container, it
truncates all tables first so seeding (which uses `createMany` without clearing)
starts clean and is idempotent across runs.

- [ ] **Step 1: Write the global-setup script**

```ts
import { execSync } from "node:child_process";
import { Client } from "pg";

const E2E_DATABASE_URL = "postgresql://e2e:e2e@localhost:5434/hms_e2e";

async function truncateAll(): Promise<void> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    // Only truncate if the schema has already been pushed (tables exist).
    const { rows } = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );
    if (rows.length > 0) {
      const list = rows.map((r) => `"${r.tablename}"`).join(", ");
      await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };

  // 1. Push the current Prisma schema into the E2E database.
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env,
    stdio: "inherit",
  });

  // 2. Start from a clean slate so the non-clearing seed scripts are idempotent.
  await truncateAll();

  // 3. Seed base data (admin user, RBAC, settings) then mock data.
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed-mock.ts", { env, stdio: "inherit" });
}
```

- [ ] **Step 2: Confirm `pg` is available**

Run: `node -e "require('pg'); console.log('pg ok')"`
Expected: `pg ok`. (Prisma depends on it transitively; if this errors, run `npm install -D pg --legacy-peer-deps` and commit the lockfile change in Step 4's commit.)

- [ ] **Step 3: Smoke-run the setup directly to verify it seeds**

Run:
```bash
docker compose -f docker-compose.test.yml up -d e2e-db && sleep 3
DATABASE_URL=postgresql://e2e:e2e@localhost:5434/hms_e2e npx tsx -e "import s from './e2e/global-setup.ts'; s().then(()=>console.log('SETUP OK'))"
```
Expected: prisma push output, seed output, then `SETUP OK`.

- [ ] **Step 4: Verify the admin row exists in the E2E DB**

Run: `docker compose -f docker-compose.test.yml exec -T e2e-db psql -U e2e -d hms_e2e -tc "SELECT email FROM siteusers WHERE email='admin@micasasuites.com';"`
Expected: prints `admin@micasasuites.com`.

- [ ] **Step 5: Commit**

```bash
git add e2e/global-setup.ts package.json package-lock.json
git commit -m "test(e2e): global setup pushes schema and seeds hms_e2e"
```

---

## Task 5: Playwright config

**Files:**
- Create: `e2e/playwright.config.ts`

Defines two projects: `setup` (runs `auth.setup.ts`, created in Task 6) and
`chromium` (the specs, depends on `setup` and loads the saved storageState).
`webServer` launches `next dev` on 3100 with the E2E `DATABASE_URL`.

- [ ] **Step 1: Write the config**

```ts
import { defineConfig, devices } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./fixtures/test-data";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DATABASE_URL = "postgresql://e2e:e2e@localhost:5434/hms_e2e";

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  // next dev compiles routes on first hit; keep timeouts generous.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ADMIN_STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: "e2e-secret",
      AUTH_URL: BASE_URL,
      NODE_ENV: "development",
    },
  },
});
```

- [ ] **Step 2: Verify the config parses (lists projects, no tests yet)**

Run: `npx playwright test -c e2e/playwright.config.ts --list`
Expected: command exits without a config error. (`auth.setup.ts` and specs don't exist yet, so it may report "no tests found" — that is fine; a *config parse error* is not.)

- [ ] **Step 3: Commit**

```bash
git add e2e/playwright.config.ts
git commit -m "test(e2e): playwright config (next dev on 3100, setup+chromium projects)"
```

---

## Task 6: Auth setup project — log in and save storageState

**Files:**
- Create: `e2e/auth.setup.ts`

- [ ] **Step 1: Write the auth setup**

```ts
import { test as setup, expect } from "@playwright/test";
import { ADMIN, ADMIN_STORAGE_STATE, ROUTES } from "./fixtures/test-data";

// Logs in as the seeded admin through the real login form and persists the
// session. The chromium project loads this storageState so specs start
// authenticated. The smoke spec still exercises login explicitly.
setup("authenticate as admin", async ({ page }) => {
  await page.goto(ROUTES.login);
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole("button", { name: "Masuk" }).click();

  await page.waitForURL(`**${ROUTES.dashboard}`);
  await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
```

- [ ] **Step 2: Run only the setup project to verify login works end-to-end**

Run: `npx playwright test -c e2e/playwright.config.ts --project=setup`
Expected: 1 passed; file `e2e/.auth/admin.json` is created.

- [ ] **Step 3: Verify the storageState file exists**

Run: `test -f e2e/.auth/admin.json && echo "STORAGE OK"`
Expected: `STORAGE OK`.

- [ ] **Step 4: Commit**

```bash
git add e2e/auth.setup.ts
git commit -m "test(e2e): auth setup project logs in admin and saves storageState"
```

---

## Task 7: Smoke spec — login + core pages render

**Files:**
- Create: `e2e/specs/smoke.spec.ts`

- [ ] **Step 1: Write the smoke spec**

The first test exercises login explicitly (fresh context, no stored session).
The second uses the authenticated session and walks core routes, asserting each
renders its heading without hitting the error boundary ("Terjadi Kesalahan").

```ts
import { test, expect } from "@playwright/test";
import { ADMIN, ROUTES } from "../fixtures/test-data";

test.describe("smoke", () => {
  test("admin can log in", async ({ browser }) => {
    // Fresh context with no stored session so the login form is exercised.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto(ROUTES.login);
    await page.locator('input[type="email"]').fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.dashboard}$`));
    await context.close();
  });

  const pages: { path: string; heading: RegExp }[] = [
    { path: ROUTES.bookings, heading: /Pemesanan/i },
    { path: ROUTES.bills, heading: /Tagihan/i },
    { path: ROUTES.payments, heading: /Pembayaran/i },
    { path: ROUTES.emailLogs, heading: /Log Email/i },
  ];

  for (const { path, heading } of pages) {
    test(`core page renders: ${path}`, async ({ page }) => {
      await page.goto(path);
      // Error boundary copy from the dashboard error.tsx — must NOT appear.
      await expect(page.getByText("Terjadi Kesalahan")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: heading })
      ).toBeVisible();
    });
  }
});
```

- [ ] **Step 2: Run the smoke spec**

Run: `npx playwright test -c e2e/playwright.config.ts e2e/specs/smoke.spec.ts`
Expected: setup (1) + smoke tests all pass.

- [ ] **Step 3: If a heading assertion fails, correct the regex to the real heading**

If a `core page renders` test fails on the heading, inspect the real page heading and adjust the `heading` regex in the `pages` array to match the rendered `<h1>`. (Headings observed during manual QA: Bookings = "Pemesanan", Email Logs = "Log Email". Bills/Payments confirm at runtime.) Re-run Step 2 until green.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/smoke.spec.ts
git commit -m "test(e2e): smoke spec for login and core page rendering"
```

---

## Task 8: Create-booking spec — the critical flow

**Files:**
- Create: `e2e/specs/create-booking.spec.ts`
- Reference (read, do not modify): `src/app/(internal)/(dashboard_layout)/bookings/booking-form.tsx`, `booking-table.tsx`

The booking form uses custom `SearchableSelect` components (not native
`<select>`), so the spec interacts via visible labels and option text rather than
raw `selectOption`. **Selectors must be verified against the live form** — this
task includes an explicit discovery step before writing assertions.

- [ ] **Step 1: Discover the live booking-form structure**

Read `src/app/(internal)/(dashboard_layout)/bookings/booking-form.tsx` and note:
field labels (tenant, room, duration, start date), how the add-booking modal is
opened from `/bookings` (button text — likely "+ Tambah Pemesanan"), the submit
button text, and how `SearchableSelect` exposes options (input + listbox). Write
these down before Step 2.

- [ ] **Step 2: Confirm selectors interactively against the running app**

Run: `npm run db:e2e` then `DATABASE_URL=postgresql://e2e:e2e@localhost:5434/hms_e2e AUTH_SECRET=e2e-secret AUTH_URL=http://localhost:3100 next dev -p 3100` in one shell; in another, use Playwright codegen to capture exact selectors:
`npx playwright codegen --load-storage=e2e/.auth/admin.json http://localhost:3100/bookings`
Click through opening the form, selecting a seeded tenant/room/duration, setting a start date, and submitting. Copy the generated locators.

- [ ] **Step 3: Write the create-booking spec using the confirmed selectors**

Use the locators captured in Step 2. Structure (fill in the real selectors/option
text from Step 2 — the seed has tenants like "Ahmad Wijaya" and rooms like "101"):

```ts
import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

test("staff can create a booking", async ({ page }) => {
  await page.goto(ROUTES.bookings);

  // Open the create-booking modal. (Confirm exact button text in Step 1/2.)
  await page.getByRole("button", { name: /Tambah Pemesanan/i }).click();

  // Fill the form via SearchableSelect inputs + date field.
  // Replace the locators below with those captured by codegen in Step 2.
  // --- BEGIN selectors confirmed in Step 2 ---
  // await page.getByLabel(/Penyewa/i).click();
  // await page.getByRole("option", { name: "Ahmad Wijaya" }).click();
  // await page.getByLabel(/Kamar/i).click();
  // await page.getByRole("option", { name: /101/ }).click();
  // await page.getByLabel(/Durasi/i).click();
  // await page.getByRole("option", { name: /1 Bulan/i }).click();
  // await page.getByLabel(/Tanggal Mulai/i).fill("2026-08-01");
  // --- END selectors confirmed in Step 2 ---

  await page.getByRole("button", { name: /Simpan|Tambah/i }).click();

  // Modal closes and the new booking appears in the table. Assert on a stable
  // signal confirmed in Step 2 (e.g. a toast or the tenant name in a new row).
  await expect(page.getByText(/berhasil/i)).toBeVisible();
});
```

- [ ] **Step 4: Run the create-booking spec**

Run: `npx playwright test -c e2e/playwright.config.ts e2e/specs/create-booking.spec.ts`
Expected: passes. If a locator is wrong, fix it from Step 2's codegen output and re-run.

- [ ] **Step 5: Verify the booking was actually written to the DB**

Run: `docker compose -f docker-compose.test.yml exec -T e2e-db psql -U e2e -d hms_e2e -tc "SELECT count(*) FROM bookings;"`
Expected: count is at least 1 greater than the seed-mock baseline (note the baseline before the run if unsure).

- [ ] **Step 6: Commit**

```bash
git add e2e/specs/create-booking.spec.ts
git commit -m "test(e2e): create-booking critical flow spec"
```

---

## Task 9: Full-suite run and README note

**Files:**
- Create: `e2e/README.md`

- [ ] **Step 1: Run the entire E2E suite from a clean DB**

Run:
```bash
docker compose -f docker-compose.test.yml down e2e-db 2>/dev/null; npm run db:e2e && sleep 3 && npm run test:e2e
```
Expected: globalSetup seeds, setup project logs in, all smoke + create-booking specs pass.

- [ ] **Step 2: Write a short E2E README**

```md
# E2E Tests (Playwright)

Local-only end-to-end tests. Separate from the Vitest suite under `tests/`.

## Run

```bash
npm run db:e2e        # start the dedicated e2e Postgres (port 5434)
npm run test:e2e      # run all specs (boots `next dev` on 3100, seeds the DB)
npm run test:e2e:ui   # interactive UI mode
```

## How it works

- `global-setup.ts` pushes the Prisma schema into `hms_e2e` and seeds it
  (`prisma/seed.ts` + `prisma/seed-mock.ts`).
- `auth.setup.ts` logs in as the seeded admin and saves the session; specs reuse it.
- Playwright launches the app with `next dev -p 3100` (`reuseExistingServer: true`).

## Notes

- Admin login: `admin@micasasuites.com` / `admin123` (from the seed).
- Not yet wired into CI — see `docs/superpowers/specs/2026-06-23-e2e-playwright-harness-design.md` follow-ups.
```

- [ ] **Step 3: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): add e2e README with run instructions"
```

---

## Self-review notes

- **Spec coverage:** DB isolation (Task 1), tooling/scripts/gitignore (Task 2), constants (Task 3), global setup + seeding (Task 4), config with `next dev`/`reuseExistingServer`/storageState (Task 5), auth fixture (Task 6), smoke test incl. core-page render (Task 7), create-booking critical flow (Task 8), full-run verification + docs (Task 9). All design sections map to a task.
- **Type/name consistency:** `ADMIN`, `ROUTES`, `ADMIN_STORAGE_STATE` defined in Task 3 and used identically in Tasks 5/6/7/8. `E2E_DATABASE_URL` string identical in global-setup and config. Port `3100`/`5434` consistent throughout.
- **Known soft spot:** Task 8 selectors depend on the live `SearchableSelect` markup, so Task 8 deliberately includes a codegen discovery step rather than guessing selectors (which would be a placeholder). Smoke headings (Task 7) likewise have a correction step.
