# Today's Tasks Dashboard Widget (Phase 1.6) — Design Spec

**Date:** 2026-06-26
**Status:** Approved (pending spec review)
**Roadmap item:** Phase 1.6 — Today's tasks view (dashboard widget).

## Problem

Staff open the dashboard but have no single place that surfaces what needs action
*now*. Action items are scattered: pending payments live on /payments, overdue
bills on /bills, arrivals and expiring stays on /bookings. The dashboard currently
shows informational cards (occupancy stats, recent payments, oldest outstanding
bills) but nothing that says "these N things need you today."

## Goal

Add a **Today's Tasks** panel at the top of the dashboard: four count tiles —
**check-ins due**, **unverified payments**, **overdue bills**, **expiring
bookings** — each linking to its exactly-filtered list page. Counts are
location-scoped and computed in WIB. To make the drill-down land on an
exactly-filtered list, add status/overdue filters to the three target list pages.

## Decisions

- **Add as a new actionable panel**, above the existing stat cards. The existing
  "Outstanding Bills" / "Recent Payments" informational cards stay as-is; the new
  panel is framed as action-now items. Some overlap with Outstanding Bills is
  accepted.
- **Four count tiles + drill-down links**, matching the existing stat-card visual
  style. Detail lives on the target pages, not in the tile.
- **Exact drill-down**: add real URL filters to the target pages so a tile click
  lands on the filtered list (not just a sort). This expands scope to the three
  list pages but is the correct UX.
- **WIB throughout** via the existing `businessToday()` (`src/app/_lib/util/business-time.ts`),
  which returns the WIB calendar day as midnight-UTC so it compares correctly
  against `@db.Date` columns.

## Tile Definitions (location-scoped, WIB)

| Tile | Count definition | Drill-down |
|---|---|---|
| Check-ins due | bookings with `start_date = businessToday()`, `status_id IN {PENDING, ACTIVE}`, and NO `CHECK_IN` log (`checkInOutLogs none { event_type: "CHECK_IN" }`), not deleted | `/bookings?checkin=today` |
| Unverified payments | payments `status_id = PAYMENT_STATUS.PENDING` (1), not deleted | `/payments?status=pending` |
| Overdue bills | bills not deleted, `due_date < businessToday()`, AND outstanding > 0 (Σ `bill_item.amount` − Σ `paymentBills.amount`) | `/bills?overdue=1` |
| Expiring bookings | bookings `status_id = ACTIVE` (2), `is_rolling = false`, `end_date` in `[businessToday(), businessToday()+30d]`, not deleted | `/bookings?expiring=1` |

Status ids (from `src/app/_lib/util/status.ts`): `BOOKING_STATUS` PENDING=1/ACTIVE=2;
`PAYMENT_STATUS` PENDING=1/VERIFIED=2/REJECTED=3.

## Architecture & Data Flow

### Dashboard side

```
dashboard/page.tsx (server component)
  selectedLocationId = (await resolveLocationContext()).selectedLocationId
  → Promise.all([ ...existing six fetches..., getTodayTaskCounts(selectedLocationId) ])
  → <DashboardClient ... todayTasks={counts} />
      → <TodayTasks counts={counts} />   // NEW, rendered at the top, above the stat row
```

`getTodayTaskCounts(locationId)` (new module `src/app/_db/today-tasks.ts`) runs the
four counts in one `Promise.all`, location-scoped. Three are direct
`prisma.x.count({ where })`. Overdue bills is two-stage (see below). Returns:

```ts
interface TodayTaskCounts {
  checkInsDue: number;
  unverifiedPayments: number;
  overdueBills: number;
  expiringBookings: number;
}
```

No extra network round-trips beyond the four counts — they join the dashboard's
existing parallel fetch. When `selectedLocationId` is null, the dashboard already
short-circuits; the panel renders all-zero tiles (safe fallback).

### `<TodayTasks>` component

`src/app/(internal)/(dashboard_layout)/dashboard/today-tasks.tsx` (client). Renders
four tiles in a responsive row (1 col mobile → 4 cols lg), reusing the existing
stat-card markup (`rounded-xl border p-5`, CSS variables). Each tile is a
`next/link` to its filtered URL. A tile with count 0 renders neutral/muted; a tile
with count > 0 gets an attention treatment (accent color / badge) so live work
stands out. Indonesian labels: "Check-in Hari Ini", "Pembayaran Belum
Diverifikasi", "Tagihan Terlambat", "Pemesanan Akan Berakhir".

### List-page filters (scope expansion)

