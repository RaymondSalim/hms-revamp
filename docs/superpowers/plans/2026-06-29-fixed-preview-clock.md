# Fixed Preview Clock (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a central, production-safe business clock that returns a frozen instant when `PREVIEW_NOW` is configured in a non-production environment, propagate it through the existing `businessToday()` helper plus the three server-side reads that bypass it, and show a banner when the clock is frozen.

**Architecture:** A new `clock.ts` exposes `now()` (frozen only when `PREVIEW_NOW` is set AND the environment is not production AND the value parses, else real time). `businessToday()`'s default argument is repointed to `now()`, which propagates the frozen instant to every business-day consumer (all already route through it). Three Category-B sites that read `new Date()` for business-time work are migrated to `now()`. A server-component banner renders in the dashboard layout when the clock is frozen.

**Tech Stack:** Next.js 16 App Router (React 19), TypeScript, Vitest (unit tests). No new dependencies.

## Global Constraints

- **Env var:** `PREVIEW_NOW` = any `Date`-parseable ISO string (recommend explicit `Z`, e.g. `2026-06-15T03:00:00Z`).
- **Production safety (defense in depth, ALL must hold to freeze):** (1) `PREVIEW_NOW` must be set; (2) `isPreviewClockAllowed()` must return true — `VERCEL_ENV === "production"` blocks unconditionally, `NODE_ENV === "production"` blocks unless `PREVIEW_CLOCK_ENABLED === "true"` is also set; (3) the value must parse. On set-but-refused or unparseable → `console.error` + real time (never throw, never silently freeze).
- **No import cycle:** `clock.ts` must NOT import from `business-time.ts`. `business-time.ts` imports `now` from `clock.ts` (one direction only).
- **Default preserves behavior:** with `PREVIEW_NOW` unset, `now()` === `new Date()` and `businessToday()` is byte-identical to today; the existing 332-test suite must stay green.
- **Server-only scope:** only server-side business-time reads change. Client components (date-pickers, header live clock) are out of scope; the banner signals the frozen state.
- **Do NOT migrate Category-C sites** (real-time-correct): logs, cron duration, JWT exp, S3-key timestamps, `deletedAt`/`applied_at`/`refunded_at`/transaction-`date` audit stamps, password-reset token expiry, version route, notes relative-time.
- **Copy:** banner text in Indonesian.

---

### Task 1: Central clock module (`clock.ts`)

**Files:**
- Create: `src/app/_lib/util/clock.ts`
- Test: `tests/unit/clock.test.ts`

**Interfaces:**
- Consumes: `process.env` only (`PREVIEW_NOW`, `VERCEL_ENV`, `NODE_ENV`, `PREVIEW_CLOCK_ENABLED`).
- Produces:
  - `function isPreviewClockAllowed(): boolean`
  - `function isPreviewClockEnabled(): boolean`
  - `function now(): Date`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/clock.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { now, isPreviewClockAllowed, isPreviewClockEnabled } from "@/app/_lib/util/clock";

