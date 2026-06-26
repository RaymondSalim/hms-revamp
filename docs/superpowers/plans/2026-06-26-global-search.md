# Global Command-Palette Search (Phase 1.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ⌘K / Ctrl-K command palette that searches tenants, bookings, bills, and rooms across all locations the user can access, shows grouped results (top 5 per entity), and navigates to the record on selection (switching the selected location first when the result lives elsewhere).

**Architecture:** A pure `globalSearch(scope, term, permissions)` query module (four scoped, permission-gated `findMany`s) is exposed through a GET `/api/search` route handler (the app's existing client-read pattern). A dependency-free `<CommandPalette>` client component, mounted in the dashboard layout, opens on ⌘K, debounces input (350ms) into an abortable fetch, renders grouped results, and navigates on select.

**Tech Stack:** Next.js 16 App Router (React 19), TypeScript, Prisma 6 / Postgres, framer-motion (already used by Modal), Vitest (node env, test DB :5433), Playwright E2E (e2e DB :5434). No new dependencies.

## Global Constraints

- Indonesian-language UI. Group headers: "Penyewa", "Pemesanan", "Tagihan", "Kamar". States: hint "Ketik untuk mencari…", empty "Tidak ada hasil", error "Gagal memuat hasil pencarian", "+N lainnya".
- Search scope is the user's session `LocationScope` from `getScopedLocationIds()` (`number[] | null`; `null` = unrestricted admin = all locations). NOT the selected location. When `scope === null`, omit `location_id in scope` clauses.
- Permission-gate each entity: only return tenants/bookings/bills/rooms the user can `*.view`. The caller passes an already-resolved `Set<Permission>`.
- Reuse the EXACT list-page search predicates (insensitive `contains`) per entity; `take: 5` per group; soft-delete (`deletedAt: null`) on bookings and bills.
- Tenants are global (no location filter; `locationId`/`locationName` are `null`).
- Result hrefs: tenant → `/residents/tenants/<id>`; booking → `/bookings?q=<term>`; bill → `/bills?q=<term>`; room → `/rooms/all-rooms?q=<term>` (term URI-encoded).
- Cross-location select: write the `selectedLocationId` cookie directly (`path=/;max-age=31536000;samesite=lax`) then `window.location.href = href`. Do NOT call `useLocation().setSelectedLocationId` (it does `window.location.reload()` and would reload the current page, not navigate).
- Reuse `serializeForClient`, the `Modal` overlay conventions (z-[100]); no `cmdk` or other new dep.
- Existing suite (317 unit/integration + 23 E2E) must stay green.

## File Structure

| File | Responsibility |
|---|---|
| `src/app/_db/search.ts` (create) | `globalSearch()` + `SearchHit`/`SearchResults`/`SearchType` types. |
| `tests/integration/global-search.test.ts` (create) | `globalSearch` field-match / scope / permission / cap / shape tests. |
| `src/app/api/search/route.ts` (create) | `GET` handler: resolve scope + permissions, call `globalSearch`, return results. |
| `src/app/_components/command-palette.tsx` (create) | `"use client"` palette UI (keydown, debounced abortable fetch, grouped results, keyboard nav, navigation). |
| `src/app/(internal)/(dashboard_layout)/layout.tsx` (modify) | Mount `<CommandPalette />` inside the existing providers. |
| `src/app/_components/header.tsx` (modify) | Add a "Cari… ⌘K" trigger affordance that opens the palette. |
| `e2e/specs/global-search.spec.ts` (create) | ⌘K opens; tenant → detail; invoice → `/bills?q=`. |

---

### Task 1: `globalSearch` query module + types + tests

**Files:**
- Create: `src/app/_db/search.ts`
- Test: `tests/integration/global-search.test.ts`

**Interfaces:**
- Consumes: `prisma`; `LocationScope` from `@/app/_lib/util/location-scope`; `Permission` from `@/app/_lib/rbac`.
- Produces:
  - `type SearchType = "tenant" | "booking" | "bill" | "room"`
  - `interface SearchHit { id: string; type: SearchType; label: string; sublabel: string; href: string; locationId: number | null; locationName: string | null }`
  - `interface SearchResults { tenants: SearchHit[]; bookings: SearchHit[]; bills: SearchHit[]; rooms: SearchHit[] }`
  - `globalSearch(scope: LocationScope, term: string, permissions: Set<Permission>): Promise<SearchResults>`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/global-search.test.ts`. `seedTestData()` provides location 1 (rooms 101/102, room_type "Standard", statuses). Create a second location for scope tests.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { globalSearch } from "@/app/_db/search";
import type { Permission } from "@/app/_lib/rbac";

const ALL: Set<Permission> = new Set([
  "tenants.view", "bookings.view", "bills.view", "rooms.view",
]);

describe("globalSearch", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  async function seed() {
    // Location 2 + a room in it.
    await testPrisma.location.create({ data: { id: 2, name: "Loc 2", address: "Jl. Dua" } });
    await testPrisma.room.create({
      data: { id: 3, room_number: "201", room_type_id: 1, status_id: 1, location_id: 2 },
    });
    const t1 = await testPrisma.tenant.create({
      data: { name: "Budi Santoso", id_number: `id-b-${Date.now()}`, email: "budi@t.com", phone: "0811" },
    });
    const b1 = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t1.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    const bill1 = await testPrisma.bill.create({
      data: { booking_id: b1.id, description: "Sewa Januari", due_date: new Date("2025-01-28"), invoice_number: "INV-001" },
    });
    // Location 2 booking + bill (for scope tests)
    const t2 = await testPrisma.tenant.create({
      data: { name: "Citra", id_number: `id-c-${Date.now()}`, email: "citra@t.com" },
    });
    const b2 = await testPrisma.booking.create({
      data: { room_id: 3, tenant_id: t2.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    await testPrisma.bill.create({
      data: { booking_id: b2.id, description: "Sewa Loc2", due_date: new Date("2025-01-28"), invoice_number: "INV-LOC2" },
    });
    return { t1, b1, bill1 };
  }

  it("matches tenants by name/email/phone/id_number", async () => {
    await seed();
    expect((await globalSearch(null, "budi", ALL)).tenants).toHaveLength(1);
    expect((await globalSearch(null, "budi@t.com", ALL)).tenants[0].label).toBe("Budi Santoso");
    expect((await globalSearch(null, "0811", ALL)).tenants).toHaveLength(1);
  });

  it("matches rooms, bookings, and bills by their documented fields", async () => {
    await seed();
    expect((await globalSearch(null, "101", ALL)).rooms.length).toBeGreaterThanOrEqual(1);
    expect((await globalSearch(null, "INV-001", ALL)).bills).toHaveLength(1);
    // booking matched via tenant name
    expect((await globalSearch(null, "budi", ALL)).bookings.length).toBeGreaterThanOrEqual(1);
  });

  it("produces correct hrefs and tenant has null location", async () => {
    const { t1 } = await seed();
    const r = await globalSearch(null, "budi", ALL);
    const tenantHit = r.tenants[0];
    expect(tenantHit.href).toBe(`/residents/tenants/${t1.id}`);
    expect(tenantHit.locationId).toBeNull();
    const billHit = (await globalSearch(null, "INV-001", ALL)).bills[0];
    expect(billHit.href).toBe("/bills?q=INV-001");
    expect(billHit.locationName).toBe("Test Location");
  });

  it("scopes location-bound entities: excludes other locations when scope is restricted", async () => {
    await seed();
    // scope = [1] → INV-LOC2 (location 2) excluded; INV-001 (location 1) included
    const scoped = await globalSearch([1], "INV", ALL);
    expect(scoped.bills.map((b) => b.label)).toContain("INV-001");
    expect(scoped.bills.map((b) => b.label)).not.toContain("INV-LOC2");
    // null scope (admin) → both
    const all = await globalSearch(null, "INV", ALL);
    expect(all.bills.map((b) => b.label).sort()).toEqual(["INV-001", "INV-LOC2"]);
  });

  it("omits an entity group the user cannot view", async () => {
    await seed();
    const noBills: Set<Permission> = new Set(["tenants.view", "bookings.view", "rooms.view"]);
    const r = await globalSearch(null, "INV-001", noBills);
    expect(r.bills).toEqual([]);
    // a permitted group still populates
    expect((await globalSearch(null, "budi", noBills)).tenants).toHaveLength(1);
  });

  it("caps each group at 5", async () => {
    const t = await testPrisma.tenant.create({
      data: { name: "ZZ Base", id_number: `id-z-${Date.now()}`, email: "z@t.com" },
    });
    const bk = await testPrisma.booking.create({
      data: { room_id: 1, tenant_id: t.id, start_date: new Date("2025-01-01"), fee: 1, is_rolling: true },
    });
    for (let i = 0; i < 7; i++) {
      await testPrisma.bill.create({
        data: { booking_id: bk.id, description: `Tagihan ${i}`, due_date: new Date("2025-01-28"), invoice_number: `INVCAP-${i}` },
      });
    }
    const r = await globalSearch(null, "INVCAP", ALL);
    expect(r.bills).toHaveLength(5);
  });

  it("returns all-empty for a blank term without querying", async () => {
    await seed();
    const r = await globalSearch(null, "   ", ALL);
    expect(r).toEqual({ tenants: [], bookings: [], bills: [], rooms: [] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/global-search.test.ts`
Expected: FAIL — module `@/app/_db/search` not found. (Start the test DB first if needed: `docker compose -f docker-compose.test.yml up -d test-db`.)

- [ ] **Step 3: Create `src/app/_db/search.ts`**

```ts
import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import type { LocationScope } from "@/app/_lib/util/location-scope";
import type { Permission } from "@/app/_lib/rbac";

export type SearchType = "tenant" | "booking" | "bill" | "room";

export interface SearchHit {
  id: string;
  type: SearchType;
  label: string;
  sublabel: string;
  href: string;
  locationId: number | null;
  locationName: string | null;
}

export interface SearchResults {
  tenants: SearchHit[];
  bookings: SearchHit[];
  bills: SearchHit[];
  rooms: SearchHit[];
}

const TAKE = 5;

/** location_id IN scope clause, or undefined when scope is null (admin = all). */
function locFilter(scope: LocationScope): { in: number[] } | undefined {
  return scope === null ? undefined : { in: scope };
}

export async function globalSearch(
  scope: LocationScope,
  rawTerm: string,
  permissions: Set<Permission>
): Promise<SearchResults> {
  const term = rawTerm.trim();
  const empty: SearchResults = { tenants: [], bookings: [], bills: [], rooms: [] };
  if (!term) return empty;

  const ci = (s: string) => ({ contains: s, mode: "insensitive" as const });
  const q = encodeURIComponent(term);
  const scopeIds = locFilter(scope);

  const [tenants, rooms, bookings, bills] = await Promise.all([
    // Tenants — global (no location filter).
    permissions.has("tenants.view")
      ? prisma.tenant.findMany({
          where: {
            OR: [
              { name: ci(term) },
              { email: ci(term) },
              { phone: ci(term) },
              { id_number: ci(term) },
            ],
          },
          orderBy: { name: "asc" },
          take: TAKE,
        })
      : Promise.resolve([]),

    // Rooms — scoped by location_id.
    permissions.has("rooms.view")
      ? prisma.room.findMany({
          where: {
            ...(scopeIds ? { location_id: scopeIds } : {}),
            OR: [{ room_number: ci(term) }, { roomtypes: { type: ci(term) } }],
          },
          include: { roomtypes: true, locations: true },
          orderBy: { room_number: "asc" },
          take: TAKE,
        })
      : Promise.resolve([]),

    // Bookings — scoped via rooms.location_id.
    permissions.has("bookings.view")
      ? prisma.booking.findMany({
          where: {
            deletedAt: null,
            ...(scopeIds ? { rooms: { location_id: scopeIds } } : {}),
            OR: [
              { tenants: { name: ci(term) } },
              { rooms: { room_number: ci(term) } },
            ],
          },
          include: { tenants: true, rooms: { include: { locations: true } } },
          orderBy: { createdAt: "desc" },
          take: TAKE,
        })
      : Promise.resolve([]),

    // Bills — scoped via bookings.rooms.location_id.
    permissions.has("bills.view")
      ? prisma.bill.findMany({
          where: {
            deletedAt: null,
            ...(scopeIds ? { bookings: { rooms: { location_id: scopeIds } } } : {}),
            OR: [
              { invoice_number: ci(term) },
              { description: ci(term) },
              { bookings: { tenants: { name: ci(term) } } },
              { bookings: { rooms: { room_number: ci(term) } } },
            ],
          },
          include: { bookings: { include: { tenants: true, rooms: { include: { locations: true } } } } },
          orderBy: { due_date: "desc" },
          take: TAKE,
        })
      : Promise.resolve([]),
  ]);

  return {
    tenants: tenants.map((t) => ({
      id: t.id,
      type: "tenant" as const,
      label: t.name,
      sublabel: t.email ?? t.phone ?? t.id_number,
      href: `/residents/tenants/${t.id}`,
      locationId: null,
      locationName: null,
    })),
    rooms: rooms.map((r) => ({
      id: String(r.id),
      type: "room" as const,
      label: r.room_number,
      sublabel: r.roomtypes?.type ?? "-",
      href: `/rooms/all-rooms?q=${q}`,
      locationId: r.location_id,
      locationName: r.locations?.name ?? null,
    })),
    bookings: bookings.map((b) => ({
      id: String(b.id),
      type: "booking" as const,
      label: `${b.rooms?.room_number ?? "-"} · ${b.tenants?.name ?? "-"}`,
      sublabel: b.tenants?.name ?? "-",
      href: `/bookings?q=${q}`,
      locationId: b.rooms?.location_id ?? null,
      locationName: b.rooms?.locations?.name ?? null,
    })),
    bills: bills.map((b) => ({
      id: String(b.id),
      type: "bill" as const,
      label: b.invoice_number ?? `Tagihan #${b.id}`,
      sublabel: `${b.bookings?.rooms?.room_number ?? "-"} · ${b.bookings?.tenants?.name ?? "-"}`,
      href: `/bills?q=${q}`,
      locationId: b.bookings?.rooms?.location_id ?? null,
      locationName: b.bookings?.rooms?.locations?.name ?? null,
    })),
  };
}
```

> Verify field names against the schema while implementing: `Tenant.phone`/`email`/`id_number` are nullable (the sublabel fallback chain handles that); `Bill.invoice_number` is nullable (label fallback handles it). `Room.locations` / `Room.roomtypes` are the relation field names confirmed in `src/app/_db/rooms.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/global-search.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/_db/search.ts tests/integration/global-search.test.ts
git commit -m "feat: globalSearch query module for command-palette search"
```

---

### Task 2: `GET /api/search` route handler

**Files:**
- Create: `src/app/api/search/route.ts`

**Interfaces:**
- Consumes: `globalSearch`, `SearchResults` from `@/app/_db/search`; `getScopedLocationIds` from `@/app/_lib/util/location-scope`; `getUserPermissions` from `@/app/_lib/rbac`; `serializeForClient`.
- Produces: `GET /api/search?q=<term>` → JSON `SearchResults`.

This task has no unit test (route handlers are exercised by the Task 4 E2E; the search logic is already covered in Task 1). It is a thin, focused handler worth its own commit.

- [ ] **Step 1: Create the route handler**

Mirror the existing `src/app/api/financials/summary/route.ts` shape (permission check, then work). Here the permission set is passed INTO `globalSearch` so it gates per entity; the endpoint itself returns 200 with whatever groups the user may see (empty if none).

```ts
import { NextRequest, NextResponse } from "next/server";
import { globalSearch } from "@/app/_db/search";
import { getScopedLocationIds } from "@/app/_lib/util/location-scope";
import { getUserPermissions } from "@/app/_lib/rbac";
import { serializeForClient } from "@/app/_lib/util/serialize";

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get("q") ?? "";

  const [scope, permissions] = await Promise.all([
    getScopedLocationIds(),
    getUserPermissions(),
  ]);

  const results = await globalSearch(scope, term, permissions);
  return NextResponse.json(serializeForClient(results));
}
```

> `getUserPermissions()` redirects to `/login` when there is no session, so an unauthenticated request never reaches `globalSearch`. No explicit 403 is needed — a logged-in user with none of the four `*.view` permissions simply gets all-empty groups.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual sanity (optional) + commit**

```bash
git add src/app/api/search/route.ts
git commit -m "feat: GET /api/search route handler"
```

---

### Task 3: `<CommandPalette>` component + layout mount + header trigger

**Files:**
- Create: `src/app/_components/command-palette.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/layout.tsx`
- Modify: `src/app/_components/header.tsx`

**Interfaces:**
- Consumes: `SearchHit`, `SearchResults`, `SearchType` from `@/app/_db/search`; `useLocation` from `@/app/_context/location-context`; `useRouter` from `next/navigation`.
- Produces: `CommandPalette` (default-style export `CommandPalette`). It owns its own open/close state via the ⌘K listener; no props required. The header dispatches a custom DOM event `"open-command-palette"` to open it (keeps the header decoupled from the palette's internals).

- [ ] **Step 1: Create the component**

Create `src/app/_components/command-palette.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "@/app/_context/location-context";
import type { SearchHit, SearchResults } from "@/app/_db/search";

