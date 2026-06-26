# Global Command-Palette Search (Phase 1.4) — Design Spec

**Date:** 2026-06-26
**Status:** Approved (pending spec review)
**Roadmap item:** Phase 1.4 — Global search (command palette, ⌘K) across tenants, bookings, bills, rooms.

## Problem

Finding a specific tenant, booking, bill, or room means navigating to the right
list page and searching there — and that list is scoped to the currently-selected
location, so an entity in another of the user's locations isn't reachable without
first switching. There is no single, fast, keyboard-driven way to jump to any
record from anywhere in the app.

## Goal

A ⌘K / Ctrl-K command palette that searches **tenants, bookings, bills, rooms**
across **all locations the user can access**, shows grouped results (top 5 per
entity), and on selection navigates to the record — switching the selected
location first when the result lives elsewhere. Permission-gated per entity;
dependency-free (built on the existing `Modal` patterns).

## Decisions

- **Result navigation:** tenant → its 360° detail page (`/residents/tenants/[id]`);
  booking/bill/room → their list page **pre-filtered** with `?q=<term>` (those have
  no detail page today). Building detail pages for the other three is **backlog**.
- **Search scope:** **all locations in the user's session scope** (not just the
  selected one). Each result is tagged with its location; selecting a result in
  another location switches the selected location first (see Navigation).
- **Result volume:** top **5 per entity group**, grouped by type, with a
  "+N lainnya" row linking to the filtered list page.
- **Transport:** a **GET API route** (`/api/search`), matching the app's existing
  client-read pattern (`/api/financials/summary`), each entity gated by its
  `*.view` permission. No `cmdk` or other new dependency.
- **Scope source:** the user's session `LocationScope` from `getScopedLocationIds()`
  (`number[] | null`, `null` = unrestricted admin) — NOT the selected location.

## Architecture & Data Flow

```
⌘K / Ctrl-K (global keydown in client <CommandPalette>, mounted in dashboard layout)
  → opens Modal with a search input
  → type → 350ms debounce (mirrors ServerDataTable) → GET /api/search?q=<term>
       (AbortController cancels the prior in-flight request)
     server: scope = await getScopedLocationIds(); perms = await getUserPermissions()
             results = await globalSearch(scope, term, perms)   // permission-gated, scoped
     → { tenants[], bookings[], bills[], rooms[] } (serializeForClient)
  → render grouped results (max 5/group + "+N lainnya")
  → select (click or ↑/↓ + Enter):
       if hit.locationId != null && hit.locationId !== selectedLocationId:
            set selectedLocationId cookie directly, then window.location.href = hit.href
       else: navigate to hit.href (router.push for same-origin)
```

### New units

- **`src/app/_db/search.ts`** — `globalSearch(scope, term, permissions): Promise<SearchResults>`.
- **`src/app/api/search/route.ts`** — `GET` handler: reads `?q=`, resolves scope +
  permissions, calls `globalSearch`, returns `serializeForClient(results)`.
- **`src/app/_components/command-palette.tsx`** — `"use client"` palette UI
  (keydown listener, debounced abortable fetch, grouped results, keyboard nav).
- **Mount** `<CommandPalette />` in
  `src/app/(internal)/(dashboard_layout)/layout.tsx`, inside the existing providers
  (it needs `useLocation()` for the current selected id). Dashboard-only
  (authenticated), not the root layout.

### `globalSearch` query module

Signature: `globalSearch(scope: LocationScope, term: string, permissions: Set<Permission>): Promise<SearchResults>`.

- Empty/whitespace `term` → returns all-empty groups without touching the DB.
- Runs only the blocks the user is permitted to see; each gated by
  `permissions.has("tenants.view" | "bookings.view" | "bills.view" | "rooms.view")`.
  An entity the user can't view is simply absent.
- Reuses the **exact list-page search predicates** (consistency), adds scope,
  `take: 5`, and an `orderBy`. When `scope === null` (unrestricted admin), the
  `location_id in scope` clauses are omitted.

| Entity | Match fields (insensitive `contains`) | Scope clause | orderBy | includes |
|---|---|---|---|---|
| tenants | name, email, phone, id_number | none (tenants are global today) | `name asc` | — |
| rooms | room_number, roomtypes.type | `location_id in scope` | `room_number asc` | roomtypes, locations |
| bookings | tenants.name, rooms.room_number | `rooms.location_id in scope` + `deletedAt: null` | `createdAt desc` | tenants, rooms→locations |
| bills | invoice_number, description, bookings.tenants.name, bookings.rooms.room_number | `bookings.rooms.location_id in scope` + `deletedAt: null` | `due_date desc` | bookings→tenants, bookings→rooms→locations |

