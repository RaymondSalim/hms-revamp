# Dashboard Quick Actions (Phase 1.7) — Design Spec

**Date:** 2026-06-28
**Status:** Approved (pending spec review)
**Roadmap item:** Phase 1.7 — Quick actions from the dashboard.

## Problem

The Today's Tasks panel (Phase 1.6) shows four "needs action now" counts —
check-ins due, unverified payments, overdue bills, expiring bookings — but each
tile is only a navigation link. To act on any of them the user leaves the
dashboard, lands on a filtered list page, and performs a multi-step flow. The
two highest-volume actions are especially heavy: verifying a payment today is
only possible by opening the full payment edit modal (which re-runs S3 upload,
Zod validation, and allocation rebuild) and changing a status dropdown.

## Goal

A **"Perlu Tindakan"** action-queue panel on the dashboard, below the existing
count tiles, that lists the actual highest-priority items across all four
categories and lets the user act inline — verify/reject a payment, send a bill
reminder, check a tenant in — without leaving the dashboard. The count tiles
stay as the at-a-glance summary; the queue is the actionable detail. A new thin
one-click payment-status action is reused on the payments list table so the same
friction is removed there too.

## Decisions

- **Surface:** a dedicated `Perlu Tindakan` panel (not expandable tiles, not
  buttons-only-on-list-pages). It groups items by category, each rendered only
  if it has items.
- **Item volume:** top **5 per category**, mirroring the count predicates.
- **Action set (one per category):**
  - Unverified payment → **Verifikasi** (primary) and **Tolak** (subtle/danger).
  - Overdue bill → **Ingatkan** (send reminder email).
  - Check-in due → **Check-in**.
  - Expiring booking → **no inline action**; a `Lihat` link only (no safe
    one-click renew exists yet — that is Phase 1.10).
- **Confirmation friction = destructive only:** Reject payment and Check-in
  prompt the branded `useConfirm()` dialog (Phase 1.2) first; Verify payment and
  Send reminder fire immediately with a success toast.
- **New server logic is minimal:** only one new action,
  `setPaymentStatusAction`. Bill reminder reuses `resendBillEmailAction`
  verbatim; check-in reuses `checkInOutAction` as-is.
- **`setPaymentStatusAction` is shared:** the same action also powers two new
  conditional row items (Verifikasi / Tolak) on the payments list table, where
  verification is otherwise only reachable through the full edit modal.
- **Refresh model:** server actions `revalidatePath("/dashboard")` (and
  `/payments`) on success; the queue and the count tiles refresh together from
  the server. No client-side optimistic removal — revalidation is the source of
  truth. A per-row pending flag prevents double-fire while an action runs.
- **Permissions:** every action is gated client-side via
  `usePermissions().can(...)` (disabled + tooltip when not allowed, matching the
  P.2 pattern) **and** re-checked server-side (`checkPermission` +
  location-scope guard, as all existing actions already do).

## Architecture & Data Flow

```
Dashboard page (server component)
  Promise.all([ ...existing..., getActionQueue(locationId) ])
    → getActionQueue reuses getTodayTaskCounts' WIB-correct, location-scoped
      predicates, but selects the top 5 items per category (not counts)
  → serializeForClient(queue) → <DashboardClient>
      → <TodayTasks counts> (unchanged)
      → <ActionQueue queue>            ← NEW client component
           per row: permission-gated button(s)
             Verifikasi → setPaymentStatusAction(id, VERIFIED)        [no confirm]
             Tolak      → confirm → setPaymentStatusAction(id, REJECTED)
             Ingatkan   → resendBillEmailAction(billId)               [no confirm]
             Check-in   → confirm → checkInOutAction({CHECK_IN, today, tenant})
             (expiring) → Lihat link to /bookings?expiring=1
           on success → toast + server revalidatePath("/dashboard")
                        → queue AND count tiles re-render

Payments list table (existing)
  row ActionMenu gains, only when row status is PENDING:
    Verifikasi → setPaymentStatusAction(id, VERIFIED)
    Tolak      → confirm → setPaymentStatusAction(id, REJECTED)   [variant danger]
  setPaymentStatusAction revalidatePath("/payments") → table refreshes in place
```

### New / changed units

- **`src/app/_db/today-tasks.ts`** — add `getActionQueue(locationId): Promise<ActionQueue>`
  plus exported `ActionQueueItem` / `ActionQueue` types. Sits beside
  `getTodayTaskCounts` and reuses its exact predicates (WIB `businessToday()`,
  `location_id` scope, `deletedAt: null`, booking-status / payment-status
  constants, and the `billOutstanding(b) > 0` JS filter for overdue bills). Adds
  `take: 5` per category and the `include`s needed to build each row
  (room number, tenant name + email, amount, due date).

- **`src/app/(internal)/(dashboard_layout)/payments/payment-action.ts`** — add
  `setPaymentStatusAction(paymentId: number, statusId: number)`. Thin: gate on
  `payments.manage`, location-scope guard (same pattern as `upsertPaymentAction`
  / `deletePaymentAction`), update only `status_id`, then call the existing
  `createOrUpdatePaymentTransactions(paymentId)` so transactions are created when
  the new status is VERIFIED and removed otherwise (that helper already gates on
  verification status). `revalidatePath("/payments")` and
  `revalidatePath("/dashboard")`. `logAudit(...)`. Returns `{success, error?}`.

