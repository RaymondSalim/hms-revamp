# Disable Unauthorized Action Buttons (P.2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable (greyed-out + tooltip) every manage-gated action button for users who lack the required permission, so buttons never silently error on click.

**Architecture:** A new client `PermissionsProvider` context is seeded once in the dashboard layout from the permission set the layout already fetches. Tables and section components read it via `usePermissions().can(perm)` — an O(1) in-memory `Set.has` lookup, no new queries or network calls. `ActionMenu` gains a `disabled` field; create buttons and the notes delete button consult `can(...)` directly. Server actions are unchanged and remain the real enforcement boundary.

**Tech Stack:** Next.js 16 App Router (React 19), TypeScript, Vitest (node env), Playwright E2E, Prisma 6 / Postgres.

## Global Constraints

- Indonesian-language UI. Disabled-button tooltip text is exactly: `Anda tidak memiliki izin untuk tindakan ini`.
- Theming via CSS variables + inline styles + Tailwind utility classes (existing pattern). No new styling system.
- The disable decision for each button uses the EXACT permission string its server action already checks via `checkPermission(...)`. The server action is NOT modified.
- Vitest runs in `node` environment and only includes `tests/**/*.test.ts` (NOT `.tsx`). Do NOT add React Testing Library / jsdom. Pure logic is unit-tested in node; rendered disabled-DOM behavior is covered by Playwright E2E.
- Read-only actions (`Detail`, `Unduh Invoice`/download, email-log `Detail`) must REMAIN enabled for everyone. Only mutating actions get disabled.
- `disabled` is an OPTIONAL addition to `ActionItem` — fully backwards-compatible; existing call sites compile unchanged.
- Scope: only tables whose page-level `*.view` gate differs from their button-level `*.manage` gate. Settings managers (company, billing, email-templates, email-logs, roles) and utilities are OUT OF SCOPE because their page gate already equals their button gate (`AccessDenied` hides the whole page). Credits refund is OUT OF SCOPE (not wired to any client component).

## In-Scope Surfaces (per spec, re-verified 2026-06-25)

| Page / component | File | Mutating button(s) | Disable on |
|---|---|---|---|
| locations | `locations/location-table.tsx` | create, Edit, Hapus | `locations.manage` |
| durations | `rooms/durations/duration-table.tsx` | create, Edit, Hapus | `durations.manage` |
| all-rooms | `rooms/all-rooms/room-table.tsx` | create, Edit, Hapus | `rooms.manage` |
| room-types | `rooms/room-types/room-type-table.tsx` | create, Edit, Hapus, pricing save | `room_types.manage` |
| addons | `addons/addon-table.tsx` | create, Edit, Hapus | `addons.manage` |
| tenants | `residents/tenants/tenant-table.tsx` | create, Edit, Hapus (NOT Detail) | `tenants.manage` |
| guests | `residents/guests/guest-table.tsx` | create, Edit, Hapus (NOT Detail) | `guests.manage` |
| users | `settings/users/user-table.tsx` | create, Edit, Hapus | `users.manage` |
| bookings | `bookings/booking-table.tsx` | create, Edit, Check In, Check Out, Akhiri, Hapus | `bookings.manage` |
| payments | `payments/payment-table.tsx` | create, Edit, Hapus | `payments.manage` |
| deposits | `deposits/deposit-table.tsx` | Ubah Status, Edit Jumlah | `deposits.manage` |
| bills | `bills/bill-table.tsx` | create, Edit, Kirim Email (NOT Detail, NOT Unduh Invoice) | `bills.manage` |
| tenant 360 notes | `residents/tenants/[id]/notes-section.tsx` | Hapus (per note) | `roles.manage` |

---

### Task 1: PermissionsProvider context + usePermissions hook

