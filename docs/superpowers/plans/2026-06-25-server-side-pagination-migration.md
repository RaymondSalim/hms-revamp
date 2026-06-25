# Server-Side Pagination Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the six unbounded list tables (rooms, addons, tenants, guests, deposits, utilities) from full-dataset client-side loading to server-side pagination + search + sorting, reusing the existing `ServerDataTable` / `parseTableParams` / `Paginated<T>` infrastructure; fix the utilities cross-location data leak as part of its migration.

**Architecture:** Each table follows the established recipe already used by bookings/bills/payments/email-logs: a `get<Entity>Page(scope, params): Promise<Paginated<T>>` query function (location-scoped `where` + search `OR` + mapped `orderBy` with an `{ id }` tiebreaker, run with `findMany`+`count` via `toSkipTake`/`buildPaginated`), a `page.tsx` that calls `parseTableParams` and spreads the result into the table, and a table component that swaps the client-side `DataTable` for `ServerDataTable`. No shared infrastructure changes.

**Tech Stack:** Next.js 16 App Router (React 19), TypeScript, Prisma 6 / Postgres, `@tanstack/react-table` v8, Vitest (node env, test DB :5433), Playwright E2E (e2e DB :5434).

## Global Constraints

- Indonesian-language UI. Existing copy (headers, button labels, search placeholders) is preserved verbatim.
- Reuse existing helpers unchanged: `parseTableParams`, `toSkipTake`, `buildPaginated`, `TableParams`, `Paginated<T>`, `RawSearchParams` from `src/app/_lib/util/table-params.ts`; `ServerDataTable` from `src/app/_components/server-data-table.tsx`; `serializeForClient` from `src/app/_lib/util/serialize`; `resolveLocationContext` from `src/app/_lib/util/location-scope`.
- Every `orderBy` is an **array** ending with `{ id: dir }` as a deterministic tiebreaker so pagination is stable across pages when the primary key ties.
- Each `get<Entity>Page` is location-scoped per the spec; **tenants is the sole exception** (no location filter — global).
- **Do NOT replace** the existing unbounded query functions `getTenants` (`src/app/_db/tenant.ts`), `getRoomsByLocation` (`src/app/_db/rooms.ts`), `getAddonsByLocation` (`src/app/_db/addons.ts`) — they are called by non-table sites (e.g. `bookings/page.tsx` uses `getTenants` and `getRoomsByLocation` and `getAddonsByLocation` for form dropdowns). ADD a new `*Page` function alongside them.
- Default `pageSize` is 20 (the `parseTableParams` default); do not override.
- Search is case-insensitive (`mode: "insensitive"`), matching the existing bookings/bills/payments queries.
- Soft-delete: only apply a `deletedAt: null` filter on models that have the column. Among these six: `Booking` has `deletedAt` (matters for guests/deposits/utilities scoping via booking), but the leaf models `Room`, `AddOn`, `Tenant`, `Guest`, `Deposit`, `MeterReading` — verify per task by reading the model before adding a `deletedAt` filter; do NOT invent a `deletedAt` filter on a model that lacks it (it will fail to compile).
- Combined room+tenant columns (deposits, utilities) sort/search by **tenant name** as the primary key.
- The existing full suite (275 unit/integration + 18 E2E) must stay green.

## In-Scope Surfaces

| Task | Table | Query file | Page file | Component file | Scope | Sortable columns (ids) |
|---|---|---|---|---|---|---|
| 1 | rooms | `_db/rooms.ts` | `rooms/all-rooms/page.tsx` | `rooms/all-rooms/room-table.tsx` | `location_id` | `room_number`, `room_type`, `status` |
| 2 | addons | `_db/addons.ts` | `addons/page.tsx` | `addons/addon-table.tsx` | `location_id` | `name`, `description` |
| 3 | tenants | `_db/tenant.ts` | `residents/tenants/page.tsx` | `residents/tenants/tenant-table.tsx` | none (global) | `name`, `email`, `phone`, `id_number` |
| 4 | guests | `_db/guests.ts` (new) | `residents/guests/page.tsx` | `residents/guests/guest-table.tsx` | booking→room→location | `name`, `email`, `phone`, `room` |
| 5 | deposits | `_db/deposits.ts` (new) | `deposits/page.tsx` | `deposits/deposit-table.tsx` | booking→room→location | `created`, `amount`, `status`, `tenant` |
| 6 | utilities | `_db/utilities.ts` (new) | `utilities/page.tsx` | `utilities/utility-table.tsx` | booking→room→location (NEW) | `reading_date`, `utility_type`, `reading_value`, `tenant` |

Tasks 7 (E2E) and 8 (docs/roadmap) follow.

**Reference implementations to read before starting:** `getBookingsPage` in `src/app/_db/bookings.ts:54-95`, `bookings/page.tsx`, and the existing tests in `tests/integration/table-pagination.test.ts`. The `ServerDataTable` props interface is at `src/app/_components/server-data-table.tsx:19-33`.

---

### Task 1: Rooms — server-side pagination (pattern-setter)

**Files:**
- Modify: `src/app/_db/rooms.ts` (add `getRoomsPage` + `ROOM_SORT_KEYS`; keep `getRoomsByLocation`)
- Modify: `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/page.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/room-table.tsx`
- Test: `tests/integration/table-pagination.test.ts` (add a `getRoomsPage` describe block)

**Interfaces:**
- Consumes: `TableParams`, `Paginated`, `toSkipTake`, `buildPaginated` from `@/app/_lib/util/table-params`; `Prisma` from `@prisma/client`.
- Produces:
  - `ROOM_SORT_KEYS: readonly ["room_number","room_type","status"]`
  - `getRoomsPage(locationId: number, params: TableParams): Promise<Paginated<RoomListRow>>` where `RoomListRow = Prisma.RoomGetPayload<{ include: { roomtypes: true; roomstatuses: true; locations: true } }>`

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/table-pagination.test.ts` (inside the top-level `describe`, after the existing blocks). Note `seedTestData()` already creates rooms 101 and 102 in location 1 with `room_type_id: 1` ("Standard") and `status_id: 1` ("Available"):

```ts
import { getRoomsPage } from "@/app/_db/rooms";

