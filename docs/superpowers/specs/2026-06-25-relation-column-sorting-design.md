# Sort Relation Columns Server-Side (P.3, Tier 1) — Design Spec

**Date:** 2026-06-25
**Status:** Approved (pending spec review)
**Roadmap item:** P.3 — Table sorting (full-dataset). Tier 1 (relation columns) only; Tier 2 (bill aggregates) deferred to backlog.

## Problem

Server-side pagination (Phase 0, PR #3) brought server-side sorting with it: the
shared `ServerDataTable` already renders clickable sort headers with ↑/↓
indicators, writes `sortBy`/`sortDir` to the URL, and the bookings/bills/payments
query functions already apply a Prisma `orderBy` built from an allowlisted sort
key. So the roadmap's original framing of P.3 ("re-implement sorting") is stale —
that core work already shipped.

What is **missing** is sorting on the columns users most want: the
**relation columns** (tenant name, room number, status). These are excluded today
because the query functions build a *flat* `orderBy`:

```ts
const orderBy = { [sortKey]: params.sortDir };
```

`{ tenant: "asc" }` is not a valid Prisma `orderBy` — a relation column needs a
*nested* object, e.g. `{ tenants: { name: "asc" } }`. The allowlists
(`BOOKING_SORT_KEYS` etc.) therefore only contain scalar fields.

## Goal

Make the to-one **relation columns** sortable server-side across the full dataset,
using Prisma's native nested `orderBy` (a JOIN). No schema change, no raw SQL.

## Scope

### In scope (Tier 1 — relation columns via Prisma nested `orderBy`)

| Table | New sortable column id | Sorts by (Prisma `orderBy`) |
|---|---|---|
| bookings | `room` | `{ rooms: { room_number: dir } }` |
| bookings | `tenant` | `{ tenants: { name: dir } }` |
| bookings | `status` | `{ bookingstatuses: { status: dir } }` |
| payments | `booking` | `{ bookings: { tenants: { name: dir } } }` |
| payments | `status` | `{ paymentstatuses: { status: dir } }` |
| bills | `room_tenant` | `{ bookings: { tenants: { name: dir } } }` |

Existing scalar sorts are unchanged: bookings `start_date`/`end_date`/`fee`,
payments `payment_date`/`amount`, bills `due_date`/`description`/`invoice_number`.

**Combined-column sort key:** payments `booking` and bills `room_tenant` each
display room **and** tenant in one column. A sort needs one primary key; per the
design decision, both sort by **tenant name** (`tenants.name`), consistent with the
standalone `tenant` column in bookings and matching how staff look people up.

### Out of scope (deferred)

- **Tier 2 — bill `total`/`paid`/`outstanding` sorting.** These are sums over
  relations (`bill_item.amount`, `paymentBills`). Prisma `orderBy` cannot sort by a
  relation aggregate (only `_count`), and sorting the *full dataset* by them
  requires raw SQL (`$queryRaw` with a computed `ORDER BY` + manual pagination that
  reproduces location scope, search, and the soft-delete filter). Filed as a backlog
  item; these columns remain non-sortable for now.
- **The 11 client-side simple tables** (tenants, guests, rooms, durations, addons,
  users, etc.). They load their full (small) dataset and sort in-memory already; no
  change.

## Architecture & Data Flow

The pipeline is unchanged end-to-end:

```
page.tsx (server component)
  params = parseTableParams(searchParams, { allowedSortKeys, defaultSortBy, defaultSortDir })
  → getXxxPage(locationId, params)        // the ONLY file that changes
      orderBy = buildOrderBy(params.sortBy, params.sortDir)   // flat → mapped
      prisma.xxx.findMany({ where, include, orderBy, skip, take })
  → <XxxTable ... sortBy sortDir sortableColumns />   // sortableColumns gains ids
      → <ServerDataTable />                            // unchanged
```

### The core change (per query file)

Replace the flat `orderBy` build with a per-table map from column id → Prisma
`orderBy` object, then append a stable tiebreaker (see Edge Cases). Example for
bookings (`src/app/_db/bookings.ts`):

```ts
export const BOOKING_SORT_KEYS = [
  "start_date", "end_date", "fee", "createdAt",
  "room", "tenant", "status",            // NEW relation columns
] as const;

function bookingOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.BookingOrderByWithRelationInput[] {
  const map: Record<string, Prisma.BookingOrderByWithRelationInput> = {
    start_date: { start_date: dir },
    end_date:   { end_date: dir },
    fee:        { fee: dir },
    createdAt:  { createdAt: dir },
    room:       { rooms: { room_number: dir } },
    tenant:     { tenants: { name: dir } },
    status:     { bookingstatuses: { status: dir } },
  };
  const primary = map[sortBy ?? "createdAt"] ?? map.createdAt;
  // Stable tiebreaker so pagination is deterministic when the primary key ties.
  return [primary, { id: dir }];
}
```

`orderBy` becomes an **array** (`[primary, { id: dir }]`) — Prisma applies them in
order. Payments and bills follow the same shape with their own maps:

- payments map adds `booking: { bookings: { tenants: { name: dir } } }` and
  `status: { paymentstatuses: { status: dir } }`; tiebreaker `{ id: dir }`.
- bills map adds `room_tenant: { bookings: { tenants: { name: dir } } }`;
  tiebreaker `{ id: dir }`.

### Component change

Each table's `sortableColumns` prop gains the new ids. No other client change —
header rendering, click-to-toggle, and URL writing already exist in
`ServerDataTable`.

- bookings: `sortableColumns={["start_date", "end_date", "fee", "room", "tenant", "status"]}`
- payments: `sortableColumns={["payment_date", "amount", "booking", "status"]}`
- bills: `sortableColumns={["due_date", "description", "invoice_number", "room_tenant"]}`

## Error Handling

- **Unknown `sortBy`:** `parseTableParams` already constrains `sortBy` to
  `allowedSortKeys`; the `map[...] ?? default` fallback is a second guard. An
  out-of-allowlist key falls back to the table's default sort, never throws.
- **Null relations:** a booking with no `status_id`, or a payment/bill whose
  booking has no tenant. Prisma orders nulls last by default on nested sorts; no
  crash. Acceptable behavior — nulls sink to the bottom regardless of direction.

## Edge Cases

- **Stable pagination (tiebreaker).** Relation sorts often tie (e.g. 50 bookings
  all "Active"). Without a deterministic secondary key, two pages could show or skip
  the same row. Every sort therefore appends `{ id: dir }` as a tiebreaker so the
  total order is deterministic across pages. Applied to scalar sorts too (cheap, and
  it removes a latent pre-existing pagination-stability bug).
- **Sort + search + location scope compose.** The `orderBy` change is orthogonal to
  the existing `where` clause (search + `location_id`). Sorting a filtered result set
  must still work; covered by a test.

## Testing

Integration tests (Vitest, test DB on :5433) added to the existing
`bookings`/`bills`/`payments` query test files:

- For each new relation column: sort `asc` and `desc`, assert returned row order
  matches a known seeded ordering.
- Invalid/unknown `sortBy` falls back to the default sort (no throw).
- Sort composes with search and location scope (sorted, filtered result is correct).
- Tiebreaker: rows sharing a primary sort value come back in a stable `id` order
  across two consecutive pages (no duplicate/skipped row).

No new E2E: `ServerDataTable` header behavior is unchanged; widening the allowlist
does not change the client contract. The existing suite (275 unit/integration + 18
E2E) must stay green.

## Out-of-Scope Backlog Item (to file)

**B.x — Sort bill aggregate columns (total/paid/outstanding).** Requires raw SQL
(`$queryRaw`) computing the sums as `ORDER BY` expressions with manual
`LIMIT`/`OFFSET`, reproducing location scope + search + soft-delete filters. Separate
design + plan when prioritized.
