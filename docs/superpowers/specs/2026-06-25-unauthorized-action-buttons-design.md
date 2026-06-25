# Disable Unauthorized Action Buttons (P.2) — Design Spec

**Date:** 2026-06-25
**Status:** Approved (pending spec review)
**Roadmap item:** P.2 — Hide/disable unauthorized action buttons client-side

## Problem

Every dashboard page gates *access* behind a `*.view` permission, then renders a
table whose Edit / Delete / Create buttons are gated server-side behind the
corresponding `*.manage` permission. The server actions correctly reject
unauthorized calls, but the buttons render unconditionally on the client. A
read-only user therefore sees fully-styled action buttons that throw an error
(or show a generic failure toast) only *after* they click — a confusing,
broken-feeling experience.

## Goal

Disable (not hide) every manage-gated action button for users who lack the
required permission, showing a tooltip that explains why. The server action
remains the real enforcement boundary; this is a pure UX layer so buttons never
silently error.

## Decisions

- **Disable + tooltip**, not hide. Unauthorized buttons render greyed-out,
  unclickable, with a tooltip "Anda tidak memiliki izin untuk tindakan ini".
  Communicates the feature exists but is locked, and keeps row layouts stable.
- **`PermissionsProvider` context.** A single client context seeded by the
  dashboard layout (which already fetches the permission set). Tables read it
  via `usePermissions()`. No prop-threading through ~15 page→table pairs.
- **Cover all manage-gated buttons** across every table and section component,
  not just simple CRUD tables.
- **Match the server's existing check exactly.** Each button disables on the
  same permission string its server action already calls `checkPermission(...)`
  with — verified against source (see Mapping). Where a button is gated behind
  the overloaded `roles.manage` (the known RBAC gaps), we disable on
  `roles.manage` to match current behavior. Correcting those permission strings
  is backlog item B.3 and is explicitly **out of scope** here.

## Architecture & Data Flow

No new server queries and no client round-trips. The dashboard layout already
calls `getUserPermissions()` (a React `cache()`-wrapped, once-per-request DB
query) and passes the result to `<Sidebar permissions={...} />`. We reuse that
same array.

```
DashboardLayout (server component)
  permissions = await getUserPermissions()        // already exists
  → <PermissionsProvider permissions={[...permissions]}>   // NEW wrapper
        <Sidebar permissions={[...permissions]} />          // unchanged
        {children}                                          // tables live here
    </PermissionsProvider>
```

`PermissionsProvider` stores the permission strings in an in-memory `Set` and
exposes:

```ts
const { can } = usePermissions();
can("locations.manage"); // → boolean, O(1) Set.has, no I/O
```

### Cost

- Server: zero additional queries. `getUserPermissions()` is already called and
  cached per request.
- Client: zero network calls. `can()` is a synchronous `Set.has()` lookup
  against an already-loaded set. 50 rows × 3 buttons = 150 `Set.has()` calls,
  cheaper than rendering the buttons themselves.
- Payload: the permission array already ships in the page payload for the
  sidebar; no new data crosses the wire.

## Components

### 1. `PermissionsProvider` + `usePermissions` (new)

`src/app/_context/permissions-context.tsx` — mirrors `LocationProvider`.

```tsx
"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";

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
  const value = useMemo<PermissionsContextValue>(() => {
    const set = new Set(permissions);
    return { can: (permission: string) => set.has(permission) };
  }, [permissions]);

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

Wired in `(internal)/(dashboard_layout)/layout.tsx`: wrap the existing tree
(inside `LocationProvider`/`TourProvider`) with `<PermissionsProvider
permissions={[...permissions]}>`. The `permissions` variable already exists at
`layout.tsx:19`.

### 2. `ActionMenu` — `disabled` support

`src/app/_components/action-menu.tsx`. Add an optional field to `ActionItem`:

```ts
export interface ActionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger" | "success" | "warning" | "info";
  disabled?: boolean;          // NEW
  disabledReason?: string;     // NEW — tooltip text when disabled
}
```

Behavior when `disabled` is true:

- `IconButton` (inline) and the overflow `<button>` render with reduced opacity
  (`0.4`), `cursor: not-allowed`, the `disabled` HTML attribute set, and `title`
  set to `disabledReason ?? "Anda tidak memiliki izin untuk tindakan ini"`.
- `onClick` is not invoked (guarded; the `disabled` attribute already prevents
  it, but the hover handlers also early-return so colors don't change).
- A disabled item **still counts toward `maxInline`** so the inline-vs-dropdown
  split is identical regardless of permission — no row-to-row layout shift
  between authorized and unauthorized users.
- `if (items.length === 0) return null;` is unchanged. Items are still passed in;
  they're disabled, not removed.

### 3. Create ("+ Tambah") buttons

These are plain `<button>` elements on each page header, not part of
`ActionMenu`. Each gets, via `usePermissions()`:

```tsx
const { can } = usePermissions();
const canManage = can("locations.manage");
// ...
<button
  onClick={openCreate}
  disabled={!canManage}
  title={canManage ? undefined : "Anda tidak memiliki izin untuk tindakan ini"}
  className="... disabled:opacity-50 disabled:cursor-not-allowed"
  ...
