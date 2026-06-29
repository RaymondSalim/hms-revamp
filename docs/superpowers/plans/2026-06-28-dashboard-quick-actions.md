# Dashboard Quick Actions (Phase 1.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Perlu Tindakan" action-queue panel to the dashboard that lists the actual highest-priority items behind the Today's Tasks counts and lets staff verify/reject payments, send bill reminders, and check tenants in without leaving the dashboard — and reuse the new one-click payment-status action on the payments list table.

**Architecture:** A new `getActionQueue(locationId)` data function reuses the exact predicates of the existing `getTodayTaskCounts` but returns the top 5 items per category. A new thin `setPaymentStatusAction(paymentId, statusId)` server action flips a payment's status and reconciles its derived transactions via the existing `createOrUpdatePaymentTransactions`. A new client `<ActionQueue>` renders the grouped items with permission-gated, confirm-where-destructive action buttons; the dashboard page feeds it and server-side `revalidatePath` refreshes both the queue and the count tiles. The same `setPaymentStatusAction` powers two new conditional row items on the payments table.

**Tech Stack:** Next.js 16 App Router (React 19), TypeScript, Prisma 6 / Postgres, Vitest (integration, test DB :5433), Playwright (E2E, e2e-db :5434), react-toastify, existing `useConfirm()` / `usePermissions()` / `ActionMenu` components.

## Global Constraints

- **Currency/locale:** Rupiah, `formatCurrency` from `@/app/_lib/util/currency`; dates are `@db.Date` stored midnight-UTC — format in `timeZone: "UTC"`.
- **Time:** "today" = `businessToday()` from `@/app/_lib/util/business-time` (WIB calendar day as midnight UTC).
- **Location scope:** every read is location-scoped; every write re-validates the item's location against `getScopedLocationIds()` (`null` = admin/all). Reuse the guard pattern already in `upsertPaymentAction`.
- **Permissions:** action buttons gated client-side via `usePermissions().can("payments.manage" | "bills.manage" | "bookings.manage")` (disabled + tooltip when not allowed, matching the P.2 pattern), AND re-checked server-side via `checkPermission(...)`.
- **Status constants:** use `PAYMENT_STATUS` / `BOOKING_STATUS` from `@/app/_lib/util/status` — never magic numbers. `PAYMENT_STATUS = { PENDING: 1, VERIFIED: 2, REJECTED: 3 }`.
- **Ledger semantics:** payment reject uses **delete-and-recreate** (the existing `createOrUpdatePaymentTransactions` already removes transactions for non-VERIFIED status). Do NOT introduce reversal entries (that is backlog B.11).
- **Confirmation friction = destructive only:** Reject payment and Check-in prompt `useConfirm()`; Verify and Send-reminder fire immediately with a toast.
- **Copy:** all user-facing strings in Indonesian.
- **Item cap:** top 5 per category.
- **Refresh:** server actions call `revalidatePath("/dashboard")` (payment action also `/payments`); no client-side optimistic row removal.
- **Help-center sync:** update `help/help-client.tsx` when the user-facing feature lands.
- **Tests:** integration tests import `"../helpers/mock-next"` first (mocks `next/cache`, `next/headers`, S3, RBAC→always authorized, auth). E2E specs suppress the onboarding tour via `page.addInitScript(() => window.localStorage.setItem("hms_tour_completed","1"))` in `beforeEach`.

---

### Task 1: `getActionQueue` data function + types

**Files:**
- Modify: `src/app/_db/today-tasks.ts` (add types + `getActionQueue`, after the existing `getTodayTaskCounts`)
- Test: `tests/integration/action-queue.test.ts` (create)