// Use vi.stubEnv (NOT direct process.env mutation): it handles NODE_ENV (which
// can be read-only in some setups) correctly and is reset by unstubAllEnvs.
// vi.stubEnv(key, undefined) deletes the var. By default vitest sets NODE_ENV
// to "test", so a clean slate already satisfies isPreviewClockAllowed().
describe("clock.now / preview-clock gates", () => {
  beforeEach(() => {
    vi.stubEnv("PREVIEW_NOW", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("PREVIEW_CLOCK_ENABLED", undefined);
    // leave NODE_ENV as vitest's default ("test")
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns real time when PREVIEW_NOW is unset", () => {
    const before = Date.now();
    const t = now().getTime();
    const after = Date.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
    expect(isPreviewClockEnabled()).toBe(false);
  });

  it("returns the frozen instant when PREVIEW_NOW is set and allowed", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    expect(now().toISOString()).toBe("2026-06-15T03:00:00.000Z");
    expect(isPreviewClockEnabled()).toBe(true);
  });

  it("REFUSES on Vercel production even with PREVIEW_NOW set", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("VERCEL_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = Date.now();
    const t = now().getTime();
    expect(t).toBeGreaterThanOrEqual(before);   // real time, not frozen
    expect(isPreviewClockAllowed()).toBe(false);
    expect(isPreviewClockEnabled()).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it("REFUSES on NODE_ENV=production without the explicit opt-in", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isPreviewClockAllowed()).toBe(false);
    const before = Date.now();
    expect(now().getTime()).toBeGreaterThanOrEqual(before);
  });

  it("ALLOWS on NODE_ENV=production WITH the explicit opt-in", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PREVIEW_CLOCK_ENABLED", "true");
    expect(isPreviewClockAllowed()).toBe(true);
    expect(now().toISOString()).toBe("2026-06-15T03:00:00.000Z");
  });

  it("the opt-in does NOT override Vercel production", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PREVIEW_CLOCK_ENABLED", "true");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isPreviewClockAllowed()).toBe(false);
  });

  it("falls back to real time + logs on an unparseable PREVIEW_NOW", () => {
    vi.stubEnv("PREVIEW_NOW", "not-a-date");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = Date.now();
    expect(now().getTime()).toBeGreaterThanOrEqual(before);
    expect(isPreviewClockEnabled()).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/clock.test.ts`
Expected: FAIL — cannot import from `@/app/_lib/util/clock` (module does not exist).

- [ ] **Step 3: Implement `clock.ts`**

Create `src/app/_lib/util/clock.ts`:

```ts
// The single wall-clock entry point for BUSINESS time. Real time by default;
// returns a FROZEN instant only when PREVIEW_NOW is set in a non-production
// environment. MUST NOT import from business-time.ts (avoid a cycle).

/** True only when freezing the clock is permitted in this environment. */
export function isPreviewClockAllowed(): boolean {
  // Hard refusal in production. Vercel production blocks unconditionally; a
  // generic prod box (NODE_ENV=production, e.g. Docker/VPS) blocks unless an
  // explicit staging opt-in is set in tandem — a real production config would
  // never set PREVIEW_CLOCK_ENABLED.
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.NODE_ENV === "production" && process.env.PREVIEW_CLOCK_ENABLED !== "true") {
    return false;
  }
  return true;
}

/** Parsed PREVIEW_NOW epoch ms, or NaN when unset/unparseable. */
function previewInstantMs(): number {
  const raw = process.env.PREVIEW_NOW;
  if (!raw) return NaN;
  return new Date(raw).getTime();
}

/** Whether the business clock is currently frozen (drives the banner). */
export function isPreviewClockEnabled(): boolean {
  if (!process.env.PREVIEW_NOW) return false;
  if (!isPreviewClockAllowed()) return false;
  return !Number.isNaN(previewInstantMs());
}

/**
 * The business "now". Returns the frozen PREVIEW_NOW instant when set, allowed,
 * and valid; real time otherwise. Never throws. Logs loudly when a configured
 * PREVIEW_NOW is refused (production) or unparseable, so a misconfig is visible
 * rather than silently changing the clock.
 */
export function now(): Date {
  const raw = process.env.PREVIEW_NOW;
  if (!raw) return new Date();
  if (!isPreviewClockAllowed()) {
    console.error("[clock] PREVIEW_NOW ignored: refusing to override clock in production");
    return new Date();
  }
  const ms = new Date(raw).getTime();
  if (Number.isNaN(ms)) {
    console.error(`[clock] PREVIEW_NOW is not a valid date: "${raw}" — using real time`);
    return new Date();
  }
  return new Date(ms);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/clock.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/_lib/util/clock.ts tests/unit/clock.test.ts
git commit -m "feat: central production-safe business clock (PREVIEW_NOW)"
```

---

### Task 2: Repoint `businessToday()` to the central clock

**Files:**
- Modify: `src/app/_lib/util/business-time.ts:24`
- Test: `tests/unit/business-time.test.ts` (add one case)

**Interfaces:**
- Consumes: `now` from `@/app/_lib/util/clock` (Task 1).
- Produces: `businessToday(now?: Date)` unchanged signature; only the default arg source changes.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/business-time.test.ts` (inside the existing `describe("businessToday", ...)` block, or a new `describe`):

```ts
  // Add `vi` to the existing top import: `import { describe, it, expect, vi } from "vitest";`
  it("argless businessToday() reflects a frozen PREVIEW_NOW", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z"); // 10:00 WIB → business day 2026-06-15
    try {
      // 03:00Z + 7h = 10:00 WIB on the 15th.
      expect(businessToday().toISOString()).toBe("2026-06-15T00:00:00.000Z");
    } finally {
      vi.unstubAllEnvs();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/business-time.test.ts`
Expected: FAIL — argless `businessToday()` still uses `new Date()` (real time), so the assertion against the frozen date fails.

- [ ] **Step 3: Implement the change**

In `src/app/_lib/util/business-time.ts`, add the import at the top (after the file's opening comment block, before `BUSINESS_UTC_OFFSET_HOURS`):

```ts
import { now as clockNow } from "@/app/_lib/util/clock";
```

Then change the default argument on line 24 only:

```ts
export function businessToday(now: Date = clockNow()): Date {
```

(The function body is unchanged. The parameter is still named `now` so all explicit-argument callers and existing tests are unaffected.)

- [ ] **Step 4: Run the FULL unit suite to verify pass + no regression**

Run: `npx vitest run tests/unit/business-time.test.ts`
Expected: PASS including the new case.

Then confirm no business-logic regression across the suite (this change touches a widely-used helper):

Run: `docker compose -f docker-compose.test.yml up -d test-db && npx vitest run`
Expected: all green (332 + the 2 new clock/business-time cases = 334).

- [ ] **Step 5: Commit**

```bash
git add src/app/_lib/util/business-time.ts tests/unit/business-time.test.ts
git commit -m "feat: route businessToday() through the central clock"
```

---

### Task 3: Migrate the three Category-B server-side reads

**Files:**
- Modify: `src/app/_lib/util/financial-summary.ts:23`
- Modify: `src/app/_db/dashboard.ts:103`
- Modify: `src/app/api/financials/summary/route.ts:22-23`
- Test: `tests/integration/preview-clock-propagation.test.ts` (create)

**Interfaces:**
- Consumes: `now` from `@/app/_lib/util/clock`.
- Produces: no new exports; these three modules now read business "now" through `now()`.

> These are the only server-side business-time reads that bypass `businessToday()` (per the spec audit). Each currently calls `new Date()` to mean "now" for a business decision (reporting window origin / upcoming-events cutoff / default report range).

- [ ] **Step 1: Write the failing test**

Create `tests/integration/preview-clock-propagation.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { getUpcomingEvents } from "@/app/_db/dashboard";

// dashboard.getUpcomingEvents filters `start >= now`. With the clock frozen to a
// past instant, an event in the frozen-future must be INCLUDED even if it is in
// the real-world past.
describe("preview clock propagates to dashboard upcoming-events cutoff", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
    vi.stubEnv("PREVIEW_NOW", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes an event after the frozen now but before real now", async () => {
    // Freeze to 2020-01-01. An event dated 2020-06-01 is in the frozen-future
    // (so it should appear) but in the real-world past (so without the clock it
    // would be filtered out).
    vi.stubEnv("PREVIEW_NOW", "2020-01-01T00:00:00Z");
    await testPrisma.event.create({
      data: { title: "Frozen-future event", start: new Date("2020-06-01T00:00:00Z") },
    });

    const events = await getUpcomingEvents();
    expect(events.some((e) => e.title === "Frozen-future event")).toBe(true);
  });

  it("excludes that same event when the clock is NOT frozen", async () => {
    // PREVIEW_NOW already unset by beforeEach.
    await testPrisma.event.create({
      data: { title: "Real-past event", start: new Date("2020-06-01T00:00:00Z") },
    });
    const events = await getUpcomingEvents();
    expect(events.some((e) => e.title === "Real-past event")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/preview-clock-propagation.test.ts`
Expected: the first test FAILS (the event is excluded because `dashboard.ts` still uses `new Date()` = real time, which is past 2020-06-01). The second test passes.

- [ ] **Step 3: Migrate `dashboard.ts`**

In `src/app/_db/dashboard.ts`, add the import near the existing imports at the top:

```ts
import { now } from "@/app/_lib/util/clock";
```

Change line 103 from:

```ts
    where: { start: { gte: new Date() } },
```

to:

```ts
    where: { start: { gte: now() } },
```

- [ ] **Step 4: Migrate `financial-summary.ts`**

In `src/app/_lib/util/financial-summary.ts`, add the import at the top:

```ts
import { now as clockNow } from "@/app/_lib/util/clock";
```

Change line 23 from:

```ts
  const now = new Date();
```

to:

```ts
  const now = clockNow();
```

(The local variable stays named `now`; only its source changes. The rest of the function is unchanged.)

- [ ] **Step 5: Migrate `api/financials/summary/route.ts`**

In `src/app/api/financials/summary/route.ts`, add the import at the top:

```ts
import { now } from "@/app/_lib/util/clock";
```

Change lines 22-23 from:

```ts
  const startDate = new Date(searchParams.get("startDate") ?? new Date().toISOString());
  const endDate = new Date(searchParams.get("endDate") ?? new Date().toISOString());
```

to:

```ts
  const startDate = new Date(searchParams.get("startDate") ?? now().toISOString());
  const endDate = new Date(searchParams.get("endDate") ?? now().toISOString());
```

- [ ] **Step 6: Run the propagation test + tsc to verify pass**

Run: `npx vitest run tests/integration/preview-clock-propagation.test.ts`
Expected: PASS (2 tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/_db/dashboard.ts src/app/_lib/util/financial-summary.ts src/app/api/financials/summary/route.ts tests/integration/preview-clock-propagation.test.ts
git commit -m "feat: route the three bypassing server reads through the central clock"
```

---

### Task 4: Frozen-clock banner

**Files:**
- Create: `src/app/_components/preview-clock-banner.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/layout.tsx` (mount the banner above `<Header />`)
- Test: `tests/unit/preview-clock-banner.test.ts` (predicate-level)

**Interfaces:**
- Consumes: `isPreviewClockEnabled`, `now` from `@/app/_lib/util/clock`; `businessToday`, `formatUtcDate` from `@/app/_lib/util/business-time`.
- Produces: `function PreviewClockBanner(): React.ReactElement | null` (server component — renders `null` when the clock is not frozen).

> The banner is a SERVER component because the gate reads a non-`NEXT_PUBLIC_` env var, which client components cannot see. It is mounted in the (server) dashboard layout, not in the (client) `header.tsx`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/preview-clock-banner.test.ts` (the banner's user-visible behavior is "shows iff the clock is frozen" — assert the gating predicate the component uses, since there is no server-component render harness):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isPreviewClockEnabled } from "@/app/_lib/util/clock";

describe("banner gating predicate", () => {
  beforeEach(() => {
    vi.stubEnv("PREVIEW_NOW", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("PREVIEW_CLOCK_ENABLED", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("banner hidden when clock not frozen", () => {
    expect(isPreviewClockEnabled()).toBe(false);
  });

  it("banner shown when frozen + allowed", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    expect(isPreviewClockEnabled()).toBe(true);
  });

  it("banner hidden in production even if PREVIEW_NOW set", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T03:00:00Z");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isPreviewClockEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/preview-clock-banner.test.ts`
Expected: PASS already (it asserts `isPreviewClockEnabled` from Task 1). This is the guard test for the component's gate — if Task 1 is present it passes; it exists to lock the banner's show/hide contract. If you are doing strict TDD and want a failing-first signal, write the component import in the test first; otherwise proceed — the component itself is verified by tsc + manual smoke. (No server-component render harness exists in this repo.)

- [ ] **Step 3: Implement the banner component**

Create `src/app/_components/preview-clock-banner.tsx`:

```tsx
import { isPreviewClockEnabled } from "@/app/_lib/util/clock";
import { businessToday, formatUtcDate } from "@/app/_lib/util/business-time";

/**
 * Server component. Renders a slim amber banner indicating the app's business
 * clock is FROZEN to a fixed date (preview/staging only). Returns null in
 * production or whenever the clock is not frozen, so it has zero footprint
 * outside preview environments.
 */
export function PreviewClockBanner() {
  if (!isPreviewClockEnabled()) return null;
  const label = formatUtcDate(businessToday());
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium shrink-0"
      style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
      <span>Mode uji — waktu sistem dibekukan pada {label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Mount in the dashboard layout**

In `src/app/(internal)/(dashboard_layout)/layout.tsx`:

Add the import near the other component imports:

```ts
import { PreviewClockBanner } from "@/app/_components/preview-clock-banner";
```

Render it as the first child of the content column, directly above `<Header />`. Change:

```tsx
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
```

to:

```tsx
            <div className="flex flex-1 flex-col overflow-hidden">
              <PreviewClockBanner />
              <Header />
```

- [ ] **Step 5: Verify tsc + banner test**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run tests/unit/preview-clock-banner.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/preview-clock-banner.tsx "src/app/(internal)/(dashboard_layout)/layout.tsx" tests/unit/preview-clock-banner.test.ts
git commit -m "feat: frozen-clock banner in the dashboard layout"
```

---

### Task 5: Documentation note (help center + rollout)

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/help/help-client.tsx` (one note, only if the banner is user-facing enough to explain — see step)

**Interfaces:** none.

> This feature is operational/testing infrastructure, not a day-to-day staff feature, so the help-center touch is minimal: a single line so a tester who sees the amber banner understands it. No new section.

- [ ] **Step 1: Add a help-center line**

In `src/app/(internal)/(dashboard_layout)/help/help-client.tsx`, inside the `faq` section's `content` array, add one entry:

```ts
      "T: Apa arti banner kuning 'Mode uji — waktu sistem dibekukan'?\nJ: Pada lingkungan uji coba (preview), waktu sistem sengaja dibekukan pada tanggal tertentu agar data contoh dan pengujian konsisten. Banner ini tidak akan pernah muncul di lingkungan produksi.",
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/help/help-client.tsx"
git commit -m "docs: help-center note for the preview-clock banner"
```

---

## Final Verification (whole-branch)

- `npx tsc --noEmit` clean.
- `npx vitest run` — full suite green (332 existing + clock 7 + business-time 1 + propagation 2 + banner 3 = 345), with `PREVIEW_NOW` unset so the default path is exercised.
- Manual smoke (local dev): start the app with `PREVIEW_NOW=2026-06-15T03:00:00Z npm run dev` → the amber "Mode uji" banner shows with date 15 Jun 2026; dashboard "today"-derived widgets (Today's Tasks, action queue) compute against the frozen date. Then start without the var → no banner, real time.
- Confirm refusal: `PREVIEW_NOW=2026-06-15T03:00:00Z VERCEL_ENV=production NODE_ENV=production npm run build && <run>` → banner absent, a `[clock]` error logged, real time used. (Or assert via the unit tests, which already cover this.)

## Notes for the PR

Per the standing instruction, the PR description must end with a `## Manual Test Checklist`: (1) app with `PREVIEW_NOW` set shows the banner + frozen date and "today" widgets reflect it; (2) app without it shows no banner + real time; (3) with `VERCEL_ENV=production` + `PREVIEW_NOW` set, banner absent + real time + `[clock]` error logged; (4) unparseable `PREVIEW_NOW` falls back to real time with a logged error; (5) full existing suite still green (no regression from the `businessToday` default change).

## Dependency note

Sub-project B (large-scale, real-logic seed) is a SEPARATE spec/plan, built on this clock. It will read the same `PREVIEW_NOW` as its anchor and drive all data (bookings, payments, deposits, check-ins, late-fee + status-sync crons) through the real application services. Do not start B here.