>
  + Tambah Lokasi
</button>
```

### 4. Section components (notes, etc.)

`notes-section.tsx` already receives a `canDelete: boolean` prop computed
server-side. To keep wiring consistent we switch it to read
`usePermissions().can("roles.manage")` internally and drop the prop. Other
section components inside the tenant 360° page (bookings-section,
bills-payments-section) currently render read-only data and have no mutating
buttons — no change needed there unless a button is found during implementation.

## Permission Mapping (verified against source)

Each button disables on the permission string its server action already checks.
Verified by grepping `checkPermission(` across all `*action*.ts` files on
2026-06-25.

| Page / component | Button(s) | Disable on | Notes |
|---|---|---|---|
| locations | create / edit / delete | `locations.manage` | |
| rooms/durations | create / edit / delete | `durations.manage` | |
| rooms/all-rooms | create / edit / delete | `rooms.manage` | |
| rooms/room-types | create / edit / delete / pricing | `room_types.manage` | pricing save uses same action file |
| addons | create / edit / delete | `addons.manage` | |
| residents/tenants | create / edit / delete | `tenants.manage` | |
| residents/guests | create / edit / delete (+ stay) | `guests.manage` | all guest-action fns check `guests.manage` |
| settings/users | create / edit / delete | `users.manage` | |
| bookings | create / edit / row actions | `bookings.manage` | all booking-action fns check `bookings.manage` |
| payments | create / verify | `payments.manage` | |
| deposits | manage actions | `deposits.manage` | |
| bills | create / edit / delete / bill-items / resend email | `bills.manage` | all mutating bill-action fns check `bills.manage`. (`simulateUnpaidBillPaymentAction` checks `payments.view` but is a read/simulation, not a button mutation — no change.) |
| utilities | create / edit / delete | `bills.manage` | known RBAC gap (wrong category); match current behavior |
| credits | refund | `payments.manage` | `refundCreditAction` checks `payments.manage`. (`getAvailableCredit` checks `payments.view` but is a read — no change.) |
| residents/tenants/[id] notes | delete | `roles.manage` | known RBAC gap; match current behavior |
| settings/email-logs | row actions | `roles.manage` | known RBAC gap |
| settings/email-templates | save / edit | `roles.manage` | known RBAC gap |
| settings/company | save | `roles.manage` | known RBAC gap |
| settings/billing | save | `roles.manage` | known RBAC gap |
| settings/roles | save / edit | `roles.manage` | this one is genuinely role management |

**Calendar exception:** `calendar-action.ts` gates its mutations on
`calendar.view`, not a separate `calendar.manage`. Anyone who can view the
calendar can already mutate it, so there is no unauthorized-but-visible state to
fix — **calendar buttons need no change**. Noted so the implementer doesn't
invent a `calendar.manage` check that doesn't exist.

During implementation, each mapping is re-confirmed by reading the specific
action function bound to each button. The table is the starting hypothesis;
source is the authority. Note that some action files contain `payments.view`
checks on *read/simulation* functions (`simulateUnpaidBillPaymentAction`,
`getAvailableCredit`) — those are not buttons and need no disable. Map only
mutating buttons, each to the permission its own action checks.

## Error Handling

The server actions are unchanged — they still return
`{ success: false, error: "Unauthorized" }` for any call that slips through
(e.g., a crafted request). The client disable is additive: it prevents the
click in the normal UI but does not replace server enforcement. If the
permission set passed to the provider is somehow empty, every manage button is
disabled — a safe failure mode (read-only).

## Testing

- **Unit:** `PermissionsProvider` / `usePermissions` — `can()` returns true for
  present permissions, false for absent, and `usePermissions` throws outside a
  provider. Vitest + React Testing Library (the suite already uses RTL-style
  tests).
- **Unit:** `ActionMenu` — a disabled item renders the `disabled` attribute and
  tooltip, does not call `onClick` when clicked, and still counts toward
  `maxInline` (layout-stability assertion).
- **E2E (Playwright):** seed a read-only role (has `*.view`, lacks `*.manage`),
  log in, visit locations + one transactional page, assert the create button and
  a row's Edit/Delete buttons are `disabled`. Reuses the existing E2E harness;
  may require a seeded read-only user in `seed-mock.ts`.
- Existing 268-test suite must stay green (the `ActionItem` change is additive
  and backwards-compatible — `disabled` is optional).

## Out of Scope

- Fixing the overloaded `roles.manage` permission (backlog B.3). We match
  current server behavior; when B.3 lands it updates both the action checks and
  the disable mappings together.
- Hiding entire pages/nav items (already handled by sidebar filtering +
  `AccessDenied`).
- Server-side rendering of disabled state (not needed — the provider data is
  available on first client render; no flash, since the permission array is in
  the initial payload).