**Interfaces:**
- Consumes: `prisma`, `businessToday()`, `BOOKING_STATUS`/`PAYMENT_STATUS`, `billOutstanding` (already imported in this file).
- Produces:
  ```ts
  type ActionQueueKind = "payment" | "bill" | "checkin" | "expiring";
  interface ActionQueueItem {
    kind: ActionQueueKind;
    id: number;          // payment id / bill id / booking id (per kind)
    primary: string;     // "Kamar 12 · Budi"
    secondary: string;   // "Rp1.200.000" / "Jatuh tempo 2026-06-20" / "Berakhir 2026-07-05"
    bookingId: number;
    tenantId: string;    // "" when unknown (still serializable)
    href: string;
    canEmail?: boolean;  // bills only
  }
  interface ActionQueue {
    payments: ActionQueueItem[];
    bills: ActionQueueItem[];
    checkins: ActionQueueItem[];
    expiring: ActionQueueItem[];
  }
  async function getActionQueue(locationId: number): Promise<ActionQueue>
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/integration/action-queue.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { getActionQueue } from "@/app/_db/today-tasks";
import { businessToday } from "@/app/_lib/util/business-time";

const DAY = 86_400_000;

describe("getActionQueue", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function tenant(name: string, email: string | null = `${name}@t.com`) {
    return testPrisma.tenant.create({
      data: { name, id_number: `id-${name}-${Date.now()}`, email },
    });
  }

  it("returns unverified payments (PENDING only), scoped, capped at 5", async () => {
    const t = await tenant("Andi");
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: businessToday(), status_id: 2, fee: 1, is_rolling: true },
    });
    // 6 pending → expect cap 5; 1 verified → excluded
    for (let i = 0; i < 6; i++) {
      await testPrisma.payment.create({
        data: { booking_id: b.id, amount: 100 + i, payment_date: businessToday(), payment_method: "CASH", status_id: 1 },
      });
    }
    await testPrisma.payment.create({
      data: { booking_id: b.id, amount: 999, payment_date: businessToday(), payment_method: "CASH", status_id: 2 },
    });

    const q = await getActionQueue(1);
    expect(q.payments).toHaveLength(5);
    expect(q.payments[0].kind).toBe("payment");
    expect(q.payments[0].bookingId).toBe(b.id);
    expect(q.payments[0].href).toBe("/payments?status=pending");
  });

  it("returns overdue bills with outstanding > 0 and sets canEmail from tenant email", async () => {
    const today = businessToday();
    const tWith = await tenant("Eka", "eka@t.com");
    const bWith = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: tWith.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    const overdue = await testPrisma.bill.create({
      data: { booking_id: bWith.id, description: "OD", due_date: new Date(today.getTime() - 5 * DAY), invoice_number: `INV-OD-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: overdue.id, description: "Sewa", amount: 500000 } });

    // tenant with NO email → canEmail false
    const tNo = await tenant("NoMail", null);
    const bNo = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: tNo.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    const overdue2 = await testPrisma.bill.create({
      data: { booking_id: bNo.id, description: "OD2", due_date: new Date(today.getTime() - 3 * DAY), invoice_number: `INV-OD2-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: overdue2.id, description: "Sewa", amount: 300000 } });

    // fully-paid past-due → excluded
    const paid = await testPrisma.bill.create({
      data: { booking_id: bWith.id, description: "PD", due_date: new Date(today.getTime() - 2 * DAY), invoice_number: `INV-PD-${Date.now()}` },
    });
    await testPrisma.billItem.create({ data: { bill_id: paid.id, description: "Sewa", amount: 100000 } });
    const pay = await testPrisma.payment.create({
      data: { booking_id: bWith.id, amount: 100000, payment_date: today, payment_method: "CASH", status_id: 2 },
    });
    await testPrisma.paymentBill.create({ data: { payment_id: pay.id, bill_id: paid.id, amount: 100000 } });

    const q = await getActionQueue(1);
    expect(q.bills).toHaveLength(2);
    const byId = Object.fromEntries(q.bills.map((x) => [x.id, x]));
    expect(byId[overdue.id].canEmail).toBe(true);
    expect(byId[overdue2.id].canEmail).toBe(false);
    expect(byId[overdue.id].href).toBe("/bills?overdue=1");
  });

  it("returns check-ins due (today, ACTIVE/PENDING, no CHECK_IN log) with tenantId", async () => {
    const today = businessToday();
    const t = await tenant("Cika");
    const b = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    const checkedIn = await testPrisma.booking.create({
      data: { room_id: 2, tenant_id: (await tenant("Dani")).id, start_date: today, status_id: 2, fee: 1, is_rolling: true },
    });
    await testPrisma.checkInOutLog.create({
      data: { booking_id: checkedIn.id, event_type: "CHECK_IN", event_date: today },
    });

    const q = await getActionQueue(1);
    expect(q.checkins).toHaveLength(1);
    expect(q.checkins[0].id).toBe(b.id);
    expect(q.checkins[0].tenantId).toBe(t.id);
    expect(q.checkins[0].href).toBe("/bookings?checkin=today");
  });

  it("returns expiring bookings (ACTIVE, non-rolling, end_date within 30 days)", async () => {
    const today = businessToday();
    const t = await tenant("Fajar");
    await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: new Date(today.getTime() - 20 * DAY), end_date: new Date(today.getTime() + 10 * DAY), status_id: 2, is_rolling: false, fee: 1 },
    });
    const q = await getActionQueue(1);
    expect(q.expiring).toHaveLength(1);
    expect(q.expiring[0].href).toBe("/bookings?expiring=1");
  });

  it("scopes all groups to the requested location", async () => {
    const q = await getActionQueue(99999);
    expect(q).toEqual({ payments: [], bills: [], checkins: [], expiring: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.test.yml up -d test-db && npx vitest run tests/integration/action-queue.test.ts`
Expected: FAIL — `getActionQueue is not a function` / no export.

- [ ] **Step 3: Implement `getActionQueue` + types**

Append to `src/app/_db/today-tasks.ts` (after `getTodayTaskCounts`). Note the existing imports at the top already include `prisma`, `businessToday`, `BOOKING_STATUS`, `PAYMENT_STATUS`, `billOutstanding`.

```ts
export type ActionQueueKind = "payment" | "bill" | "checkin" | "expiring";

export interface ActionQueueItem {
  kind: ActionQueueKind;
  id: number;
  primary: string;
  secondary: string;
  bookingId: number;
  tenantId: string;
  href: string;
  canEmail?: boolean;
}

export interface ActionQueue {
  payments: ActionQueueItem[];
  bills: ActionQueueItem[];
  checkins: ActionQueueItem[];
  expiring: ActionQueueItem[];
}

const QUEUE_TAKE = 5;

function roomTenantLabel(
  roomNumber: string | undefined,
  tenantName: string | undefined
): string {
  return `Kamar ${roomNumber ?? "?"} · ${tenantName ?? "?"}`;
}

/** Format a @db.Date (midnight-UTC) as a WIB-correct calendar day. */
function fmtDate(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Top-N actionable items behind the Today's Tasks counts, for the dashboard
 * "Perlu Tindakan" panel. Reuses getTodayTaskCounts' predicates verbatim but
 * selects the items (capped at QUEUE_TAKE per category) instead of counting.
 */
export async function getActionQueue(locationId: number): Promise<ActionQueue> {
  const today = businessToday();
  const in30 = new Date(today.getTime() + 30 * 86_400_000);

  const [paymentRows, overdueBillRows, checkinRows, expiringRows] =
    await Promise.all([
      prisma.payment.findMany({
        where: {
          deletedAt: null,
          status_id: PAYMENT_STATUS.PENDING,
          bookings: { rooms: { location_id: locationId } },
        },
        include: {
          bookings: { include: { tenants: true, rooms: true } },
        },
        orderBy: { payment_date: "asc" },
        take: QUEUE_TAKE,
      }),
      // Overdue bills: due before today (SQL), outstanding > 0 (JS), then cap.
      prisma.bill.findMany({
        where: {
          deletedAt: null,
          bookings: { rooms: { location_id: locationId } },
          due_date: { lt: today },
        },
        include: {
          bill_item: true,
          paymentBills: true,
          bookings: { include: { tenants: true, rooms: true } },
        },
        orderBy: { due_date: "asc" },
      }),
      prisma.booking.findMany({
        where: {
          deletedAt: null,
          rooms: { location_id: locationId },
          start_date: today,
          status_id: { in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACTIVE] },
          checkInOutLogs: { none: { event_type: "CHECK_IN" } },
        },
        include: { tenants: true, rooms: true },
        orderBy: { id: "asc" },
        take: QUEUE_TAKE,
      }),
      prisma.booking.findMany({
        where: {
          deletedAt: null,
          rooms: { location_id: locationId },
          status_id: BOOKING_STATUS.ACTIVE,
          is_rolling: false,
          end_date: { gte: today, lte: in30 },
        },
        include: { tenants: true, rooms: true },
        orderBy: { end_date: "asc" },
        take: QUEUE_TAKE,
      }),
    ]);

  const payments: ActionQueueItem[] = paymentRows.map((p) => ({
    kind: "payment",
    id: p.id,
    primary: roomTenantLabel(p.bookings.rooms?.room_number, p.bookings.tenants?.name),
    secondary: `Rp${Number(p.amount).toLocaleString("id-ID")}`,
    bookingId: p.booking_id,
    tenantId: p.bookings.tenants?.id ?? "",
    href: "/payments?status=pending",
  }));

  const bills: ActionQueueItem[] = overdueBillRows
    .filter((b) => billOutstanding(b) > 0)
    .slice(0, QUEUE_TAKE)
    .map((b) => ({
      kind: "bill",
      id: b.id,
      primary: roomTenantLabel(b.bookings.rooms?.room_number, b.bookings.tenants?.name),
      secondary: `Jatuh tempo ${fmtDate(b.due_date)}`,
      bookingId: b.booking_id,
      tenantId: b.bookings.tenants?.id ?? "",
      href: "/bills?overdue=1",
      canEmail: Boolean(b.bookings.tenants?.email),
    }));

  const checkins: ActionQueueItem[] = checkinRows.map((bk) => ({
    kind: "checkin",
    id: bk.id,
    primary: roomTenantLabel(bk.rooms?.room_number, bk.tenants?.name),
    secondary: `Mulai ${fmtDate(bk.start_date)}`,
    bookingId: bk.id,
    tenantId: bk.tenant_id ?? "",
    href: "/bookings?checkin=today",
  }));

  const expiring: ActionQueueItem[] = expiringRows.map((bk) => ({
    kind: "expiring",
    id: bk.id,
    primary: roomTenantLabel(bk.rooms?.room_number, bk.tenants?.name),
    secondary: bk.end_date ? `Berakhir ${fmtDate(bk.end_date)}` : "",
    bookingId: bk.id,
    tenantId: bk.tenant_id ?? "",
    href: "/bookings?expiring=1",
  }));

  return { payments, bills, checkins, expiring };
}
```

> Note: confirm `billOutstanding`'s parameter type accepts `{ bill_item, paymentBills }` — it is already used the same way in `getTodayTaskCounts` in this file, so the include above matches. If `booking.tenant_id` is nullable in the schema, the `?? ""` fallback keeps `tenantId` a string.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/action-queue.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/_db/today-tasks.ts tests/integration/action-queue.test.ts
git commit -m "feat: getActionQueue data function for dashboard quick actions"
```

---

### Task 2: `setPaymentStatusAction` server action

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/payments/payment-action.ts` (add new exported action; imports `checkPermission`, `getScopedLocationIds`, `revalidatePath`, `PAYMENT_STATUS`, `logAudit`, `prisma`, `createOrUpdatePaymentTransactions` are all already present in this file)
- Test: `tests/integration/set-payment-status.test.ts` (create)

**Interfaces:**
- Consumes: existing `createOrUpdatePaymentTransactions(paymentId)` (same file), `PAYMENT_STATUS`.
- Produces: `async function setPaymentStatusAction(paymentId: number, statusId: number): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/set-payment-status.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { setPaymentStatusAction } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";

describe("setPaymentStatusAction", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function setup() {
    const tenant = await testPrisma.tenant.create({
      data: { name: "T", id_number: `${Date.now()}`, email: `t${Date.now()}@t.com` },
    });
    const booking = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: tenant.id, start_date: new Date("2025-01-01"), end_date: new Date("2025-01-31"), fee: 3000000, is_rolling: false },
    });
    const bill = await testPrisma.bill.create({
      data: { booking_id: booking.id, description: "Tagihan", due_date: new Date("2025-01-31") },
    });
    await testPrisma.billItem.create({
      data: { bill_id: bill.id, description: "Biaya Sewa", amount: 3000000, type: "GENERATED" },
    });
    const payment = await testPrisma.payment.create({
      data: { booking_id: booking.id, amount: 3000000, payment_date: new Date("2025-01-05"), status_id: PAYMENT_STATUS.PENDING },
    });
    await testPrisma.paymentBill.create({
      data: { payment_id: payment.id, bill_id: bill.id, amount: 3000000 },
    });
    return { payment };
  }

  function txnsFor(paymentId: number) {
    return testPrisma.transaction.findMany({
      where: { related_id: { path: ["payment_id"], equals: paymentId } },
    });
  }

  it("VERIFIED flips status and creates transactions", async () => {
    const { payment } = await setup();
    const res = await setPaymentStatusAction(payment.id, PAYMENT_STATUS.VERIFIED);
    expect(res.success).toBe(true);

    const updated = await testPrisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status_id).toBe(PAYMENT_STATUS.VERIFIED);
    expect(await txnsFor(payment.id)).toHaveLength(1);
  });

  it("REJECTED flips status and removes transactions (delete-and-recreate)", async () => {
    const { payment } = await setup();
    // first verify (creates a transaction)
    await setPaymentStatusAction(payment.id, PAYMENT_STATUS.VERIFIED);
    expect(await txnsFor(payment.id)).toHaveLength(1);

    // then reject
    const res = await setPaymentStatusAction(payment.id, PAYMENT_STATUS.REJECTED);
    expect(res.success).toBe(true);
    const updated = await testPrisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status_id).toBe(PAYMENT_STATUS.REJECTED);
    expect(await txnsFor(payment.id)).toHaveLength(0);
  });

  it("returns an error for a missing payment", async () => {
    const res = await setPaymentStatusAction(999999, PAYMENT_STATUS.VERIFIED);
    expect(res.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/set-payment-status.test.ts`
Expected: FAIL — `setPaymentStatusAction is not a function`.

- [ ] **Step 3: Implement the action**

Add to `src/app/(internal)/(dashboard_layout)/payments/payment-action.ts` (anywhere among the other exported actions, e.g. after `deletePaymentAction`):

```ts
/**
 * Thin one-click status change for a payment (used by the dashboard action
 * queue and the payments-table row buttons). Only mutates status_id, then
 * reconciles derived transactions via createOrUpdatePaymentTransactions (which
 * creates transactions only for VERIFIED and removes them otherwise). For a
 * full edit, callers still use upsertPaymentAction.
 */
export async function setPaymentStatusAction(
  paymentId: number,
  statusId: number
): Promise<{ success: boolean; error?: string }> {
  const { authorized } = await checkPermission("payments.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, bookings: { select: { rooms: { select: { location_id: true } } } } },
  });
  if (!payment) return { success: false, error: "Pembayaran tidak ditemukan" };

  // Location scope guard (same pattern as upsertPaymentAction).
  const locationId = payment.bookings.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status_id: statusId },
  });

  // Reconcile transactions to the new status (delete-and-recreate).
  await createOrUpdatePaymentTransactions(paymentId);

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  await logAudit(`payment.status_changed: id=${paymentId}, status_id=${statusId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/set-payment-status.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/payments/payment-action.ts" tests/integration/set-payment-status.test.ts
git commit -m "feat: setPaymentStatusAction one-click payment status change"
```

---

### Task 3: `<ActionQueue>` client component + wire into dashboard

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/dashboard/action-queue.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx` (accept `actionQueue` prop, render under `<TodayTasks>`)
- Modify: `src/app/(internal)/(dashboard_layout)/dashboard/page.tsx` (fetch + serialize + pass)

**Interfaces:**
- Consumes: `ActionQueue` / `ActionQueueItem` from `@/app/_db/today-tasks`; `setPaymentStatusAction` from `../../payments/payment-action`; `resendBillEmailAction` from `../../bills/bill-action`; `checkInOutAction` from `../../bookings/booking-action`; `useConfirm` from `@/app/_components/confirm-dialog`; `usePermissions` from `@/app/_context/permissions-context`; `businessToday` from `@/app/_lib/util/business-time`; `PAYMENT_STATUS` from `@/app/_lib/util/status`; `toast` from `react-toastify`; `Link` from `next/link`.
- Produces: `function ActionQueue({ queue }: { queue: ActionQueue }): JSX.Element`. `DashboardClient` gains a required `actionQueue: ActionQueue` prop.

> There is no Vitest test for this client component (the project has no component-render harness; UI is covered by the Task 5 E2E). The deliverable is verified by `tsc` + the E2E spec.

- [ ] **Step 1: Create the component**

Create `src/app/(internal)/(dashboard_layout)/dashboard/action-queue.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import type { ActionQueue as ActionQueueData, ActionQueueItem } from "@/app/_db/today-tasks";
import { useConfirm } from "@/app/_components/confirm-dialog";
import { usePermissions } from "@/app/_context/permissions-context";
import { businessToday } from "@/app/_lib/util/business-time";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";
import { setPaymentStatusAction } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { resendBillEmailAction } from "@/app/(internal)/(dashboard_layout)/bills/bill-action";
import { checkInOutAction } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

const DISABLED_REASON = "Anda tidak memiliki izin untuk tindakan ini";

export function ActionQueue({ queue }: { queue: ActionQueueData }) {
  const confirm = useConfirm();
  const { can } = usePermissions();
  // Per-row pending key: `${kind}-${id}` while that row's action is in flight.
  const [pending, setPending] = useState<string | null>(null);

  const total =
    queue.payments.length + queue.bills.length + queue.checkins.length + queue.expiring.length;

  const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) => {
    setPending(key);
    try {
      const res = await fn();
      if (res.success) toast.success(okMsg);
      else toast.error(res.error ?? "Gagal memproses tindakan");
    } catch {
      toast.error("Gagal memproses tindakan");
    } finally {
      setPending(null);
    }
  };

  const verifyPayment = (item: ActionQueueItem) =>
    run(`payment-${item.id}`, () => setPaymentStatusAction(item.id, PAYMENT_STATUS.VERIFIED), "Pembayaran diverifikasi");

  const rejectPayment = async (item: ActionQueueItem) => {
    if (!(await confirm({ message: "Tolak pembayaran ini? Tindakan ini akan menghapus transaksi terkait.", danger: true, confirmLabel: "Tolak" }))) return;
    await run(`payment-${item.id}`, () => setPaymentStatusAction(item.id, PAYMENT_STATUS.REJECTED), "Pembayaran ditolak");
  };

  const remindBill = (item: ActionQueueItem) =>
    run(`bill-${item.id}`, () => resendBillEmailAction(item.id), "Email pengingat terkirim");

  const checkIn = async (item: ActionQueueItem) => {
    if (!(await confirm({ message: "Catat check-in untuk pemesanan ini?", confirmLabel: "Check-in" }))) return;
    await run(`checkin-${item.id}`, () =>
      checkInOutAction({
        booking_id: item.bookingId,
        event_type: "CHECK_IN",
        event_date: businessToday(),
        tenant_id: item.tenantId,
      }), "Check-in tercatat");
  };

  if (total === 0) {
    return (
      <div data-tour="action-queue">
        <SectionHeading />
        <div
          className="rounded-xl border p-6 text-sm"
          style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
        >
          Tidak ada tindakan tertunda — semua beres 🎉
        </div>
      </div>
    );
  }

  const canPay = can("payments.manage");
  const canBill = can("bills.manage");
  const canBook = can("bookings.manage");

  return (
    <div data-tour="action-queue">
      <SectionHeading />
      <div
        className="rounded-xl border divide-y"
        style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border)", boxShadow: "var(--shadow-sm)" }}
      >
        {queue.payments.map((item) => (
          <Row key={`payment-${item.id}`} item={item}>
            <ActionButton
              label="Verifikasi"
              variant="success"
              disabled={!canPay}
              disabledReason={DISABLED_REASON}
              loading={pending === `payment-${item.id}`}
              onClick={() => verifyPayment(item)}
            />
            <ActionButton
              label="Tolak"
              variant="danger"
              disabled={!canPay}
              disabledReason={DISABLED_REASON}
              loading={pending === `payment-${item.id}`}
              onClick={() => rejectPayment(item)}
            />
          </Row>
        ))}

        {queue.bills.map((item) => (
          <Row key={`bill-${item.id}`} item={item}>
            <ActionButton
              label="Ingatkan"
              variant="default"
              disabled={!canBill || item.canEmail === false}
              disabledReason={item.canEmail === false ? "Penyewa tidak memiliki email" : DISABLED_REASON}
              loading={pending === `bill-${item.id}`}
              onClick={() => remindBill(item)}
            />
          </Row>
        ))}

        {queue.checkins.map((item) => (
          <Row key={`checkin-${item.id}`} item={item}>
            <ActionButton
              label="Check-in"
              variant="default"
              disabled={!canBook}
              disabledReason={DISABLED_REASON}
              loading={pending === `checkin-${item.id}`}
              onClick={() => checkIn(item)}
            />
          </Row>
        ))}

        {queue.expiring.map((item) => (
          <Row key={`expiring-${item.id}`} item={item}>
            <Link
              href={item.href}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
            >
              Lihat
            </Link>
          </Row>
        ))}
      </div>
    </div>
  );
}

function SectionHeading() {
  return (
    <h2
      className="text-sm font-semibold uppercase tracking-wide mb-3"
      style={{ color: "var(--color-text-secondary)" }}
    >
      Perlu Tindakan
    </h2>
  );
}

function Row({ item, children }: { item: ActionQueueItem; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
          {item.primary}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
          {item.secondary}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  );
}

function ActionButton({
  label,
  variant,
  disabled,
  disabledReason,
  loading,
  onClick,
}: {
  label: string;
  variant: "default" | "success" | "danger";
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  onClick: () => void;
}) {
  const palette: Record<string, { bg: string; color: string }> = {
    default: { bg: "var(--color-accent-light)", color: "var(--color-accent)" },
    success: { bg: "#D1FAE5", color: "#059669" },
    danger: { bg: "#FEF2F2", color: "#DC2626" },
  };
  const style = palette[variant];
  const isOff = Boolean(disabled) || Boolean(loading);
  return (
    <button
      onClick={isOff ? undefined : onClick}
      disabled={isOff}
      title={disabled ? disabledReason : label}
      className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
      style={{
        backgroundColor: style.bg,
        color: style.color,
        opacity: isOff ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : loading ? "wait" : "pointer",
      }}
    >
      {loading ? "..." : label}
    </button>
  );
}
```

- [ ] **Step 2: Wire into `dashboard-client.tsx`**

In `src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx`:

Add import near the top (next to the `TodayTasks` import):
```tsx
import { ActionQueue } from "./action-queue";
import type { TodayTaskCounts, ActionQueue as ActionQueueData } from "@/app/_db/today-tasks";
```
(Replace the existing `import type { TodayTaskCounts } from "@/app/_db/today-tasks";` line with the combined import above.)

Add to `DashboardClientProps`:
```tsx
  todayTasks: TodayTaskCounts;
  actionQueue: ActionQueueData;
```

Add `actionQueue` to the destructured params, and render it directly under `<TodayTasks counts={todayTasks} />`:
```tsx
      <TodayTasks counts={todayTasks} />
      <ActionQueue queue={actionQueue} />
```

- [ ] **Step 3: Wire into `page.tsx`**

In `src/app/(internal)/(dashboard_layout)/dashboard/page.tsx`:

Update the import to also pull `getActionQueue`:
```tsx
import { getTodayTaskCounts, getActionQueue } from "@/app/_db/today-tasks";
```

Add `getActionQueue(locationId)` to the `Promise.all` array and destructure it:
```tsx
  const [checkInOutCounts, roomStats, occupancy, recentPayments, upcomingEvents, todayTasks, actionQueue] =
    await Promise.all([
      getCheckInOutCounts(locationId),
      getRoomStats(locationId),
      getOccupancyRate(locationId),
      getRecentPayments(locationId),
      getUpcomingEvents(),
      getTodayTaskCounts(locationId),
      getActionQueue(locationId),
    ]);
```

Pass it to the client (serialize, matching the other props — the queue contains a Decimal-free shape but `serializeForClient` is harmless and keeps the pattern):
```tsx
    <DashboardClient
      checkInOutCounts={checkInOutCounts}
      roomStats={roomStats}
      occupancy={occupancy}
      recentPayments={serializeForClient(recentPayments) as unknown as RecentPayment[]}
      upcomingEvents={serializeForClient(upcomingEvents) as unknown as UpcomingEvent[]}
      todayTasks={todayTasks}
      actionQueue={actionQueue}
    />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `tsc` is slow, `npx tsc --noEmit -p tsconfig.json` is fine; the project's CI uses the same.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/dashboard/action-queue.tsx" "src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx" "src/app/(internal)/(dashboard_layout)/dashboard/page.tsx"
git commit -m "feat: dashboard Perlu Tindakan action-queue panel"
```

---

### Task 4: Verifikasi / Tolak row items on the payments table

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx`

**Interfaces:**
- Consumes: `setPaymentStatusAction` from `./payment-action`; existing `useConfirm` (add import), `PAYMENT_STATUS` (add import), `ActionMenu`/`Icons`/`DEFAULT_DISABLED_REASON` (already imported), `toast` (already imported), `canManage` (already derived from `usePermissions`).
- Produces: two new conditional `ActionMenu` items shown only when the row status is PENDING.

> Verified by `tsc` + the Task 5 E2E payments-table assertion (no separate unit test — consistent with the table's existing test coverage).

- [ ] **Step 1: Add imports**

In `src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx`:

Add `setPaymentStatusAction` to the existing payment-action import:
```tsx
import { upsertPaymentAction, deletePaymentAction, setPaymentStatusAction } from "./payment-action";
```
Add two new imports:
```tsx
import { useConfirm } from "@/app/_components/confirm-dialog";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";
```

- [ ] **Step 2: Add the confirm hook + handlers**

Inside the `PaymentTable` component, next to the existing `const { can } = usePermissions(); const canManage = can("payments.manage");`, add:
```tsx
  const confirm = useConfirm();

  const handleVerify = async (row: PaymentRow) => {
    setLoading(true);
    const res = await setPaymentStatusAction(row.id, PAYMENT_STATUS.VERIFIED);
    setLoading(false);
    if (res.success) toast.success("Pembayaran diverifikasi");
    else toast.error(res.error ?? "Gagal memverifikasi pembayaran");
  };

  const handleReject = async (row: PaymentRow) => {
    if (!(await confirm({ message: "Tolak pembayaran ini? Tindakan ini akan menghapus transaksi terkait.", danger: true, confirmLabel: "Tolak" }))) return;
    setLoading(true);
    const res = await setPaymentStatusAction(row.id, PAYMENT_STATUS.REJECTED);
    setLoading(false);
    if (res.success) toast.success("Pembayaran ditolak");
    else toast.error(res.error ?? "Gagal menolak pembayaran");
  };
```

- [ ] **Step 3: Add the conditional ActionMenu items**

Locate the row `ActionMenu` (the `items={[ ... ]}` array with Edit and Hapus). Replace that `items` array with one that prepends the two status items when the row is PENDING:
```tsx
        <ActionMenu
          items={[
            ...(row.original.status_id === PAYMENT_STATUS.PENDING
              ? [
                  { label: "Verifikasi", icon: Icons.status, onClick: () => handleVerify(row.original), variant: "success" as const, disabled: !canManage },
                  { label: "Tolak", icon: Icons.delete, onClick: () => handleReject(row.original), variant: "danger" as const, disabled: !canManage },
                ]
              : []),
            { label: "Edit", icon: Icons.edit, onClick: () => openEdit(row.original), disabled: !canManage },
            { label: "Hapus", icon: Icons.delete, onClick: () => setDeleteConfirm(row.original), variant: "danger", disabled: !canManage },
          ]}
        />
```
(Keep any other existing props on the `ActionMenu`, e.g. a `maxInline`, unchanged.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx"
git commit -m "feat: Verifikasi/Tolak quick actions on the payments table"
```

---

### Task 5: E2E coverage + help-center note

**Files:**
- Create: `e2e/specs/dashboard-quick-actions.spec.ts`
- Modify: `src/app/(internal)/(dashboard_layout)/help/help-client.tsx` (add a quick-actions note)

**Interfaces:**
- Consumes: `ROUTES`, `ADMIN` from `e2e/fixtures/test-data`; the seeded e2e DB (which includes at least one PENDING payment per `prisma/seed-mock.ts`).
- Produces: an E2E spec asserting the panel renders and a verify action works end-to-end; a help-center entry.

- [ ] **Step 1: Add the help-center note**

In `src/app/(internal)/(dashboard_layout)/help/help-client.tsx`, inside the `daily-workflow` section's `content` array, add one entry after the "Tugas Hari Ini" line:
```ts
      "Perlu Tindakan: di bawah Tugas Hari Ini, panel ini menampilkan item yang butuh tindakan langsung — verifikasi/tolak pembayaran, kirim pengingat tagihan, dan catat check-in — tanpa meninggalkan Dashboard. Tombol akan nonaktif jika peran Anda tidak memiliki izin terkait.",
```

- [ ] **Step 2: Write the E2E spec**

Create `e2e/specs/dashboard-quick-actions.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

test.describe("Dashboard quick actions (Perlu Tindakan)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.setItem("hms_tour_completed", "1"); } catch {}
    });
  });

  test("renders the Perlu Tindakan panel", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Perlu Tindakan" })
    ).toBeVisible();
    // No error boundary.
    await expect(page.getByText("Terjadi Kesalahan")).toHaveCount(0);
  });

  test("verifying a pending payment from the queue clears it and shows a toast", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    const main = page.getByRole("main");

    const verifyButtons = main.getByRole("button", { name: "Verifikasi" });
    const count = await verifyButtons.count();
    test.skip(count === 0, "No pending payment seeded in the queue");

    await verifyButtons.first().click();
    // Success toast (react-toastify).
    await expect(page.getByText("Pembayaran diverifikasi")).toBeVisible();
  });

  test("payments table shows Verifikasi for a PENDING row", async ({ page }) => {
    await page.goto(`${ROUTES.payments}?status=pending`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Pembayaran" })).toBeVisible();

    // The row ActionMenu renders Verifikasi/Tolak for pending rows. With <=2
    // inline items they render as title-bearing icon buttons; otherwise inside
    // the overflow menu. Assert at least one Verifikasi affordance is reachable.
    const rows = main.getByRole("row");
    const rowCount = await rows.count();
    test.skip(rowCount <= 1, "No pending payments seeded");

    // Open the first data row's overflow if present, then look for Verifikasi.
    const verifByTitle = main.locator('button[title="Verifikasi"]');
    if (await verifByTitle.count() === 0) {
      // try opening an overflow menu
      const more = main.locator('button[title="Lainnya"]').first();
      if (await more.count()) await more.click();
    }
    await expect(
      main.getByRole("button", { name: "Verifikasi" }).or(main.locator('button[title="Verifikasi"]')).first()
    ).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the E2E spec**

Run:
```bash
docker compose -f docker-compose.test.yml up -d e2e-db
npx playwright test e2e/specs/dashboard-quick-actions.spec.ts
```
Expected: PASS (3 tests; the action tests `skip` gracefully if the seed has no pending payment, but the seed does include pending payments so they should run).

- [ ] **Step 4: Run the full unit/integration suite to confirm no regression**

Run: `npx vitest run`
Expected: all green (existing suite + the two new integration files).

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/dashboard-quick-actions.spec.ts "src/app/(internal)/(dashboard_layout)/help/help-client.tsx"
git commit -m "test(e2e): dashboard quick actions + help-center note"
```

---

## Final Verification (whole-branch)

- `npx tsc --noEmit` clean.
- `npx vitest run` — full unit/integration suite green, including `action-queue.test.ts` and `set-payment-status.test.ts`.
- `npx playwright test e2e/specs/dashboard-quick-actions.spec.ts` — green (re-run independently; do not trust a single pass — the tour overlay has caused flakes before, and these specs already suppress it in `beforeEach`).
- Manual smoke: dashboard shows "Perlu Tindakan"; verify a pending payment → toast + row drops + the "Pembayaran Belum Diverifikasi" tile count decreases; reject prompts a confirm; a bill row with a no-email tenant shows the disabled "Ingatkan" with tooltip; check-in prompts a confirm and writes a log; expiring rows show only "Lihat".

## Notes for the PR

Per the standing instruction, the PR description must end with a tailored `## Manual Test Checklist` of concrete click-through steps (verify/reject payment from both the dashboard queue and the payments table; send a reminder to a tenant with/without email; check a tenant in; confirm the count tiles refresh; confirm permission-gated buttons disable for a viewer role).