**Files:**
- Create: `src/app/_context/permissions-context.tsx`
- Test: `tests/unit/permissions-context.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `PermissionsProvider({ children, permissions }: { children: ReactNode; permissions: string[] })` — client component.
  - `usePermissions(): { can: (permission: string) => boolean }` — throws `Error("usePermissions must be used within a PermissionsProvider")` if used outside a provider.
  - `buildCan(permissions: string[]): (permission: string) => boolean` — exported pure helper (so logic is unit-testable in node env without rendering).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/permissions-context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCan } from "@/app/_context/permissions-context";

describe("buildCan", () => {
  it("returns true for a permission that is present", () => {
    const can = buildCan(["locations.manage", "tenants.view"]);
    expect(can("locations.manage")).toBe(true);
  });

  it("returns false for a permission that is absent", () => {
    const can = buildCan(["tenants.view"]);
    expect(can("locations.manage")).toBe(false);
  });

  it("returns false for every check when the list is empty", () => {
    const can = buildCan([]);
    expect(can("anything.manage")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/permissions-context.test.ts`
Expected: FAIL — `buildCan` is not exported / module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/_context/permissions-context.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/** Pure, render-free permission checker. Exported for unit testing in node env. */
export function buildCan(permissions: string[]): (permission: string) => boolean {
  const set = new Set(permissions);
  return (permission: string) => set.has(permission);
}

