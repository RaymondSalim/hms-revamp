# E2E Playwright Harness — Design

**Date:** 2026-06-23
**Status:** Approved for implementation
**Roadmap item:** 4.3 (Tests — E2E for critical flows), pulled forward from Phase 4.

## Problem

The repo has solid domain coverage via Vitest: 40 files / 255 tests (11 unit, 29
integration against a dedicated Postgres). But there is **no end-to-end coverage
and no committed browser-test harness**. Every UI PR so far (loading skeletons,
confirm dialogs, email logs) has been verified only by ad-hoc manual browser QA.
That manual QA uses the Playwright **MCP browser tool** in the assistant's
session — it is not committed test code and runs nothing in the repo.

As we keep shipping Phase 1 UI features, the untested surface widens. We want a
lightweight, real E2E harness now so future PRs have a regression net for the UI
shell, auth, and critical server-action flows — rather than continuing to rely
on manual QA.

## Goals

- A committed Playwright (`@playwright/test`) harness, runnable locally.
- Runs against a **dedicated, isolated E2E database** so it never collides with
  the Vitest integration DB or dev data.
- A **login smoke test** (auth + core pages render) and **one critical-path
  flow** (create a booking) to prove the harness end-to-end.
- Clear separation from the existing Vitest suite (no shared config, no shared DB).

## Non-Goals (YAGNI)

- **No CI wiring yet.** Local-only for this iteration; a follow-up wires it into
  GitHub Actions once the specs prove stable. (A note is left in this doc.)
- **No component/render tests** (`@testing-library/react`) — separate concern.
- **No visual-regression / screenshot diffing.**
- **No changes to the Vitest suite or its database.**

## Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Target environment | **Dedicated E2E Postgres**, seeded, isolated from the integration DB |
| Scope | **Smoke test + one critical flow** (create booking) |
| CI | **Local-only first**; wire into CI as a follow-up |
| App server | **`next dev`** via Playwright `webServer`, with `reuseExistingServer: true` |

## Architecture

### Database isolation

The existing `docker-compose.test.yml` defines `test-db` (Postgres 16, DB
`hms_test`, host port **5433**) — used by the Vitest integration suite, which
truncates tables freely mid-run. E2E needs its own DB so the two suites never
interfere.

- Add a service `e2e-db` to `docker-compose.test.yml`: Postgres 16-alpine, DB
  `hms_e2e`, user/pass `e2e`/`e2e`, host port **5434**, `tmpfs` data (ephemeral).
- Ports in play: `5432` dev, `5433` integration tests, **`5434` E2E**.

### App server

Playwright's `webServer` launches the app with `next dev` on a dedicated port
(**3100**), `DATABASE_URL` pointed at `hms_e2e`, and test env (`AUTH_SECRET`,
`AUTH_URL=http://localhost:3100`, plus S3/SMTP pointing at the compose
MinIO/Mailpit). `reuseExistingServer: true` so a developer who already has a
server on that port attaches to it instead of spawning a second one.

`next dev` compiles routes on first hit, so the config uses generous timeouts
(navigation + webServer start) to avoid first-compile flakiness.

### Global setup & seeding

A Playwright `globalSetup` script runs once before the suite:

1. `prisma db push` against `hms_e2e` (schema, no migration history needed).
2. Seed base data (`prisma/seed.ts` logic): admin user
   `admin@micasasuites.com` / `admin123`, RBAC roles/permissions, settings.
3. Seed mock data (`prisma/seed-mock.ts` logic): tenants, rooms, durations,
   bookings, bills, email logs — so specs assert against realistic, known data.

Seeding reuses the existing seed scripts by running them with `DATABASE_URL`
pointed at `hms_e2e` (invoked via `tsx`, same as the npm seed scripts).

### Authentication fixture

A storage-state approach: a setup step logs in once as admin through the real
login form and saves the session (`e2e/.auth/admin.json`). Specs that need an
authenticated session load this `storageState` and start logged in — except the
smoke test, which exercises the login form explicitly.

### Directory layout

```
e2e/
  playwright.config.ts      # testDir, webServer (next dev), baseURL, projects, timeouts
  global-setup.ts           # db push + seed hms_e2e once per run
  auth.setup.ts             # log in as admin, save storageState (a setup project)
  fixtures/
    test-data.ts            # known seed values specs assert against (admin creds, etc.)
  specs/
    smoke.spec.ts           # login + core pages render
    create-booking.spec.ts  # the one critical flow
```

`playwright.config.ts` lives under `e2e/` to keep it visually separate from the
Vitest `tests/` tree.

## The specs

### `smoke.spec.ts`
- Fill the login form with `admin@micasasuites.com` / `admin123`.
- Assert redirect to `/dashboard`.
- Visit core routes — `/bookings`, `/bills`, `/payments`, `/settings/email-logs`
  — and assert each renders its heading + table without an error boundary.

Regression net for the UI shell, navigation, and auth.

### `create-booking.spec.ts`
- Authenticated via `storageState`.
- Go to `/bookings`, open the add-booking form, fill it (tenant, room, duration,
  dates), submit.
- Assert the new booking appears in the table.

Exercises a server action + DB write + revalidation — the highest-value path to
protect.

## Tooling changes

- **devDependency:** `@playwright/test` (+ `npx playwright install chromium`).
- **npm scripts:**
  - `test:e2e` — `playwright test -c e2e/playwright.config.ts`
  - `test:e2e:ui` — `playwright test -c e2e/playwright.config.ts --ui`
  - `db:e2e` — start the `e2e-db` container (`docker compose -f docker-compose.test.yml up -d e2e-db`)
- **`.gitignore`:** `playwright-report/`, `test-results/`, `e2e/.auth/`.

## Risks & mitigations

- **External deps (S3/SMTP):** the first critical flow (create booking) is kept
  clear of file upload / email. If a future spec touches them, point at the
  running MinIO/Mailpit (already in compose) or assert around them.
- **Seed determinism:** specs assert against known seed-mock data; if seed-mock
  changes, specs may need updating. Expected and acceptable.
- **`next dev` first-compile latency:** mitigated with generous Playwright
  timeouts.

## Follow-ups (out of scope now)

- Wire E2E into CI (GitHub Actions job: boot DB + app, run Playwright on PRs).
- Expand specs to more critical flows (verify payment, generate bill, resend email).
- Consider build+start for higher prod fidelity in CI.
