# Today's Tasks Dashboard Widget (Phase 1.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a four-tile "Today's Tasks" panel at the top of the dashboard (check-ins due, unverified payments, overdue bills, expiring bookings) with exact drill-down links, backed by new status/overdue filters on the payments/bookings/bills list pages.

**Architecture:** A new `getTodayTaskCounts(locationId)` query (in `src/app/_db/today-tasks.ts`) returns the four counts in one parallel batch, location-scoped and WIB-correct via `businessToday()`; it joins the dashboard's existing `Promise.all`. A new `<TodayTasks>` client component renders four `next/link` tiles in the existing stat-card style, above the current stat row. Each target list page's query function gains an optional typed filter argument; the page reads a new searchParam and passes it. Overdue bills (an aggregate) uses a two-stage SQL-date-then-JS-outstanding filter, reusing a shared `billOutstanding` helper.

**Tech Stack:** Next.js 16 App Router (React 19), TypeScript, Prisma 6 / Postgres, `@tanstack/react-table` v8 (ServerDataTable), Vitest (node env, test DB :5433), Playwright E2E (e2e DB :5434).

## Global Constraints

- Indonesian-language UI. Tile labels: "Check-in Hari Ini", "Pembayaran Belum Diverifikasi", "Tagihan Terlambat", "Pemesanan Akan Berakhir".
- All "today"/date comparisons use `businessToday()` from `@/app/_lib/util/business-time` (returns the WIB calendar day as midnight-UTC, comparing correctly against `@db.Date` columns). Never use `new Date()` for day boundaries.
- Status ids from `@/app/_lib/util/status`: `BOOKING_STATUS` (PENDING=1, ACTIVE=2, COMPLETED=3, CANCELLED=4), `PAYMENT_STATUS` (PENDING=1, VERIFIED=2, REJECTED=3).
- Reuse existing infra unchanged: `parseTableParams`, `RawSearchParams`, `toSkipTake`, `buildPaginated`, `Paginated<T>` from `@/app/_lib/util/table-params`; `resolveLocationContext` from `@/app/_lib/util/location-scope`; `serializeForClient`; the existing `ServerDataTable` client contract.
- All counts and filters are location-scoped (payments/bills/bookings via the relations already used in their `getXxxPage`).
- New list-page filter args are OPTIONAL and additive — existing call sites (and the table components) compile unchanged. Unknown/garbage param values are ignored (no filter), never throw.
- The `?overdue=1` bills view paginates the filtered subset in memory (documented exception); the UNFILTERED bills page keeps its existing SQL pagination untouched.
- The existing suite (currently 307 unit/integration + 20 E2E) must stay green.

## File Structure

| File | Responsibility |
|---|---|
| `src/app/_db/bills.ts` (modify) | Add exported `billOutstanding(bill)` helper; add optional `overdue` filter to `getBillsPage` (two-stage). |
| `src/app/_db/today-tasks.ts` (create) | `getTodayTaskCounts(locationId)` — the four counts. |
| `src/app/_db/payments.ts` (modify) | Optional `status: "pending"` filter on `getPaymentsPage`. |
| `src/app/_db/bookings.ts` (modify) | Optional `checkin: "today"` / `expiring: boolean` filter on `getBookingsPage`. |
| `dashboard/today-tasks.tsx` (create) | `<TodayTasks>` client component — 4 link tiles. |
| `dashboard/page.tsx` (modify) | Fetch counts, pass to client. |
| `dashboard/dashboard-client.tsx` (modify) | Render `<TodayTasks>` at the top; add prop. |
| `{payments,bills,bookings}/page.tsx` (modify) | Read the new searchParam, pass to query fn. |
| `tests/integration/today-tasks.test.ts` (create) | Count + filter tests. |
| `e2e/specs/dashboard-tasks.spec.ts` (create) | Tiles render + drill-down link. |

---

### Task 1: `getTodayTaskCounts` + `billOutstanding` helper + `<TodayTasks>` panel + dashboard wiring

This task delivers a working, useful widget on its own: the four counts are computed by `getTodayTaskCounts` independently of the list-page filters (Tasks 2-4). The tiles link to the filtered URLs now; until Tasks 2-4 land, a click lands on the unfiltered page (harmless — shows all rows). Each later task makes one link exact.

**Files:**
- Modify: `src/app/_db/bills.ts` (add exported `billOutstanding`)
- Create: `src/app/_db/today-tasks.ts`
- Create: `src/app/(internal)/(dashboard_layout)/dashboard/today-tasks.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/dashboard/page.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx`
- Test: `tests/integration/today-tasks.test.ts`

