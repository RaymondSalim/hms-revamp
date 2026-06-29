# Fixed Preview Clock (Sub-project A) — Design Spec

**Date:** 2026-06-29
**Status:** Approved (pending spec review)
**Context:** Preview/staging deployments need a deterministic "now" so the
seed/mock data and manual feature testing line up against a known date. This is
**sub-project A** of two: (A) a fixed, production-safe clock; (B — separate,
later spec) a large-scale seed that rebases all data around the configured date
and drives it through the real application services. A unblocks B (the seed and
the running app must agree on "now") and is shippable on its own.

## Problem

The app derives "today" for all business logic, and on a preview deployment that
"today" is the real wall-clock date. The seed data is anchored on fixed 2026
dates, so as real time moves past those dates the seeded bookings/bills drift out
of their intended state (overdue items stop being overdue relative to seed
assumptions, "check-in today" never matches, etc.), making preview testing
unreliable. We want to **freeze** the app's business clock to a configured
instant on preview/staging — without any possibility of affecting production.

## Goal

A single, central, **production-safe** business-time source that returns a
**frozen** instant when `PREVIEW_NOW` is configured (in a non-production
environment) and the real time otherwise. All existing business-day logic must
pick this up through the already-central `businessToday()` helper, the small
number of business-time reads that currently bypass it must be migrated, and a
visible banner must make a frozen clock unmistakable. Default behavior (no
`PREVIEW_NOW`) is byte-for-byte unchanged.

## Scope

**In scope (A):**
- `src/app/_lib/util/clock.ts` — `now()` with layered production safety.
- Repoint `businessToday()`'s default argument to the central clock.
- Migrate the **Category-B** server-side business-time reads (listed below) from
  raw `new Date()` to `now()`.
- A frozen-clock **banner** indicator in the header.
- Tests for the clock's safety gates and the banner.

**Out of scope (A):**
- The seed rework / large-scale data (that is **sub-project B** — its own spec).
- **Client-side** time unification (date-pickers, header live clock display
  beyond the banner). Server-only scope was chosen; the banner covers the "is
  this frozen?" confusion. (Backlog candidate.)
- An advancing/ticking offset clock — we freeze to a fixed instant
  (deterministic). (Backlog candidate.)
- Security-token expiry (password reset) — deliberately stays on real time.

## Codebase Audit (every wall-clock read, categorized)

A full sweep of `new Date()` / `Date.now()` and every `businessToday()` call was
performed. **Finding: business-day logic is already centralized through
`businessToday()`** — all three crons (`monthly-billing`, `late-fees`,
`booking-status-sync`), the invoice-reminder task, the bill-generation service,
`booking.ts`/`booking-status.ts`, `reports.ts`, `bills.ts`, `bookings.ts`,
`dashboard.ts`, `today-tasks.ts`, `invoice-number.ts`, the financials summary,
and the action-queue check-in all call it (argless or with an explicit injected
date). Repointing its default is therefore the single change that propagates the
frozen instant to all of them.

**Category A — routes through `businessToday()` already.** Fixed automatically by
repointing the default. No site-by-site edits.

**Category B — raw `new Date()` doing business-time work → migrate to `now()`:**
- `src/app/_lib/util/financial-summary.ts:23` — default reporting window origin.
- `src/app/_db/dashboard.ts:103` — "upcoming events" cutoff (`start: { gte: <now> }`).
- `src/app/api/financials/summary/route.ts:22-23` — default start/end of the
  report range when query params are absent.

  (These three are the only server-side business-time reads that bypass
  `businessToday()`. `booking-action.ts:672` and `payments/payment-action.ts:417`
  were inspected and are `deletedAt` audit stamps → Category C, NOT migrated.)

