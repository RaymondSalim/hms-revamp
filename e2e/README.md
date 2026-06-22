# E2E Tests (Playwright)

Local-only end-to-end tests. Separate from the Vitest suite under `tests/`.

## Run

```bash
npm run db:e2e        # start the dedicated e2e Postgres (port 5434)
npm run test:e2e      # run all specs (boots `next dev` on 3100, seeds the DB)
npm run test:e2e:ui   # interactive UI mode
```

## How it works

- `global-setup.ts` pushes the Prisma schema into `hms_e2e`, truncates, seeds it
  (`prisma/seed.ts` + `prisma/seed-mock.ts`), and flips `APP_SETUP=true` so
  authenticated routes don't redirect to the first-time-setup wizard.
- `auth.setup.ts` logs in as the seeded admin and saves the session to
  `e2e/.auth/admin.json`; the chromium project reuses it so specs start authenticated.
- Playwright launches the app with `next dev -p 3100` (`reuseExistingServer: true`,
  `cwd: ..`).

## Specs

- `specs/smoke.spec.ts` — explicit login + core pages render (bookings, bills,
  payments, email logs).
- `specs/create-booking.spec.ts` — create a booking end-to-end (server action +
  DB write), asserted via success toast and the new table row.

## Notes

- Admin login: `admin@micasasuites.com` / `admin123` (from the seed).
- The default location resolves to "Mi Casa Kemang"; the create-booking spec uses
  room "A3" there (seeded with no existing booking, so no overlap).
- Specs assert against seed-mock data — if the seed scripts change, update the
  specs and `fixtures/test-data.ts`.
- Not yet wired into CI. See the follow-ups in
  `docs/superpowers/specs/2026-06-23-e2e-playwright-harness-design.md`.
```