**Interfaces:**
- Produces:
  - `billOutstanding(bill: { bill_item: { amount: Prisma.Decimal | number | string }[]; paymentBills: { amount: Prisma.Decimal | number | string }[] }): number` — exported from `src/app/_db/bills.ts`.
  - `getTodayTaskCounts(locationId: number): Promise<TodayTaskCounts>` where `interface TodayTaskCounts { checkInsDue: number; unverifiedPayments: number; overdueBills: number; expiringBookings: number }` — exported from `src/app/_db/today-tasks.ts`.
  - `<TodayTasks counts={TodayTaskCounts} />` — client component default export `TodayTasks`.

- [ ] **Step 1: Write the failing test for `getTodayTaskCounts`**

Create `tests/integration/today-tasks.test.ts`. `seedTestData()` provides location 1 with rooms 1 (101) and 2 (102), booking statuses (1=PENDING, 2=ACTIVE, 3=COMPLETED), payment statuses (1=PENDING, 2=VERIFIED). Use `businessToday()` to build relative dates so the test is TZ-stable.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { getTodayTaskCounts } from "@/app/_db/today-tasks";
import { businessToday } from "@/app/_lib/util/business-time";

const DAY = 86_400_000;

describe("getTodayTaskCounts", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function tenant(name: string) {
    return testPrisma.tenant.create({
      data: { name, id_number: `id-${name}-${Date.now()}`, email: `${name}@t.com` },
    });
  }

  it("counts check-ins due: starts today, ACTIVE/PENDING, no CHECK_IN log", async () => {
    const today = businessToday();
    const t1 = await tenant("Andi");
    // due today, no check-in log → counts
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    // due today but already checked in → excluded
    const t2 = await tenant("Budi");
    const checkedIn = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.checkInOutLog.create({
      data: { booking_id: checkedIn.id, event_type: "CHECK_IN", event_date: today },
    });
    // starts tomorrow → excluded
    const t3 = await tenant("Cika");
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t3.id, start_date: new Date(today.getTime() + DAY), status_id: 2, fee: 1, is_rolling: true },
    });

    const counts = await getTodayTaskCounts(1);
    expect(counts.checkInsDue).toBe(1);
  });

  it("counts unverified payments: status PENDING only", async () => {
    const t = await tenant("Dewi");
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 100, payment_date: businessToday(), payment_method: "CASH", status_id: 1 },
    });
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 200, payment_date: businessToday(), payment_method: "CASH", status_id: 2 },
    });
    const counts = await getTodayTaskCounts(1);
    expect(counts.unverifiedPayments).toBe(1);
  });

  it("counts overdue bills: due before today AND outstanding > 0", async () => {
    const today = businessToday();
    const t = await tenant("Eka");
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    // past-due, unpaid → counts
    const overdue = await testPrisma.bill.create({
      data: { booking_id: b.id, description: "Overdue", due_date: new Date(today.getTime() - 5 * DAY), invoice_number: `INV-OD-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: overdue.id, description: "Sewa", amount: 500000 } });
    // past-due, fully paid → excluded
    const paid = await testPrisma.bill.create({
      data: { booking_id: b.id, description: "Paid", due_date: new Date(today.getTime() - 5 * DAY), invoice_number: `INV-PD-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: paid.id, description: "Sewa", amount: 300000 } });
    const pay = await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 300000, payment_date: today, payment_method: "CASH", status_id: 2 },
    });
    await testPrisma.paymentBill.create({ data: { payment_id: pay.id, bill_id: paid.id, amount: 300000 } });
    // future-due, unpaid → excluded
    const future = await testPrisma.bill.create({
      data: { booking_id: b.id, description: "Future", due_date: new Date(today.getTime() + 5 * DAY), invoice_number: `INV-FT-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: future.id, description: "Sewa", amount: 400000 } });

    const counts = await getTodayTaskCounts(1);
    expect(counts.overdueBills).toBe(1);
  });

  it("counts expiring bookings: ACTIVE, non-rolling, end_date within 30 days", async () => {
    const today = businessToday();
    const t1 = await tenant("Fajar");
    // ends in 10 days, non-rolling, ACTIVE → counts
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: new Date(today.getTime() - 20 * DAY), end_date: new Date(today.getTime() + 10 * DAY), status_id: 2, is_rolling: false, fee: 1 },
    });
    // rolling (no end_date) → excluded
    const t2 = await tenant("Gita");
    await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: today, status_id: 2, is_rolling: true, fee: 1 },
    });
    // ends in 40 days → excluded
    const t3 = await tenant("Hadi");
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t3.id, start_date: today, end_date: new Date(today.getTime() + 40 * DAY), status_id: 2, is_rolling: false, fee: 1 },
    });
    // COMPLETED → excluded
    const t4 = await tenant("Indah");
    await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t4.id, start_date: today, end_date: new Date(today.getTime() + 10 * DAY), status_id: 3, is_rolling: false, fee: 1 },
    });

    const counts = await getTodayTaskCounts(1);
    expect(counts.expiringBookings).toBe(1);
  });

  it("scopes all counts to the requested location", async () => {
    const counts = await getTodayTaskCounts(99999);
    expect(counts).toEqual({ checkInsDue: 0, unverifiedPayments: 0, overdueBills: 0, expiringBookings: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/today-tasks.test.ts`
Expected: FAIL — module `@/app/_db/today-tasks` not found. (Start the test DB first if needed: `docker compose -f docker-compose.test.yml up -d test-db`.)

- [ ] **Step 3: Add the `billOutstanding` helper to `src/app/_db/bills.ts`**

At the top of `src/app/_db/bills.ts` (after the imports), add an exported helper. `bill_item.amount` and `paymentBills.amount` are Prisma `Decimal`; `Number()` handles Decimal/number/string uniformly.

```ts
/** Outstanding balance for a bill: Σ item amounts − Σ allocated payments. */
export function billOutstanding(bill: {
  bill_item: { amount: Prisma.Decimal | number | string }[];
  paymentBills: { amount: Prisma.Decimal | number | string }[];
}): number {
  const items = bill.bill_item.reduce((s, i) => s + Number(i.amount), 0);
  const paid = bill.paymentBills.reduce((s, p) => s + Number(p.amount), 0);
  return items - paid;
}
```

(`Prisma` is already imported in `bills.ts`.)

- [ ] **Step 4: Create `src/app/_db/today-tasks.ts`**

```ts
import { prisma } from "@/app/_lib/prisma";
import { businessToday } from "@/app/_lib/util/business-time";
import { BOOKING_STATUS, PAYMENT_STATUS } from "@/app/_lib/util/status";
import { billOutstanding } from "@/app/_db/bills";

export interface TodayTaskCounts {
  checkInsDue: number;
  unverifiedPayments: number;
  overdueBills: number;
  expiringBookings: number;
}

/**
 * Four "needs action now" counts for the dashboard Today's Tasks panel,
 * location-scoped and WIB-correct (businessToday() returns the WIB calendar day
 * as midnight UTC, matching @db.Date storage).
 */
export async function getTodayTaskCounts(
  locationId: number
): Promise<TodayTaskCounts> {
  const today = businessToday();
  const in30 = new Date(today.getTime() + 30 * 86_400_000);

  const [checkInsDue, unverifiedPayments, overdueBillRows, expiringBookings] =
    await Promise.all([
      // Check-ins due: starts today, PENDING/ACTIVE, no CHECK_IN log yet.
      prisma.booking.count({
        where: {
          deletedAt: null,
          rooms: { location_id: locationId },
          start_date: today,
          status_id: { in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACTIVE] },
          checkInOutLogs: { none: { event_type: "CHECK_IN" } },
        },
      }),
      // Unverified payments: status PENDING.
      prisma.payment.count({
        where: {
          deletedAt: null,
          status_id: PAYMENT_STATUS.PENDING,
          bookings: { rooms: { location_id: locationId } },
        },
      }),
      // Overdue bills: due before today (SQL), then outstanding > 0 (JS).
      prisma.bill.findMany({
        where: {
          deletedAt: null,
          bookings: { rooms: { location_id: locationId } },
          due_date: { lt: today },
        },
        include: { bill_item: true, paymentBills: true },
      }),
      // Expiring bookings: ACTIVE, non-rolling, end_date in [today, today+30d].
      prisma.booking.count({
        where: {
          deletedAt: null,
          rooms: { location_id: locationId },
          status_id: BOOKING_STATUS.ACTIVE,
          is_rolling: false,
          end_date: { gte: today, lte: in30 },
        },
      }),
    ]);

  const overdueBills = overdueBillRows.filter(
    (b) => billOutstanding(b) > 0
  ).length;

  return { checkInsDue, unverifiedPayments, overdueBills, expiringBookings };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/integration/today-tasks.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Create the `<TodayTasks>` component**

Create `src/app/(internal)/(dashboard_layout)/dashboard/today-tasks.tsx`. Match the existing `StatCard` style (`rounded-xl border p-5`); the whole tile is a `next/link`. A count > 0 uses the accent attention treatment; a 0 count is muted.

```tsx
"use client";

import Link from "next/link";
import type { TodayTaskCounts } from "@/app/_db/today-tasks";

interface Tile {
  key: keyof TodayTaskCounts;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const TILES: Tile[] = [
  {
    key: "checkInsDue",
    label: "Check-in Hari Ini",
    href: "/bookings?checkin=today",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
      </svg>
    ),
  },
  {
    key: "unverifiedPayments",
    label: "Pembayaran Belum Diverifikasi",
    href: "/payments?status=pending",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "overdueBills",
    label: "Tagihan Terlambat",
    href: "/bills?overdue=1",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "expiringBookings",
    label: "Pemesanan Akan Berakhir",
    href: "/bookings?expiring=1",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export function TodayTasks({ counts }: { counts: TodayTaskCounts }) {
  return (
    <div data-tour="today-tasks">
      <h2
        className="text-sm font-semibold uppercase tracking-wide mb-3"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Tugas Hari Ini
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TILES.map((tile) => {
          const value = counts[tile.key];
          const active = value > 0;
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className="rounded-xl border p-5 flex items-start gap-4 transition-shadow duration-150 hover:shadow-md"
              style={{
                backgroundColor: "var(--color-bg-card)",
                borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                className="p-2.5 rounded-lg"
                style={{
                  backgroundColor: active ? "var(--color-accent)" : "var(--color-accent-light)",
                  color: active ? "white" : "var(--color-accent)",
                }}
              >
                {tile.icon}
              </div>
              <div>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {tile.label}
                </p>
                <p
                  className="text-2xl font-bold mt-0.5"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {value}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire the dashboard page**

In `src/app/(internal)/(dashboard_layout)/dashboard/page.tsx`:

Add the import:
```tsx
import { getTodayTaskCounts } from "@/app/_db/today-tasks";
```

Add `getTodayTaskCounts(locationId)` to the `Promise.all` and destructure it. Change the array to:
```tsx
  const [checkInOutCounts, roomStats, occupancy, recentPayments, outstandingBills, upcomingEvents, todayTasks] =
    await Promise.all([
      getCheckInOutCounts(locationId),
      getRoomStats(locationId),
      getOccupancyRate(locationId),
      getRecentPayments(locationId),
      getOutstandingBills(locationId),
      getUpcomingEvents(),
      getTodayTaskCounts(locationId),
    ]);
```

Pass it to the client (counts are plain numbers — no serialization needed):
```tsx
    <DashboardClient
      checkInOutCounts={checkInOutCounts}
      roomStats={roomStats}
      occupancy={occupancy}
      recentPayments={serializeForClient(recentPayments) as unknown as RecentPayment[]}
      outstandingBills={serializeForClient(outstandingBills) as unknown as OutstandingBill[]}
      upcomingEvents={serializeForClient(upcomingEvents) as unknown as UpcomingEvent[]}
      todayTasks={todayTasks}
    />
```

- [ ] **Step 8: Render `<TodayTasks>` in the dashboard client**

In `src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx`:

Add imports near the top:
```tsx
import { TodayTasks } from "./today-tasks";
import type { TodayTaskCounts } from "@/app/_db/today-tasks";
```

Add `todayTasks: TodayTaskCounts;` to `DashboardClientProps`, and add `todayTasks` to the destructured params of `DashboardClient`.

Render the panel immediately after the `<h1>Dashboard</h1>` and before the `{/* Overview Cards */}` grid:
```tsx
      <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
        Dashboard
      </h1>

      <TodayTasks counts={todayTasks} />

      {/* Overview Cards */}
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/app/_db/bills.ts src/app/_db/today-tasks.ts \
  "src/app/(internal)/(dashboard_layout)/dashboard/today-tasks.tsx" \
  "src/app/(internal)/(dashboard_layout)/dashboard/page.tsx" \
  "src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx" \
  tests/integration/today-tasks.test.ts
git commit -m "feat: Today's tasks dashboard widget with four count tiles"
```

---

### Task 2: Payments `?status=pending` filter

**Files:**
- Modify: `src/app/_db/payments.ts` (add optional filter arg to `getPaymentsPage`)
- Modify: `src/app/(internal)/(dashboard_layout)/payments/page.tsx` (read `?status`)
- Test: `tests/integration/today-tasks.test.ts` (add a `getPaymentsPage status` block)

**Interfaces:**
- Consumes: existing `getPaymentsPage(locationId, params): Promise<Paginated<PaymentWithRelations>>`, `PAYMENT_STATUS`.
- Produces: `getPaymentsPage(locationId, params, opts?: { status?: "pending" })` — when `opts.status === "pending"`, adds `status_id: PAYMENT_STATUS.PENDING` to the `where`. Backwards-compatible (third arg optional).

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/today-tasks.test.ts`:

```ts
import { getPaymentsPage } from "@/app/_db/payments";

describe("getPaymentsPage status filter", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("returns only PENDING payments when status='pending'", async () => {
    const t = await testPrisma.tenant.create({
      data: { name: "Joko", id_number: `id-j-${Date.now()}`, email: "j@t.com" },
    });
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 100, payment_date: businessToday(), payment_method: "CASH", status_id: 1 },
    });
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 200, payment_date: businessToday(), payment_method: "CASH", status_id: 2 },
    });

    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const pending = await getPaymentsPage(1, base, { status: "pending" });
    expect(pending.total).toBe(1);
    expect(pending.rows[0].status_id).toBe(1);

    const all = await getPaymentsPage(1, base);
    expect(all.total).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/today-tasks.test.ts -t "getPaymentsPage status filter"`
Expected: FAIL — `getPaymentsPage` does not accept a third argument / the filter is ignored so `pending.total` is 2.

- [ ] **Step 3: Add the optional filter to `getPaymentsPage`**

In `src/app/_db/payments.ts`, change the signature and `where`. Add `import { PAYMENT_STATUS } from "@/app/_lib/util/status";` if not already imported. Update the function:

```ts
export interface PaymentFilter {
  status?: "pending";
}

export async function getPaymentsPage(
  locationId: number,
  params: TableParams,
  opts: PaymentFilter = {}
): Promise<Paginated<PaymentWithRelations>> {
  const search = params.search;
  const methodMatch = matchPaymentMethod(search);
  const where: Prisma.PaymentWhereInput = {
    deletedAt: null,
    bookings: { rooms: { location_id: locationId } },
    ...(opts.status === "pending" ? { status_id: PAYMENT_STATUS.PENDING } : {}),
    ...(search
      ? {
          OR: [
            // ...existing OR clauses unchanged...
          ],
        }
      : {}),
  };
  // ...rest unchanged (orderBy via paymentOrderBy, skip/take, count)...
}
```

Keep everything else (the `OR` search block, `paymentOrderBy`, pagination) exactly as it is — only the signature and the one `status_id` spread are added.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/today-tasks.test.ts -t "getPaymentsPage status filter"`
Expected: PASS.

- [ ] **Step 5: Wire the page to read `?status`**

In `src/app/(internal)/(dashboard_layout)/payments/page.tsx`, read the raw param and pass the filter. After `const params = parseTableParams(...)`, add:

```tsx
  const sp = await searchParams;
  const statusParam = (Array.isArray(sp.status) ? sp.status[0] : sp.status) === "pending"
    ? ("pending" as const)
    : undefined;

  const payments = await getPaymentsPage(selectedLocationId, params, { status: statusParam });
```

(Replace the existing `const payments = await getPaymentsPage(selectedLocationId, params);` line. Note `searchParams` is already awaited once for `parseTableParams`; reuse a single `await`. If `parseTableParams(await searchParams, ...)` is inline, change it to `const sp = await searchParams; const params = parseTableParams(sp, {...});` so you await once.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/_db/payments.ts \
  "src/app/(internal)/(dashboard_layout)/payments/page.tsx" \
  tests/integration/today-tasks.test.ts
git commit -m "feat: payments ?status=pending filter for Today's tasks drill-down"
```

---

### Task 3: Bookings `?checkin=today` and `?expiring=1` filters

**Files:**
- Modify: `src/app/_db/bookings.ts` (add optional filter arg to `getBookingsPage`)
- Modify: `src/app/(internal)/(dashboard_layout)/bookings/page.tsx` (read `?checkin` / `?expiring`)
- Test: `tests/integration/today-tasks.test.ts` (add a `getBookingsPage filters` block)

**Interfaces:**
- Consumes: existing `getBookingsPage(locationId, params): Promise<Paginated<BookingListRow>>`, `BOOKING_STATUS`, `businessToday`.
- Produces: `getBookingsPage(locationId, params, opts?: { checkin?: "today"; expiring?: boolean })`. `checkin` takes precedence if both are set. Backwards-compatible.

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/today-tasks.test.ts`:

```ts
import { getBookingsPage } from "@/app/_db/bookings";

describe("getBookingsPage checkin/expiring filters", () => {
  const DAY = 86_400_000;
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("checkin='today' returns only today's un-checked-in PENDING/ACTIVE bookings", async () => {
    const today = businessToday();
    const t1 = await testPrisma.tenant.create({ data: { name: "K", id_number: `k-${Date.now()}`, email: "k@t.com" } });
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    const t2 = await testPrisma.tenant.create({ data: { name: "L", id_number: `l-${Date.now()}`, email: "l@t.com" } });
    const ci = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.checkInOutLog.create({ data: { booking_id: ci.id, event_type: "CHECK_IN", event_date: today } });

    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const r = await getBookingsPage(1, base, { checkin: "today" });
    expect(r.total).toBe(1);
  });

  it("expiring=true returns only ACTIVE non-rolling bookings ending within 30 days", async () => {
    const today = businessToday();
    const t1 = await testPrisma.tenant.create({ data: { name: "M", id_number: `m-${Date.now()}`, email: "m@t.com" } });
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: new Date(today.getTime() - 20 * DAY), end_date: new Date(today.getTime() + 10 * DAY), status_id: 2, is_rolling: false, fee: 1 },
    });
    const t2 = await testPrisma.tenant.create({ data: { name: "N", id_number: `n-${Date.now()}`, email: "n@t.com" } });
    await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: t2.id, start_date: today, status_id: 2, is_rolling: true, fee: 1 },
    });

    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const r = await getBookingsPage(1, base, { expiring: true });
    expect(r.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/today-tasks.test.ts -t "getBookingsPage checkin/expiring filters"`
Expected: FAIL — third arg unsupported / filter ignored.

- [ ] **Step 3: Add the optional filter to `getBookingsPage`**

In `src/app/_db/bookings.ts`, add `import { businessToday } from "@/app/_lib/util/business-time";` if not present (BOOKING_STATUS is already imported). Change the signature and build the filter into `where`:

```ts
export interface BookingFilter {
  checkin?: "today";
  expiring?: boolean;
}

export async function getBookingsPage(
  locationId: number,
  params: TableParams,
  opts: BookingFilter = {}
): Promise<Paginated<BookingListRow>> {
  const search = params.search;

  let filter: Prisma.BookingWhereInput = {};
  if (opts.checkin === "today") {
    const today = businessToday();
    filter = {
      start_date: today,
      status_id: { in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACTIVE] },
      checkInOutLogs: { none: { event_type: "CHECK_IN" } },
    };
  } else if (opts.expiring) {
    const today = businessToday();
    const in30 = new Date(today.getTime() + 30 * 86_400_000);
    filter = {
      status_id: BOOKING_STATUS.ACTIVE,
      is_rolling: false,
      end_date: { gte: today, lte: in30 },
    };
  }

  const where: Prisma.BookingWhereInput = {
    rooms: { location_id: locationId },
    deletedAt: null,
    ...filter,
    ...(search
      ? {
          OR: [
            // ...existing OR clauses unchanged...
          ],
        }
      : {}),
  };
  // ...rest unchanged (orderBy via bookingOrderBy, skip/take, count)...
}
```

Keep the existing `OR` search block, `bookingOrderBy`, and pagination exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/today-tasks.test.ts -t "getBookingsPage checkin/expiring filters"`
Expected: PASS.

- [ ] **Step 5: Wire the page to read `?checkin` / `?expiring`**

In `src/app/(internal)/(dashboard_layout)/bookings/page.tsx`, await searchParams once, derive the filter, and pass it. The page currently fetches several things in a `Promise.all` including `getBookingsPage(selectedLocationId, params)` — change only that call. Add before the `Promise.all`:

```tsx
  const sp = await searchParams;
  const params = parseTableParams(sp, {
    allowedSortKeys: BOOKING_SORT_KEYS,
    defaultSortBy: "createdAt",
    defaultSortDir: "desc",
  });
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const bookingFilter =
    first(sp.checkin) === "today"
      ? { checkin: "today" as const }
      : first(sp.expiring) === "1"
        ? { expiring: true }
        : {};
```

Then change the bookings fetch in the `Promise.all` from `getBookingsPage(selectedLocationId, params)` to `getBookingsPage(selectedLocationId, params, bookingFilter)`. (The existing code already does `parseTableParams(await searchParams, ...)`; replace it with the `sp`-based version above so searchParams is awaited once.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/_db/bookings.ts \
  "src/app/(internal)/(dashboard_layout)/bookings/page.tsx" \
  tests/integration/today-tasks.test.ts
git commit -m "feat: bookings ?checkin=today and ?expiring=1 filters for Today's tasks drill-down"
```

---

### Task 4: Bills `?overdue=1` filter (two-stage)

**Files:**
- Modify: `src/app/_db/bills.ts` (add optional `overdue` filter to `getBillsPage`, two-stage)
- Modify: `src/app/(internal)/(dashboard_layout)/bills/page.tsx` (read `?overdue`)
- Test: `tests/integration/today-tasks.test.ts` (add a `getBillsPage overdue filter` block)

**Interfaces:**
- Consumes: existing `getBillsPage(locationId, params): Promise<Paginated<BillWithRelations>>`, `billOutstanding` (Task 1), `businessToday`, `toSkipTake`, `buildPaginated`.
- Produces: `getBillsPage(locationId, params, opts?: { overdue?: boolean })`. When `opts.overdue` is true, the function returns the past-due-and-unpaid subset, paginated in memory. Default path unchanged (SQL pagination).

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/today-tasks.test.ts`:

```ts
import { getBillsPage } from "@/app/_db/bills";

describe("getBillsPage overdue filter", () => {
  const DAY = 86_400_000;
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function bill(bookingId: number, dueOffsetDays: number, amount: number, paid: number, tag: string) {
    const today = businessToday();
    const b = await testPrisma.bill.create({
      data: {
        booking_id: bookingId,
        description: tag,
        due_date: new Date(today.getTime() + dueOffsetDays * DAY),
        invoice_number: `INV-${tag}-${Date.now()}`,
      },
    });
    await testPrisma.billItem.create({ data: { bill_id: b.id, description: "Sewa", amount } });
    if (paid > 0) {
      const p = await testPrisma.payment.create({
        data: { booking_id: bookingId, amount: paid, payment_date: today, payment_method: "CASH", status_id: 2 },
      });
      await testPrisma.paymentBill.create({ data: { payment_id: p.id, bill_id: b.id, amount: paid } });
    }
    return b;
  }

  it("returns only past-due bills with outstanding > 0, paginated", async () => {
    const t = await testPrisma.tenant.create({ data: { name: "O", id_number: `o-${Date.now()}`, email: "o@t.com" } });
    const bk = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    await bill(bk.id, -5, 500000, 0, "OD1");    // past-due, unpaid → in
    await bill(bk.id, -3, 400000, 0, "OD2");    // past-due, unpaid → in
    await bill(bk.id, -5, 300000, 300000, "PD"); // past-due, fully paid → out
    await bill(bk.id, 5, 200000, 0, "FT");       // future-due → out

    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const r = await getBillsPage(1, base, { overdue: true });
    expect(r.total).toBe(2);

    // pagination of the subset: pageSize 1 → 2 pages, disjoint
    const p1 = await getBillsPage(1, { ...base, pageSize: 1, page: 1 }, { overdue: true });
    const p2 = await getBillsPage(1, { ...base, pageSize: 1, page: 2 }, { overdue: true });
    expect(p1.rows).toHaveLength(1);
    expect(p2.rows).toHaveLength(1);
    expect(p1.pageCount).toBe(2);
    expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
  });

  it("unfiltered getBillsPage still returns all non-deleted bills", async () => {
    const t = await testPrisma.tenant.create({ data: { name: "P", id_number: `p-${Date.now()}`, email: "p@t.com" } });
    const bk = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    await bill(bk.id, -5, 500000, 500000, "PAID");
    await bill(bk.id, 5, 200000, 0, "FUT");
    const base = { page: 1, pageSize: 10, search: "", sortBy: null, sortDir: "desc" as const };
    const all = await getBillsPage(1, base);
    expect(all.total).toBe(2); // overdue filter NOT applied
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/today-tasks.test.ts -t "getBillsPage overdue filter"`
Expected: FAIL — third arg unsupported / overdue subset not applied.

- [ ] **Step 3: Add the two-stage `overdue` filter to `getBillsPage`**

In `src/app/_db/bills.ts`, add `import { businessToday } from "@/app/_lib/util/business-time";`. Change the signature and branch on `opts.overdue`. The non-overdue path stays exactly as today (SQL pagination); the overdue path fetches the past-due subset, filters by `billOutstanding`, and paginates in memory:

```ts
export interface BillFilter {
  overdue?: boolean;
}

export async function getBillsPage(
  locationId: number,
  params: TableParams,
  opts: BillFilter = {}
): Promise<Paginated<BillWithRelations>> {
  const search = params.search;
  const where: Prisma.BillWhereInput = {
    deletedAt: null,
    bookings: { rooms: { location_id: locationId } },
    ...(opts.overdue ? { due_date: { lt: businessToday() } } : {}),
    ...(search
      ? {
          OR: [
            // ...existing OR clauses unchanged...
          ],
        }
      : {}),
  };

  if (opts.overdue) {
    // Outstanding (Σitems − Σpaid) is an aggregate Prisma `where` can't express,
    // so filter in JS and paginate the (small) past-due-unpaid subset in memory.
    const all = await prisma.bill.findMany({
      where,
      ...billWithRelations,
      orderBy: billOrderBy(params.sortBy, params.sortDir),
    });
    const outstanding = all.filter((b) => billOutstanding(b) > 0);
    const { skip, take } = toSkipTake(params);
    const rows = outstanding.slice(skip, skip + take);
    return buildPaginated(rows, outstanding.length, params);
  }

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

  return buildPaginated(rows, total, params);
}
```

Keep the existing `OR` search block and `billOrderBy` exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/today-tasks.test.ts -t "getBillsPage overdue filter"`
Expected: PASS.

- [ ] **Step 5: Wire the page to read `?overdue`**

In `src/app/(internal)/(dashboard_layout)/bills/page.tsx`, await searchParams once and pass the filter:

```tsx
  const sp = await searchParams;
  const params = parseTableParams(sp, {
    allowedSortKeys: BILL_SORT_KEYS,
    defaultSortBy: "due_date",
    defaultSortDir: "desc",
  });
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const overdue = first(sp.overdue) === "1";

  const bills = await getBillsPage(selectedLocationId, params, { overdue });
```

(Replace the existing `parseTableParams(await searchParams, ...)` and `getBillsPage(selectedLocationId, params)` lines so searchParams is awaited once.)

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: clean.
Run: `npx vitest run`
Expected: PASS (all unit + integration, incl. the new today-tasks blocks). Test DB up.

- [ ] **Step 7: Commit**

```bash
git add src/app/_db/bills.ts \
  "src/app/(internal)/(dashboard_layout)/bills/page.tsx" \
  tests/integration/today-tasks.test.ts
git commit -m "feat: bills ?overdue=1 two-stage filter for Today's tasks drill-down"
```

---

### Task 5: E2E proof + help center note

**Files:**
- Create: `e2e/specs/dashboard-tasks.spec.ts`
- Modify: the help center content under `src/app/(internal)/(dashboard_layout)/help/` (conditional — only if a relevant section exists)

**Interfaces:** none.

- [ ] **Step 1: Write the E2E spec**

Create `e2e/specs/dashboard-tasks.spec.ts` (default admin storageState). Assert the panel renders and a tile drills down to its filtered page without the error boundary.

```ts
import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

test.describe("Dashboard Today's Tasks panel", () => {
  test("renders the four task tiles", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Tugas Hari Ini" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Pembayaran Belum Diverifikasi/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Tagihan Terlambat/ })).toBeVisible();
  });

  test("unverified-payments tile drills down to the filtered payments page", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await page.getByRole("link", { name: /Pembayaran Belum Diverifikasi/ }).click();
    await expect(page).toHaveURL(/\/payments\?status=pending/);
    await expect(page.getByText("Terjadi Kesalahan")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Pembayaran" })
    ).toBeVisible();
  });
});
```

> If `ROUTES.dashboard` is `/dashboard`, the tile link names must match the component labels exactly. Adjust the heading name ("Pembayaran") to the payments page's actual `<main>` h1 if it differs (read `payments/payment-table.tsx`).

- [ ] **Step 2: Run the E2E spec**

Ensure the e2e DB is up (`docker compose -f docker-compose.test.yml up -d e2e-db`). Then:
Run: `npx playwright test --config e2e/playwright.config.ts dashboard-tasks`
Expected: PASS (2 tests + setup). Be patient with the first dev-server compile (config allows 120s).

- [ ] **Step 3: Help center note (conditional)**

Run: `grep -rn "Dashboard\|Tugas\|dasbor" "src/app/(internal)/(dashboard_layout)/help/help-client.tsx"`
If a dashboard-related section exists, add one concise Indonesian entry to that section's `content` array (match the existing string format), e.g.:

```
"Tugas Hari Ini: panel di atas Dashboard menampilkan jumlah check-in hari ini, pembayaran yang belum diverifikasi, tagihan terlambat, dan pemesanan yang akan berakhir. Klik kartu untuk membuka daftar terkait.",
```

If no dashboard section exists, skip (do not invent a new section).

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/dashboard-tasks.spec.ts
# include the help file only if you changed it:
# git add "src/app/(internal)/(dashboard_layout)/help/help-client.tsx"
git commit -m "test(e2e): Today's tasks panel renders and drills down; help center note"
```

---

## Final Verification (after all tasks)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx vitest run` — all unit + integration pass (307 existing + new today-tasks blocks), test DB :5433 up.
- [ ] `npx playwright test --config e2e/playwright.config.ts` — full E2E green (20 existing + 2 new), e2e DB :5434 up.
- [ ] Manual smoke (optional): on /dashboard, confirm the four tiles render with counts at the top; a tile with count > 0 shows the accent treatment; click each tile and confirm it lands on the correctly-filtered list (payments → only pending; bills → only past-due-unpaid; bookings → today's check-ins / expiring-within-30-days). Switch the location selector and confirm counts change to that location.