**Category C — legitimately real wall-clock, MUST NOT freeze (left as `new Date()`/`Date.now()`):**
- `logger.ts:34` (real log timestamps), `cron-handler.ts:28-39` (duration
  measurement), `auth.ts:45` (JWT exp), S3 upload-key timestamps in
  `tenant-action.ts` and `payment-action.ts:272` (uniqueness only),
  `version/route.ts:7`, `notes-section.tsx:19` (relative-time display),
  the `deletedAt`/`applied_at`/`refunded_at`/transaction-`date` audit stamps in
  `booking-action.ts`, `payments/payment-action.ts`, `deposit-action.ts`,
  `credit-action.ts`, and the password-reset token expiry in
  `reset-password/confirm-action.ts:40` + `reset-action.ts:23`.
- **Client components** (`summary-client.tsx`, `availability-client.tsx`,
  `utility-table.tsx`, `bills-payments-section.tsx`, `header.tsx` live clock) —
  out of scope (server-only). They keep real browser time; the banner signals
  the frozen state.

## Architecture & Data Flow

```
PREVIEW_NOW (ISO string env var, e.g. "2026-06-15T03:00:00Z")
  │
  ▼
clock.ts  now(): Date
  ├─ unset                         → new Date()            (real time; default path)
  ├─ set but production-refused    → console.error + new Date()
  ├─ set but unparseable           → console.error + new Date()
  └─ set & allowed & valid         → new Date(PREVIEW_NOW) (FROZEN instant)
       │
       ├──▶ businessToday(now = now())  ── propagates to ALL Category-A consumers
       │       (crons, bill-gen, overdue, action queue, reports, dashboard, …)
       └──▶ Category-B sites call now() directly
                (financial-summary, dashboard upcoming-events, summary route)

isPreviewClockEnabled() (server)  → header renders <PreviewClockBanner date=…>
```

### `clock.ts`

```ts
// The single wall-clock entry point for BUSINESS time. Real time by default;
// returns a FROZEN instant only when PREVIEW_NOW is set in a non-production env.

/** True only when freezing the clock is permitted in this environment. */
export function isPreviewClockAllowed(): boolean {
  // Hard refusal in production: Vercel production OR NODE_ENV=production block
  // the override, UNLESS an explicit staging opt-in is set in tandem (a real
  // production config would never set PREVIEW_CLOCK_ENABLED).
  const isVercelProd = process.env.VERCEL_ENV === "production";
  const isNodeProd = process.env.NODE_ENV === "production";
  const explicitOptIn = process.env.PREVIEW_CLOCK_ENABLED === "true";
  if (isVercelProd) return false;            // Vercel prod: never, no override.
  if (isNodeProd && !explicitOptIn) return false;  // generic prod box: only with opt-in.
  return true;
}

/** Whether the clock is currently frozen (drives the banner). */
export function isPreviewClockEnabled(): boolean {
  return Boolean(process.env.PREVIEW_NOW) && isPreviewClockAllowed() && !Number.isNaN(previewInstant());
}

function previewInstant(): number {
  const raw = process.env.PREVIEW_NOW;
  return raw ? new Date(raw).getTime() : NaN;
}

/** The business "now". Frozen when configured+allowed+valid; real time otherwise. */
export function now(): Date {
  const raw = process.env.PREVIEW_NOW;
  if (!raw) return new Date();
  if (!isPreviewClockAllowed()) {
    console.error("[clock] PREVIEW_NOW ignored: refusing to override clock in production");
    return new Date();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    console.error(`[clock] PREVIEW_NOW is not a valid date: "${raw}" — using real time`);
    return new Date();
  }
  return parsed;
}
```

### Layered production safety (defense in depth — ALL must hold to freeze)

1. **Env-presence gate** — inert unless `PREVIEW_NOW` is explicitly set;
   production never sets it.