Each row maps to a uniform hit:

```ts
type SearchType = "tenant" | "booking" | "bill" | "room";

interface SearchHit {
  id: string;                       // stringified (booking/bill/room ids are int; tenant is cuid)
  type: SearchType;
  label: string;                    // tenant name / room_number / invoice_number / "Kamar · Penyewa"
  sublabel: string;                 // email / room type / "Kamar · Penyewa" / description
  href: string;                     // tenant → /residents/tenants/<id>; others → /<list>?q=<term>
  locationId: number | null;        // null for tenants
  locationName: string | null;
}

interface SearchResults {
  tenants: SearchHit[];
  bookings: SearchHit[];
  bills: SearchHit[];
  rooms: SearchHit[];
}
```

`href` per type (term URI-encoded):
- tenant → `/residents/tenants/<id>`
- booking → `/bookings?q=<term>`
- bill → `/bills?q=<term>`
- room → `/rooms/all-rooms?q=<term>`

The "+N lainnya" affordance per group links to the same list `?q=<term>`.

### Navigation & cross-location switch

`useLocation().setSelectedLocationId` calls `window.location.reload()` (it reloads
the *current* page), so it cannot be used to land on a different page. For a
cross-location result the palette therefore:

1. writes the cookie directly:
   `document.cookie = "selectedLocationId=<id>;path=/;max-age=...;samesite=lax"`
   (same format the location context uses), then
2. `window.location.href = hit.href` — a full navigation that both applies the new
   cookie scope server-side and lands on the destination in one step.

Same-location (or tenant, `locationId: null`) results use a normal client
navigation (`router.push(hit.href)`).

## Components & UX

`<CommandPalette>` (client):

- **Trigger:** global `keydown` for ⌘K / Ctrl-K (`preventDefault`), toggles open.
  Plus a subtle clickable affordance in the header ("Cari… ⌘K") for discoverability.
  **Esc** closes (Modal behavior).
- **Input + debounce:** 350ms. Each fetch uses an `AbortController`; a new keystroke
  aborts the prior request so a stale response can't overwrite a newer one. Terms
  shorter than 2 characters show a "Ketik untuk mencari…" hint instead of querying.
- **Results:** grouped sections — **Penyewa / Pemesanan / Tagihan / Kamar** — each
  header rendered only if it has hits; max 5 rows + "+N lainnya" linking to the
  filtered list. Each row shows the primary label, a muted sublabel, and a
  **location badge** when `locationName` is set and differs from the current
  selection (cross-location hits are visually obvious).
- **Keyboard nav:** ↑/↓ move a highlight across the flattened result list; **Enter**
  activates the highlight; mouse hover syncs the highlight.
- **States:** idle (empty input → hint), loading (spinner), empty ("Tidak ada
  hasil"), error ("Gagal memuat hasil pencarian"). Indonesian copy throughout.
- Reuses Modal overlay/animation/z-index conventions.

## Error Handling

- **Fetch failure** → inline error in the palette; never crashes the app. Aborted
  requests are ignored (not surfaced as errors).
- **No view permissions** → endpoint returns all-empty groups (HTTP 200), palette
  shows "no results" — no 403 reaches the UI.
- **`scope === null` (admin)** → all locations searched; scoped user → only their
  locations.
- **Empty/short `q`** → empty groups, no DB query.

## Testing

- **Integration (Vitest, test DB :5433)** on `globalSearch`:
  - each entity returns matches on its documented fields;
  - results cap at 5 per group;
  - **location scope**: a row in another location is excluded for a scoped user
    (`scope = [otherId]`) and included for `scope = null` (admin);
  - **permission gating**: omitting `bills.view` from the permissions set yields an
    empty `bills` group while other groups still populate;
  - empty/whitespace term → all-empty, no throw;
  - hit shape correct (href format per type, `locationName` populated for
    room/booking/bill, `null` for tenant).
- **E2E (Playwright, admin session = all locations):**
  - ⌘K opens the palette;
  - typing a seeded tenant name shows a Penyewa group; activating it navigates to
    that tenant's detail page;
  - typing a seeded invoice number shows a Tagihan result that navigates to
    `/bills?q=<term>` without the error boundary.
- Existing suite (317 unit/integration + 23 E2E) stays green; the palette is additive.

## Out of Scope (backlog)

- Detail pages for bookings / bills / rooms (so those results could deep-link like
  tenants do). Filed as a follow-up.
- Searching other entities (payments, deposits, guests, add-ons).
- Fuzzy / typo-tolerant ranking — we use the existing `contains` predicates.
- Recent-searches history and search analytics.