- **`src/app/(internal)/(dashboard_layout)/dashboard/action-queue.tsx`** — new
  `"use client"` `<ActionQueue queue={...} />`. Renders grouped sections
  (Pembayaran / Tagihan / Check-in / Akan Berakhir), each only when it has
  items, with per-row label + sublabel + action button(s). Uses `useConfirm()`
  for Reject and Check-in, `toast` for feedback, `usePermissions().can()` for
  gating, and a per-row pending state (the acting button shows a spinner /
  disables while its server action runs). Empty queue → calm "semua beres" state.

- **`src/app/(internal)/(dashboard_layout)/dashboard/page.tsx`** — add
  `getActionQueue(locationId)` to the existing `Promise.all`, serialize it, pass
  it to `DashboardClient`.

- **`src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx`** —
  accept the new `actionQueue` prop and render `<ActionQueue>` directly under
  `<TodayTasks>`.

- **`src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx`** — add
  two conditional items (Verifikasi, Tolak) to the existing row `ActionMenu`,
  shown only when `row.status` is PENDING, both `disabled: !canManage` with the
  standard tooltip; Tolak uses `variant: "danger"` and a confirm dialog.

- **Help center** (`.../help/help-client.tsx`) — add a "Tindakan Cepat" note to
  the dashboard/daily-workflow section (per the help-center sync rule).

### Types

```ts
type ActionQueueKind = "payment" | "bill" | "checkin" | "expiring";

interface ActionQueueItem {
  kind: ActionQueueKind;
  id: number;                 // payment id / bill id / booking id (per kind)
  primary: string;            // e.g. "Kamar 12 · Budi"
  secondary: string;          // e.g. "Rp1.200.000" / "Jatuh tempo 3 hari lalu"
  bookingId: number;
  tenantId: string;           // needed for one-click check-in
  href: string;               // deep link to the relevant filtered list page
  canEmail?: boolean;         // bills only: tenant has an email address
}

interface ActionQueue {
  payments: ActionQueueItem[];
  bills: ActionQueueItem[];
  checkins: ActionQueueItem[];
  expiring: ActionQueueItem[];
}
```

### The four actions

| Category | Button(s) | Server action | Confirm? | Gate | Notes |
|---|---|---|---|---|---|
| Unverified payment | Verifikasi · Tolak | **new** `setPaymentStatusAction(id, statusId)` | Verify: no · Reject: yes | `payments.manage` | Verify → status VERIFIED + transactions created; Reject → REJECTED + transactions removed |
| Overdue bill | Ingatkan | existing `resendBillEmailAction(billId)` | no | `bills.manage` | Disabled + tooltip when `canEmail === false` ("Penyewa tidak memiliki email") |
| Check-in due | Check-in | existing `checkInOutAction({booking_id, event_type:"CHECK_IN", event_date: today, tenant_id})` | yes | `bookings.manage` | CHECK_IN only writes a `CheckInOutLog`; none of the CHECK_OUT deposit/bill-deletion logic runs |
| Expiring booking | — (Lihat link) | — | — | — | No inline action; links to `/bookings?expiring=1`. Renew is Phase 1.10 |

`checkInOutAction` for CHECK_IN was verified to be low-risk: it creates a single
`CheckInOutLog` row with the booking id, event type, event date, and tenant id.
All deposit transitions, future-bill deletion, and payment reallocation are
inside the `event_type === "CHECK_OUT"` branch only.

## Error Handling

- Every action returns `{ success: boolean; error?: string }`. On failure the
  `<ActionQueue>` / payments table shows an error toast and leaves the row in
  place; on success it shows a success toast and the server revalidation removes
  the row.
- **Bill with no tenant email:** `canEmail` is computed in `getActionQueue`; the
  Ingatkan button renders disabled with an explanatory tooltip, so the failing
  path is prevented in the UI (the server action still guards it).
- **Stale / double click:** a per-row pending flag disables the row's buttons
  while its action is in flight. If the underlying item was already actioned
  elsewhere, the server guard returns an error and the next revalidation drops
  the row.
- **No permission:** buttons render disabled with a tooltip (client), and the
  server action returns `Unauthorized` regardless (defense in depth).
- **Location scope:** `getActionQueue` is location-scoped like the counts;
  every action re-validates the item's location against the user's scope.

## Testing

- **Integration (Vitest, test DB :5433):**
  - `getActionQueue` returns, per category, only location-scoped, non-deleted,
    WIB-correct items, capped at 5; overdue bills are filtered by
    `billOutstanding > 0`; `canEmail` reflects tenant email presence; hit shape
    correct per kind (ids, href, tenantId).
  - `setPaymentStatusAction`: flips `status_id`; creates transactions when the
    new status is VERIFIED and removes them when REJECTED; enforces
    `payments.manage`; rejects an out-of-scope payment for a scoped user.
- **E2E (Playwright, admin session):**
  - Dashboard renders the `Perlu Tindakan` panel with seeded items.
  - Verify a seeded pending payment from the queue → success toast, row clears,
    the unverified-payments count drops.
  - Send a bill reminder → success toast (Mailpit receives it).
  - Check a tenant in → confirm dialog, then row clears and a `CheckInOutLog`
    exists.
  - Reject prompts the confirm dialog before acting.
  - Payments table: a PENDING row shows Verifikasi / Tolak; verifying updates the
    status badge to VERIFIED in place.
  - Onboarding tour suppressed deterministically (`hms_tour_completed`), per the
    established E2E convention.
- Existing suite stays green; all additions are additive.

## Out of Scope (backlog)

- One-click **renew** for expiring bookings (Phase 1.10) — the expiring category
  is navigate-only until then.
- Quick actions for categories beyond the four Today's Tasks counts.
- Bulk actions (verify/remind multiple at once) — single-item only here.
- Optimistic UI / client-side row removal — revalidation handles refresh.