describe("getRoomsPage", () => {
  it("paginates and reports total/pageCount for the location", async () => {
    // seedTestData seeds 2 rooms (101, 102) in location 1.
    const p1 = await getRoomsPage(1, { ...baseParams, pageSize: 1, page: 1 });
    expect(p1.rows).toHaveLength(1);
    expect(p1.total).toBe(2);
    expect(p1.pageCount).toBe(2);
  });

  it("does not overlap rows across pages (stable id tiebreaker)", async () => {
    const p1 = await getRoomsPage(1, { ...baseParams, pageSize: 1, page: 1 });
    const p2 = await getRoomsPage(1, { ...baseParams, pageSize: 1, page: 2 });
    expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
  });

  it("searches by room number", async () => {
    const r = await getRoomsPage(1, { ...baseParams, search: "101" });
    expect(r.total).toBe(1);
    expect(r.rows[0].room_number).toBe("101");
  });

  it("searches by room type name", async () => {
    const r = await getRoomsPage(1, { ...baseParams, search: "standard" });
    expect(r.total).toBe(2);
  });

  it("sorts by room_number ascending and descending", async () => {
    const asc = await getRoomsPage(1, { ...baseParams, sortBy: "room_number", sortDir: "asc" });
    expect(asc.rows.map((r) => r.room_number)).toEqual(["101", "102"]);
    const desc = await getRoomsPage(1, { ...baseParams, sortBy: "room_number", sortDir: "desc" });
    expect(desc.rows.map((r) => r.room_number)).toEqual(["102", "101"]);
  });

  it("scopes results to the requested location", async () => {
    const other = await getRoomsPage(99999, baseParams);
    expect(other.total).toBe(0);
  });

  it("falls back to default sort for an unknown sortBy", async () => {
    const r = await getRoomsPage(1, { ...baseParams, sortBy: "nonexistent" });
    expect(r.total).toBe(2); // does not throw
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getRoomsPage`
Expected: FAIL — `getRoomsPage` is not exported.

(If the test DB is not running: `docker compose -f docker-compose.test.yml up -d test-db` and wait for `pg_isready`.)

- [ ] **Step 3: Implement `getRoomsPage`**

In `src/app/_db/rooms.ts`, add the imports and the new function/constant. Leave `getRoomsByLocation` and everything else unchanged. `Room` has no `deletedAt` column, so no soft-delete filter.

```ts
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";
import { Prisma } from "@prisma/client";

const roomListInclude = {
  roomtypes: true,
  roomstatuses: true,
  locations: true,
} satisfies Prisma.RoomInclude;

export type RoomListRow = Prisma.RoomGetPayload<{ include: typeof roomListInclude }>;

/** DB-backed columns the rooms table may sort by. */
export const ROOM_SORT_KEYS = ["room_number", "room_type", "status"] as const;

function roomOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.RoomOrderByWithRelationInput[] {
  const map: Record<string, Prisma.RoomOrderByWithRelationInput> = {
    room_number: { room_number: dir },
    room_type: { roomtypes: { type: dir } },
    status: { roomstatuses: { status: dir } },
  };
  const primary = map[sortBy ?? "room_number"] ?? map.room_number;
  return [primary, { id: dir }];
}

export async function getRoomsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<RoomListRow>> {
  const search = params.search;
  const where: Prisma.RoomWhereInput = {
    location_id: locationId,
    ...(search
      ? {
          OR: [
            { room_number: { contains: search, mode: "insensitive" } },
            { roomtypes: { type: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.room.findMany({
      where,
      include: roomListInclude,
      orderBy: roomOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.room.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getRoomsPage`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire the page**

Replace `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/page.tsx` with:

```tsx
import { getRoomsPage, ROOM_SORT_KEYS } from "@/app/_db/rooms";
import { getRoomTypes } from "@/app/_db/room-types";
import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { RoomTable } from "./room-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function AllRoomsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("rooms.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: ROOM_SORT_KEYS,
    defaultSortBy: "room_number",
    defaultSortDir: "asc",
  });

  const rooms = selectedLocationId
    ? await getRoomsPage(selectedLocationId, params)
    : { rows: [], total: 0, page: 1, pageSize: params.pageSize, pageCount: 1 };
  const roomTypes = await getRoomTypes();
  const roomStatuses = await prisma.roomStatus.findMany({ orderBy: { status: "asc" } });

  return (
    <RoomTable
      rooms={serializeForClient(rooms.rows)}
      roomTypes={serializeForClient(roomTypes)}
      roomStatuses={serializeForClient(roomStatuses)}
      total={rooms.total}
      page={rooms.page}
      pageSize={rooms.pageSize}
      pageCount={rooms.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
```

- [ ] **Step 6: Swap the table component to `ServerDataTable`**

In `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/room-table.tsx`:

1. Change the import on line 6 from
   `import { DataTable } from "@/app/_components/data-table";`
   to
   `import { ServerDataTable } from "@/app/_components/server-data-table";`
2. Extend the `Props` interface (currently `{ rooms; roomTypes; roomStatuses }`) with the pagination props:

```ts
interface Props {
  rooms: RoomRow[];
  roomTypes: RoomTypeOption[];
  roomStatuses: RoomStatusOption[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  search: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
}
```

3. Update the function signature to destructure them:
   `export function RoomTable({ rooms, roomTypes, roomStatuses, total, page, pageSize, pageCount, search, sortBy, sortDir }: Props) {`
4. The `columns` array keeps its existing ids (`room_number` via `accessorKey`, `room_type`, `status`, `actions`). Confirm the `room_number` column has an explicit `id: "room_number"` so the sort header matches; `accessorKey: "room_number"` already yields that id, so no change needed.
5. Replace the table render (line 145):
   `<DataTable columns={columns} data={rooms} searchPlaceholder="Cari kamar..." />`
   with:

```tsx
<ServerDataTable
  columns={columns}
  data={rooms}
  total={total}
  page={page}
  pageSize={pageSize}
  pageCount={pageCount}
  search={search}
  sortBy={sortBy}
  sortDir={sortDir}
  sortableColumns={["room_number", "room_type", "status"]}
  searchPlaceholder="Cari kamar..."
/>
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 8: Run the full pagination test file + confirm no regression**

Run: `npx vitest run tests/integration/table-pagination.test.ts`
Expected: PASS (existing blocks + the new getRoomsPage block).

- [ ] **Step 9: Commit**

```bash
git add src/app/_db/rooms.ts \
  "src/app/(internal)/(dashboard_layout)/rooms/all-rooms/page.tsx" \
  "src/app/(internal)/(dashboard_layout)/rooms/all-rooms/room-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: server-side pagination for rooms table"
```

---

### Task 2: Addons — server-side pagination

**Files:**
- Modify: `src/app/_db/addons.ts` (add `getAddonsPage` + `ADDON_SORT_KEYS`; keep `getAddonsByLocation`)
- Modify: `src/app/(internal)/(dashboard_layout)/addons/page.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/addons/addon-table.tsx`
- Test: `tests/integration/table-pagination.test.ts`

**Interfaces:**
- Produces:
  - `ADDON_SORT_KEYS: readonly ["name","description"]`
  - `getAddonsPage(locationId: number, params: TableParams): Promise<Paginated<AddonListRow>>` where `AddonListRow = Prisma.AddOnGetPayload<{ include: { pricing: true; children: true } }>`

Before writing: read `src/app/(internal)/(dashboard_layout)/addons/addon-table.tsx` to confirm its current `DataTable` usage, `Props` shape, column ids, and search placeholder. `AddOn` has no `deletedAt` column — no soft-delete filter.

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/table-pagination.test.ts`:

```ts
import { getAddonsPage } from "@/app/_db/addons";

describe("getAddonsPage", () => {
  beforeEach(async () => {
    // seedTestData has run; add addons in location 1.
    await testPrisma.addOn.createMany({
      data: [
        { id: "a1", name: "Laundry", description: "Cuci setrika", location_id: 1, requires_input: false },
        { id: "a2", name: "Parkir", description: "Parkir motor", location_id: 1, requires_input: false },
        { id: "a3", name: "WiFi", description: "Internet cepat", location_id: 2, requires_input: false },
      ],
    });
  });

  it("paginates and scopes to the location", async () => {
    const r = await getAddonsPage(1, baseParams);
    expect(r.total).toBe(2); // a1, a2 in location 1; a3 is location 2
  });

  it("searches by name and description", async () => {
    const byName = await getAddonsPage(1, { ...baseParams, search: "laundry" });
    expect(byName.total).toBe(1);
    const byDesc = await getAddonsPage(1, { ...baseParams, search: "parkir motor" });
    expect(byDesc.total).toBe(1);
  });

  it("sorts by name ascending and descending", async () => {
    const asc = await getAddonsPage(1, { ...baseParams, sortBy: "name", sortDir: "asc" });
    expect(asc.rows.map((r) => r.name)).toEqual(["Laundry", "Parkir"]);
    const desc = await getAddonsPage(1, { ...baseParams, sortBy: "name", sortDir: "desc" });
    expect(desc.rows.map((r) => r.name)).toEqual(["Parkir", "Laundry"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getAddonsPage`
Expected: FAIL — `getAddonsPage` not exported.

- [ ] **Step 3: Implement `getAddonsPage`**

In `src/app/_db/addons.ts`, add (keep `getAddonsByLocation` unchanged):

```ts
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";
import { Prisma } from "@prisma/client";

const addonListInclude = {
  pricing: true,
  children: true,
} satisfies Prisma.AddOnInclude;

export type AddonListRow = Prisma.AddOnGetPayload<{ include: typeof addonListInclude }>;

export const ADDON_SORT_KEYS = ["name", "description"] as const;

function addonOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.AddOnOrderByWithRelationInput[] {
  const map: Record<string, Prisma.AddOnOrderByWithRelationInput> = {
    name: { name: dir },
    description: { description: dir },
  };
  const primary = map[sortBy ?? "name"] ?? map.name;
  return [primary, { id: dir }];
}

export async function getAddonsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<AddonListRow>> {
  const search = params.search;
  const where: Prisma.AddOnWhereInput = {
    location_id: locationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.addOn.findMany({
      where,
      include: addonListInclude,
      orderBy: addonOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.addOn.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
```

> Note: `id` on `AddOn` is a string (cuid). `{ id: dir }` is still a valid, deterministic tiebreaker (lexical order). That is fine — it only needs to be stable, not numeric.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getAddonsPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the page**

Replace `src/app/(internal)/(dashboard_layout)/addons/page.tsx` with:

```tsx
import { getAddonsPage, ADDON_SORT_KEYS } from "@/app/_db/addons";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { AddonTable } from "./addon-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function AddonsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("addons.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: ADDON_SORT_KEYS,
    defaultSortBy: "name",
    defaultSortDir: "asc",
  });

  const addons = selectedLocationId
    ? await getAddonsPage(selectedLocationId, params)
    : { rows: [], total: 0, page: 1, pageSize: params.pageSize, pageCount: 1 };

  return (
    <AddonTable
      addons={serializeForClient(addons.rows) as never}
      locationId={selectedLocationId ?? 0}
      total={addons.total}
      page={addons.page}
      pageSize={addons.pageSize}
      pageCount={addons.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
```

- [ ] **Step 6: Swap the table component to `ServerDataTable`**

In `src/app/(internal)/(dashboard_layout)/addons/addon-table.tsx`:
1. Replace the `DataTable` import with `import { ServerDataTable } from "@/app/_components/server-data-table";`
2. Add the pagination props (`total, page, pageSize, pageCount, search, sortBy, sortDir`) to the component's `Props` interface and destructure them, exactly as in Task 1 Step 6.2–6.3.
3. Ensure the name and description columns have ids matching `"name"` and `"description"` (an `accessorKey: "name"` produces id `"name"`; if they use `accessorKey`, no change). The actions column and any pricing-tier column stay non-sortable (omit from `sortableColumns`).
4. Replace the `<DataTable ... />` render with:

```tsx
<ServerDataTable
  columns={columns}
  data={addons}
  total={total}
  page={page}
  pageSize={pageSize}
  pageCount={pageCount}
  search={search}
  sortBy={sortBy}
  sortDir={sortDir}
  sortableColumns={["name", "description"]}
  searchPlaceholder="Cari add-on..."
/>
```

(Preserve the existing search placeholder text if it differs — read the file. The current `DataTable` used `"Cari add-on..."`.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Run the pagination tests**

Run: `npx vitest run tests/integration/table-pagination.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/_db/addons.ts \
  "src/app/(internal)/(dashboard_layout)/addons/page.tsx" \
  "src/app/(internal)/(dashboard_layout)/addons/addon-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: server-side pagination for addons table"
```

---

### Task 3: Tenants — server-side pagination (global, no location scope)

**Files:**
- Modify: `src/app/_db/tenant.ts` (add `getTenantsPage` + `TENANT_SORT_KEYS`; keep `getTenants`)
- Modify: `src/app/(internal)/(dashboard_layout)/residents/tenants/page.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-table.tsx`
- Test: `tests/integration/table-pagination.test.ts`

**Interfaces:**
- Produces:
  - `TENANT_SORT_KEYS: readonly ["name","email","phone","id_number"]`
  - `getTenantsPage(params: TableParams): Promise<Paginated<Tenant>>` — **no location argument** (tenants are global). `Tenant` is the bare Prisma model (no relations needed for the list).

Read `src/app/_db/tenant.ts` first — confirm `Tenant` has no `deletedAt` column (no soft-delete filter). The current `page.tsx` passes the full list and `editId`; preserve the `editId` behavior.

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/table-pagination.test.ts`:

```ts
import { getTenantsPage } from "@/app/_db/tenant";

describe("getTenantsPage", () => {
  beforeEach(async () => {
    await testPrisma.tenant.createMany({
      data: [
        { name: "Ahmad", id_number: "t-ahmad", email: "ahmad@x.com", phone: "0811" },
        { name: "Bayu", id_number: "t-bayu", email: "bayu@x.com", phone: "0822" },
        { name: "Cipto", id_number: "t-cipto", email: "cipto@x.com", phone: "0833" },
      ],
    });
  });

  it("paginates across the full (global) tenant set", async () => {
    const p1 = await getTenantsPage({ ...baseParams, pageSize: 2, page: 1 });
    expect(p1.rows).toHaveLength(2);
    expect(p1.total).toBe(3);
    expect(p1.pageCount).toBe(2);
  });

  it("searches by name, email, phone, and id_number", async () => {
    expect((await getTenantsPage({ ...baseParams, search: "bayu" })).total).toBe(1);
    expect((await getTenantsPage({ ...baseParams, search: "cipto@x.com" })).total).toBe(1);
    expect((await getTenantsPage({ ...baseParams, search: "0811" })).total).toBe(1);
    expect((await getTenantsPage({ ...baseParams, search: "t-ahmad" })).total).toBe(1);
    expect((await getTenantsPage({ ...baseParams, search: "zzz" })).total).toBe(0);
  });

  it("sorts by name ascending and descending", async () => {
    const asc = await getTenantsPage({ ...baseParams, sortBy: "name", sortDir: "asc" });
    expect(asc.rows.map((r) => r.name)).toEqual(["Ahmad", "Bayu", "Cipto"]);
    const desc = await getTenantsPage({ ...baseParams, sortBy: "name", sortDir: "desc" });
    expect(desc.rows.map((r) => r.name)).toEqual(["Cipto", "Bayu", "Ahmad"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getTenantsPage`
Expected: FAIL — `getTenantsPage` not exported.

- [ ] **Step 3: Implement `getTenantsPage`**

In `src/app/_db/tenant.ts` (keep `getTenants` unchanged):

```ts
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";
import { Prisma, type Tenant } from "@prisma/client";

export const TENANT_SORT_KEYS = ["name", "email", "phone", "id_number"] as const;

function tenantOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.TenantOrderByWithRelationInput[] {
  const map: Record<string, Prisma.TenantOrderByWithRelationInput> = {
    name: { name: dir },
    email: { email: dir },
    phone: { phone: dir },
    id_number: { id_number: dir },
  };
  const primary = map[sortBy ?? "name"] ?? map.name;
  return [primary, { id: dir }];
}

export async function getTenantsPage(
  params: TableParams
): Promise<Paginated<Tenant>> {
  const search = params.search;
  const where: Prisma.TenantWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { id_number: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: tenantOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.tenant.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
```

> `Tenant.id` is a string (cuid); `{ id: dir }` is a valid stable tiebreaker.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getTenantsPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the page**

The current page renders `<TenantTable data={serialized} editId={edit} />`. The `editId` flow opens the edit modal for a tenant present in `data`. With pagination, the edited tenant may not be on the current page — so fetch that one tenant explicitly and pass it through. Replace `residents/tenants/page.tsx` with:

```tsx
import { getTenantsPage, TENANT_SORT_KEYS } from "@/app/_db/tenant";
import { getTenantById } from "@/app/_db/tenant";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { TenantTable } from "./tenant-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams & { edit?: string }>;
}) {
  const { authorized } = await checkPermission("tenants.view");
  if (!authorized) return <AccessDenied />;

  const sp = await searchParams;
  const params = parseTableParams(sp, {
    allowedSortKeys: TENANT_SORT_KEYS,
    defaultSortBy: "name",
    defaultSortDir: "asc",
  });

  const tenants = await getTenantsPage(params);

  // The tenant targeted by ?edit= may not be on the current page; fetch it so
  // the edit modal can still open. getTenantById returns relations the table
  // row type ignores — serialize and pass through.
  const editTarget = sp.edit ? await getTenantById(sp.edit) : null;

  return (
    <TenantTable
      data={serializeForClient(tenants.rows) as never}
      editTarget={editTarget ? (serializeForClient(editTarget) as never) : null}
      total={tenants.total}
      page={tenants.page}
      pageSize={tenants.pageSize}
      pageCount={tenants.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
```

- [ ] **Step 6: Update the table component**

In `src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-table.tsx`:
1. Replace the `DataTable` import (line 7) with `import { ServerDataTable } from "@/app/_components/server-data-table";`.
2. Change the component signature and props. Replace:
   `export function TenantTable({ data, editId }: { data: TenantRow[]; editId?: string }) {`
   with:

```tsx
interface TenantTableProps {
  data: TenantRow[];
  editTarget: TenantRow | null;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  search: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
}

export function TenantTable({
  data,
  editTarget,
  total,
  page,
  pageSize,
  pageCount,
  search,
  sortBy,
  sortDir,
}: TenantTableProps) {
```

3. Replace the `editId` effect (lines 44–52) with one driven by `editTarget` (no longer searching the page-local `data`):

```tsx
  useEffect(() => {
    if (editTarget) {
      setEditingTenant(editTarget);
      setIsModalOpen(true);
    }
  }, [editTarget]);
```

4. The `name`/`email`/`phone`/`id_number` columns already use `accessorKey`, so their ids match the sort keys. The `name` column keeps its `Link` cell. The `actions` column stays non-sortable.
5. Replace the `<DataTable columns={columns} data={data} searchPlaceholder="Cari penghuni..." />` (lines 153–157) with:

```tsx
<ServerDataTable
  columns={columns}
  data={data}
  total={total}
  page={page}
  pageSize={pageSize}
  pageCount={pageCount}
  search={search}
  sortBy={sortBy}
  sortDir={sortDir}
  sortableColumns={["name", "email", "phone", "id_number"]}
  searchPlaceholder="Cari penghuni..."
/>
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Run the pagination tests**

Run: `npx vitest run tests/integration/table-pagination.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/_db/tenant.ts \
  "src/app/(internal)/(dashboard_layout)/residents/tenants/page.tsx" \
  "src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: server-side pagination for tenants table"
```

---

### Task 4: Guests — server-side pagination (extract inline query)

**Files:**
- Create: `src/app/_db/guests.ts`
- Modify: `src/app/(internal)/(dashboard_layout)/residents/guests/page.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/residents/guests/guest-table.tsx`
- Test: `tests/integration/table-pagination.test.ts`

**Interfaces:**
- Produces:
  - `GUEST_SORT_KEYS: readonly ["name","email","phone","room"]`
  - `getGuestsPage(locationId: number, params: TableParams): Promise<Paginated<GuestListRow>>` where `GuestListRow = Prisma.GuestGetPayload<{ include: { GuestStay: true; booking: { include: { rooms: true; tenants: true } } } }>`

Read `guest-table.tsx` first to learn its `Props`, columns, column ids, and search placeholder. Read the `Guest` model in `prisma/schema.prisma` to confirm whether it has `deletedAt` (the current inline query does NOT filter `deletedAt`, so match that — do not add a filter the current code lacks).

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/table-pagination.test.ts`. Guests attach to a booking (room→location):

```ts
import { getGuestsPage } from "@/app/_db/guests";

describe("getGuestsPage", () => {
  async function seedGuests() {
    const tenant = await testPrisma.tenant.create({
      data: { name: "Dewi", id_number: `id-d-${Date.now()}`, email: "d@t.com" },
    });
    const booking = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: tenant.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    await testPrisma.guest.createMany({
      data: [
        { name: "Eka", email: "eka@g.com", phone: "0911", booking_id: booking.id },
        { name: "Fajar", email: "fajar@g.com", phone: "0922", booking_id: booking.id },
      ],
    });
    return { booking };
  }

  it("paginates and scopes guests to the location via booking→room", async () => {
    await seedGuests();
    const r = await getGuestsPage(1, baseParams);
    expect(r.total).toBe(2);
    const other = await getGuestsPage(99999, baseParams);
    expect(other.total).toBe(0);
  });

  it("searches by guest name, email, phone, and room number", async () => {
    await seedGuests();
    expect((await getGuestsPage(1, { ...baseParams, search: "eka" })).total).toBe(1);
    expect((await getGuestsPage(1, { ...baseParams, search: "fajar@g.com" })).total).toBe(1);
    expect((await getGuestsPage(1, { ...baseParams, search: "0911" })).total).toBe(1);
    expect((await getGuestsPage(1, { ...baseParams, search: "101" })).total).toBe(2); // both in room 101
  });

  it("sorts by name ascending and descending", async () => {
    await seedGuests();
    const asc = await getGuestsPage(1, { ...baseParams, sortBy: "name", sortDir: "asc" });
    expect(asc.rows.map((r) => r.name)).toEqual(["Eka", "Fajar"]);
    const desc = await getGuestsPage(1, { ...baseParams, sortBy: "name", sortDir: "desc" });
    expect(desc.rows.map((r) => r.name)).toEqual(["Fajar", "Eka"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getGuestsPage`
Expected: FAIL — module `@/app/_db/guests` not found.

- [ ] **Step 3: Create `src/app/_db/guests.ts`**

Mirror the inline query in `guests/page.tsx` (include `GuestStay` + `booking → rooms,tenants`), now paginated + searchable + sortable. The `room` sort/search goes through `booking.rooms.room_number`.

```ts
import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";

const guestListInclude = {
  GuestStay: true,
  booking: { include: { rooms: true, tenants: true } },
} satisfies Prisma.GuestInclude;

export type GuestListRow = Prisma.GuestGetPayload<{ include: typeof guestListInclude }>;

export const GUEST_SORT_KEYS = ["name", "email", "phone", "room"] as const;

function guestOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.GuestOrderByWithRelationInput[] {
  const map: Record<string, Prisma.GuestOrderByWithRelationInput> = {
    name: { name: dir },
    email: { email: dir },
    phone: { phone: dir },
    room: { booking: { rooms: { room_number: dir } } },
  };
  const primary = map[sortBy ?? "name"] ?? map.name;
  return [primary, { id: dir }];
}

export async function getGuestsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<GuestListRow>> {
  const search = params.search;
  const where: Prisma.GuestWhereInput = {
    booking: { rooms: { location_id: locationId } },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            {
              booking: {
                rooms: { room_number: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.guest.findMany({
      where,
      include: guestListInclude,
      orderBy: guestOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.guest.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
```

> Verify against the schema: the `Guest`→`Booking` relation field is `booking` and `Booking`→`Room` is `rooms` (confirmed in the current inline query). If `Guest.id` is a string, `{ id: dir }` remains a valid tiebreaker.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getGuestsPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the page**

Replace `residents/guests/page.tsx`. Keep the existing bookings-for-the-form query (the guest form needs it); only the guests list becomes paginated:

```tsx
import { prisma } from "@/app/_lib/prisma";
import { getGuestsPage, GUEST_SORT_KEYS } from "@/app/_db/guests";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { GuestTable } from "./guest-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("guests.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  if (!selectedLocationId) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--color-text-secondary)" }}>
          Tidak ada lokasi tersedia. Silakan tambahkan lokasi terlebih dahulu.
        </p>
      </div>
    );
  }

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: GUEST_SORT_KEYS,
    defaultSortBy: "name",
    defaultSortDir: "asc",
  });

  const [guests, bookings] = await Promise.all([
    getGuestsPage(selectedLocationId, params),
    prisma.booking.findMany({
      where: { rooms: { location_id: selectedLocationId }, deletedAt: null },
      include: { rooms: true, tenants: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <GuestTable
      data={serializeForClient(guests.rows) as never}
      bookings={serializeForClient(bookings) as never}
      total={guests.total}
      page={guests.page}
      pageSize={guests.pageSize}
      pageCount={guests.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
```

- [ ] **Step 6: Swap the table component**

In `guest-table.tsx`: replace the `DataTable` import with `ServerDataTable`, add the seven pagination props to `Props` and destructure them (as in Task 1 Step 6), and replace the `<DataTable ... />` render with a `<ServerDataTable ... />` carrying `sortableColumns={["name", "email", "phone", "room"]}` and the same `searchPlaceholder` the file currently uses (read it; current value `"Cari tamu..."`). Confirm the displayed name/email/phone columns have ids `name`/`email`/`phone` and the room column has id `room` — if the room column currently uses a different id, set `id: "room"` on it so the sort header binds. The Guest Stays column and actions stay out of `sortableColumns`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Run the pagination tests**

Run: `npx vitest run tests/integration/table-pagination.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/_db/guests.ts \
  "src/app/(internal)/(dashboard_layout)/residents/guests/page.tsx" \
  "src/app/(internal)/(dashboard_layout)/residents/guests/guest-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: server-side pagination for guests table"
```

---

### Task 5: Deposits — server-side pagination (extract inline query)

**Files:**
- Create: `src/app/_db/deposits.ts`
- Modify: `src/app/(internal)/(dashboard_layout)/deposits/page.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/deposits/deposit-table.tsx`
- Test: `tests/integration/table-pagination.test.ts`

**Interfaces:**
- Produces:
  - `DEPOSIT_SORT_KEYS: readonly ["created","amount","status","tenant"]`
  - `getDepositsPage(locationId: number, params: TableParams): Promise<Paginated<DepositListRow>>` where `DepositListRow = Prisma.DepositGetPayload<{ include: { booking: { include: { tenants: true; rooms: true } } } }>`

Read `deposit-table.tsx` for its `Props`, column ids, and the combined Booking column id. Read the `Deposit` model: it has a `status` enum field (`DepositStatus`) and a 1:1 `booking` relation; confirm it has no `deletedAt` (the current inline query has no soft-delete filter — match it). The `created` sort key maps to the `createdAt` scalar (the current default sort).

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/table-pagination.test.ts`:

```ts
import { getDepositsPage } from "@/app/_db/deposits";

describe("getDepositsPage", () => {
  async function seedDeposits() {
    const t1 = await testPrisma.tenant.create({
      data: { name: "Gita", id_number: `id-g-${Date.now()}`, email: "g@t.com" },
    });
    const t2 = await testPrisma.tenant.create({
      data: { name: "Hadi", id_number: `id-h-${Date.now()}`, email: "h@t.com" },
    });
    const b1 = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    const b2 = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    await testPrisma.deposit.create({ data: { booking_id: b1.id, amount: 500000, status: "HELD" } });
    await testPrisma.deposit.create({ data: { booking_id: b2.id, amount: 700000, status: "UNPAID" } });
  }

  it("paginates and scopes deposits to the location via booking→room", async () => {
    await seedDeposits();
    expect((await getDepositsPage(1, baseParams)).total).toBe(2);
    expect((await getDepositsPage(99999, baseParams)).total).toBe(0);
  });

  it("searches by tenant name and room number", async () => {
    await seedDeposits();
    expect((await getDepositsPage(1, { ...baseParams, search: "gita" })).total).toBe(1);
    expect((await getDepositsPage(1, { ...baseParams, search: "102" })).total).toBe(1);
  });

  it("sorts by amount ascending and descending", async () => {
    await seedDeposits();
    const asc = await getDepositsPage(1, { ...baseParams, sortBy: "amount", sortDir: "asc" });
    expect(asc.rows.map((r) => Number(r.amount))).toEqual([500000, 700000]);
    const desc = await getDepositsPage(1, { ...baseParams, sortBy: "amount", sortDir: "desc" });
    expect(desc.rows.map((r) => Number(r.amount))).toEqual([700000, 500000]);
  });

  it("sorts by tenant name (relation)", async () => {
    await seedDeposits();
    const asc = await getDepositsPage(1, { ...baseParams, sortBy: "tenant", sortDir: "asc" });
    expect(asc.rows.map((r) => r.booking.tenants?.name)).toEqual(["Gita", "Hadi"]);
  });
});
```

> If the `Deposit.amount` type or `DepositStatus` values differ from the assumptions here (`HELD`/`UNPAID`), read `prisma/schema.prisma` and adjust the seed values to real enum members before running.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getDepositsPage`
Expected: FAIL — module `@/app/_db/deposits` not found.

- [ ] **Step 3: Create `src/app/_db/deposits.ts`**

```ts
import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";

const depositListInclude = {
  booking: { include: { tenants: true, rooms: true } },
} satisfies Prisma.DepositInclude;

export type DepositListRow = Prisma.DepositGetPayload<{ include: typeof depositListInclude }>;

export const DEPOSIT_SORT_KEYS = ["created", "amount", "status", "tenant"] as const;

function depositOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.DepositOrderByWithRelationInput[] {
  const map: Record<string, Prisma.DepositOrderByWithRelationInput> = {
    created: { createdAt: dir },
    amount: { amount: dir },
    status: { status: dir },
    tenant: { booking: { tenants: { name: dir } } },
  };
  const primary = map[sortBy ?? "created"] ?? map.created;
  return [primary, { id: dir }];
}

export async function getDepositsPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<DepositListRow>> {
  const search = params.search;
  const where: Prisma.DepositWhereInput = {
    booking: { rooms: { location_id: locationId } },
    ...(search
      ? {
          OR: [
            {
              booking: {
                tenants: { name: { contains: search, mode: "insensitive" } },
              },
            },
            {
              booking: {
                rooms: { room_number: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.deposit.findMany({
      where,
      include: depositListInclude,
      orderBy: depositOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.deposit.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
```

> Confirm `Deposit.id` type for the tiebreaker (int or cuid — both work). Confirm the `createdAt` field exists on `Deposit` (the current page sorts by it). If the field is named differently, adjust the `created` mapping.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getDepositsPage`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the page**

Replace `deposits/page.tsx`:

```tsx
import { getDepositsPage, DEPOSIT_SORT_KEYS } from "@/app/_db/deposits";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { DepositTable } from "./deposit-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function DepositsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("deposits.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  if (!selectedLocationId) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--color-text-secondary)" }}>
          Tidak ada lokasi tersedia. Silakan tambahkan lokasi terlebih dahulu.
        </p>
      </div>
    );
  }

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: DEPOSIT_SORT_KEYS,
    defaultSortBy: "created",
    defaultSortDir: "desc",
  });

  const deposits = await getDepositsPage(selectedLocationId, params);

  return (
    <DepositTable
      deposits={serializeForClient(deposits.rows) as never}
      total={deposits.total}
      page={deposits.page}
      pageSize={deposits.pageSize}
      pageCount={deposits.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
```

- [ ] **Step 6: Swap the table component**

In `deposit-table.tsx`: replace `DataTable` import with `ServerDataTable`; add the seven pagination props to `Props` and destructure (as Task 1 Step 6); replace the render with `<ServerDataTable ... />` passing `sortableColumns={["created", "amount", "status", "tenant"]}` and an appropriate `searchPlaceholder` (e.g. `"Cari deposit..."` — read the file; if the current `DataTable` had none, use `"Cari penyewa atau kamar..."`). Bind the sort key ids to the right columns: the amount column → `amount`, the status column → `status`, the applied/created date column → `created`, and the combined Booking column → `tenant`. Set explicit `id`s on those columns to match if they don't already. The refunded-amount and applied-date display columns and actions stay non-sortable unless they map to a key above.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Run the pagination tests**

Run: `npx vitest run tests/integration/table-pagination.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/_db/deposits.ts \
  "src/app/(internal)/(dashboard_layout)/deposits/page.tsx" \
  "src/app/(internal)/(dashboard_layout)/deposits/deposit-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: server-side pagination for deposits table"
```

---

### Task 6: Utilities — server-side pagination + NEW location scope (leak fix)

**Files:**
- Create: `src/app/_db/utilities.ts`
- Modify: `src/app/(internal)/(dashboard_layout)/utilities/page.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/utilities/utility-table.tsx`
- Test: `tests/integration/table-pagination.test.ts`

**Interfaces:**
- Produces:
  - `UTILITY_SORT_KEYS: readonly ["reading_date","utility_type","reading_value","tenant"]`
  - `getUtilitiesPage(locationId: number, params: TableParams): Promise<Paginated<MeterReadingListRow>>` where `MeterReadingListRow = Prisma.MeterReadingGetPayload<{ include: { booking: { include: { tenants: true; rooms: true } } } }>`

**Behavior change (intended):** the current `utilities/page.tsx` loads `meterReading` for ALL locations. The new query scopes to the selected location via `booking → rooms → location_id`. Read the `MeterReading` model first to confirm the `booking` relation and the `utility_type` / `reading_value` / `reading_date` field names (the page maps them, so they exist). The current page maps reading rows into a `MeterReadingRow` view type and bookings into `BookingOption` — preserve those view types; only the readings list becomes paginated and scoped.

- [ ] **Step 1: Write the failing test (includes the location-isolation assertion)**

Add to `tests/integration/table-pagination.test.ts`. This needs a room in a SECOND location to prove isolation; `seedTestData` only makes location 1, so create location 2 + a room in the test:

```ts
import { getUtilitiesPage } from "@/app/_db/utilities";

describe("getUtilitiesPage", () => {
  async function seedReadings() {
    // Location 1 already exists with rooms 1 (101) and 2 (102). Add location 2 + a room.
    await testPrisma.location.create({ data: { id: 2, name: "Loc 2", address: "Jl. Dua" } });
    await testPrisma.room.create({
      data: { id: 3, room_number: "201", room_type_id: 1, status_id: 1, location_id: 2 },
    });
    const tLoc1 = await testPrisma.tenant.create({
      data: { name: "Indra", id_number: `id-i-${Date.now()}`, email: "i@t.com" },
    });
    const tLoc2 = await testPrisma.tenant.create({
      data: { name: "Joko", id_number: `id-j-${Date.now()}`, email: "j@t.com" },
    });
    const bLoc1 = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: tLoc1.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    const bLoc2 = await testPrisma.booking.create({
      data: { room_id: 3, tenant_id: tLoc2.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    await testPrisma.meterReading.create({
      data: { booking_id: bLoc1.id, utility_type: "ELECTRICITY", reading_date: new Date("2025-01-10"), reading_value: 100, rate_per_unit: 1500 },
    });
    await testPrisma.meterReading.create({
      data: { booking_id: bLoc2.id, utility_type: "WATER", reading_date: new Date("2025-01-12"), reading_value: 50, rate_per_unit: 2000 },
    });
  }

  it("scopes readings to the selected location (closes the cross-location leak)", async () => {
    await seedReadings();
    const loc1 = await getUtilitiesPage(1, baseParams);
    expect(loc1.total).toBe(1);
    expect(loc1.rows[0].booking.tenants?.name).toBe("Indra");

    const loc2 = await getUtilitiesPage(2, baseParams);
    expect(loc2.total).toBe(1);
    expect(loc2.rows[0].booking.tenants?.name).toBe("Joko");
  });

  it("searches by tenant name and room number within the location", async () => {
    await seedReadings();
    expect((await getUtilitiesPage(1, { ...baseParams, search: "indra" })).total).toBe(1);
    expect((await getUtilitiesPage(1, { ...baseParams, search: "101" })).total).toBe(1);
    expect((await getUtilitiesPage(1, { ...baseParams, search: "joko" })).total).toBe(0); // other location
  });

  it("sorts by reading_value ascending and descending within the location", async () => {
    await seedReadings();
    // Add a second reading in location 1 to have something to order.
    const tenant = await testPrisma.tenant.create({
      data: { name: "Kiki", id_number: `id-k-${Date.now()}`, email: "k@t.com" },
    });
    const b = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: tenant.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    await testPrisma.meterReading.create({
      data: { booking_id: b.id, utility_type: "ELECTRICITY", reading_date: new Date("2025-01-15"), reading_value: 300, rate_per_unit: 1500 },
    });
    const asc = await getUtilitiesPage(1, { ...baseParams, sortBy: "reading_value", sortDir: "asc" });
    expect(asc.rows.map((r) => Number(r.reading_value))).toEqual([100, 300]);
    const desc = await getUtilitiesPage(1, { ...baseParams, sortBy: "reading_value", sortDir: "desc" });
    expect(desc.rows.map((r) => Number(r.reading_value))).toEqual([300, 100]);
  });
});
```

> Adjust `utility_type` enum values (`ELECTRICITY`/`WATER`) and field names to the real `MeterReading` model if they differ.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getUtilitiesPage`
Expected: FAIL — module `@/app/_db/utilities` not found.

- [ ] **Step 3: Create `src/app/_db/utilities.ts`**

```ts
import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import {
  toSkipTake,
  buildPaginated,
  type TableParams,
  type Paginated,
} from "@/app/_lib/util/table-params";

const meterReadingListInclude = {
  booking: { include: { tenants: true, rooms: true } },
} satisfies Prisma.MeterReadingInclude;

export type MeterReadingListRow = Prisma.MeterReadingGetPayload<{
  include: typeof meterReadingListInclude;
}>;

export const UTILITY_SORT_KEYS = [
  "reading_date",
  "utility_type",
  "reading_value",
  "tenant",
] as const;

function utilityOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.MeterReadingOrderByWithRelationInput[] {
  const map: Record<string, Prisma.MeterReadingOrderByWithRelationInput> = {
    reading_date: { reading_date: dir },
    utility_type: { utility_type: dir },
    reading_value: { reading_value: dir },
    tenant: { booking: { tenants: { name: dir } } },
  };
  const primary = map[sortBy ?? "reading_date"] ?? map.reading_date;
  return [primary, { id: dir }];
}

export async function getUtilitiesPage(
  locationId: number,
  params: TableParams
): Promise<Paginated<MeterReadingListRow>> {
  const search = params.search;
  const where: Prisma.MeterReadingWhereInput = {
    booking: { rooms: { location_id: locationId } },
    ...(search
      ? {
          OR: [
            {
              booking: {
                tenants: { name: { contains: search, mode: "insensitive" } },
              },
            },
            {
              booking: {
                rooms: { room_number: { contains: search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.meterReading.findMany({
      where,
      include: meterReadingListInclude,
      orderBy: utilityOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.meterReading.count({ where }),
  ]);

  return buildPaginated(rows, total, params);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getUtilitiesPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the page (now scoped + paginated)**

The current page maps readings into `MeterReadingRow` and bookings into `BookingOption`, then renders `<UtilityTable readings={rows} bookings={bookingOptions} />`. Rework it to resolve the location, parse params, call `getUtilitiesPage`, map only the current page's rows, and pass pagination props. The bookings-for-the-form query gains a location filter too (it currently has none for the readings, but the booking options should match the location). Replace `utilities/page.tsx` with:

```tsx
import { getUtilitiesPage, UTILITY_SORT_KEYS } from "@/app/_db/utilities";
import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { UtilityTable, type MeterReadingRow, type BookingOption } from "./utility-table";
import { BOOKING_STATUS } from "@/app/_lib/util/status";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function UtilitiesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  if (!selectedLocationId) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--color-text-secondary)" }}>
          Tidak ada lokasi tersedia. Silakan tambahkan lokasi terlebih dahulu.
        </p>
      </div>
    );
  }

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: UTILITY_SORT_KEYS,
    defaultSortBy: "reading_date",
    defaultSortDir: "desc",
  });

  const [readings, bookings] = await Promise.all([
    getUtilitiesPage(selectedLocationId, params),
    prisma.booking.findMany({
      where: {
        status_id: BOOKING_STATUS.ACTIVE,
        deletedAt: null,
        rooms: { location_id: selectedLocationId },
      },
      orderBy: { id: "desc" },
      include: { tenants: true, rooms: true },
    }),
  ]);

  const rows: MeterReadingRow[] = readings.rows.map((r) => ({
    id: r.id,
    booking_id: r.booking_id,
    utility_type: r.utility_type,
    reading_date: r.reading_date.toISOString(),
    reading_value: Number(r.reading_value),
    previous_value: r.previous_value === null ? null : Number(r.previous_value),
    rate_per_unit: Number(r.rate_per_unit),
    photo_proof: r.photo_proof,
    tenant_name: r.booking.tenants?.name ?? null,
    room_number: r.booking.rooms?.room_number ?? null,
  }));

  const bookingOptions: BookingOption[] = bookings.map((b) => ({
    id: b.id,
    tenant_name: b.tenants?.name ?? null,
    room_number: b.rooms?.room_number ?? null,
  }));

  return (
    <UtilityTable
      readings={rows}
      bookings={bookingOptions}
      total={readings.total}
      page={readings.page}
      pageSize={readings.pageSize}
      pageCount={readings.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
```

- [ ] **Step 6: Update the utilities table component**

`utility-table.tsx` is a custom component (not currently a `DataTable`). Read it fully first. Then:
1. Import `ServerDataTable`.
2. Add the seven pagination props (`total, page, pageSize, pageCount, search, sortBy, sortDir`) to its props type and destructure them.
3. Express the displayed readings as `ColumnDef<MeterReadingRow, unknown>[]` if not already, with column ids: `tenant` (the Booking/tenant column — show tenant_name + room_number), `utility_type`, `reading_date`, `reading_value`, plus a non-sortable `rate`/`proof`/actions as today.
4. Render `<ServerDataTable columns={columns} data={readings} ... sortableColumns={["reading_date", "utility_type", "reading_value", "tenant"]} searchPlaceholder="Cari penyewa atau kamar..." />` with the pagination props.
5. Preserve all existing create/edit reading functionality (the form + its `bookings` options) unchanged — only the list rendering moves to `ServerDataTable`.

If the existing component renders readings in a bespoke layout that can't cleanly become `ServerDataTable` columns without large rework, keep its row markup but drive it from the paginated `readings` prop and add the `ServerDataTable` pagination/search/sort chrome around it — the controlling requirement is that pagination, server-side search, and the four sort keys work; match the visual structure already in the file.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Run the pagination tests + the full unit/integration suite**

Run: `npx vitest run`
Expected: PASS (all existing + the six new describe blocks). The test DB must be up.

- [ ] **Step 9: Commit**

```bash
git add src/app/_db/utilities.ts \
  "src/app/(internal)/(dashboard_layout)/utilities/page.tsx" \
  "src/app/(internal)/(dashboard_layout)/utilities/utility-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: server-side pagination + location scope for utilities table"
```

---

### Task 7: E2E — tenants page paginates and searches via URL

**Files:**
- Create: `e2e/specs/table-pagination.spec.ts`
- Possibly modify: `prisma/seed-mock.ts` (only if the e2e DB lacks enough tenants to exceed one page)

**Interfaces:**
- Consumes: the migrated tenants page (Task 3) and the existing admin storageState configured by the chromium project; `ROUTES` from `e2e/fixtures/test-data.ts` (`ROUTES.tenants = "/residents/tenants"`).

- [ ] **Step 1: Check seed volume**

Read `prisma/seed-mock.ts` and count how many tenants it seeds. The default `pageSize` is 20. If fewer than 21 tenants are seeded, pagination controls won't render. Decide: either assert search-only behavior (works at any count) OR add tenants to the seed. Prefer asserting search + URL state (no seed change) if the count is low; only seed more if you specifically want to assert the page-2 control.

- [ ] **Step 2: Write the E2E spec**

Create `e2e/specs/table-pagination.spec.ts` (uses the default admin session):

```ts
import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

test.describe("Tenants table is server-driven", () => {
  test("search updates the URL and filters server-side", async ({ page }) => {
    await page.goto(ROUTES.tenants);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Penghuni" })
    ).toBeVisible();

    // Type into the search box; the table debounces into ?q=
    const search = page.getByPlaceholder("Cari penghuni...");
    await search.fill("a");
    await expect(page).toHaveURL(/[?&]q=a\b/);

    // At least the header row resolves without a client-side full load error.
    await expect(page.locator("table")).toBeVisible();
  });

  test("clicking the Nama header sorts via the URL", async ({ page }) => {
    await page.goto(ROUTES.tenants);
    await page.getByRole("main").getByText("Nama", { exact: true }).click();
    await expect(page).toHaveURL(/[?&]sort=name\b/);
    await expect(page).toHaveURL(/[?&]dir=(asc|desc)\b/);
  });
});
```

> If the search box selector differs (read the rendered placeholder), adjust. The `Nama` header text must match the tenants table's name column header exactly.

- [ ] **Step 3: Run the E2E spec**

Ensure the e2e DB is up: `docker compose -f docker-compose.test.yml up -d e2e-db`. Then:
Run: `npx playwright test --config e2e/playwright.config.ts table-pagination`
Expected: PASS (2 tests + setup).

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/table-pagination.spec.ts
# include prisma/seed-mock.ts only if you changed it
git commit -m "test(e2e): tenants table search + sort drive the URL"
```

---

### Task 8: Update roadmap memory + help center

**Files:**
- Modify: `/Users/rsalim/.claude/projects/-Users-rsalim-personal-hms-revamp/memory/project_improvement_roadmap.md` and `MEMORY.md` index if needed
- Possibly modify: the help center content under `src/app/(internal)/(dashboard_layout)/help/`

**Interfaces:** none.

- [ ] **Step 1: Update the roadmap memory**

Record that the six unbounded tables (rooms, addons, tenants, guests, deposits, utilities) now use server-side pagination/search/sorting; that the utilities cross-location leak was fixed; that the 4 reference tables (locations, durations, room-types, users) deliberately remain client-side; and that two follow-ups remain: P.3 Tier 1 relation-column sorting for bookings/bills/payments (paused) and B.x bill aggregate sorting (Tier 2, raw SQL). Convert any relative dates to absolute (2026-06-25).

- [ ] **Step 2: Help center note (only if these pages are user-documented)**

Run: `grep -rin "tabel\|pagination\|halaman\|cari\|urut" "src/app/(internal)/(dashboard_layout)/help/"` to find any section describing list tables. If a relevant section exists, add a concise Indonesian note that list tables now page/search/sort server-side. If no such section exists, skip (do not invent a new help section for this).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: roadmap + help center note for server-side pagination migration"
```

---

## Final Verification (after all tasks)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx vitest run` — all unit + integration pass (275 existing + new pagination blocks), test DB on :5433 up.
- [ ] `npx playwright test --config e2e/playwright.config.ts` — full E2E green (18 existing + 2 new), e2e DB on :5434 up.
- [ ] Manual smoke (optional): for each migrated page, confirm the URL gains `?page=/q=/sort=/dir=` on interaction, search filters across the full dataset (not just the current page), and column headers toggle sort. For utilities, switch the location selector and confirm only that location's readings show.
- [ ] Confirm non-table callers still work: open the booking create form (uses `getTenants`/`getRoomsByLocation`/`getAddonsByLocation`) and verify the dropdowns populate.