interface PermissionsContextValue {
  can: (permission: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(
  undefined
);

export function PermissionsProvider({
  children,
  permissions,
}: {
  children: ReactNode;
  permissions: string[];
}) {
  const value = useMemo<PermissionsContextValue>(
    () => ({ can: buildCan(permissions) }),
    [permissions]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/permissions-context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/app/_context/permissions-context.tsx tests/unit/permissions-context.test.ts
git commit -m "feat: PermissionsProvider context + usePermissions hook"
```

---

### Task 2: Wire PermissionsProvider into the dashboard layout

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/layout.tsx`

**Interfaces:**
- Consumes: `PermissionsProvider` from Task 1; the `permissions` variable already computed at `layout.tsx:25` (`const permissions = await getUserPermissions();`).
- Produces: every client component under the dashboard layout can now call `usePermissions()`.

This task has no unit test (it is provider wiring verified by typecheck + the full build; behavioral proof comes from the E2E task). It is a single focused change worth its own commit.

- [ ] **Step 1: Add the import**

At the top of `src/app/(internal)/(dashboard_layout)/layout.tsx`, alongside the other context imports (the file already imports `LocationProvider` from `@/app/_context/location-context`), add:

```tsx
import { PermissionsProvider } from "@/app/_context/permissions-context";
```

- [ ] **Step 2: Wrap the existing tree**

The current return wraps everything in `<LocationProvider>...</LocationProvider>`. Wrap the `LocationProvider` with `PermissionsProvider` so it sits at the top (it has no dependency on location). Change:

```tsx
  return (
    <LocationProvider initialLocations={locations} initialLocationId={initialLocationId}>
      <TourProvider>
```

to:

```tsx
  return (
    <PermissionsProvider permissions={[...permissions]}>
      <LocationProvider initialLocations={locations} initialLocationId={initialLocationId}>
        <TourProvider>
```

And at the end of the return, change the matching closing tags:

```tsx
      </TourProvider>
    </LocationProvider>
```

to:

```tsx
        </TourProvider>
      </LocationProvider>
    </PermissionsProvider>
```

(Re-indent the wrapped block by two spaces to keep the file tidy. If re-indentation is noisy, leaving indentation as-is is acceptable — correctness matters, not whitespace.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Build the route to confirm no runtime/RSC boundary error**

Run: `npx next build 2>&1 | tail -20`
Expected: build completes; no error about context/hook usage. (A full build is the cheapest way to catch a client/server boundary mistake here.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/layout.tsx"
git commit -m "feat: provide permissions context in dashboard layout"
```

---

### Task 3: Add `disabled` support to ActionMenu

**Files:**
- Modify: `src/app/_components/action-menu.tsx`
- Test: `tests/unit/action-menu-logic.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ActionItem` gains two optional fields:
  - `disabled?: boolean`
  - `disabledReason?: string`
  Plus an exported pure helper for layout logic:
  - `splitInline(itemCount: number, maxInline: number): { inline: number; overflow: number }` — returns how many items render inline vs in the overflow dropdown. Disabled items are counted identically to enabled ones (layout stability).

The default tooltip when `disabled` is true and no `disabledReason` is given is the constant `DEFAULT_DISABLED_REASON = "Anda tidak memiliki izin untuk tindakan ini"` (exported).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/action-menu-logic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitInline, DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";

describe("splitInline", () => {
  it("renders all items inline when count <= maxInline", () => {
    expect(splitInline(2, 2)).toEqual({ inline: 2, overflow: 0 });
  });

  it("splits into inline + overflow when count > maxInline", () => {
    expect(splitInline(5, 2)).toEqual({ inline: 2, overflow: 3 });
  });

  it("treats disabled items no differently — split depends only on count", () => {
    // Whether items are disabled does not change the count-based split.
    expect(splitInline(3, 2)).toEqual({ inline: 2, overflow: 1 });
  });
});

describe("DEFAULT_DISABLED_REASON", () => {
  it("is the Indonesian permission message", () => {
    expect(DEFAULT_DISABLED_REASON).toBe("Anda tidak memiliki izin untuk tindakan ini");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/action-menu-logic.test.ts`
Expected: FAIL — `splitInline` / `DEFAULT_DISABLED_REASON` not exported.

- [ ] **Step 3: Implement in `src/app/_components/action-menu.tsx`**

3a. Extend the interface (currently lines 5-10):

```ts
export interface ActionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger" | "success" | "warning" | "info";
  disabled?: boolean;
  disabledReason?: string;
}
```

3b. Add these exports near the top of the file (after imports):

```ts
export const DEFAULT_DISABLED_REASON = "Anda tidak memiliki izin untuk tindakan ini";

/** Count-based split of action items into inline buttons vs overflow dropdown.
 *  Disabled items count the same as enabled ones, so the layout is identical
 *  regardless of the user's permissions (no row-to-row shift). */
export function splitInline(
  itemCount: number,
  maxInline: number
): { inline: number; overflow: number } {
  if (itemCount <= maxInline) return { inline: itemCount, overflow: 0 };
  return { inline: maxInline, overflow: itemCount - maxInline };
}
```

3c. Update `IconButton` (currently lines 45-65) to honor `disabled`:

```tsx
function IconButton({ item }: { item: ActionItem }) {
  const style = variantStyles[item.variant ?? "default"];
  const isDisabled = item.disabled ?? false;
  return (
    <button
      onClick={isDisabled ? undefined : item.onClick}
      disabled={isDisabled}
      title={isDisabled ? item.disabledReason ?? DEFAULT_DISABLED_REASON : item.label}
      className="p-1.5 rounded-lg transition-colors duration-150"
      style={{
        color: style.color,
        backgroundColor: style.bg,
        opacity: isDisabled ? 0.4 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.backgroundColor = style.hoverBg;
        e.currentTarget.style.color = "white";
      }}
      onMouseLeave={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.backgroundColor = style.bg;
        e.currentTarget.style.color = style.color;
      }}
    >
      {item.icon}
    </button>
  );
}
```

3d. Update the overflow dropdown `<button>` (currently the block rendering `overflowItems.map(...)`, lines 131-153) so each overflow item honors `disabled`. Replace the `onClick`, and add `disabled`, `title`, and disabled styling:

```tsx
{overflowItems.map((item, i) => {
  const style = variantStyles[item.variant ?? "default"];
  const isDisabled = item.disabled ?? false;
  return (
    <button
      key={i}
      disabled={isDisabled}
      title={isDisabled ? item.disabledReason ?? DEFAULT_DISABLED_REASON : undefined}
      onClick={() => {
        if (isDisabled) return;
        setOpen(false);
        item.onClick();
      }}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors duration-100"
      style={{
        color: style.color,
        opacity: isDisabled ? 0.4 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.backgroundColor = style.bg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );
})}
```

3e. (Optional refactor for DRY) The existing component computes `inlineItems`/`overflowItems` with `items.slice(...)`. Leave that slicing as-is; `splitInline` exists for the test and documents the rule. Do NOT rip out working slice logic — YAGNI.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/action-menu-logic.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. (All existing `ActionMenu` call sites still compile because `disabled` is optional.)

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/action-menu.tsx tests/unit/action-menu-logic.test.ts
git commit -m "feat: disabled-item support in ActionMenu"
```

---

### Task 4: Apply disable to the simple CRUD tables

**Files (modify each):**
- `src/app/(internal)/(dashboard_layout)/locations/location-table.tsx` → `locations.manage`
- `src/app/(internal)/(dashboard_layout)/rooms/durations/duration-table.tsx` → `durations.manage`
- `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/room-table.tsx` → `rooms.manage`
- `src/app/(internal)/(dashboard_layout)/addons/addon-table.tsx` → `addons.manage`
- `src/app/(internal)/(dashboard_layout)/settings/users/user-table.tsx` → `users.manage`

**Interfaces:**
- Consumes: `usePermissions` (Task 1), `DEFAULT_DISABLED_REASON` + `ActionItem.disabled` (Task 3).
- Produces: nothing downstream.

Each of these five tables has the identical shape: a `+ Tambah X` create button and an `ActionMenu` with `Edit` + `Hapus`. Apply the SAME edit to each (substitute the file's permission string from the list above). The example below is for `location-table.tsx` with `locations.manage`.

- [ ] **Step 1: Add the hook import and call**

Add to the imports:

```tsx
import { usePermissions } from "@/app/_context/permissions-context";
import { DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";
```

Inside the component, near the other hooks (e.g. after `const router = useRouter();`):

```tsx
  const { can } = usePermissions();
  const canManage = can("locations.manage"); // <-- per-file permission string
```

- [ ] **Step 2: Disable the Edit/Hapus items**

In the `ActionMenu` `items` array, add `disabled: !canManage` to each mutating item:

```tsx
        <ActionMenu
          items={[
            { label: "Edit", icon: Icons.edit, onClick: () => openEdit(row.original), disabled: !canManage },
            { label: "Hapus", icon: Icons.delete, onClick: () => setDeleteConfirm(row.original), variant: "danger", disabled: !canManage },
          ]}
        />
```

- [ ] **Step 3: Disable the create button**

Find the `+ Tambah ...` button and add `disabled` + tooltip + disabled classes:

```tsx
        <button
          onClick={openCreate}
          disabled={!canManage}
          title={canManage ? undefined : DEFAULT_DISABLED_REASON}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          + Tambah Lokasi
        </button>
```

(Keep each file's existing button text and classes; just add `disabled`, `title`, and the two `disabled:` utility classes.)

- [ ] **Step 4: Repeat Steps 1-3 for the other four files**

Use the permission string mapped in the Files list. The `+ Tambah` label and `can("...")` string differ per file; everything else is identical.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Run the full unit/integration suite to confirm nothing regressed**

Run: `npx vitest run`
Expected: all tests pass (existing 268 + new from Tasks 1 & 3).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/locations/location-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/rooms/durations/duration-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/rooms/all-rooms/room-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/addons/addon-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/settings/users/user-table.tsx"
git commit -m "feat: disable manage actions in simple CRUD tables"
```

---

### Task 5: Apply disable to tenants, guests, and room-types tables

**Files (modify each):**
- `src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-table.tsx` → `tenants.manage`
- `src/app/(internal)/(dashboard_layout)/residents/guests/guest-table.tsx` → `guests.manage`
- `src/app/(internal)/(dashboard_layout)/rooms/room-types/room-type-table.tsx` → `room_types.manage`

**Interfaces:**
- Consumes: `usePermissions`, `DEFAULT_DISABLED_REASON`, `ActionItem.disabled`.
- Produces: nothing downstream.

These differ from Task 4 because they have a read-only `Detail` action (tenants, guests) that MUST stay enabled, and room-types has an extra "pricing" button.

- [ ] **Step 1: tenant-table.tsx**

Add imports + `const { can } = usePermissions(); const canManage = can("tenants.manage");`.

In the `ActionMenu` items, leave `Detail` untouched; add `disabled: !canManage` ONLY to `Edit` and `Hapus`:

```tsx
        <ActionMenu
          items={[
            { label: "Detail", icon: Icons.detail, onClick: () => { window.location.href = `/residents/tenants/${row.original.id}`; } },
            { label: "Edit", icon: Icons.edit, onClick: () => handleEdit(row.original), disabled: !canManage },
            { label: "Hapus", icon: Icons.delete, onClick: () => handleDelete(row.original.id), variant: "danger", disabled: !canManage },
          ]}
        />
```

Disable the `+ Tambah Penghuni` create button (same pattern as Task 4 Step 3, with `title={canManage ? undefined : DEFAULT_DISABLED_REASON}` and `disabled:opacity-50 disabled:cursor-not-allowed`).

- [ ] **Step 2: guest-table.tsx**

Add imports + `const { can } = usePermissions(); const canManage = can("guests.manage");`.

The guest `Detail` item is conditionally spread (`...(cond ? [{ Detail }] : [])`) — leave it untouched. Add `disabled: !canManage` to `Edit` and `Hapus`:

```tsx
            { label: "Edit", icon: Icons.edit, onClick: () => handleEdit(row.original), disabled: !canManage },
            { label: "Hapus", icon: Icons.delete, onClick: () => handleDelete(row.original.id), variant: "danger" as const, disabled: !canManage },
```

Disable the `+ Tambah Tamu` create button (same pattern).

- [ ] **Step 3: room-type-table.tsx**

Add imports + `const { can } = usePermissions(); const canManage = can("room_types.manage");`.

Add `disabled: !canManage` to the `Edit` and `Hapus` items.

This table has TWO header buttons: a pricing button (`onClick={() => setPricingModal(true)}`) and the `+ Tambah Tipe` create button. Disable BOTH (pricing edits prices → needs `room_types.manage`):

```tsx
          <button
            onClick={() => setPricingModal(true)}
            disabled={!canManage}
            title={canManage ? undefined : DEFAULT_DISABLED_REASON}
            className="<existing classes> disabled:opacity-50 disabled:cursor-not-allowed"
            ...
          >
            <existing pricing label>
          </button>
          <button
            onClick={openCreate}
            disabled={!canManage}
            title={canManage ? undefined : DEFAULT_DISABLED_REASON}
            className="<existing classes> disabled:opacity-50 disabled:cursor-not-allowed"
            ...
          >
            + Tambah Tipe
          </button>
```

Keep the existing classes/styles; only add `disabled`, `title`, and the two `disabled:` utilities.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/residents/guests/guest-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/rooms/room-types/room-type-table.tsx"
git commit -m "feat: disable manage actions in tenants/guests/room-types tables"
```

---

### Task 6: Apply disable to transactional tables (bookings, payments, deposits, bills)

**Files (modify each):**
- `src/app/(internal)/(dashboard_layout)/bookings/booking-table.tsx` → `bookings.manage`
- `src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx` → `payments.manage`
- `src/app/(internal)/(dashboard_layout)/deposits/deposit-table.tsx` → `deposits.manage`
- `src/app/(internal)/(dashboard_layout)/bills/bill-table.tsx` → `bills.manage`

**Interfaces:**
- Consumes: `usePermissions`, `DEFAULT_DISABLED_REASON`, `ActionItem.disabled`.
- Produces: nothing downstream.

These use `ServerDataTable` and build their `items` arrays with more entries / conditional spreads. Disable only the MUTATING items; keep read actions enabled.

- [ ] **Step 1: booking-table.tsx**

Add imports + `const { can } = usePermissions(); const canManage = can("bookings.manage");`.

The items array (around line 306) is built as a `const items = [...]` possibly with a conditional `Akhiri` spread. Add `disabled: !canManage` to EVERY item (`Edit`, `Check In`, `Check Out`, `Akhiri`, `Hapus`) — all are mutations:

```tsx
        const items = [
          { label: "Edit", icon: Icons.edit, onClick: () => openEdit(row.original), disabled: !canManage },
          { label: "Check In", icon: Icons.checkIn, onClick: () => setCheckInOutModal({ booking: row.original, type: "CHECK_IN" }), variant: "success" as const, disabled: !canManage },
          { label: "Check Out", icon: Icons.checkOut, onClick: () => setCheckInOutModal({ booking: row.original, type: "CHECK_OUT" }), variant: "warning" as const, disabled: !canManage },
          ...(<existing Akhiri condition>
            ? [{ label: "Akhiri", icon: Icons.endBooking, onClick: () => setScheduleEndModal(row.original), variant: "info" as const, disabled: !canManage }]
            : []),
          { label: "Hapus", icon: Icons.delete, onClick: () => setDeleteConfirm(row.original), variant: "danger" as const, disabled: !canManage },
        ];
```

Disable the `+ Tambah Pemesanan` create button (same pattern as Task 4 Step 3).

- [ ] **Step 2: payment-table.tsx**

Add imports + `const { can } = usePermissions(); const canManage = can("payments.manage");`.

Add `disabled: !canManage` to `Edit` and `Hapus`. Disable the `+ Tambah Pembayaran` create button.

- [ ] **Step 3: deposit-table.tsx**

Add imports + `const { can } = usePermissions(); const canManage = can("deposits.manage");`.

Deposits has NO create button. The items are conditionally spread (`Ubah Status`, `Edit Jumlah`). Add `disabled: !canManage` to each:

```tsx
          ...(<existing cond> ? [{ label: "Ubah Status", icon: Icons.status, onClick: () => setStatusModalDeposit(deposit), disabled: !canManage }] : []),
          ...(<existing cond> ? [{ label: "Edit Jumlah", icon: Icons.money, onClick: () => setAmountModalDeposit(deposit), variant: "warning" as const, disabled: !canManage }] : []),
```

- [ ] **Step 4: bill-table.tsx**

Add imports + `const { can } = usePermissions(); const canManage = can("bills.manage");`.

The items array (around line 350) contains read AND mutating actions. Add `disabled: !canManage` ONLY to mutating items: `Edit` and `Kirim Email`. LEAVE `Detail` and `Unduh Invoice` enabled (read-only):

```tsx
          items={[
            { label: "Detail", icon: ..., onClick: ... },                 // unchanged (read)
            { label: "Unduh Invoice", icon: ..., onClick: ... },          // unchanged (read)
            { label: "Edit", icon: ..., onClick: ..., disabled: !canManage },
            { label: "Kirim Email", icon: ..., onClick: ..., disabled: !canManage },
          ]}
```

Disable the `+ Tambah Tagihan` create button. NOTE: the bill "Tambah Item" buttons inside the bill-detail modal are also `bills.manage` mutations — add `disabled={!canManage}` + tooltip to those too (search the file for `Tambah Item` and `+ Tambah Item`). Keep the in-modal save buttons' existing `disabled={loading}` by combining: `disabled={loading || !canManage}`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/bookings/booking-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/deposits/deposit-table.tsx" \
        "src/app/(internal)/(dashboard_layout)/bills/bill-table.tsx"
git commit -m "feat: disable manage actions in transactional tables"
```

---

### Task 7: Disable notes delete via context (tenant 360°)

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/residents/tenants/[id]/notes-section.tsx`
- Modify: `src/app/(internal)/(dashboard_layout)/residents/tenants/[id]/page.tsx`

**Interfaces:**
- Consumes: `usePermissions` (Task 1), `DEFAULT_DISABLED_REASON` (Task 3).
- Produces: `NotesSection` no longer requires a `canDelete` prop (reads context instead).

Currently `page.tsx` computes `const canManageNotes = permissions.has("roles.manage");` and passes `canDelete={canManageNotes}` to `<NotesSection>`, and the per-note `Hapus` button is rendered only when `canDelete` is true (i.e. HIDDEN otherwise). The spec's global decision is **disable + tooltip, not hide** — so this task both moves the check to context AND switches the button from hidden to always-rendered-but-disabled, for consistency with every other surface.

- [ ] **Step 1: Update NotesSection to read the context**

In `notes-section.tsx`:

Add imports:

```tsx
import { usePermissions } from "@/app/_context/permissions-context";
import { DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";
```

Remove `canDelete` from the props type and destructuring. Inside the component add:

```tsx
  const { can } = usePermissions();
  const canDelete = can("roles.manage");
```

- [ ] **Step 1b: Switch the delete button from hidden to disabled**

The per-note delete button currently renders as `{canDelete && (<button ...>Hapus</button>)}`. Replace that conditional with an always-rendered button that is disabled when `!canDelete`:

```tsx
                <button
                  onClick={() => handleDelete(note.id)}
                  disabled={!canDelete}
                  title={canDelete ? undefined : DEFAULT_DISABLED_REASON}
                  className="text-xs px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ color: "#DC2626" }}
                >
                  Hapus
                </button>
```

(Remove the `{canDelete && (` wrapper and its closing `)}`.)

- [ ] **Step 2: Stop passing the prop from page.tsx**

In `page.tsx`, remove the `canDelete={canManageNotes}` prop from `<NotesSection ...>`. If `canManageNotes` becomes unused after this, delete its declaration line too (avoid an unused-variable lint error).

```tsx
      <NotesSection
        notes={serialized.tenant.notes}
        tenantId={tenant.id}
        currentUserName={session?.user?.name ?? ""}
      />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. (Confirms the prop removal is consistent on both sides.)

- [ ] **Step 4: Run notes tests**

Run: `npx vitest run tests/integration/note-actions.test.ts tests/integration/notes.test.ts`
Expected: PASS (these test the server actions, which are unchanged — they confirm no accidental breakage).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/residents/tenants/[id]/notes-section.tsx" \
        "src/app/(internal)/(dashboard_layout)/residents/tenants/[id]/page.tsx"
git commit -m "feat: notes delete reads permissions from context"
```

---

### Task 8: E2E proof — Viewer sees disabled buttons

**Files:**
- Modify: `prisma/seed-mock.ts` (add a Viewer user)
- Modify: `e2e/fixtures/test-data.ts` (add Viewer credentials)
- Create: `e2e/specs/permission-disabled-actions.spec.ts`

**Interfaces:**
- Consumes: the seeded Viewer role (`role_id: 4`, view-only — already defined in `prisma/seed-rbac.ts`).
- Produces: an E2E spec asserting disabled state for a viewer and enabled state for the admin.

The seed already creates a `Viewer` role (id 4) with only `*.view` permissions. We only need a USER assigned to it. The E2E harness seeds via `seed.ts` + `seed-mock.ts` in `global-setup.ts`.

- [ ] **Step 1: Seed a Viewer user**

In `prisma/seed-mock.ts`, after the existing admin/user seeding, add a viewer user (use the same bcrypt import already present in the file; if absent, import `bcrypt from "bcrypt"`):

```ts
  const viewerPassword = await bcrypt.hash("viewer123", 10);
  await prisma.siteUser.upsert({
    where: { email: "viewer@micasasuites.com" },
    update: {},
    create: {
      name: "Viewer User",
      email: "viewer@micasasuites.com",
      password: viewerPassword,
      role_id: 4, // Viewer — view-only (see prisma/seed-rbac.ts ROLES)
    },
  });
```

If the viewer needs a location assignment to see scoped pages, mirror however the admin/staff users get their `userLocations` in this file (search for `userLocation`); assign the viewer to the same location(s). If admin has no explicit userLocations row, skip this.

- [ ] **Step 2: Add Viewer credentials to the fixtures**

In `e2e/fixtures/test-data.ts`, add alongside `ADMIN`:

```ts
export const VIEWER = {
  email: "viewer@micasasuites.com",
  password: "viewer123",
} as const;
```

- [ ] **Step 3: Write the E2E spec**

Create `e2e/specs/permission-disabled-actions.spec.ts`. This spec logs in as the Viewer explicitly (it does NOT use the saved admin storageState), so override storageState to none:

```ts
import { test, expect } from "@playwright/test";
import { VIEWER, ROUTES } from "../fixtures/test-data";

// Fresh context — do not reuse the admin session.
test.use({ storageState: { cookies: [], origins: [] } });

async function loginAsViewer(page) {
  await page.goto(ROUTES.login);
  await page.locator('input[type="email"]').fill(VIEWER.email);
  await page.locator('input[type="password"]').fill(VIEWER.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL(`**${ROUTES.dashboard}`);
}

test.describe("Viewer sees manage actions disabled", () => {
  test("locations: create button is disabled", async ({ page }) => {
    await loginAsViewer(page);
    await page.goto(ROUTES.locations);
    await expect(page.getByRole("heading", { name: "Lokasi" })).toBeVisible();
    const createBtn = page.getByRole("button", { name: "+ Tambah Lokasi" });
    await expect(createBtn).toBeDisabled();
  });

  test("locations: a row's Edit/Hapus actions are disabled", async ({ page }) => {
    await loginAsViewer(page);
    await page.goto(ROUTES.locations);
    // Wait for at least one data row.
    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByRole("button", { name: "Edit" })).toBeDisabled();
    await expect(firstRow.getByRole("button", { name: "Hapus" })).toBeDisabled();
  });
});
```

- [ ] **Step 4: Add a positive (admin) assertion**

Add a second describe using the default admin storageState in a SEPARATE file so the `test.use` override above doesn't bleed in. Create `e2e/specs/permission-enabled-actions.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ROUTES } from "../fixtures/test-data";

// Uses the default admin storageState configured by the chromium project.
test.describe("Admin sees manage actions enabled", () => {
  test("locations: create button is enabled", async ({ page }) => {
    await page.goto(ROUTES.locations);
    await expect(page.getByRole("button", { name: "+ Tambah Lokasi" })).toBeEnabled();
  });
});
```

- [ ] **Step 5: Run the E2E suite**

Run (from repo root; the harness boots next dev on 3100 + E2E Postgres on 5434 per `e2e/README.md`):

```bash
npx playwright test --config e2e/playwright.config.ts permission-disabled-actions permission-enabled-actions
```

Expected: all 3 tests PASS. If the Viewer can't see `/locations` data rows because of location scoping, fix the seed (Step 1) so the viewer is scoped to a location with seeded data, then re-run.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed-mock.ts e2e/fixtures/test-data.ts \
        e2e/specs/permission-disabled-actions.spec.ts \
        e2e/specs/permission-enabled-actions.spec.ts
git commit -m "test(e2e): viewer sees disabled manage actions; admin sees enabled"
```

---

### Task 9: Update help center

**Files:**
- Modify: the help center content (search `src/app/(internal)/(dashboard_layout)/help/` for the relevant section).

**Interfaces:** none.

Per the project's help-center sync rule, document the new behavior: action buttons appear disabled with a tooltip when the signed-in role lacks the required permission.

- [ ] **Step 1: Locate the help content**

Run: `grep -rn "izin\|permission\|hak akses\|peran" "src/app/(internal)/(dashboard_layout)/help/"`
Identify where role/permission behavior is described (if such a section exists).

- [ ] **Step 2: Add a short note**

Add a concise Indonesian entry under the access/roles section, e.g.:

> **Tombol tindakan dinonaktifkan:** Jika peran Anda tidak memiliki izin untuk suatu tindakan (misalnya menambah atau menghapus), tombolnya akan tampil redup dan tidak dapat diklik. Arahkan kursor ke tombol untuk melihat keterangannya.

Match the surrounding content's structure/format exactly (it may be a data array or JSX — follow the existing pattern in the file).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(internal)/(dashboard_layout)/help/"
git commit -m "docs: help center note on disabled action buttons"
```

---

## Final verification (after all tasks)

- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx vitest run` — all unit + integration tests pass (268 existing + new).
- [ ] `npx playwright test --config e2e/playwright.config.ts` — full E2E suite green.
- [ ] Manual smoke (optional): log in as `viewer@micasasuites.com` / `viewer123`, visit `/locations`, `/bookings`, a tenant 360° page — confirm Edit/Delete/Create are greyed with the tooltip, and `Detail`/`Unduh Invoice` remain clickable.
