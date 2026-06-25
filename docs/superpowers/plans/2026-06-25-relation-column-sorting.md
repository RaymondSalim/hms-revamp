# Relation-Column Sorting (P.3 Tier 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the to-one relation columns (tenant name, room number, status) sortable server-side on the three already-paginated tables (bookings, bills, payments), using Prisma nested `orderBy`, with a stable `{ id }` tiebreaker on every sort.

**Architecture:** Each of the three query functions currently builds a flat `orderBy` (`{ [sortKey]: dir }`) that only works for scalar fields. Replace it with a per-table `xxxOrderBy(sortBy, dir)` helper returning an **array** — a mapped primary `orderBy` (scalar OR nested relation) plus a `{ id: dir }` tiebreaker — exactly the shape the six pagination-migration tables already use. Widen each `*_SORT_KEYS` allowlist and each table's `sortableColumns` prop to include the relation column ids. No schema change, no raw SQL, no client/component logic change beyond the `sortableColumns` array.

**Tech Stack:** Next.js 16 App Router (React 19), TypeScript, Prisma 6 / Postgres, `@tanstack/react-table` v8, Vitest (node env, test DB :5433).

## Global Constraints

- Reuse existing infrastructure unchanged: `TableParams`, `Paginated<T>`, `toSkipTake`, `buildPaginated`, `parseTableParams` from `@/app/_lib/util/table-params`; `ServerDataTable` from `@/app/_components/server-data-table`.
- Every `orderBy` becomes an array ending with `{ id: dir }` as a deterministic tiebreaker (matches the pattern established by the pagination-migration tables, e.g. `roomOrderBy` in `src/app/_db/rooms.ts`).
- The disable/scope/search behavior of each query is unchanged — only `orderBy` construction and the sort allowlists change. Do NOT alter the `where` clause, `include`, `skip`/`take`, or `count`.
- Relation sort field names, verified against current source on 2026-06-25:
  - bookings: `rooms.room_number`, `tenants.name`, `bookingstatuses.status`
  - payments: `bookings.tenants.name` (for the combined `booking` column), `paymentstatuses.status`
  - bills: `bookings.tenants.name` (for the combined `room_tenant` column)
- Combined columns (payments `booking`, bills `room_tenant`) sort by **tenant name** as the primary key.
- Column ids already present in the table components (verified): bookings `room`/`tenant`/`status`; payments `booking`/`status`; bills `room_tenant`. No component column-id changes are needed — only the `sortableColumns` array widens.
- Default sort keys are unchanged: bookings `createdAt` desc, payments `payment_date` desc, bills `due_date` desc (whatever each currently uses — confirm in the file and keep it).
- The existing suite (currently 298 unit/integration + 20 E2E) must stay green. No new E2E (the `ServerDataTable` client contract is unchanged).

## In-Scope Surfaces

| Task | Table | Query file | Component file | New sortable ids | Sorts by |
|---|---|---|---|---|---|
| 1 | bookings | `_db/bookings.ts` | `bookings/booking-table.tsx` | `room`, `tenant`, `status` | `rooms.room_number`, `tenants.name`, `bookingstatuses.status` |
| 2 | payments | `_db/payments.ts` | `payments/payment-table.tsx` | `booking`, `status` | `bookings.tenants.name`, `paymentstatuses.status` |
| 3 | bills | `_db/bills.ts` | `bills/bill-table.tsx` | `room_tenant` | `bookings.tenants.name` |

**Reference pattern (already in the codebase):** `roomOrderBy` / `getRoomsPage` in `src/app/_db/rooms.ts` shows the exact `xxxOrderBy(sortBy, dir): Prisma.XOrderByWithRelationInput[]` shape with the `{ id: dir }` tiebreaker. The existing tests in `tests/integration/table-pagination.test.ts` show the test style (`baseParams`, seeded rooms 101/102 in location 1, `seedTestData`).

---

### Task 1: Bookings — relation-column sorting

**Files:**
- Modify: `src/app/_db/bookings.ts` (widen `BOOKING_SORT_KEYS`; replace flat `orderBy` with `bookingOrderBy` helper)
- Modify: `src/app/(internal)/(dashboard_layout)/bookings/booking-table.tsx` (widen `sortableColumns`)
- Test: `tests/integration/table-pagination.test.ts` (add relation-sort cases to the existing `getBookingsPage` describe block)

