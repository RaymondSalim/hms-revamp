# Server-Side Pagination for Unbounded List Tables — Design Spec

**Date:** 2026-06-25
**Status:** Approved (pending spec review)
**Roadmap item:** Extends Phase 0.2 (server-side pagination). Supersedes the immediate P.3 work — P.3 Tier 1 (relation-column sorting for bookings/bills/payments) is paused and resumes after this; its spec lives at `docs/superpowers/specs/2026-06-25-relation-column-sorting-design.md`.

## Problem

Four list tables (bookings, bills, payments, email-logs) use server-side
pagination: `page.tsx` → `parseTableParams` → `get<Entity>Page(scope, params):
Promise<Paginated<T>>` → `ServerDataTable`. Six other list tables still call an
unbounded `findMany` (no `skip`/`take`), ship the **entire** dataset to the browser,
and paginate/sort/search **in memory** via the client-side `DataTable`. At small row
counts this is invisible; as the data grows it becomes a slow page, a large RSC
payload, and client memory pressure — the exact problem Phase 0 pagination solved for
the other tables.

Two of these also have specific defects:
- **utilities** queries `meterReading` with **no location scope** — it loads every
  location's readings for every user (a cross-location data leak, not just a perf
  issue).
- client-side search (`DataTable` global filter) silently becomes "search the current
  page only" the moment a table is paginated, so each migration must add a real
  server-side search equivalent.

## Goal

Migrate the six **unbounded** tables to server-side pagination, search, and sorting,
following the established pattern. Fix the utilities location scope as part of its
migration. Add relation-column sorting for these six tables (their sortable columns
are being chosen anyway).

## Scope

### In scope — migrate these 6 tables

| Table | File (table component) | Location scope |
|---|---|---|
| tenants | `residents/tenants/tenant-table.tsx` | **none** (global — tenants book across locations) |
| guests | `residents/guests/guest-table.tsx` | via `booking → room → location` |
| deposits | `deposits/deposit-table.tsx` | via `booking → room → location` |
| utilities | `utilities/utility-table.tsx` | **NEW** via `booking → room → location` (fixes leak) |
| rooms | `rooms/all-rooms/room-table.tsx` | by `location_id` |
| addons | `addons/addon-table.tsx` | by `location_id` |

### Out of scope

- **The 4 bounded reference tables:** locations (1–5 rows), durations (<10),
  room-types (<20), users (<50). Natural low ceilings; stay client-side `DataTable`.
- **email-logs:** already server-side paginated.
- **Relation-column sorting for the original 3 tables** (bookings/bills/payments):
  remains the separate paused P.3 Tier 1 task.
- **Bill aggregate sorting** (total/paid/outstanding): Tier 2 backlog (raw SQL).

## Architecture & Data Flow

No new shared infrastructure. `src/app/_lib/util/table-params.ts`
(`parseTableParams`, `toSkipTake`, `buildPaginated`, `TableParams`, `Paginated<T>`),
`ServerDataTable`, and the URL-driven sort/page contract all already exist and are
unchanged. This is six repetitions of a proven recipe.

### Reference pattern (already in the codebase)

```
page.tsx (server component)
  params = parseTableParams(await searchParams, { allowedSortKeys, defaultSortBy, defaultSortDir })
  data = await getEntityPage(scope, params)         // returns Paginated<T>
  → <EntityTable rows total page pageSize pageCount search sortBy sortDir />
      → <ServerDataTable ... sortableColumns={[...]} />
```

`getBookingsPage` (`src/app/_db/bookings.ts:54`) and `getEmailLogsPage`
(`src/app/_db/email-logs.ts:37`) are the canonical references; the freshest is
email-logs (it also carries a status-tab filter, useful for deposits/utilities later).

### Per-table recipe

For each of the 6 tables:

1. **Query layer** (`src/app/_db/<entity>.ts`): add
   `get<Entity>Page(scope, params: TableParams): Promise<Paginated<T>>`:
   - `where`: location scope (per the table above) + soft-delete filter where the
     model has one + a search `OR` clause over the documented fields.
   - `orderBy`: a per-table map from column id → Prisma `orderBy` object (scalar OR
     nested relation), returned as an **array** with a `{ id: dir }` tiebreaker
     appended for stable pagination.
   - run `findMany({ where, include, orderBy, skip, take })` and `count({ where })`
     in parallel via `toSkipTake` / `buildPaginated`.
   - export `<ENTITY>_SORT_KEYS` (the allowlist).
2. **Page** (`page.tsx`): accept `searchParams: Promise<RawSearchParams>`, call
   `parseTableParams(await searchParams, { allowedSortKeys, defaultSortBy,
   defaultSortDir })`, call the new query fn, spread `Paginated<T>` into the table.
