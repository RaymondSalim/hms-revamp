# Dashboard De-duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `/dashboard` so Today's Tasks is the sole action zone and the area below shows each health/activity fact exactly once — collapsing the three room cards into one occupancy card, demoting realized check-in/out to a thin activity line, and removing the "Tagihan Belum Lunas" table (and its now-dead query).

**Architecture:** Presentational reorganization of the dashboard server component + client component, plus removal of one now-unused DB query. No new queries, no new data — net removal of UI and one `Promise.all` entry.

**Tech Stack:** Next.js 16 App Router (React 19), TypeScript, Playwright E2E (e2e DB :5434).

## Global Constraints

- Indonesian-language UI. Exact copy: occupancy card label "Tingkat Hunian"; occupancy subtitle `"{occupied} terisi · {available} tersedia · {maintenance} maintenance"`; activity line `"Aktivitas hari ini: {checkIns} check-in · {checkOuts} check-out"`.
- Today's Tasks panel, Pembayaran Terbaru table, and Acara Mendatang are UNCHANGED.
- No new queries. `getCheckInOutCounts`, `getRoomStats`, `getOccupancyRate`, `getRecentPayments`, `getUpcomingEvents`, `getTodayTaskCounts` all stay (still feed surviving UI). `getOutstandingBills` is removed (no other caller — verified 2026-06-26).
- Theming via existing CSS variables + inline styles (existing pattern). No new styling system.
- The existing suite (317 unit/integration + 22 E2E) must stay green.

---

### Task 1: Reorganize the dashboard, remove duplication

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/dashboard/page.tsx`
- Modify: `src/app/_db/dashboard.ts` (remove dead `getOutstandingBills`)
- Test: `e2e/specs/dashboard-tasks.spec.ts` (extend with layout assertions)

**Interfaces:**
- Consumes: existing `getCheckInOutCounts`, `getRoomStats`, `getOccupancyRate`, `getRecentPayments`, `getUpcomingEvents`, `getTodayTaskCounts`; the existing local `StatCard`, `TodayTasks`, `StatusBadge` components and `RecentPayment`/`UpcomingEvent` types in `dashboard-client.tsx`.
- Produces: a slimmer `DashboardClientProps` (no `outstandingBills`); `dashboard.ts` no longer exports `getOutstandingBills`.

- [ ] **Step 1: Update the E2E spec first (failing layout assertions)**

Extend `e2e/specs/dashboard-tasks.spec.ts` with a new test asserting the de-duplicated layout. Append this test inside the existing `test.describe("Dashboard Today's Tasks panel", ...)` block (before its closing `});`):

```ts
  test("dashboard shows each fact once (no duplicate cards/tables)", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    const main = page.getByRole("main");

    // Single occupancy card (replaces the three room cards).
    await expect(main.getByText("Tingkat Hunian")).toHaveCount(1);

    // Thin activity line for realized check-in/out.
    await expect(main.getByText(/Aktivitas hari ini:/)).toBeVisible();

    // "Check-in Hari Ini" now appears ONCE — only the task tile, not also a stat card.
    await expect(main.getByText("Check-in Hari Ini")).toHaveCount(1);

    // The Outstanding Bills table is gone (covered by the Tagihan Terlambat tile).
    await expect(main.getByText("Tagihan Belum Lunas")).toHaveCount(0);

    // Recent payments table is retained.
    await expect(main.getByRole("heading", { name: "Pembayaran Terbaru" })).toBeVisible();
  });
```

- [ ] **Step 2: Run the new E2E test to verify it fails**

Ensure the e2e DB is up (`docker compose -f docker-compose.test.yml up -d e2e-db`). Then:
Run: `npx playwright test --config e2e/playwright.config.ts dashboard-tasks -g "each fact once"`
Expected: FAIL — currently "Check-in Hari Ini" matches 2 elements (tile + stat card), "Tingkat Hunian" still renders, and "Tagihan Belum Lunas" is present. (First dev-server compile is slow; config allows 120s.)

- [ ] **Step 3: Remove the `outstandingBills` plumbing in `page.tsx`**

In `src/app/(internal)/(dashboard_layout)/dashboard/page.tsx`:

Change the import block (remove `getOutstandingBills` and the `OutstandingBill` type):

```tsx
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import {
  getCheckInOutCounts,
  getRoomStats,
  getOccupancyRate,
  getRecentPayments,
  getUpcomingEvents,
} from "@/app/_db/dashboard";
import { getTodayTaskCounts } from "@/app/_db/today-tasks";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { DashboardClient, type RecentPayment, type UpcomingEvent } from "./dashboard-client";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
```

Change the `Promise.all` (drop `getOutstandingBills`):

```tsx
  const [checkInOutCounts, roomStats, occupancy, recentPayments, upcomingEvents, todayTasks] =
    await Promise.all([
      getCheckInOutCounts(locationId),
      getRoomStats(locationId),
      getOccupancyRate(locationId),
      getRecentPayments(locationId),
      getUpcomingEvents(),
      getTodayTaskCounts(locationId),
    ]);