2. **Default-deny production refusal** (`isPreviewClockAllowed`) — freezing is
   refused unless the environment affirmatively proves it is non-production:
   (a) `VERCEL_ENV === "production"` blocks unconditionally (not even the opt-in
   overrides it); (b) `PREVIEW_CLOCK_ENABLED === "true"` allows any remaining
   env (deliberate staging opt-in, e.g. a box running `NODE_ENV=production`);
   (c) otherwise require an affirmative non-prod signal — `VERCEL_ENV` of
   `preview`/`development`, or `NODE_ENV` of `development`/`test`. Anything else,
   including an **unset/unknown** environment (a self-hosted box that never set
   `NODE_ENV`), is treated as production-like and **refused** — so a leaked
   `PREVIEW_NOW` cannot accidentally freeze a bare prod box. (Hardened from the
   original "block known-prod" model per final-review Minor #1.)
3. **Loud failure, never silent** — a set-but-refused or unparseable
   `PREVIEW_NOW` logs `console.error` and falls back to real time, so a leaked
   misconfig is visible in logs rather than silently freezing prod.
4. **Visible banner** — when frozen, the app shows a persistent indicator (see
   below) so a preview env can never be mistaken for production.
5. **Default-preserves-behavior** — unset `PREVIEW_NOW` makes `now()` exactly
   `new Date()` and `businessToday()` byte-identical to today; existing tests and
   absolute-dated current seed are unaffected.

### `businessToday()` change

`src/app/_lib/util/business-time.ts`:

```ts
import { now as clockNow } from "@/app/_lib/util/clock";
// ...
export function businessToday(now: Date = clockNow()): Date { /* unchanged body */ }
```

Only the default argument changes. Every existing call (argless in prod code,
explicit-`now` in tests) keeps working; tests that inject `now` are unaffected.
**Note:** `clock.ts` must NOT import from `business-time.ts` (avoid a cycle) —
`clock.ts` depends on nothing in `business-time.ts`.

### Banner

- `src/app/_components/preview-clock-banner.tsx` — a small server-readable
  indicator. The header (server context) calls `isPreviewClockEnabled()` and,
  when true, renders a slim badge: `🕐 Waktu uji: <formatUtcDate(businessToday())>`
  using a distinct accent (e.g. amber) so it reads as "non-production".
- Mounted in `src/app/_components/header.tsx` (or the dashboard layout header),
  visible on every authenticated page. Indonesian copy.
- Renders nothing when the clock is not frozen (zero footprint in production).

## Error Handling

- Unparseable `PREVIEW_NOW` → `console.error` + real time (never throws, never
  freezes).
- `PREVIEW_NOW` set in production → refused + `console.error` + real time.
- Banner reads the same `isPreviewClockEnabled()` predicate, so it can never show
  in production or when the value is invalid.

## Testing

- **Unit `clock.ts`** (Vitest): unset → real time; set+allowed+valid → frozen
  instant equals the parsed value; `VERCEL_ENV=production` → refused (real time)
  even with `PREVIEW_NOW` set; `NODE_ENV=production` without opt-in → refused;
  `NODE_ENV=production` + `PREVIEW_CLOCK_ENABLED=true` → allowed; unparseable →
  real time + error logged. (Manipulate `process.env` within the test, restore
  after.)
- **Unit `business-time.ts`**: existing tests pass unchanged (they inject `now`);
  add one asserting argless `businessToday()` reflects a frozen `PREVIEW_NOW`.
- **Unit banner predicate**: `isPreviewClockEnabled()` true only when set +
  allowed + valid.
- **Regression**: full existing suite (332 unit/integration) green with
  `PREVIEW_NOW` unset — the default path is byte-identical.

## Rollout / Config Notes

- Set `PREVIEW_NOW` (and, on a `NODE_ENV=production` staging box only,
  `PREVIEW_CLOCK_ENABLED=true`) in the **preview/staging** environment only.
- **Never** set either in production. The code refuses regardless, but config
  hygiene is the first line of defense.
- `PREVIEW_NOW` format: any `Date`-parseable ISO string; recommend an explicit
  `Z`/offset (e.g. `2026-06-15T03:00:00Z`) to avoid host-timezone ambiguity.

## Dependency on Sub-project B

B (the large-scale, real-logic seed) will read the **same** `PREVIEW_NOW` as its
anchor so the seeded data and the running app share one "now". B is specced and
built separately, on top of this clock. Per the user, B drives **all** data
(bookings, payments, deposits, check-ins, late-fee + status-sync crons — not just
bill generation) through the real application services rather than direct writes.