Each target page's query function gains an optional, typed filter argument; the
`page.tsx` reads a new searchParam and passes it. The `ServerDataTable` client
contract is unchanged — these are server-side `where` (or two-stage) additions.

- **payments** `getPaymentsPage(locationId, params, opts?: { status?: "pending" })`
  → when `status==="pending"`, add `status_id: PAYMENT_STATUS.PENDING` to `where`.
  Page reads `?status=pending`.
- **bookings** `getBookingsPage(locationId, params, opts?: { checkin?: "today"; expiring?: boolean })`
  → `checkin==="today"`: add `start_date = businessToday()`, `status_id in {PENDING, ACTIVE}`,
  `checkInOutLogs: { none: { event_type: "CHECK_IN" } }`. `expiring`: add
  `status_id = ACTIVE`, `is_rolling = false`, `end_date` in `[today, today+30]`.
  Page reads `?checkin=today` and `?expiring=1` (mutually independent; if both
  present, `checkin` takes precedence — documented, but tiles never send both).
- **bills** `getBillsPage(locationId, params, opts?: { overdue?: boolean })`
  → `?overdue=1`: two-stage (below).

Unknown/garbage param values are ignored (no filter), mirroring how
`parseTableParams` ignores out-of-allowlist sort keys. Never throws.

### Overdue bills — two-stage filtering

"Outstanding > 0" is an aggregate Prisma `where` cannot express (same limit as P.3
Tier 2). `due_date < today` IS a clean `where`. So both the **count** and the
**`?overdue=1` list view** do:

1. SQL `where`: `deletedAt: null`, location scope, `due_date < businessToday()`
   (plus the existing search `OR` on the list page).
2. In-JS: keep only rows with `outstanding > 0`, reusing the existing summing logic
   from `getOutstandingBills` (Σ items − Σ paymentBills).

For the **count**, return the post-filter length. For the **list page**, this means
the `?overdue=1` view paginates the filtered subset **in memory** (fetch overdue-dated
bills → filter by outstanding → slice by `skip`/`take` → report honest `total`/
`pageCount`). This is a deliberate, documented exception: the overdue subset (past-due
AND unpaid) is small, so in-memory paginating *that subset* does not reintroduce the
full-table load the pagination migration removed. The **unfiltered** bills page keeps
its existing SQL pagination untouched — the two-stage path runs only when `?overdue=1`.

## Error Handling

- **No location selected:** all-zero tiles; no query runs (matches existing
  dashboard null-location behavior).
- **Bad filter param** (`?status=banana`, `?overdue=xyz`): ignored, page behaves as
  unfiltered. No throw.
- **WIB correctness:** all "today" comparisons use `businessToday()` so they match
  `@db.Date` midnight-UTC storage regardless of server timezone.

## Testing

Integration tests (Vitest, test DB :5433):

- **`getTodayTaskCounts`** — one boundary test per count:
  - check-ins: a booking starting today with no CHECK_IN counts; one starting today
    WITH a CHECK_IN log does not; one starting tomorrow does not.
  - unverified payments: a PENDING payment counts; VERIFIED/REJECTED do not.
  - overdue bills: a past-due bill with outstanding > 0 counts; a past-due fully-paid
    bill does not; a future-due unpaid bill does not.
  - expiring bookings: ACTIVE non-rolling ending in 10 days counts; a rolling booking
    (end_date null) does not; one ending in 40 days does not; a COMPLETED one does not.
  - location scope: a row in another location is excluded from every count.
- **List-page filters** — one test each: `getPaymentsPage` with `status: "pending"`
  returns only pending; `getBookingsPage` with `checkin: "today"` and with
  `expiring: true` each narrow correctly; `getBillsPage` with `overdue: true` returns
  only past-due-and-unpaid and paginates the subset correctly (page 1 vs 2 disjoint,
  honest total).
- **E2E (Playwright):** one new spec asserting the four tiles render on the dashboard
  and a tile (e.g. unverified payments) links to its filtered page (`/payments?status=pending`)
  which loads without the error boundary. Existing suite must stay green.

## Out of Scope

- Auto-refresh/polling of counts (page load is sufficient).
- Per-tile inline item previews (drill-down to the filtered list covers detail).
- Notifications/badges outside the dashboard (e.g. sidebar counts).
- New permissions — the dashboard and the three list pages already gate on their
  existing `*.view` permissions; the widget shows counts a user can already see.
- Help center: the dashboard tour/help may mention the panel, but no user-facing
  feature doc change is mandated beyond a one-line note if a relevant section exists.
