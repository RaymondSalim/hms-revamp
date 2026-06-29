# Large-Scale, Real-Logic Seed (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-built `prisma/seed-mock.ts` with a modular, deterministic generator under `prisma/seed/` that produces ~300 rooms / ~1000 tenants spanning past/current/future relative to `PREVIEW_NOW`, derives all financial state through the REAL application services, and pins a ≥2-per-scenario anchor matrix so the E2E suite stays green.

**Architecture:** A seeded PRNG drives all generation (no `Math.random`/`Date.now`/argless `new Date`). `PREVIEW_NOW` → `SEED_NOW` anchors all dates. Raw entities (locations, rooms, tenants, bookings) are generated, then bills/payments/transactions/penalties/statuses are DERIVED by calling the real services (`bill-generation`, `payment-allocation`, `createOrUpdatePaymentTransactions`, `runLateFees`, `runBookingStatusSync`) exactly as production does. A fixed anchor matrix is created first so the E2E contract holds.

**Tech Stack:** TypeScript, Prisma 6 / Postgres, `tsx` (seed runner), Vitest (integration tests, test DB :5433). No new runtime dependencies.

## Global Constraints

- **Determinism:** seeded PRNG (`mulberry32`) with a fixed default seed (overridable via `SEED_RNG_SEED`). NO `Math.random()`, NO `Date.now()`, NO argless `new Date()` anywhere in `prisma/seed/`. Same `PREVIEW_NOW` + same seed → byte-identical DB.
- **Anchor (`SEED_NOW`):** read `PREVIEW_NOW` (same var as the clock); fall back to today's real date (midnight-UTC) when unset. All generated dates derive from `SEED_NOW` via month/day offset helpers (reuse `business-time.ts` helpers: `startOfUtcMonth`, `addUtcMonths`, `startOfUtcDay`).
- **Real logic everywhere:** derive bills/allocations/transactions/penalties/status via the real services. NEVER hand-compute financial output. NEVER call the server *actions* (`upsertPaymentAction`, `checkInOutAction`, `setPaymentStatusAction`) — they need session/request context. Check-ins are written as `CheckInOutLog` rows directly.
- **Invoice determinism:** bill derivation runs SEQUENTIALLY in booking-id order (invoice numbering is atomic but order-sensitive). Concurrency only for raw inserts / non-invoice-numbered work.
- **≥2 anchors per scenario:** the fixed matrix (active/past/future/pending/cancelled/rolling/overdue/pending-payment/rejected/partial/each deposit status/both locations) each has at least two pinned records, never PRNG-derived.
- **E2E contract:** must preserve tenant "Ahmad Wijaya", invoice prefix "INV/SDK", room "A3" (Kemang), logins `admin@micasasuites.com` / `viewer@micasasuites.com`, and ≥1 PENDING payment in Sudirman.
- **Production guard:** abort if `NODE_ENV === "production"` unless `SEED_FORCE === "true"`.
- **No imports from `tests/`** in `prisma/seed/`. The seed owns its truncate (a seed-local helper).
- **Reuse, don't duplicate:** `reference.ts` reuses `seedRbac(prisma)` from `prisma/seed-rbac.ts`.
- **Scale:** ~300 rooms / ~1000 tenants; distribution ~60% active, ~20% past/completed, ~10% future, ~10% pending/cancelled.
- **Copy:** Indonesian names/strings (match the existing seed's style).
- The old `prisma/seed-mock.ts` is DELETED; the `seed:mock` npm script repoints to `prisma/seed/index.ts`. `prisma/seed.ts`, `prisma-seed`, `db:setup` untouched.

**Reference:** the existing `prisma/seed-mock.ts` (until deleted in the final task) is the source of truth for valid Prisma field shapes per entity (room types, durations, pricing matrix, deposits, add-ons, billing policies, settings, email templates). Implementers should read it for exact field combinations rather than re-deriving the schema.

---

### Task 1: Seeded PRNG + generators (`rng.ts`)

**Files:**
- Create: `prisma/seed/rng.ts`
- Test: `tests/integration/seed/rng.test.ts`

**Interfaces:**
- Produces:
  - `class Rng { constructor(seed: number); next(): number; int(min: number, max: number): number; pick<T>(arr: readonly T[]): T; weighted<T>(entries: ReadonlyArray<[T, number]>): T; bool(pTrue: number): boolean; }`
  - `function makeRng(seed?: number): Rng` (default seed `0x484D53` = "HMS")
  - Deterministic data generators (each takes an `Rng`): `genName(rng): string`, `genPhone(rng): string`, `genEmail(rng, name): string`, `genIdNumber(rng): string`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/seed/rng.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "../../../prisma/seed/rng";

describe("seeded Rng", () => {
  it("is deterministic for the same seed", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = Array.from({ length: 5 }, () => makeRng(1).next());
    const b = Array.from({ length: 5 }, () => makeRng(2).next());
    expect(a).not.toEqual(b);
  });

  it("int() stays within [min,max] and is deterministic", () => {
    const r = makeRng(7);
    const vals = Array.from({ length: 100 }, () => r.int(5, 9));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...vals)).toBeLessThanOrEqual(9);
    expect(makeRng(7).int(5, 9)).toBe(makeRng(7).int(5, 9));
  });

  it("pick() and weighted() are deterministic and in-range", () => {
    const r1 = makeRng(42);
    const r2 = makeRng(42);
    expect(r1.pick(["a", "b", "c"])).toBe(r2.pick(["a", "b", "c"]));
    const w1 = makeRng(9).weighted([["x", 1], ["y", 9]]);
    const w2 = makeRng(9).weighted([["x", 1], ["y", 9]]);
    expect(w1).toBe(w2);
    expect(["x", "y"]).toContain(w1);
  });

  it("data generators are deterministic and well-formed", () => {
    const { genName, genPhone, genEmail, genIdNumber } = require("../../../prisma/seed/rng");
    const r1 = makeRng(5); const r2 = makeRng(5);
    const n1 = genName(r1); const n2 = genName(r2);
    expect(n1).toBe(n2);
    expect(n1.length).toBeGreaterThan(0);
    const p = genPhone(makeRng(1));
    expect(p).toMatch(/^08\d{8,}$/);
    const email = genEmail(makeRng(1), "Budi Santoso");
    expect(email).toContain("@");
    expect(genIdNumber(makeRng(1))).toMatch(/^\d{10,}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.test.yml up -d test-db && npx vitest run tests/integration/seed/rng.test.ts`
Expected: FAIL — `prisma/seed/rng` does not exist. (No DB actually needed for this test, but the command is harmless.)

- [ ] **Step 3: Implement `rng.ts`**

Create `prisma/seed/rng.ts`:

```ts
// Deterministic seeded PRNG for reproducible seed data. No Math.random anywhere.
// mulberry32: a fast, well-distributed 32-bit generator.

export class Rng {
  private state: number;
  constructor(seed: number) {
    // Force to a 32-bit unsigned int.
    this.state = seed >>> 0;
  }
  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  /** Weighted pick: entries are [value, weight]; weight > 0. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.next() * total;
    for (const [value, w] of entries) {
      roll -= w;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
  }
  /** True with probability pTrue in [0,1]. */
  bool(pTrue: number): boolean {
    return this.next() < pTrue;
  }
}

export function makeRng(seed = 0x484d53): Rng {
  return new Rng(seed);
}

const FIRST_NAMES = [
  "Budi", "Siti", "Andi", "Dewi", "Eka", "Fajar", "Gita", "Hadi", "Indah",
  "Joko", "Kartika", "Lestari", "Made", "Nadia", "Putu", "Rina", "Sari",
  "Taufik", "Umar", "Vina", "Wawan", "Yuni", "Agus", "Bayu", "Citra", "Dian",
];
const LAST_NAMES = [
  "Santoso", "Wijaya", "Pratama", "Kusuma", "Hidayat", "Nugroho", "Saputra",
  "Halim", "Wibowo", "Permana", "Utami", "Setiawan", "Maulana", "Suryani",
  "Gunawan", "Iskandar", "Rahmawati", "Firmansyah", "Anggraini", "Lesmana",
];

export function genName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export function genPhone(rng: Rng): string {
  // 08 + 8-10 more digits.
  const len = rng.int(8, 10);
  let s = "08";
  for (let i = 0; i < len; i++) s += String(rng.int(0, 9));
  return s;
}

export function genEmail(rng: Rng, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, ".");
  return `${slug}${rng.int(1, 999)}@example.com`;
}

export function genIdNumber(rng: Rng): string {
  // 16-digit NIK-like string.
  let s = "";
  for (let i = 0; i < 16; i++) s += String(rng.int(0, 9));
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/seed/rng.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed/rng.ts tests/integration/seed/rng.test.ts
git commit -m "feat(seed): deterministic seeded PRNG + data generators"
```

---

### Task 2: Date anchor + offset helpers (`anchor.ts`)

**Files:**
- Create: `prisma/seed/anchor.ts`
- Test: `tests/integration/seed/anchor.test.ts`

**Interfaces:**
- Consumes: `business-time.ts` helpers (`startOfUtcMonth`, `addUtcMonths`, `startOfUtcDay`).
- Produces:
  - `function seedNow(): Date` — `PREVIEW_NOW` parsed to midnight-UTC, else today midnight-UTC.
  - `function monthsFrom(n: number): Date` — first-of-month, `n` months from `seedNow()`'s month.
  - `function daysFrom(n: number): Date` — `seedNow()` ± `n` days, midnight-UTC.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/seed/anchor.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { seedNow, monthsFrom, daysFrom } from "../../../prisma/seed/anchor";

describe("seed anchor", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("seedNow reflects PREVIEW_NOW as midnight-UTC", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T09:30:00Z");
    expect(seedNow().toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("daysFrom offsets by whole days", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z");
    expect(daysFrom(-5).toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(daysFrom(10).toISOString()).toBe("2026-06-25T00:00:00.000Z");
  });

  it("monthsFrom returns first-of-month offsets", () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z");
    expect(monthsFrom(0).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(monthsFrom(-2).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(monthsFrom(3).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/seed/anchor.test.ts`
Expected: FAIL — `prisma/seed/anchor` does not exist.

- [ ] **Step 3: Implement `anchor.ts`**

Create `prisma/seed/anchor.ts`:

```ts
import { startOfUtcDay, startOfUtcMonth, addUtcMonths } from "@/app/_lib/util/business-time";

const DAY_MS = 86_400_000;

/** The seed's "now": PREVIEW_NOW (midnight-UTC) when set, else today midnight-UTC. */
export function seedNow(): Date {
  const raw = process.env.PREVIEW_NOW;
  const base = raw ? new Date(raw) : new Date();
  return startOfUtcDay(base);
}

/** First-of-month, n months from seedNow()'s month (n may be negative). */
export function monthsFrom(n: number): Date {
  return addUtcMonths(startOfUtcMonth(seedNow()), n);
}

/** seedNow() offset by n whole days (n may be negative), midnight-UTC. */
export function daysFrom(n: number): Date {
  return new Date(seedNow().getTime() + n * DAY_MS);
}
```

> Note: this imports from `@/app/_lib/util/business-time`. Confirm `tsx` resolves the `@/` path alias (the existing `seed-mock.ts` and `bill-generation.ts` already use `@/` imports under tsx, so this works).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/seed/anchor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed/anchor.ts tests/integration/seed/anchor.test.ts
git commit -m "feat(seed): PREVIEW_NOW-anchored date offset helpers"
```

---

### Task 3: Truncate + production guard (`reset.ts`)

**Files:**
- Create: `prisma/seed/reset.ts`
- Test: `tests/integration/seed/reset.test.ts`

**Interfaces:**
- Produces:
  - `function assertSeedAllowed(): void` — throws if `NODE_ENV === "production"` and `SEED_FORCE !== "true"`.
  - `async function truncateAll(prisma: PrismaClient): Promise<void>` — `TRUNCATE ... RESTART IDENTITY CASCADE` over all public tables (excluding `_prisma_migrations`).

- [ ] **Step 1: Write the failing test**

Create `tests/integration/seed/reset.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { assertSeedAllowed } from "../../../prisma/seed/reset";

describe("assertSeedAllowed", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows in non-production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(() => assertSeedAllowed()).not.toThrow();
  });

  it("throws in production without SEED_FORCE", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SEED_FORCE", undefined);
    expect(() => assertSeedAllowed()).toThrow(/production/i);
  });

  it("allows in production WITH SEED_FORCE=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SEED_FORCE", "true");
    expect(() => assertSeedAllowed()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/seed/reset.test.ts`
Expected: FAIL — `prisma/seed/reset` does not exist.

- [ ] **Step 3: Implement `reset.ts`**

Create `prisma/seed/reset.ts`:

```ts
import { PrismaClient } from "@prisma/client";

/** Guard: refuse to run a destructive seed against production unless forced. */
export function assertSeedAllowed(): void {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "true") {
    throw new Error(
      "Refusing to seed: NODE_ENV=production. Set SEED_FORCE=true to override."
    );
  }
}

/**
 * Truncate every table in the public schema (except Prisma's migration table),
 * resetting identity sequences. Same approach as tests/helpers/prisma.ts, but
 * seed-local so prisma/seed/ never imports from tests/.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/seed/reset.test.ts`
Expected: PASS (3 tests). (`truncateAll` is exercised end-to-end in Task 8's integration test.)

- [ ] **Step 5: Commit**

```bash
git add prisma/seed/reset.ts tests/integration/seed/reset.test.ts
git commit -m "feat(seed): production guard + seed-local truncate"
```

---

### Task 4: Reference data (`reference.ts`)

**Files:**
- Create: `prisma/seed/reference.ts`
- Reference (read, do not modify): `prisma/seed-mock.ts` (Reference Data / Settings / Billing Policies sections), `prisma/seed-rbac.ts`
- Test: covered by Task 8's end-to-end seed test (no standalone unit test — this is straight inserts of fixed reference rows).

**Interfaces:**
- Consumes: `seedRbac(prisma)` from `prisma/seed-rbac.ts`.
- Produces: `async function seedReference(prisma: PrismaClient): Promise<void>` — creates booking/payment/room statuses, RBAC (via `seedRbac`), settings, and the system/location billing policies. Idempotent-safe via `createMany({ skipDuplicates: true })` where the existing seed uses it.

- [ ] **Step 1: Implement `reference.ts`**

Create `prisma/seed/reference.ts`. Port the Reference Data, Settings, and Billing Policy sections from `prisma/seed-mock.ts` verbatim (read lines under the "Reference Data", "Settings", and "Billing Policies" banners), and call `seedRbac(prisma)` for RBAC. Structure:

```ts
import { PrismaClient } from "@prisma/client";
import { seedRbac } from "../seed-rbac";

export async function seedReference(prisma: PrismaClient): Promise<void> {
  // Booking / Payment / Room statuses — copy the createMany blocks from
  // prisma/seed-mock.ts (lines under "Reference Data").
  await prisma.bookingStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "ACTIVE" },
      { id: 3, status: "COMPLETED" },
      { id: 4, status: "CANCELLED" },
    ],
    skipDuplicates: true,
  });
  await prisma.paymentStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "VERIFIED" },
      { id: 3, status: "REJECTED" },
    ],
    skipDuplicates: true,
  });
  await prisma.roomStatus.createMany({
    data: [
      { id: 1, status: "AVAILABLE" },
      { id: 2, status: "OCCUPIED" },
      { id: 3, status: "MAINTENANCE" },
    ],
    skipDuplicates: true,
  });

  // RBAC (roles, permissions, grants).
  await seedRbac(prisma);

  // Settings — copy the createMany block from seed-mock.ts ("Settings" banner).
  // IMPORTANT: ensure LATE_FEE_AUTOMATION_ENABLED = "true" so the late-fee cron
  // replay (derive.ts) actually creates penalties for overdue anchors.
  // (Port the exact rows from seed-mock.ts; adjust this flag to "true".)
}
```

> The implementer must open `prisma/seed-mock.ts` and copy the exact Settings rows and any billing-policy creation that is location/system-level (NOT booking-level — booking-level policies are created with their bookings later). Keep field names/values identical. The ONLY deliberate change: `LATE_FEE_AUTOMATION_ENABLED` must be `"true"` so the late-fee replay produces penalties.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed/reference.ts
git commit -m "feat(seed): reference data (statuses, RBAC, settings, billing policies)"
```

---

### Task 5: Bulk entity generators (`generate/locations-rooms.ts`, `generate/tenants.ts`)

**Files:**
- Create: `prisma/seed/generate/locations-rooms.ts`
- Create: `prisma/seed/generate/tenants.ts`
- Reference: `prisma/seed-mock.ts` (Locations, Room Types, Durations, Room Type Durations, Rooms, Tenants sections) for exact field shapes.
- Test: `tests/integration/seed/generate.test.ts`

**Interfaces:**
- Consumes: `Rng` + generators from `rng.ts`.
- Produces:
  - `async function seedLocationsRoomsTypes(prisma, rng): Promise<{ locationIds: number[]; roomIds: number[]; roomTypeIds: number[]; durationIds: number[] }>` — creates the 2 fixed locations (Sudirman id 1 code SDK, Kemang id 2 code KMG), room types, durations, the pricing matrix, and ~300 rooms distributed across locations.
  - `async function seedTenants(prisma, rng, count: number): Promise<string[]>` — creates `count` tenants (cuid ids returned), deterministic names/contacts; returns the tenant ids.

> The 2 locations here are the fixed base every scenario needs; named-anchor records (Ahmad Wijaya, room A3) are created in Task 6's fixtures, not here.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/seed/generate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { makeRng } from "../../../prisma/seed/rng";
import { truncateAll } from "../../../prisma/seed/reset";
import { seedReference } from "../../../prisma/seed/reference";
import { seedLocationsRoomsTypes, seedTenants } from "../../../prisma/seed/generate/locations-rooms";
// NOTE: seedTenants lives in generate/tenants.ts — import accordingly:
import { seedTenants as seedTenantsFn } from "../../../prisma/seed/generate/tenants";

const prisma = new PrismaClient();

describe("bulk generators", () => {
  beforeEach(async () => {
    await truncateAll(prisma);
    await seedReference(prisma);
  });

  it("creates the 2 fixed locations and ~300 rooms", async () => {
    const { locationIds, roomIds } = await seedLocationsRoomsTypes(prisma, makeRng(1));
    expect(locationIds).toContain(1);
    expect(locationIds).toContain(2);
    expect(roomIds.length).toBeGreaterThanOrEqual(280);
    const sdk = await prisma.location.findUnique({ where: { id: 1 } });
    expect(sdk?.code).toBe("SDK");
  });

  it("creates the requested number of tenants, deterministically", async () => {
    await seedLocationsRoomsTypes(prisma, makeRng(1));
    const idsA = await seedTenantsFn(prisma, makeRng(99), 50);
    expect(idsA).toHaveLength(50);
    // Names are deterministic for a fixed seed.
    const first = await prisma.tenant.findUnique({ where: { id: idsA[0] } });
    expect(first?.name).toBeTruthy();
  });
});
```

> Fix the import: `seedLocationsRoomsTypes` from `generate/locations-rooms.ts`, `seedTenants` from `generate/tenants.ts`. Remove the duplicate import line; keep the two correct ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/seed/generate.test.ts`
Expected: FAIL — generator modules do not exist.

- [ ] **Step 3: Implement `generate/locations-rooms.ts`**

Create `prisma/seed/generate/locations-rooms.ts`. Read `prisma/seed-mock.ts`'s Locations / Room Types / Durations / Room Type Durations / Rooms sections for exact field shapes, then:
- Create the 2 fixed locations with explicit ids 1 (Sudirman, code "SDK", address per existing seed) and 2 (Kemang, code "KMG").
- Create the room types, durations, and the room-type-duration pricing matrix exactly as the existing seed does (these are small fixed sets — port them).
- Generate ~300 rooms distributed across the 2 locations (e.g. 150 each, or weighted), each with a `room_number` (deterministic, unique per location — e.g. `${floor}${String(n).padStart(2,"0")}`), a `room_type_id` picked via `rng`, a `status_id` (mostly AVAILABLE/OCCUPIED), and the `location_id`. Use `createMany` for the rooms, then re-query to return their ids (or create individually if ids are needed inline). Return `{ locationIds, roomIds, roomTypeIds, durationIds }`.

Create `prisma/seed/generate/tenants.ts`:
- `seedTenants(prisma, rng, count)` builds `count` tenant rows via `genName`/`genPhone`/`genEmail`/`genIdNumber`, a fraction with emergency contacts / second residents / referral sources (use `rng.bool(p)` for variety, matching the existing seed's profile mix). Batch with `createMany`, then query back the created ids (ordered by `createdAt`/`id`) and return them. Tenant id is a cuid (DB-generated) — do not set it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/seed/generate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed/generate/locations-rooms.ts prisma/seed/generate/tenants.ts tests/integration/seed/generate.test.ts
git commit -m "feat(seed): bulk location/room/tenant generators"
```

---

### Task 6: Anchor matrix + booking generator (`fixtures.ts`, `generate/bookings.ts`)

**Files:**
- Create: `prisma/seed/fixtures.ts`
- Create: `prisma/seed/generate/bookings.ts`
- Reference: `prisma/seed-mock.ts` (Bookings, Booking Add-ons, Deposits sections) for field shapes.
- Test: `tests/integration/seed/fixtures.test.ts`

**Interfaces:**
- Consumes: `seedNow`, `monthsFrom`, `daysFrom` (anchor.ts); `Rng` (rng.ts); the location/room/type/duration ids from Task 5.
- Produces:
  - A `BookingSpec` shape used by both files (and consumed by Task 7):
    ```ts
    interface BookingSpec {
      bookingDbId: number;       // the created Booking row's DB id (set after create); Task 7 derives in this order
      tenantId: string;
      roomId: number;
      locationId: number;
      startDate: Date;
      endDate: Date | null;     // null = rolling
      isRolling: boolean;
      statusId: number;          // BOOKING_STATUS
      fee: number;
      scenario: string;          // e.g. "active","completed","future","pending","cancelled","rolling","overdue","pending_payment","rejected","partial"
      paymentIntent: "paid" | "partial" | "overdue_unpaid" | "pending" | "rejected" | "bulk" | "none";
      deposit?: { amount: number; status: string };
      checkedIn?: boolean;       // write a CHECK_IN log
    }
    ```
    Both `seedAnchorFixtures` and `seedBulkBookings` must populate `bookingDbId` with the id returned from each `prisma.booking.create(...)`.
  - `async function seedAnchorFixtures(prisma, ctx): Promise<BookingSpec[]>` — creates the ≥2-per-scenario fixed records (incl. named anchors Ahmad Wijaya + room A3) and returns their `BookingSpec[]` (bookings are created here; their bills/payments are derived in Task 7). `ctx` carries the location/room/type/duration ids.
  - `async function seedBulkBookings(prisma, rng, ctx, tenantIds): Promise<BookingSpec[]>` — generates bulk bookings over the distribution and returns their specs.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/seed/fixtures.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { makeRng } from "../../../prisma/seed/rng";
import { truncateAll } from "../../../prisma/seed/reset";
import { seedReference } from "../../../prisma/seed/reference";
import { seedLocationsRoomsTypes } from "../../../prisma/seed/generate/locations-rooms";
import { seedAnchorFixtures } from "../../../prisma/seed/fixtures";

const prisma = new PrismaClient();

describe("anchor fixtures", () => {
  beforeEach(async () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z");
    await truncateAll(prisma);
    await seedReference(prisma);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates >=2 anchors per scenario and the named E2E anchors", async () => {
    const ctx = await seedLocationsRoomsTypes(prisma, makeRng(1));
    const specs = await seedAnchorFixtures(prisma, ctx);

    // >=2 per scenario for the key scenarios
    for (const s of ["active", "completed", "future", "pending", "cancelled", "rolling", "overdue", "pending_payment"]) {
      const count = specs.filter((x) => x.scenario === s).length;
      expect(count, `scenario ${s}`).toBeGreaterThanOrEqual(2);
    }

    // Named E2E anchors exist
    const ahmad = await prisma.tenant.findFirst({ where: { name: "Ahmad Wijaya" } });
    expect(ahmad).toBeTruthy();
    const a3 = await prisma.room.findFirst({ where: { room_number: "A3", location_id: 2 } });
    expect(a3).toBeTruthy();

    // both locations represented among anchor bookings
    expect(new Set(specs.map((s) => s.locationId))).toEqual(new Set([1, 2]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/seed/fixtures.test.ts`
Expected: FAIL — `prisma/seed/fixtures` does not exist.

- [ ] **Step 3: Implement `fixtures.ts`**

Create `prisma/seed/fixtures.ts`. Drive the matrix from a small declarative table so "≥2 per scenario" is data, not copy-paste. For each scenario, define ≥2 entries with their date offsets (relative to `seedNow()`), status, payment intent, and deposit status; create the booking rows (and their tenant + room when they must be specific named anchors). Key requirements:
- **Named anchors:** create tenant "Ahmad Wijaya" and room "A3" in Kemang (location 2) explicitly; at least one Sudirman (location 1) booking with a PENDING payment intent (so an `INV/SDK` invoice + a pending payment exist after derivation). A second known tenant + room as spares.
- **Scenarios & offsets** (relative to seedNow):
  - `active` ×2/location: start `monthsFrom(-3)`, no end or end `monthsFrom(+3)`, status ACTIVE.
  - `completed` ×2: start `monthsFrom(-8)`, end `monthsFrom(-1)`, status COMPLETED, `checkedIn: true`.
  - `future` ×2: start `monthsFrom(+1)`, end `monthsFrom(+7)`, status PENDING.
  - `pending` ×2: start `seedNow()` (today), status PENDING, no check-in log (drives check-in-today).
  - `cancelled` ×2: status CANCELLED.
  - `rolling` ×2: start `monthsFrom(-2)`, `isRolling: true`, end null, status ACTIVE.
  - `overdue` ×2: active booking whose earliest bill will be past-due + unpaid (`paymentIntent: "overdue_unpaid"`).
  - `pending_payment` ×2 (≥1 in Sudirman): `paymentIntent: "pending"`.
  - `rejected` ×2: `paymentIntent: "rejected"`; `partial` ×2: `paymentIntent: "partial"`.
  - Deposits: across the anchor bookings, include ≥2 of each `DepositStatus` (HELD, APPLIED, REFUNDED, PARTIALLY_REFUNDED) via the `deposit` field.
- Create each booking with the real schema fields (see `seed-mock.ts` Bookings section: `room_id`, `tenant_id`, `start_date`, `end_date`, `status_id`, `fee`, `is_rolling`, `duration_id`). Create a `Deposit` row where specified. Write a `CheckInOutLog` (CHECK_IN, event_date = start_date) where `checkedIn`.
- Return the `BookingSpec[]` for all anchor bookings.

Create `prisma/seed/generate/bookings.ts`:
- `seedBulkBookings(prisma, rng, ctx, tenantIds)` assigns tenants to rooms and generates bookings across the distribution (~60% active, ~20% completed, ~10% future, ~10% pending/cancelled) using `rng.weighted(...)`, with start/end dates derived from `monthsFrom`/`daysFrom` and a `paymentIntent` chosen by `rng.weighted` over `paid/partial/overdue_unpaid/pending/rejected/bulk`. One booking per occupied room (don't double-book a room for overlapping active periods — pick a free room per active booking). Return the `BookingSpec[]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/seed/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed/fixtures.ts prisma/seed/generate/bookings.ts tests/integration/seed/fixtures.test.ts
git commit -m "feat(seed): >=2-per-scenario anchor matrix + bulk booking generator"
```

---

### Task 7: Real-logic derivation (`derive.ts`)

**Files:**
- Create: `prisma/seed/derive.ts`
- Test: `tests/integration/seed/derive.test.ts`

**Interfaces:**
- Consumes: `BookingSpec[]` (Task 6); real services:
  - `generateBillsForFixedBooking(booking)`, `generateInitialBillsForRollingBooking(booking)` from `@/app/_lib/services/bill-generation` (booking arg matches `BillGenerationBooking`: `{ id, start_date, fee, second_resident_fee, deposit?, addOns: [] }`).
  - `generatePaymentBillMappingFromPaymentsAndBills(bookingId)` from `@/app/_lib/util/payment-allocation`.
  - `createOrUpdatePaymentTransactions(paymentId)` from `@/app/(internal)/(dashboard_layout)/payments/payment-action`.
  - `runLateFees(today?)` from `@/app/api/cron/late-fees/route`.
  - `runBookingStatusSync()` from `@/app/api/cron/booking-status-sync/route`.
  - `PAYMENT_STATUS` from `@/app/_lib/util/status`; `seedNow` from anchor.ts.
- Produces:
  - `async function deriveFinancials(prisma, rng, specs: BookingSpec[]): Promise<void>` — for each booking (sorted by id): generate bills via the real service, then create payments per `paymentIntent` and run real allocation + transaction derivation. Then replays the crons once.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/seed/derive.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { makeRng } from "../../../prisma/seed/rng";
import { truncateAll } from "../../../prisma/seed/reset";
import { seedReference } from "../../../prisma/seed/reference";
import { seedLocationsRoomsTypes } from "../../../prisma/seed/generate/locations-rooms";
import { seedAnchorFixtures } from "../../../prisma/seed/fixtures";
import { deriveFinancials } from "../../../prisma/seed/derive";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";

const prisma = new PrismaClient();

describe("real-logic derivation", () => {
  beforeEach(async () => {
    vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z");
    await truncateAll(prisma);
    await seedReference(prisma);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("derives real bills, payments, transactions, and penalties for anchors", async () => {
    const ctx = await seedLocationsRoomsTypes(prisma, makeRng(1));
    const specs = await seedAnchorFixtures(prisma, ctx);
    await deriveFinancials(prisma, makeRng(2), specs);

    // Bills were generated by the real service (have invoice numbers).
    const bills = await prisma.bill.findMany({ where: { invoice_number: { not: null } } });
    expect(bills.length).toBeGreaterThan(0);

    // At least one INV/SDK invoice exists (Sudirman anchor) — the E2E contract.
    const sdk = await prisma.bill.findFirst({ where: { invoice_number: { startsWith: "INV/SDK" } } });
    expect(sdk).toBeTruthy();

    // At least one PENDING payment in Sudirman (location 1).
    const pending = await prisma.payment.findFirst({
      where: { status_id: PAYMENT_STATUS.PENDING, bookings: { rooms: { location_id: 1 } } },
    });
    expect(pending).toBeTruthy();

    // Verified payments produced ledger transactions.
    const txns = await prisma.transaction.findMany({ where: { type: "INCOME" } });
    expect(txns.length).toBeGreaterThan(0);

    // The late-fee replay created at least one penalty for overdue anchors.
    const penalties = await prisma.penalty.findMany();
    expect(penalties.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/seed/derive.test.ts`
Expected: FAIL — `prisma/seed/derive` does not exist.

- [ ] **Step 3: Implement `derive.ts`**

Create `prisma/seed/derive.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { generateBillsForFixedBooking, generateInitialBillsForRollingBooking } from "@/app/_lib/services/bill-generation";
import { generatePaymentBillMappingFromPaymentsAndBills } from "@/app/_lib/util/payment-allocation";
import { createOrUpdatePaymentTransactions } from "@/app/(internal)/(dashboard_layout)/payments/payment-action";
import { runLateFees } from "@/app/api/cron/late-fees/route";
import { runBookingStatusSync } from "@/app/api/cron/booking-status-sync/route";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";
import { seedNow } from "./anchor";
import { Rng } from "./rng";
import type { BookingSpec } from "./fixtures";

export async function deriveFinancials(
  prisma: PrismaClient,
  rng: Rng,
  specs: BookingSpec[]
): Promise<void> {
  // 1. Bills — SEQUENTIAL in booking-id order (invoice-number determinism).
  const ordered = [...specs].sort((a, b) => a.bookingDbId - b.bookingDbId);
  for (const spec of ordered) {
    const booking = await loadBillGenBooking(prisma, spec.bookingDbId);
    if (spec.isRolling) {
      await generateInitialBillsForRollingBooking(booking);
    } else {
      await generateBillsForFixedBooking(booking as typeof booking & { end_date: Date });
    }
  }

  // 2. Payments + allocation + transactions per booking (paymentIntent).
  for (const spec of ordered) {
    await seedPaymentsForBooking(prisma, rng, spec);
    await generatePaymentBillMappingFromPaymentsAndBills(spec.bookingDbId);
    const payments = await prisma.payment.findMany({ where: { booking_id: spec.bookingDbId } });
    for (const p of payments) await createOrUpdatePaymentTransactions(p.id);
  }

  // 3. Replay the daily crons over the whole dataset (real prod logic).
  await runLateFees(seedNow());
  await runBookingStatusSync();
}
```

Plus two helpers in the same file:
- `loadBillGenBooking(prisma, id)` — query the booking with `addOns: { include: { addOn: { include: { pricing: true } } } }` and `deposit`, mapped to the `BillGenerationBooking` shape (`{ id, start_date, fee: Number, second_resident_fee, deposit, addOns }`).
- `seedPaymentsForBooking(prisma, rng, spec)` — based on `spec.paymentIntent`, create `Payment` rows against the booking's now-existing bills:
  - `paid`: one VERIFIED payment covering the full outstanding (sum of bill items for due bills), `payment_date` ~ each bill's month.
  - `partial`: a VERIFIED payment for a fraction (e.g. `rng.int(40,80)%`).
  - `overdue_unpaid`: NO payment (leaves the past-due bill outstanding → late-fee cron picks it up).
  - `pending`: a PENDING payment (status_id = PAYMENT_STATUS.PENDING) — not allocated to transactions by the real logic.
  - `rejected`: a REJECTED payment.
  - `bulk`: one VERIFIED payment covering multiple months at once.
  - `none`: no payments (cancelled/future bookings).
  Use `payment_method` from `PaymentMethod` enum, dates derived from bill due dates / `seedNow`. (Read `seed-mock.ts` Payments section for valid field shapes.)

> **`BookingSpec` addition:** Task 6's `BookingSpec` must carry the created booking's DB id. Add `bookingDbId: number` to the interface in `fixtures.ts` and populate it when each booking row is created (both in `fixtures.ts` and `generate/bookings.ts`). Update Task 6's interface accordingly. (Recorded here so the implementer adds it; the controller will reconcile.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/seed/derive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed/derive.ts tests/integration/seed/derive.test.ts
git commit -m "feat(seed): real-logic financial derivation + cron replay"
```

---

### Task 8: Orchestrator, wiring, delete old seed, end-to-end + determinism tests

**Files:**
- Create: `prisma/seed/index.ts`
- Modify: `package.json` (`seed:mock` script → `tsx prisma/seed/index.ts`)
- Delete: `prisma/seed-mock.ts`
- Test: `tests/integration/seed/full-seed.test.ts`

**Interfaces:**
- Consumes: all prior modules.
- Produces: `prisma/seed/index.ts` with a `main()` that runs the full pipeline and a `seedAll(prisma, opts?)` export the test can call.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/seed/full-seed.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedAll } from "../../../prisma/seed/index";
import { PAYMENT_STATUS } from "@/app/_lib/util/status";

const prisma = new PrismaClient();

describe("full seed pipeline", () => {
  beforeEach(() => vi.stubEnv("PREVIEW_NOW", "2026-06-15T00:00:00Z"));
  afterEach(() => vi.unstubAllEnvs());

  it("seeds the full dataset with the anchor matrix and real-derived financials", async () => {
    await seedAll(prisma, { tenants: 120, rngSeed: 7 }); // smaller count for test speed

    const tenants = await prisma.tenant.count();
    expect(tenants).toBeGreaterThanOrEqual(120);
    expect(await prisma.room.count()).toBeGreaterThanOrEqual(280);

    // anchor matrix present
    expect(await prisma.tenant.findFirst({ where: { name: "Ahmad Wijaya" } })).toBeTruthy();
    expect(await prisma.bill.findFirst({ where: { invoice_number: { startsWith: "INV/SDK" } } })).toBeTruthy();
    expect(await prisma.payment.findFirst({
      where: { status_id: PAYMENT_STATUS.PENDING, bookings: { rooms: { location_id: 1 } } },
    })).toBeTruthy();
    expect(await prisma.penalty.count()).toBeGreaterThan(0);
  });

  it("is deterministic: two runs produce identical invoice numbers per booking", async () => {
    await seedAll(prisma, { tenants: 60, rngSeed: 7 });
    const run1 = await prisma.bill.findMany({
      where: { invoice_number: { not: null } },
      select: { booking_id: true, invoice_number: true },
      orderBy: [{ booking_id: "asc" }, { invoice_number: "asc" }],
    });

    await seedAll(prisma, { tenants: 60, rngSeed: 7 }); // re-seed (truncates first)
    const run2 = await prisma.bill.findMany({
      where: { invoice_number: { not: null } },
      select: { booking_id: true, invoice_number: true },
      orderBy: [{ booking_id: "asc" }, { invoice_number: "asc" }],
    });

    expect(run2).toEqual(run1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/seed/full-seed.test.ts`
Expected: FAIL — `prisma/seed/index` does not exist.

- [ ] **Step 3: Implement `prisma/seed/index.ts`**

Create `prisma/seed/index.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { assertSeedAllowed, truncateAll } from "./reset";
import { seedReference } from "./reference";
import { seedLocationsRoomsTypes } from "./generate/locations-rooms";
import { seedTenants } from "./generate/tenants";
import { seedAnchorFixtures } from "./fixtures";
import { seedBulkBookings } from "./generate/bookings";
import { deriveFinancials } from "./derive";
import { makeRng } from "./rng";

interface SeedOptions {
  tenants?: number;     // default 1000
  rngSeed?: number;     // default makeRng() default
}

export async function seedAll(prisma: PrismaClient, opts: SeedOptions = {}): Promise<void> {
  const tenantCount = opts.tenants ?? (process.env.SEED_TENANTS ? Number(process.env.SEED_TENANTS) : 1000);
  const seed = opts.rngSeed ?? (process.env.SEED_RNG_SEED ? Number(process.env.SEED_RNG_SEED) : undefined);
  const rng = makeRng(seed);

  await truncateAll(prisma);
  console.log("[seed] reference data…");
  await seedReference(prisma);
  console.log("[seed] locations + rooms…");
  const ctx = await seedLocationsRoomsTypes(prisma, rng);
  console.log("[seed] tenants…");
  const tenantIds = await seedTenants(prisma, rng, tenantCount);
  console.log("[seed] anchor fixtures…");
  const anchorSpecs = await seedAnchorFixtures(prisma, ctx);
  console.log("[seed] bulk bookings…");
  const bulkSpecs = await seedBulkBookings(prisma, rng, ctx, tenantIds);
  console.log("[seed] deriving financials via real services…");
  await deriveFinancials(prisma, rng, [...anchorSpecs, ...bulkSpecs]);
  console.log("[seed] done.");
}

async function main() {
  assertSeedAllowed();
  const prisma = new PrismaClient();
  try {
    await seedAll(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Run when invoked directly (tsx prisma/seed/index.ts).
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

> Note: the test imports `seedAll` (named export). The bare `main()` call runs only under `tsx` invocation; in the Vitest import it will ALSO execute. To prevent that, guard the auto-run: only call `main()` when the module is the entry point. Use:
> ```ts
> import { fileURLToPath } from "node:url";
> const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
> if (isEntry) main().catch((e) => { console.error(e); process.exit(1); });
> ```
> Implement it this way so importing `seedAll` in the test does not trigger a full real-time seed.

- [ ] **Step 4: Repoint the npm script + delete the old seed**

In `package.json`, change:
```json
"seed:mock": "tsx prisma/seed-mock.ts",
```
to:
```json
"seed:mock": "tsx prisma/seed/index.ts",
```
Then delete the old file:
```bash
git rm prisma/seed-mock.ts
```

- [ ] **Step 5: Run the end-to-end + determinism tests**

Run: `npx vitest run tests/integration/seed/full-seed.test.ts`
Expected: PASS (2 tests). (These are heavier — the determinism test seeds twice; allow for the 30s testTimeout already configured.)

- [ ] **Step 6: Typecheck + confirm no references to the deleted file remain**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `grep -rn "seed-mock" --include=*.ts --include=*.json . | grep -v node_modules`
Expected: no results (the script is repointed; no code imports the deleted file).

- [ ] **Step 7: Commit**

```bash
git add prisma/seed/index.ts package.json tests/integration/seed/full-seed.test.ts
git rm prisma/seed-mock.ts
git commit -m "feat(seed): orchestrator + wire seed:mock; remove hand-built seed-mock.ts"
```

---

### Task 9: Full-suite + E2E regression against the new seed

**Files:** none created — this task verifies the new seed satisfies the existing test contract and reseeds the E2E DB.

- [ ] **Step 1: Run the full unit/integration suite**

Run: `docker compose -f docker-compose.test.yml up -d test-db && npx vitest run`
Expected: all green, including the new `tests/integration/seed/*` files.

- [ ] **Step 2: Reseed the E2E database with the new seed and run the E2E suite**

The E2E DB (`hms_e2e`, :5434) is seeded by `e2e/global-setup.ts`. Confirm how it invokes the seed:

Run: `grep -nE "seed|seedAll|seed-mock|seed/index" e2e/global-setup.ts`

If it shells out to `seed:mock` (or `tsx prisma/seed-mock.ts`), the repointed script now runs the new seed — no change needed beyond the Task 8 repoint. If it imports a seed function directly, update that import to `seedAll` from `prisma/seed/index`. Make the minimal change required so global-setup runs the new seed.

Then run the E2E suite:

Run: `docker compose -f docker-compose.test.yml up -d e2e-db && npx playwright test -c e2e/playwright.config.ts`
Expected: all specs green. The anchor fixtures preserve "Ahmad Wijaya", "INV/SDK", room "A3", and the Sudirman pending payment, so `create-booking`, `global-search`, and `dashboard-quick-actions` pass unchanged.

> If global-setup seeds without `PREVIEW_NOW` set, the seed anchors on the real current date — that's fine for E2E (the anchors are relative). If any spec implicitly assumed the old fixed 2026 dates, note it and adjust the spec's assertion to be relative, not the seed.

- [ ] **Step 3: Commit any global-setup adjustment**

```bash
git add e2e/global-setup.ts
git commit -m "test(e2e): run the new large-scale seed in global setup"
```
(Skip if no change was needed.)

---

## Final Verification (whole-branch)

- `npx tsc --noEmit` clean.
- `npx vitest run` — full suite green, including all `tests/integration/seed/*`.
- `npx playwright test -c e2e/playwright.config.ts` — green (anchor contract preserved). Re-run twice for stability.
- Manual: `PREVIEW_NOW=2026-06-15T03:00:00Z npm run seed:mock` against a dev DB completes, logs progress per phase, and the dashboard shows realistic data aligned to 15 Jun 2026 (overdue bills, today's check-ins, pending payments all populated). Re-running produces an identical dataset.
- `grep -rn "seed-mock" . | grep -v node_modules` — only this plan/spec mention it; no code references the deleted file.

## Notes for the PR

Per the standing instruction, the PR body ends with a `## Manual Test Checklist`: (1) `npm run seed:mock` completes without error and logs phases; (2) with `PREVIEW_NOW` set, dashboard widgets (overdue, check-in-today, pending payments) are populated and aligned to the frozen date; (3) re-running the seed yields an identical dataset (determinism); (4) the production guard aborts the seed under `NODE_ENV=production` without `SEED_FORCE`; (5) full vitest + Playwright suites green.

## Dependency note

Builds on sub-project A (the clock, merged). Reads `PREVIEW_NOW` via the seed anchor. Does not modify any application service, action, or the clock.