**Interfaces:**
- Consumes: `Prisma`, `TableParams`, the existing `getBookingsPage(locationId, params): Promise<Paginated<BookingListRow>>`.
- Produces: `BOOKING_SORT_KEYS` widened to include `"room"`, `"tenant"`, `"status"`. `getBookingsPage` now accepts those sort keys and orders by the nested relation.

Current state (verified): `BOOKING_SORT_KEYS = ["start_date", "end_date", "fee", "createdAt"]`; the function builds `const orderBy: Prisma.BookingOrderByWithRelationInput = { [sortKey]: params.sortDir };` and passes `orderBy` to `findMany`. The bookings table column ids are `room`, `tenant`, `start_date`, `end_date`, `fee`, `status`, `actions`.

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe("getBookingsPage", ...)` block in `tests/integration/table-pagination.test.ts`. Seed two bookings with tenants whose names sort oppositely to their rooms, and distinct statuses, so each relation sort is unambiguous. `seedTestData` provides rooms 101 (id 1) and 102 (id 2) in location 1 and booking statuses 1=PENDING, 2=ACTIVE.

```ts
it("sorts by tenant name (relation) asc and desc", async () => {
  const tZ = await testPrisma.tenant.create({
    data: { name: "Zulkifli", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
  });
  const tA = await testPrisma.tenant.create({
    data: { name: "Anwar", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
  });
  // Zulkifli in room 101, Anwar in room 102 — name order is the reverse of room order.
  await testPrisma.booking.create({
    data: { room_id: 1, tenant_id: tZ.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  await testPrisma.booking.create({
    data: { room_id: 2, tenant_id: tA.id, start_date: new Date("2025-02-01"), fee: 1, is_rolling: true },
  });

  const asc = await getBookingsPage(1, { ...baseParams, sortBy: "tenant", sortDir: "asc" });
  expect(asc.rows.map((r) => r.tenants?.name)).toEqual(["Anwar", "Zulkifli"]);

  const desc = await getBookingsPage(1, { ...baseParams, sortBy: "tenant", sortDir: "desc" });
  expect(desc.rows.map((r) => r.tenants?.name)).toEqual(["Zulkifli", "Anwar"]);
});

it("sorts by room number (relation) asc and desc", async () => {
  const tZ = await testPrisma.tenant.create({
    data: { name: "Zulkifli", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
  });
  const tA = await testPrisma.tenant.create({
    data: { name: "Anwar", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
  });
  await testPrisma.booking.create({
    data: { room_id: 1, tenant_id: tZ.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  await testPrisma.booking.create({
    data: { room_id: 2, tenant_id: tA.id, start_date: new Date("2025-02-01"), fee: 1, is_rolling: true },
  });

  const asc = await getBookingsPage(1, { ...baseParams, sortBy: "room", sortDir: "asc" });
  expect(asc.rows.map((r) => r.rooms?.room_number)).toEqual(["101", "102"]);

  const desc = await getBookingsPage(1, { ...baseParams, sortBy: "room", sortDir: "desc" });
  expect(desc.rows.map((r) => r.rooms?.room_number)).toEqual(["102", "101"]);
});

it("sorts by status (relation) asc", async () => {
  const t1 = await testPrisma.tenant.create({
    data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
  });
  const t2 = await testPrisma.tenant.create({
    data: { name: "Budi", id_number: `id-b-${Date.now()}`, email: "b@t.com" },
  });
  // status 2 = ACTIVE, status 1 = PENDING. asc by the status STRING: ACTIVE < PENDING.
  await testPrisma.booking.create({
    data: { room_id: 1, tenant_id: t1.id, status_id: 1, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  await testPrisma.booking.create({
    data: { room_id: 2, tenant_id: t2.id, status_id: 2, start_date: new Date("2025-02-01"), fee: 1, is_rolling: true },
  });

  const asc = await getBookingsPage(1, { ...baseParams, sortBy: "status", sortDir: "asc" });
  expect(asc.rows.map((r) => r.bookingstatuses?.status)).toEqual(["ACTIVE", "PENDING"]);
});

it("falls back to default sort for an unknown sortBy (no throw)", async () => {
  const t = await testPrisma.tenant.create({
    data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
  });
  await testPrisma.booking.create({
    data: { room_id: 1, tenant_id: t.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  const r = await getBookingsPage(1, { ...baseParams, sortBy: "not_a_column" });
  expect(r.total).toBe(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getBookingsPage`
Expected: the `tenant`/`room`/`status` cases FAIL — the flat `orderBy` cannot order by a relation, so the rows come back in default order (the assertions on order do not hold). The DB is at :5433 (start it if needed: `docker compose -f docker-compose.test.yml up -d test-db`).

- [ ] **Step 3: Widen the allowlist and replace the flat `orderBy`**

In `src/app/_db/bookings.ts`:

Change `BOOKING_SORT_KEYS` to include the relation ids:

```ts
/** DB-backed columns the bookings table may sort by (scalar + to-one relations). */
export const BOOKING_SORT_KEYS = [
  "start_date",
  "end_date",
  "fee",
  "createdAt",
  "room",
  "tenant",
  "status",
] as const;
```

Add the helper above `getBookingsPage`:

```ts
function bookingOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.BookingOrderByWithRelationInput[] {
  const map: Record<string, Prisma.BookingOrderByWithRelationInput> = {
    start_date: { start_date: dir },
    end_date: { end_date: dir },
    fee: { fee: dir },
    createdAt: { createdAt: dir },
    room: { rooms: { room_number: dir } },
    tenant: { tenants: { name: dir } },
    status: { bookingstatuses: { status: dir } },
  };
  const primary = map[sortBy ?? "createdAt"] ?? map.createdAt;
  return [primary, { id: dir }];
}
```

In `getBookingsPage`, delete the existing flat `orderBy` build (the `const sortKey = ...` and `const orderBy: Prisma.BookingOrderByWithRelationInput = { [sortKey]: params.sortDir };` lines) and pass the helper result to `findMany`:

```ts
  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingListInclude,
      orderBy: bookingOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.booking.count({ where }),
  ]);
```

> `params.sortDir` is the string `"asc" | "desc"`, which is assignable to `Prisma.SortOrder`. If tsc complains, the helper param type already accepts it; pass `params.sortDir` directly as in the rooms reference.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getBookingsPage`
Expected: PASS (existing cases + the 4 new ones).

- [ ] **Step 5: Widen `sortableColumns` in the table component**

In `src/app/(internal)/(dashboard_layout)/bookings/booking-table.tsx`, change the `ServerDataTable` prop:

```tsx
sortableColumns={["start_date", "end_date", "fee", "room", "tenant", "status"]}
```

(The column ids `room`, `tenant`, `status` already exist on the column defs — no other change.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Run the full pagination test file**

Run: `npx vitest run tests/integration/table-pagination.test.ts`
Expected: PASS (no regression in other blocks).

- [ ] **Step 8: Commit**

```bash
git add src/app/_db/bookings.ts \
  "src/app/(internal)/(dashboard_layout)/bookings/booking-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: relation-column sorting for bookings table"
```

---

### Task 2: Payments — relation-column sorting

**Files:**
- Modify: `src/app/_db/payments.ts` (widen `PAYMENT_SORT_KEYS`; replace flat `orderBy` with `paymentOrderBy`)
- Modify: `src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx` (widen `sortableColumns`)
- Test: `tests/integration/table-pagination.test.ts` (add cases to the `getPaymentsPage` describe block)

**Interfaces:**
- Consumes: `Prisma`, the existing `getPaymentsPage(locationId, params): Promise<Paginated<PaymentWithRelations>>`.
- Produces: `PAYMENT_SORT_KEYS` widened to include `"booking"` (sorts by `bookings.tenants.name`) and `"status"` (sorts by `paymentstatuses.status`).

Current state (verified): `PAYMENT_SORT_KEYS = ["payment_date", "amount"]`; flat `orderBy: Prisma.PaymentOrderByWithRelationInput = { [sortKey]: params.sortDir }` with default `payment_date`. Payment relations included: `bookings: { include: { tenants: true, rooms: true } }`, `paymentstatuses: true`. Column ids: `booking`, `amount`, `payment_date`, `status`, `payment_method`, `proof`, `actions`. Payment statuses seeded: 1=PENDING, 2=VERIFIED, 3=REJECTED.

- [ ] **Step 1: Write the failing tests**

Add to `describe("getPaymentsPage", ...)`:

```ts
it("sorts by booking (tenant name relation) asc and desc", async () => {
  const tZ = await testPrisma.tenant.create({
    data: { name: "Zulkifli", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
  });
  const tA = await testPrisma.tenant.create({
    data: { name: "Anwar", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
  });
  const bZ = await testPrisma.booking.create({
    data: { room_id: 1, tenant_id: tZ.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  const bA = await testPrisma.booking.create({
    data: { room_id: 2, tenant_id: tA.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  await testPrisma.payment.create({
    data: { booking_id: bZ.id, amount: 100, payment_date: new Date("2025-01-05"), payment_method: "CASH" },
  });
  await testPrisma.payment.create({
    data: { booking_id: bA.id, amount: 200, payment_date: new Date("2025-02-05"), payment_method: "CASH" },
  });

  const asc = await getPaymentsPage(1, { ...baseParams, sortBy: "booking", sortDir: "asc" });
  expect(asc.rows.map((r) => r.bookings?.tenants?.name)).toEqual(["Anwar", "Zulkifli"]);

  const desc = await getPaymentsPage(1, { ...baseParams, sortBy: "booking", sortDir: "desc" });
  expect(desc.rows.map((r) => r.bookings?.tenants?.name)).toEqual(["Zulkifli", "Anwar"]);
});

it("sorts by status (relation) asc", async () => {
  const t = await testPrisma.tenant.create({
    data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
  });
  const b = await testPrisma.booking.create({
    data: { room_id: 1, tenant_id: t.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  // status 1 = PENDING, status 2 = VERIFIED. asc by string: PENDING < VERIFIED.
  await testPrisma.payment.create({
    data: { booking_id: b.id, amount: 100, payment_date: new Date("2025-01-05"), payment_method: "CASH", status_id: 2 },
  });
  await testPrisma.payment.create({
    data: { booking_id: b.id, amount: 200, payment_date: new Date("2025-02-05"), payment_method: "CASH", status_id: 1 },
  });

  const asc = await getPaymentsPage(1, { ...baseParams, sortBy: "status", sortDir: "asc" });
  expect(asc.rows.map((r) => r.paymentstatuses?.status)).toEqual(["PENDING", "VERIFIED"]);
});

it("falls back to default sort for an unknown sortBy (no throw)", async () => {
  const t = await testPrisma.tenant.create({
    data: { name: "Andi", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
  });
  const b = await testPrisma.booking.create({
    data: { room_id: 1, tenant_id: t.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  await testPrisma.payment.create({
    data: { booking_id: b.id, amount: 100, payment_date: new Date("2025-01-05"), payment_method: "CASH" },
  });
  const r = await getPaymentsPage(1, { ...baseParams, sortBy: "not_a_column" });
  expect(r.total).toBe(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getPaymentsPage`
Expected: the `booking`/`status` sort cases FAIL (flat `orderBy` can't order by relation).

- [ ] **Step 3: Widen the allowlist and replace the flat `orderBy`**

In `src/app/_db/payments.ts`:

```ts
export const PAYMENT_SORT_KEYS = [
  "payment_date",
  "amount",
  "booking",
  "status",
] as const;
```

Add the helper above `getPaymentsPage`:

```ts
function paymentOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.PaymentOrderByWithRelationInput[] {
  const map: Record<string, Prisma.PaymentOrderByWithRelationInput> = {
    payment_date: { payment_date: dir },
    amount: { amount: dir },
    booking: { bookings: { tenants: { name: dir } } },
    status: { paymentstatuses: { status: dir } },
  };
  const primary = map[sortBy ?? "payment_date"] ?? map.payment_date;
  return [primary, { id: dir }];
}
```

Delete the existing flat `orderBy` build and pass the helper result to `findMany`:

```ts
  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      ...paymentWithRelations,
      orderBy: paymentOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.payment.count({ where }),
  ]);
```

> Keep the existing `...paymentWithRelations` spread exactly as it currently is — only the `orderBy` line changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getPaymentsPage`
Expected: PASS.

- [ ] **Step 5: Widen `sortableColumns`**

In `src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx`:

```tsx
sortableColumns={["payment_date", "amount", "booking", "status"]}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Run the full pagination test file**

Run: `npx vitest run tests/integration/table-pagination.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/_db/payments.ts \
  "src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: relation-column sorting for payments table"
```

---

### Task 3: Bills — relation-column sorting (combined room/tenant column)

**Files:**
- Modify: `src/app/_db/bills.ts` (widen `BILL_SORT_KEYS`; replace flat `orderBy` with `billOrderBy`)
- Modify: `src/app/(internal)/(dashboard_layout)/bills/bill-table.tsx` (widen `sortableColumns`)
- Test: `tests/integration/table-pagination.test.ts` (add cases to the `getBillsPage` describe block)

**Interfaces:**
- Consumes: `Prisma`, the existing `getBillsPage(locationId, params): Promise<Paginated<BillWithRelations>>`.
- Produces: `BILL_SORT_KEYS` widened to include `"room_tenant"` (sorts by `bookings.tenants.name`).

Current state (verified): `BILL_SORT_KEYS = ["due_date", "description", "invoice_number"]`; flat `orderBy: Prisma.BillOrderByWithRelationInput = { [sortKey]: params.sortDir }` with default `due_date`. Bills include `bookings: { include: { tenants: true, rooms: true } }`. The combined column id is `room_tenant`. The bills query uses `prisma.bill.findMany({ where, ...billWithRelations, orderBy, skip, take })`. Note: `total`/`paid`/`outstanding` columns are aggregate (Tier 2) and stay OUT of `sortableColumns`.

- [ ] **Step 1: Write the failing tests**

The existing `getBillsPage` tests use a `seedBills(count)` helper that creates ONE tenant ("Budi Santoso") + one booking + N bills. For a relation sort we need bills under bookings with DIFFERENT tenants. Add a local helper inside the new test(s) or seed inline:

```ts
it("sorts by room_tenant (tenant name relation) asc and desc", async () => {
  const tZ = await testPrisma.tenant.create({
    data: { name: "Zulkifli", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
  });
  const tA = await testPrisma.tenant.create({
    data: { name: "Anwar", id_number: `id-a-${Date.now()}`, email: "a@t.com" },
  });
  const bZ = await testPrisma.booking.create({
    data: { room_id: 1, tenant_id: tZ.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  const bA = await testPrisma.booking.create({
    data: { room_id: 2, tenant_id: tA.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
  });
  await testPrisma.bill.create({
    data: { booking_id: bZ.id, description: "Tagihan Z", due_date: new Date("2025-01-28"), invoice_number: "INV-Z" },
  });
  await testPrisma.bill.create({
    data: { booking_id: bA.id, description: "Tagihan A", due_date: new Date("2025-01-28"), invoice_number: "INV-A" },
  });

  const asc = await getBillsPage(1, { ...baseParams, sortBy: "room_tenant", sortDir: "asc" });
  expect(asc.rows.map((r) => r.bookings?.tenants?.name)).toEqual(["Anwar", "Zulkifli"]);

  const desc = await getBillsPage(1, { ...baseParams, sortBy: "room_tenant", sortDir: "desc" });
  expect(desc.rows.map((r) => r.bookings?.tenants?.name)).toEqual(["Zulkifli", "Anwar"]);
});

it("falls back to default sort (due_date) for an unknown sortBy (no throw)", async () => {
  await seedBills(2);
  const r = await getBillsPage(1, { ...baseParams, sortBy: "not_a_column" });
  expect(r.total).toBe(2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getBillsPage`
Expected: the `room_tenant` sort case FAILS.

- [ ] **Step 3: Widen the allowlist and replace the flat `orderBy`**

In `src/app/_db/bills.ts`:

```ts
/** Columns that can be sorted at the DB level. Aggregate totals (total/paid/
 *  outstanding) are NOT sortable here — see Tier 2 backlog. */
export const BILL_SORT_KEYS = [
  "due_date",
  "description",
  "invoice_number",
  "room_tenant",
] as const;
```

Add the helper above `getBillsPage`:

```ts
function billOrderBy(
  sortBy: string | null,
  dir: Prisma.SortOrder
): Prisma.BillOrderByWithRelationInput[] {
  const map: Record<string, Prisma.BillOrderByWithRelationInput> = {
    due_date: { due_date: dir },
    description: { description: dir },
    invoice_number: { invoice_number: dir },
    room_tenant: { bookings: { tenants: { name: dir } } },
  };
  const primary = map[sortBy ?? "due_date"] ?? map.due_date;
  return [primary, { id: dir }];
}
```

Delete the existing flat `orderBy` build and update the `findMany`:

```ts
  const { skip, take } = toSkipTake(params);
  const [rows, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      ...billWithRelations,
      orderBy: billOrderBy(params.sortBy, params.sortDir),
      skip,
      take,
    }),
    prisma.bill.count({ where }),
  ]);
```

> Keep `...billWithRelations` exactly as is — only the `orderBy` line changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/integration/table-pagination.test.ts -t getBillsPage`
Expected: PASS.

- [ ] **Step 5: Widen `sortableColumns`**

In `src/app/(internal)/(dashboard_layout)/bills/bill-table.tsx`:

```tsx
sortableColumns={["due_date", "description", "invoice_number", "room_tenant"]}
```

(Do NOT add `total`/`paid`/`outstanding` — they are aggregate columns, Tier 2.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS (all unit + integration, test DB up). This is the last code task — confirm no regression anywhere.

- [ ] **Step 8: Commit**

```bash
git add src/app/_db/bills.ts \
  "src/app/(internal)/(dashboard_layout)/bills/bill-table.tsx" \
  tests/integration/table-pagination.test.ts
git commit -m "feat: relation-column sorting for bills table"
```

---

### Task 4: File the Tier 2 backlog item + help-center touch

**Files:**
- Modify: `/Users/rsalim/.claude/projects/-Users-rsalim-personal-hms-revamp/memory/project_improvement_roadmap.md` (record P.3 Tier 1 done; note Tier 2 remains)
- No help-center change expected (the FAQ note added in the pagination migration already covers "click a column header to sort"); confirm and skip if so.

**Interfaces:** none.

- [ ] **Step 1: Update the roadmap memory**

Record that P.3 Tier 1 (relation-column sorting for bookings/bills/payments) is now complete, that all `orderBy`s now carry a stable `{ id }` tiebreaker, and that the only remaining sorting follow-up is **B.x — bill aggregate sorting (total/paid/outstanding) via raw SQL** (Tier 2 backlog). Convert relative dates to absolute (2026-06-25).

- [ ] **Step 2: Confirm the help center needs no change**

Run: `grep -rin "urut\|kolom\|sort" "src/app/(internal)/(dashboard_layout)/help/"`
The pagination-migration FAQ entry ("klik judul kolom untuk mengurutkan") already documents column-header sorting generically. If it's present, no change is needed — relation columns sort the same way from the user's view. If for some reason no such note exists, add the one-line FAQ entry from the pagination plan. Otherwise skip.

- [ ] **Step 3: Commit (only if a repo file changed)**

```bash
# Only if the help center was actually modified:
git add "src/app/(internal)/(dashboard_layout)/help/"
git commit -m "docs: note relation-column sorting in help center"
```

(The roadmap memory lives outside the repo and persists on its own — no commit needed for it.)

---

## Final Verification (after all tasks)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx vitest run` — all unit + integration pass (298 existing + new relation-sort cases), test DB on :5433 up.
- [ ] Manual smoke (optional): on /bookings, /payments, /bills, click the tenant/room/status (and combined-column) headers; confirm the table re-sorts across the full dataset and the URL shows `?sort=<id>&dir=<asc|desc>`, and clicking again toggles direction.
- [ ] Confirm `total`/`paid`/`outstanding` headers on /bills remain non-clickable (still Tier 2).