3. **Table component**: swap `DataTable` → `ServerDataTable`; pass
   `total/page/pageSize/pageCount/search/sortBy/sortDir/sortableColumns`; **remove**
   the now-dead client-side search/sort/pagination wiring.

### Layering cleanup (in service of the goal)

`guests`, `deposits`, and `utilities` currently run `prisma.X.findMany` **inline in
`page.tsx`**. Their paginated queries will be extracted into proper `src/app/_db/`
functions, matching the established layering. No unrelated refactoring beyond this.

### Do NOT break other callers (critical)

`getTenants`, `getRoomsByLocation`, and `getAddonsByLocation` are called from
**non-table** sites too (e.g. `bookings/page.tsx` uses `getTenants` for a dropdown;
verified via grep on 2026-06-25). The migration **adds** a new paginated function and
leaves the existing unbounded function intact for those callers — it does NOT replace
them. Before touching any query file, grep every caller and confirm only the table
path moves to the paginated function.

## Per-Table Columns (scope · sortable · search)

Default sort in **bold**. All sorts append the `{ id: dir }` tiebreaker. Relation
sorts use Prisma nested `orderBy`.

**tenants** — no location scope
- Sortable: **name (asc)**, email, phone, id_number (all scalar)
- Search: name, email, phone, id_number (case-insensitive)

**guests** — scope via booking→room→location
- Sortable: **name (asc)**, email, phone, room (`booking.rooms.room_number`)
- Search: name, email, phone, room number
- Guest Stays (count/list): not sortable

**deposits** — scope via booking→room→location
- Sortable: **applied/created date (desc)**, amount, status (`DepositStatus` enum
  scalar), tenant (`booking.tenants.name`, primary key for the combined Booking column)
- Search: tenant name, room number

**utilities** — NEW scope via booking→room→location
- Sortable: **reading_date (desc)**, utility type, reading value, tenant
  (`booking.tenants.name`, for the combined Booking column)
- Search: tenant name, room number
- Proof (file link): not sortable

**rooms** — scope by location_id
- Sortable: **room_number (asc)**, room type (`roomtypes.name`), status
  (`roomstatuses.status`)
- Search: room number, room type name

**addons** — scope by location_id
- Sortable: **name (asc)**, description
- Search: name, description
- Pricing tiers (nested list): not sortable

## Error Handling

- **Unknown `sortBy`:** constrained by `parseTableParams` allowlist; the
  `map[...] ?? default` is a second guard. Falls back to default sort; never throws.
- **Null relations** (room with no room-type, booking with no tenant): Prisma sorts
  nulls last; no crash.
- **Page beyond `pageCount` / empty result:** `buildPaginated` reports honest totals;
  `ServerDataTable` renders its existing empty state.

## Edge Cases

- **Stable pagination tiebreaker.** Every `orderBy` ends with `{ id: dir }` so tied
  rows (e.g. many rooms sharing a status) don't shuffle or duplicate across pages.
- **Utilities scope is a deliberate behavior change.** After migration, users see only
  the selected location's readings (staff: their assigned location; admin: the
  switcher selection). This closes the current cross-location leak. Called out so it
  isn't mistaken for a regression; a test asserts the isolation.
- **Dead client code removed,** not orphaned, when swapping to `ServerDataTable`.

## Testing

Integration tests (Vitest, test DB :5433) added to
`tests/integration/table-pagination.test.ts` (the existing home for this pattern),
mirroring the bookings/bills/payments coverage:

- **Pagination:** page 1 vs page 2 are disjoint and correctly sized; `total` /
  `pageCount` correct.
- **Sorting:** each sortable column asc/desc returns a known seeded order (incl.
  relation columns).
- **Search:** matches the documented fields, excludes non-matches.
- **Location scope:** a row from another location is excluded — **with an explicit
  utilities isolation assertion** (the scope fix).
- **Tiebreaker:** rows tied on the primary key come back in stable `id` order across
  two consecutive pages (no duplicate / skipped row).
- **Caller safety:** existing unbounded `getTenants` / `getRoomsByLocation` /
  `getAddonsByLocation` still return their full result for non-table callers.

**E2E:** add **one** new spec asserting a migrated page (tenants) paginates and
searches end-to-end via the URL — the first time these pages become server-driven.
`ServerDataTable` header/sort behavior is otherwise already E2E-covered. The existing
275 unit/integration + 18 E2E must stay green.

## Implementation Order (independent, low→high risk)

1. **rooms** — simplest scoped table, two relation sorts; good pattern-setter.
2. **addons** — scalar-only, scoped.
3. **tenants** — scalar-only, global (no scope), highest row-count; carries the new E2E.
4. **guests** — extract inline query, relation sort + search.
5. **deposits** — extract inline query, enum status + relation.
6. **utilities** — extract inline query **and** add the new location scope (the leak
   fix); highest risk, done last with the isolation test.

Each table is an independently testable, independently committable unit.
