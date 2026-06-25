# Dashboard De-duplication — Design Spec

**Date:** 2026-06-26
**Status:** Approved (pending spec review)
**Context:** Follow-up to Phase 1.6 (Today's Tasks widget, PR #13). The new task panel introduced overlap with the pre-existing stat cards and tables.

## Problem

After the Today's Tasks panel shipped, `/dashboard` shows the same information in
two places, and in one case with two *different* numbers under the same label:

1. **"Check-in Hari Ini"** appears in BOTH the Today's Tasks panel and the stat
   cards — with different meanings: the task tile counts arrivals **due** today and
   not yet checked in; the stat card counts **realized** check-ins today
   (CheckInOutLog rows). Same label, two numbers — confusing.
2. **Occupancy is triple-counted.** Three stat cards ("Kamar Tersedia", "Kamar
   Terisi", "Tingkat Hunian") encode one fact sliced three ways — available,
   occupied, and the ratio that is literally derived from them.
3. **"Tagihan Belum Lunas"** table (oldest unpaid bills) overlaps the **"Tagihan
   Terlambat"** task tile (overdue count + drill-down).

## Goal

Reorganize the dashboard around one rule: **Today's Tasks is the action zone
(loud, on top); everything below is passive health/activity, each fact shown
exactly once.** Remove all duplication. This is a presentational reorganization —
no new queries, net removal of UI and one query call.

## New Structure (top → bottom)

1. **Today's Tasks** — the four tiles, **unchanged**. Sole home for actionable items.
2. **Occupancy card (single)** — replaces the three room cards. One card:
   - Value: `{occupancy.rate}%`, label "Tingkat Hunian".
   - Subtitle: `"{roomStats.occupied} terisi · {roomStats.available} tersedia · {roomStats.maintenance} maintenance"`.
   - Reuses existing `roomStats` + `occupancy.rate`. No new query.
3. **Activity line (thin)** — a single compact, muted line (NOT stat cards):
   - `"Aktivitas hari ini: {checkInOutCounts.checkIns} check-in · {checkInOutCounts.checkOuts} check-out"`.
   - Realized counts from the existing `checkInOutCounts`. Secondary text, small —
     visibly passive, not competing with the action tiles.
4. **Pembayaran Terbaru** — recent payments table, **unchanged** (passive activity log).
5. **Acara Mendatang** — upcoming events, **unchanged**.

### Removed
- The realized "Check-in Hari Ini" stat card (duplicate label, different number).
- The standalone "Check-out Hari Ini" stat card (folded into the activity line).
- "Kamar Tersedia" and "Kamar Terisi" stat cards (folded into the occupancy card).
- The entire "Tagihan Belum Lunas" table (covered by the "Tagihan Terlambat" tile →
  `/bills?overdue=1` drill-down; detail lives on the bills page).

## Architecture & Data Flow

No new queries. Net removal.

- **`dashboard-client.tsx`:** replace the 5-card `grid` with one occupancy card +
  the activity line; delete the "Tagihan Belum Lunas" `<div>` block; remove the
  `outstandingBills` prop from `DashboardClientProps` and the `OutstandingBill`
  interface. The occupancy card reuses the existing local `StatCard` component
  (value = rate%, subtitle = the composed string). The activity line is plain
  inline markup using existing CSS variables (`--color-text-secondary`), placed
  between the occupancy card and the Pembayaran Terbaru table.
- **`dashboard/page.tsx`:** remove `getOutstandingBills` from the import and the
  `Promise.all`, and drop the `outstandingBills={...}` prop. Keep
  `getCheckInOutCounts`, `getRoomStats`, `getOccupancyRate`, `getRecentPayments`,
  `getUpcomingEvents`, `getTodayTaskCounts` — all still feed surviving UI.
- **`dashboard.ts`:** `getOutstandingBills` has no other caller (verified
  2026-06-25) — remove it as dead code. `getCheckInOutCounts`, `getRoomStats`,
  `getOccupancyRate`, `getRecentPayments` all stay (still used).

## Error Handling

- Unchanged from today. The dashboard already early-returns a "no location" message
  before any fetch; the surviving cards/line render normally otherwise.
- Empty data: occupancy with zero rooms already returns `rate: 0` (existing
  `getOccupancyRate` behavior); the activity line shows `0 check-in · 0 check-out`;
  Pembayaran Terbaru already has its empty state.

## Testing

Presentational change — no new unit logic.

- Extend the existing `e2e/specs/dashboard-tasks.spec.ts` to assert the new layout:
  - the single occupancy card renders (heading/label "Tingkat Hunian" visible);
  - the activity line renders (text matching `/Aktivitas hari ini/`);
  - the duplicate is gone: the dashboard `<main>` has exactly ONE element matching
    "Check-in Hari Ini" (the task tile), not two;
  - the "Tagihan Belum Lunas" table is gone (`getByText("Tagihan Belum Lunas")`
    has count 0).
- `npx tsc --noEmit` clean (removing the prop/type must not leave dangling refs).
- Existing suite (317 unit/integration + 22 E2E) stays green; if any test referenced
  `getOutstandingBills`, it would have been caught by the caller grep (none found).

## Out of Scope

- Restyling the Today's Tasks tiles, the Pembayaran Terbaru table, or Acara
  Mendatang.
- Any new metrics or queries.
- The `billOutstanding` soft-delete-allocation follow-up noted in PR #13 (separate).