const GROUPS: { key: keyof SearchResults; title: string }[] = [
  { key: "tenants", title: "Penyewa" },
  { key: "bookings", title: "Pemesanan" },
  { key: "bills", title: "Tagihan" },
  { key: "rooms", title: "Kamar" },
];

const EMPTY: SearchResults = { tenants: [], bookings: [], bills: [], rooms: [] };

export function CommandPalette() {
  const router = useRouter();
  const { selectedLocationId } = useLocation();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Flattened list (in group order) for keyboard nav + index mapping.
  const flat: SearchHit[] = GROUPS.flatMap((g) => results[g.key]);

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setResults(EMPTY);
    setError(false);
    setHighlight(0);
  }, []);

  // Global ⌘K / Ctrl-K toggle + custom event from the header trigger.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("open-command-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  // Focus the input when opened; lock body scroll.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      // focus after paint
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        clearTimeout(t);
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Debounced, abortable fetch.
  useEffect(() => {
    if (!open) return;
    const q = term.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("search failed");
        const data: SearchResults = await res.json();
        setResults(data);
        setHighlight(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      close();
      if (hit.locationId != null && hit.locationId !== selectedLocationId) {
        // Switch location (cookie) then full-navigate so the server re-scopes.
        document.cookie = `selectedLocationId=${hit.locationId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
        window.location.href = hit.href;
      } else {
        router.push(hit.href);
      }
    },
    [close, router, selectedLocationId]
  );

  // Keyboard nav within the palette.
  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[highlight];
      if (hit) go(hit);
    }
  }

  let flatIndex = -1; // running index across groups for highlight mapping

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh]"
          style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            className="w-full max-w-xl rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-lg)" }}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Cari penyewa, pemesanan, tagihan, kamar…"
              className="w-full px-5 py-4 text-base outline-none border-b"
              style={{
                backgroundColor: "transparent",
                color: "var(--color-text-primary)",
                borderColor: "var(--color-border)",
              }}
            />
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {loading && (
                <p className="px-5 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Mencari…
                </p>
              )}
              {!loading && error && (
                <p className="px-5 py-3 text-sm" style={{ color: "#DC2626" }}>
                  Gagal memuat hasil pencarian
                </p>
              )}
              {!loading && !error && term.trim().length < 2 && (
                <p className="px-5 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Ketik untuk mencari…
                </p>
              )}
              {!loading && !error && term.trim().length >= 2 && flat.length === 0 && (
                <p className="px-5 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Tidak ada hasil
                </p>
              )}
              {!loading && !error &&
                GROUPS.map((g) => {
                  const hits = results[g.key];
                  if (hits.length === 0) return null;
                  return (
                    <div key={g.key} className="py-1">
                      <p
                        className="px-5 py-1 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {g.title}
                      </p>
                      {hits.map((hit) => {
                        flatIndex += 1;
                        const idx = flatIndex;
                        const active = idx === highlight;
                        const showLoc =
                          hit.locationName != null && hit.locationId !== selectedLocationId;
                        return (
                          <button
                            key={`${hit.type}-${hit.id}`}
                            onMouseEnter={() => setHighlight(idx)}
                            onClick={() => go(hit)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left"
                            style={{ backgroundColor: active ? "var(--color-accent-light)" : "transparent" }}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                                {hit.label}
                              </span>
                              <span className="block text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
                                {hit.sublabel}
                              </span>
                            </span>
                            {showLoc && (
                              <span
                                className="shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "var(--color-bg-primary)", color: "var(--color-text-secondary)" }}
                              >
                                {hit.locationName}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

> The "+N lainnya" per-group affordance from the spec is intentionally satisfied by the result rows themselves linking to the filtered list page (each row's `href` for booking/bill/room IS the filtered list). Add an explicit "+N lainnya" row only if the reviewer/spec deems the per-row links insufficient — the rows already provide the path to the full filtered list, so YAGNI applies here. (If you do add it, render one row per group whose `href` is the same `/<list>?q=<term>`.)

- [ ] **Step 2: Mount in the dashboard layout**

In `src/app/(internal)/(dashboard_layout)/layout.tsx`, import and render the palette inside the provider tree (it needs `useLocation`). Add the import:

```tsx
import { CommandPalette } from "@/app/_components/command-palette";
```

Render `<CommandPalette />` just inside `<TourProvider>` (sibling of `<SessionRefresh />`), so it sits within `LocationProvider`:

```tsx
        <TourProvider>
          <SessionRefresh />
          <CommandPalette />
          <div className="flex h-screen overflow-hidden">
```

- [ ] **Step 3: Add the header trigger**

In `src/app/_components/header.tsx`, add a clickable affordance in the right-side cluster (before `<TourButton />`) that dispatches the custom event. Insert at the start of the `<div className="flex items-center gap-3">` right-side block:

```tsx
        <button
          onClick={() => document.dispatchEvent(new CustomEvent("open-command-palette"))}
          className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          aria-label="Cari"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <span>Cari…</span>
          <kbd className="text-[10px] px-1 py-0.5 rounded border" style={{ borderColor: "var(--color-border)" }}>⌘K</kbd>
        </button>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Build to confirm no client/server boundary error**

Run: `npx next build 2>&1 | tail -20`
Expected: build completes; no error about hook/context usage or the new route. (Catches a client/server mistake cheaply.)

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/command-palette.tsx \
  "src/app/(internal)/(dashboard_layout)/layout.tsx" \
  src/app/_components/header.tsx
git commit -m "feat: command palette UI + ⌘K trigger + dashboard mount"
```

---

### Task 4: E2E proof

**Files:**
- Create: `e2e/specs/global-search.spec.ts`

**Interfaces:**
- Consumes: the mounted palette + `/api/search`; the default admin storageState; `ROUTES` from `e2e/fixtures/test-data.ts`.

- [ ] **Step 1: Check seed data**

Read `prisma/seed-mock.ts` to find a seeded tenant name and a seeded bill invoice number to assert against (the e2e DB is seeded by globalSetup). Pick one of each that is stable.

- [ ] **Step 2: Write the spec**

Create `e2e/specs/global-search.spec.ts` (default admin session = all locations). Replace `SEEDED_TENANT` / `SEEDED_INVOICE` with real values found in Step 1.

```ts
import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

const SEEDED_TENANT = "Budi"; // adjust to a real seeded tenant name substring
const SEEDED_INVOICE = "INV"; // adjust to a real seeded invoice_number substring

test.describe("Global command-palette search", () => {
  test("Cmd-K opens the palette and finds a tenant, navigating to detail", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await page.keyboard.press("Meta+k"); // chromium on the harness maps Meta
    const input = page.getByPlaceholder(/Cari penyewa/);
    await expect(input).toBeVisible();

    await input.fill(SEEDED_TENANT);
    // Penyewa group appears with at least one result
    await expect(page.getByText("Penyewa", { exact: true })).toBeVisible();
    const firstTenant = page.getByRole("button").filter({ hasText: SEEDED_TENANT }).first();
    await firstTenant.click();
    await expect(page).toHaveURL(/\/residents\/tenants\/[^/]+$/);
  });

  test("searching an invoice number drills down to the filtered bills page", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder(/Cari penyewa/);
    await input.fill(SEEDED_INVOICE);
    await expect(page.getByText("Tagihan", { exact: true })).toBeVisible();
    await page.getByRole("button").filter({ hasText: SEEDED_INVOICE }).first().click();
    await expect(page).toHaveURL(/\/bills\?q=/);
    await expect(page.getByText("Terjadi Kesalahan")).toHaveCount(0);
  });
});
```

> If `Meta+k` does not toggle in the harness's chromium, use `page.evaluate(() => document.dispatchEvent(new CustomEvent("open-command-palette")))` to open via the same event the header trigger uses, then proceed. Prefer the real keypress; fall back only if needed and note it in the report.

- [ ] **Step 3: Run the E2E spec**

Ensure the e2e DB is up (`docker compose -f docker-compose.test.yml up -d e2e-db`). Then:
Run: `npx playwright test --config e2e/playwright.config.ts global-search`
Expected: PASS (2 tests + setup). First dev-server compile is slow (config allows 120s).

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/global-search.spec.ts
git commit -m "test(e2e): global search opens, finds, and navigates"
```

---

### Task 5: Help center + roadmap docs

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/help/help-client.tsx` (add a note)
- Modify: `/Users/rsalim/.claude/projects/-Users-rsalim-personal-hms-revamp/memory/project_improvement_roadmap.md` (record 1.4 done + backlog item)

**Interfaces:** none.

- [ ] **Step 1: Help center note**

Add a concise Indonesian FAQ entry to `help-client.tsx` (match the existing `content` string-array format). Add it to the most contextually appropriate existing section (e.g. the "Alur Kerja Harian" / general section — read the file to choose):

```
"Pencarian Cepat (⌘K / Ctrl-K): tekan ⌘K (atau Ctrl-K) di mana saja untuk membuka pencarian global. Cari penyewa, pemesanan, tagihan, atau kamar di seluruh lokasi yang dapat Anda akses, lalu klik hasil untuk membukanya.",
```

- [ ] **Step 2: Roadmap memory**

Record that Phase 1.4 (global search) is implemented (branch `feat/global-search`), with the backlog follow-up: "detail pages for bookings/bills/rooms so global-search results can deep-link like tenants do." Convert relative dates to absolute (2026-06-26).

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add "src/app/(internal)/(dashboard_layout)/help/help-client.tsx"
git commit -m "docs: help center note for global search (⌘K)"
```

(The roadmap memory lives outside the repo and persists on its own — no commit needed.)

---

## Final Verification (after all tasks)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx vitest run` — all unit + integration pass (317 existing + the new global-search block), test DB :5433 up.
- [ ] `npx playwright test --config e2e/playwright.config.ts` — full E2E green (23 existing + 2 new), e2e DB :5434 up.
- [ ] Manual smoke (optional): press ⌘K anywhere in the dashboard; type a tenant name → Penyewa group → Enter opens the 360° page; type an invoice number → Tagihan group → opens `/bills?q=…`; type a room number that exists in another of your locations → result shows a location badge → selecting it switches location and lands on the row. As a scoped (non-admin) user, confirm results never include other-location records.