```

Change the render (drop the `outstandingBills` prop):

```tsx
  return (
    <DashboardClient
      checkInOutCounts={checkInOutCounts}
      roomStats={roomStats}
      occupancy={occupancy}
      recentPayments={serializeForClient(recentPayments) as unknown as RecentPayment[]}
      upcomingEvents={serializeForClient(upcomingEvents) as unknown as UpcomingEvent[]}
      todayTasks={todayTasks}
    />
  );
```

- [ ] **Step 4: Update `dashboard-client.tsx` — props/types**

In `src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx`:

Delete the `OutstandingBill` interface (the `export interface OutstandingBill { ... }` block).

Remove `outstandingBills` from `DashboardClientProps`:

```tsx
interface DashboardClientProps {
  checkInOutCounts: CheckInOutCounts;
  roomStats: RoomStats;
  occupancy: Occupancy;
  recentPayments: RecentPayment[];
  upcomingEvents: UpcomingEvent[];
  todayTasks: TodayTaskCounts;
}
```

Remove `outstandingBills` from the destructured params of `DashboardClient`:

```tsx
export function DashboardClient({
  checkInOutCounts,
  roomStats,
  occupancy,
  recentPayments,
  upcomingEvents,
  todayTasks,
}: DashboardClientProps) {
```

- [ ] **Step 5: Update `dashboard-client.tsx` — replace the stat-card grid with one occupancy card + activity line**

Replace the entire `{/* Overview Cards */}` block (the `<div data-tour="dashboard-stats" ...>` grid containing the five `StatCard`s) with a single occupancy card followed by a thin activity line:

```tsx
      {/* Occupancy — single card (was three room cards) */}
      <div data-tour="dashboard-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Tingkat Hunian"
          value={`${occupancy.rate}%`}
          subtitle={`${roomStats.occupied} terisi · ${roomStats.available} tersedia · ${roomStats.maintenance} maintenance`}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
      </div>

      {/* Realized check-in/out today — passive activity line, not a stat card */}
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Aktivitas hari ini: {checkInOutCounts.checkIns} check-in · {checkInOutCounts.checkOuts} check-out
      </p>
```

> The occupancy card reuses the existing local `StatCard`. The `data-tour="dashboard-stats"` attribute moves onto the occupancy card's wrapper so the existing product-tour step still anchors to a real element. `checkInOutCounts` and `roomStats` are still consumed (activity line + occupancy subtitle), so no prop becomes unused.

- [ ] **Step 6: Update `dashboard-client.tsx` — delete the Outstanding Bills table**

Delete the entire `{/* Outstanding Bills */}` block — the `<div className="rounded-xl border p-6" ...>` containing the `<h2>Tagihan Belum Lunas</h2>` heading and its table (the `outstandingBills.length === 0 ? ... : ...` markup). Leave the `{/* Recent Payments */}` block above it and the `{/* Upcoming Events */}` block below it untouched.

After this deletion, `outstandingBills` and the per-row `total/paid/outstanding` computation it contained are gone; confirm no other reference to `outstandingBills` remains in the file.

- [ ] **Step 7: Remove the dead `getOutstandingBills` query**

In `src/app/_db/dashboard.ts`, delete the entire `export async function getOutstandingBills(locationId: number, limit = 5) { ... }` function (it has no remaining caller). Leave `getCheckInOutCounts`, `getRoomStats`, `getOccupancyRate`, `getRecentPayments`, `getUpcomingEvents`, and everything else unchanged.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Catches any dangling `outstandingBills` / `OutstandingBill` / `getOutstandingBills` reference.)

- [ ] **Step 9: Run the dashboard E2E to verify the new layout passes**

Run: `npx playwright test --config e2e/playwright.config.ts dashboard-tasks`
Expected: PASS (the original 2 tests + the new layout test = 3, plus auth setup).

- [ ] **Step 10: Run the full suites to confirm no regression**

Run: `npx vitest run`
Expected: PASS (317; no unit test referenced `getOutstandingBills`).
Run: `npx playwright test --config e2e/playwright.config.ts`
Expected: PASS (23 = prior 22 + 1 new).

- [ ] **Step 11: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/dashboard/dashboard-client.tsx" \
  "src/app/(internal)/(dashboard_layout)/dashboard/page.tsx" \
  src/app/_db/dashboard.ts \
  e2e/specs/dashboard-tasks.spec.ts
git commit -m "refactor: de-duplicate dashboard — single occupancy card, activity line, drop outstanding-bills table"
```

---

## Final Verification (after the task)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx vitest run` — 317 pass.
- [ ] `npx playwright test --config e2e/playwright.config.ts` — 23 pass.
- [ ] Manual smoke (optional): on `/dashboard`, confirm Today's Tasks is on top; below it a single "Tingkat Hunian" card with the "N terisi · N tersedia · N maintenance" subtitle; a thin "Aktivitas hari ini: …" line; the Pembayaran Terbaru table; Acara Mendatang. Confirm "Check-in Hari Ini" appears only once (the task tile) and there is no "Tagihan Belum Lunas" table.
