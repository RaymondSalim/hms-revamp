# Large-Scale, Real-Logic Seed (Sub-project B) — Design Spec

**Date:** 2026-06-29
**Status:** Approved (pending spec review)
**Depends on:** Sub-project A (Fixed Preview Clock — merged, PR #17). B reads the
same `PREVIEW_NOW` so the seeded data and the running app share one "now".

## Problem

The current demo data (`prisma/seed-mock.ts`, ~1825 lines) is hand-built: a dozen
bookings with manually-written bills, payments, and transactions anchored on
fixed 2026 dates. Two problems: (1) it does not scale (too small for realistic
testing/load), and (2) the financial figures are hand-computed, so they can drift
from what the real billing/payment/penalty logic would actually produce, and they
do not move with the (now configurable) business clock. We want a large,
date-aligned dataset whose financial state is produced by the **real application
services**, reproducible run-to-run, and anchored on the frozen `PREVIEW_NOW`.

## Goal

Replace `seed-mock.ts` with a structured, **deterministic** generator that:
- produces ~300 rooms / ~1000 tenants across multiple locations, with a realistic
  booking distribution spanning **past / current / future**, relative to `SEED_NOW`;
- derives all bills, payment allocations, ledger transactions, late-fee
  penalties, and booking-status transitions by calling the **real service
  functions** production uses — never by hand-computing expected output;
- pins a **≥2-per-scenario anchor matrix** of fixed records (so every scenario has
  redundancy and the existing E2E suite stays green);
- is byte-identical run-to-run for a given `PREVIEW_NOW` (seeded PRNG, no
  `Math.random()` / `Date.now()` / argless `new Date()`).

## Decisions

- **Replace `seed-mock.ts`** (not a parallel script). Single source of demo data.
- **Seeded PRNG + fixed anchor records.** Deterministic generation; the records
  the E2E/test contract depends on are hand-pinned, never PRNG-derived.
- **≥2 anchors per scenario** (a coverage matrix), so a test that consumes one
  anchor (e.g. verifying the one pending payment) leaves a second intact.
- **~300 rooms / ~1000 tenants, realistic mix:** ~60% active, ~20% past/completed,
  ~10% future/upcoming, ~10% pending/cancelled; active bookings get a realistic
  paid / partial / overdue / pending / rejected payment spread.
- **Real logic everywhere, accept the runtime.** Every bill/payment/penalty/status
  goes through the real services. Bounded concurrency only where safe (raw inserts,
  non-invoice-numbered derivation); bill generation stays sequential for
  invoice-ordering determinism.
- **Seed only** — B changes no application code, service, or the clock. A service
  that is not cleanly seed-importable is a flagged blocker (small refactor), not a
  reason to duplicate its logic.

## Architecture & Module Structure

`seed-mock.ts`'s single 1825-line `main()` is replaced by focused modules under
`prisma/seed/`:

```
prisma/seed/
  index.ts            orchestrator: reference → anchors → bulk → real-logic derivation → cron replay
  rng.ts              seeded PRNG (mulberry32) + int/pick/weighted + Indonesian name/phone/email/id-number generators
  anchor.ts           reads PREVIEW_NOW → SEED_NOW (midnight-UTC); monthsFrom(n)/daysFrom(n) offset helpers (reuse business-time helpers)
  fixtures.ts         the ≥2-per-scenario fixed anchor matrix (declarative table → records); never PRNG-derived
  reference.ts        statuses, RBAC (via seedRbac), settings, billing policies — the deterministic "schema" data
  generate/
    locations-rooms.ts  N locations + ~300 rooms (types/pricing) via seeded PRNG
    tenants.ts          ~1000 tenants (deterministic names/contacts/profiles)
    bookings.ts         bookings with the past/current/future + status distribution
  derive.ts           runs the REAL services over generated bookings (bills, allocation, transactions); then replays crons
```

`prisma/seed.ts` (reference-only seed used by `db:setup`/CI) is unchanged; B's
`reference.ts` reuses `seedRbac(prisma)` from `prisma/seed-rbac.ts` (already a
plain export) and the statuses/settings logic, rather than duplicating it. B is
invoked via the existing `seed:mock` npm script, repointed from
`prisma/seed-mock.ts` to `prisma/seed/index.ts`; the old `seed-mock.ts` is
deleted. (`prisma/seed.ts`, `prisma-seed`, and `db:setup` are untouched.)

## Data Flow (mirrors production)

```
PREVIEW_NOW → SEED_NOW (anchor, midnight-UTC)
1. reference data (createMany): statuses, RBAC, settings, billing policies
2. anchor fixtures (fixed, deterministic): the ≥2-per-scenario matrix
3. bulk entities (seeded PRNG, createMany batches): locations, rooms, tenants, bookings
4. DERIVE via real services, per booking in id order:
     generateBillsForFixedBooking / generateInitialBillsForRollingBooking
     → PRNG decides payment intent (paid/partial/overdue/pending/rejected/bulk)
     → create Payment rows
     → generatePaymentBillMappingFromPaymentsAndBills(bookingId)   (real allocation)
     → createOrUpdatePaymentTransactions(paymentId)                (real ledger)
5. replay daily crons once over the whole dataset:
     runLateFees(SEED_NOW)            (real Penalty + late-fee BillItem rows)
     runBookingStatusSync()           (real status transitions)
6. post-seed determinism/coverage assertion (≥2 per scenario present)
```

### Real services B calls (verified plain-importable)

- `generateBillsForFixedBooking`, `generateInitialBillsForRollingBooking`,
  `generateNextMonthlyBill` — `src/app/_lib/services/bill-generation.ts`
- `generatePaymentBillMappingFromPaymentsAndBills` —
  `src/app/_lib/util/payment-allocation.ts`
- `createOrUpdatePaymentTransactions` —
  `src/app/(internal)/(dashboard_layout)/payments/payment-action.ts`
- `runLateFees(today?)` — `src/app/api/cron/late-fees/route.ts`
- `runBookingStatusSync()` — `src/app/api/cron/booking-status-sync/route.ts`
- `assignInvoiceNumber` / `generateInvoiceNumber` (invoked transitively by
  bill-generation) — atomic, race-safe via the `InvoiceSequence` row upsert.

### What B must NOT call

The server **actions** (`upsertPaymentAction`, `checkInOutAction`,
`setPaymentStatusAction`) require a session/request context
(`checkPermission`, `getScopedLocationIds`, `revalidatePath`) absent in a seed
script. B calls the service/util layer those actions wrap. Check-in is reproduced
by writing `CheckInOutLog` rows directly (the action's CHECK_IN path is itself
just a log insert); the CHECK_OUT deposit/bill effects are reproduced via the
deposit fixtures + `runBookingStatusSync`, not by invoking the action.

## Determinism

`rng.ts` exposes a pure `mulberry32(seed)` with a fixed default seed (overridable
via `SEED_RNG_SEED`). All "random" choices and generated dates derive from the
seed + `SEED_NOW`. **No `Math.random()`, no `Date.now()`, no argless
`new Date()`** anywhere in the generator. Same `PREVIEW_NOW` + same code →
byte-identical database.

**Concurrency caveat (resolved):** invoice numbering is atomic/race-safe
(Postgres serializes the `InvoiceSequence` upsert) so parallel bill generation
cannot duplicate numbers — but the *order* bookings consume numbers would become
nondeterministic under concurrency. Therefore bill derivation runs **sequentially
in booking-id order**; bounded concurrency is applied only to independent,
non-numbered work (raw `createMany` inserts; per-booking payment-transaction
derivation, which allocates no invoice numbers).

## Anchor Matrix (≥2 per scenario, fixed, never PRNG-derived)

Created before any bulk generation. Driven by a small declarative table
(scenario → count → params) so "two per scenario" is data, not 24 copied blocks.

| Scenario | ≥2 pinned anchors | Exercises |
|---|---|---|
| Locations | Sudirman (SDK, id 1) + Kemang (KMG, id 2) | cross-location scoping, switching |
| Active / current | 2 active bookings per location (≥4) | current rent, occupancy |
| Past / completed | 2 completed (checked out before now) | history, completed views, renew |
| Future / upcoming | 2 starting after now | upcoming check-ins, future bills |
| Pending (awaiting check-in) | 2 due to check in today | check-in-today tile + queue |
| Cancelled | 2 cancelled | excluded-from-reads behavior |
| Rolling | 2 rolling (open-ended) | monthly auto-bill generation |
| Overdue bills | 2 bookings with a past-due unpaid bill | overdue tile, late-fee cron, aging |
| Unverified payments | 2 PENDING (≥1 in Sudirman) | payment verify/reject quick actions |
| Rejected / partial | 2 rejected + 2 partially-paid | status pills, allocation |
| Deposits | 2 per status (HELD/APPLIED/REFUNDED/PARTIALLY_REFUNDED) | deposit lifecycle |
| Named test anchors | "Ahmad Wijaya" + a 2nd known tenant; room A3 + a 2nd; INV/SDK invoices on ≥2 bookings | keeps E2E green, provides a spare |

The derived financial state for anchors still flows through the real services —
anchors are pinned in their **inputs** (dates, ids, names), not their computed
outputs. The bulk ~1000 tenants / ~300 rooms generate around this matrix.

### E2E contract preserved

The existing specs depend on: tenant **"Ahmad Wijaya"**, invoice prefix
**"INV/SDK"**, room **A3** (Kemang), logins `admin@micasasuites.com` /
`viewer@micasasuites.com`, and a **PENDING payment in Sudirman**. All are pinned
anchors, so `create-booking.spec.ts`, `global-search.spec.ts`, and
`dashboard-quick-actions.spec.ts` keep passing unchanged.

## Error Handling & Safety

- **Production guard:** B truncates+repopulates, so it aborts if the target looks
  like production (`NODE_ENV === "production"` without explicit `SEED_FORCE=true`),
  mirroring the clock's defense-in-depth.
- **Truncate:** B owns its own truncate (a `TRUNCATE ... RESTART IDENTITY CASCADE`
  over the public tables, the same SQL `tests/helpers/prisma.ts#cleanDatabase`
  uses). The seed must NOT import from `tests/` — extract the truncate into a
  seed-local helper (`prisma/seed/reset.ts`) that both the seed and, if desired,
  the test helper can share, OR inline it in the seed. Default: a seed-local
  helper; leave the test helper as-is to avoid scope creep.
- **Coverage/determinism assertion:** after seeding, assert the anchor matrix
  exists (≥2 per scenario). A refactor that silently drops an anchor fails the
  seed loudly rather than producing a quietly-incomplete DB.
- **Fail-fast:** a service call that throws aborts the seed with the booking
  id/context, never leaving a half-derived DB.
- **Progress logging:** `console.log` per phase so a multi-minute run isn't opaque.

## Performance

- Raw entity inserts (tenants, rooms) batched via `createMany`.
- Bill derivation sequential in booking-id order (determinism requirement).
- Bounded concurrency for independent post-bill work (payment-transaction
  derivation) where no invoice number is allocated.
- A few minutes for ~1000 bookings is acceptable (accepted runtime).

## Testing

- **Integration (Vitest, test DB :5433)** against a pinned `PREVIEW_NOW`:
  - **anchor matrix present** — ≥2 per scenario (overdue, pending, completed,
    future, cancelled, rolling, each deposit status, both locations);
  - **determinism** — two runs produce identical row counts and identical invoice
    numbers for the same booking ids;
  - **production guard** — aborts under simulated `NODE_ENV=production` without
    `SEED_FORCE`;
  - **internal consistency** — a "fully paid" booking reports zero outstanding via
    the real `billOutstanding`; an "overdue" anchor has a `Penalty` after the
    late-fee replay.
- **E2E regression (Playwright):** the existing specs stay green against the new
  seed (the contract the anchors protect). Full suite re-run after wiring B in.
- **No assertion of exact computed financials** (amounts, tax) — those are the
  real services' responsibility, covered by their own unit tests. B's tests assert
  shape and coverage, not recomputed numbers (which would duplicate service logic).

## Out of Scope (backlog)

- Changing any application service, action, or the clock (B is seed-only).
- Client-side time unification (sub-project A backlog item, unrelated).
- Seeding entities not already in the current mock (no new domain models).
- Multi-dataset/tenant-specific seeds beyond the `SEED_RNG_SEED` override.
