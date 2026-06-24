# Tenant 360° View — Design Spec

## Overview

A single-page tenant profile (`/residents/tenants/[id]`) that aggregates all
tenant-related data: personal info, financial summary, bookings, bills/payments,
deposits, and notes. Scrollable layout with stacked sections — no tabs.

## Route & Navigation

- **Route:** `src/app/(internal)/(dashboard_layout)/residents/tenants/[id]/page.tsx`
- **Navigation into the page:**
  - Tenant name in the list table becomes a `<Link>` to the detail page.
  - An "eye" icon button added alongside edit/delete in the actions column.
- **Back navigation:** breadcrumb at top → "Penyewa" (links back to list) / tenant name.

## Page Sections (top to bottom)

### 1. Header Card

Displays tenant identity + contact info in a compact card:

| Field | Source |
|-------|--------|
| Name | `tenant.name` |
| Email | `tenant.email` |
| Phone | `tenant.phone` |
| NIK | `tenant.id_number` |
| Alamat | `tenant.current_address` |
| Kontak Darurat | `emergency_contact_name` + `emergency_contact_phone` |
| Sumber Referral | `tenant.referral_source` |
| Penghuni Kedua | `second_resident_name` + relation (if present) |

- Documents (KTP, KK) shown as download links if file paths are non-null.
- "Edit" button opens the existing tenant form modal (reuse `TenantForm`).
- If tenant is a second_resident_of another tenant, show a link to the primary.

### 2. Financial Summary (4 metric cards)

A horizontal row of 4 cards (responsive: 2×2 on mobile):

| Card | Label | Calculation |
|------|-------|-------------|
| Outstanding | Tagihan Belum Lunas | Sum of `bill_item.amount` across non-deleted bills minus sum of `paymentBill.amount` allocated to those bills. Only bills where remaining > 0. |
| Total Paid | Total Dibayar | Sum of `payment.amount` where `deletedAt IS NULL` across all tenant's bookings. |
| Active Deposits | Deposit Aktif | Sum of `deposit.amount` where `status = HELD`. |
| Overdue | Jatuh Tempo | Count of non-deleted bills where `due_date < today` AND remaining balance > 0. |

Soft-delete policy: exclude bills with `deletedAt != null` and payments with
`deletedAt != null`.

### 3. Bookings Section

A compact table listing all bookings for this tenant, sorted most-recent first:

| Column | Source |
|--------|--------|
| Kamar | `booking.rooms.room_number` (+ room type) |
| Lokasi | `booking.rooms.locations.name` |
| Tanggal Mulai | `booking.start_date` |
| Tanggal Akhir | `booking.end_date` (or "Bergulir" if `is_rolling`) |
| Durasi | `booking.durations.duration` or "Rolling" |
| Status | `booking.bookingstatuses.status` |
| Biaya/Bulan | `booking.fee` formatted as Rp |
| Deposit | `booking.deposit.status` badge |

No pagination (typical tenant has <10 bookings). If count exceeds 20, show a
"Show all" toggle (future consideration, not built now).

Each row is clickable → navigates to the booking detail (existing bookings page
with a `?highlight=id` param for now; full booking 360° is Phase 3).

### 4. Bills & Payments Section

A chronological list grouped by booking. For each booking, show:

**Bills sub-table:**
| Column | Source |
|--------|--------|
| Invoice | `bill.invoice_number` |
| Deskripsi | `bill.description` |
| Jatuh Tempo | `bill.due_date` |
| Jumlah | sum of `bill_item.amount` |
| Dibayar | sum of `paymentBill.amount` for this bill |
| Sisa | Jumlah − Dibayar |
| Status | badge (Lunas / Sebagian / Belum / Jatuh Tempo) |

Sorted by `due_date` descending within each booking group. Show most recent
booking's bills first (booking groups sorted by `start_date` desc).

Payments are shown per-booking in a collapsed section ("Lihat Pembayaran") that
expands to show:
| Column | Source |
|--------|--------|
| Tanggal | `payment.payment_date` |
| Jumlah | `payment.amount` |
| Metode | `payment.payment_method` |
| Status | `payment.paymentstatuses.status` |
| Dialokasikan ke | list of bill invoice_numbers via `paymentBills` |

### 5. Notes Section

Simple chronological list of notes (newest first) with an inline "Add note" form.

Each note shows:
- Content (plain text, multi-line)
- Author name (`siteUser.name`)
- Timestamp (relative: "2 jam lalu", "3 hari lalu"; absolute on hover)
- Delete button (with confirm dialog, only if user has `roles.manage` permission)

**Add note form:** textarea + "Simpan Catatan" button. Visible to all
authenticated users with access to the page. Uses a server action.

## Data Model Changes

### New: `Note` model

```prisma
model Note {
  id         Int      @id @default(autoincrement())
  content    String   @db.Text
  tenant_id  String?
  booking_id Int?

  created_by String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @default(now()) @updatedAt

  tenant  Tenant?  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  booking Booking? @relation(fields: [booking_id], references: [id], onDelete: Cascade)
  author  SiteUser @relation(fields: [created_by], references: [id])

  @@index([tenant_id])
  @@index([booking_id])
  @@map("notes")
}
```

Relations to add:
- `Tenant.notes: Note[]`
- `Booking.notes: Note[]`
- `SiteUser.notes: Note[]`

Polymorphic via nullable FKs (matches existing patterns like `Penalty.bill_id`).
For the 360° page, query: `WHERE tenant_id = :id OR booking_id IN (:tenantBookingIds)`.

## Data Fetching

Single server-component query: `getTenantProfile(id: string)` in
`src/app/_db/tenant.ts`. One Prisma `findUnique` with deep includes:

```ts
prisma.tenant.findUnique({
  where: { id },
  include: {
    second_resident: true,
    second_resident_of: true,
    bookings: {
      where: { deletedAt: null },
      orderBy: { start_date: "desc" },
      include: {
        rooms: { include: { locations: true, roomtypes: true } },
        durations: true,
        bookingstatuses: true,
        deposit: true,
        bills: {
          where: { deletedAt: null },
          orderBy: { due_date: "desc" },
          include: { bill_item: true, paymentBills: true },
        },
        payments: {
          where: { deletedAt: null },
          orderBy: { payment_date: "desc" },
          include: { paymentstatuses: true, paymentBills: true },
        },
      },
    },
    notes: {
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    },
  },
});
```

Notes for bookings fetched separately (simpler than nested include):
```ts
prisma.note.findMany({
  where: { booking_id: { in: bookingIds } },
  orderBy: { createdAt: "desc" },
  include: { author: { select: { name: true } } },
});
```

Financial summary computed in the server component from the included data (no
separate query needed — all bill_items and paymentBills are already loaded).

## Server Actions

### `addNoteAction(tenantId: string, content: string)`
- Validates: content non-empty, tenant exists.
- `created_by` = current session user ID.
- `tenant_id` = the given tenant ID.
- Revalidates the page.

### `deleteNoteAction(noteId: number)`
- Permission check: `roles.manage`.
- Hard delete (notes are not soft-deleted — they're lightweight annotations).
- Revalidates the page.

## Permission & Access

- Page accessible to any authenticated user whose location scope includes at
  least one booking for this tenant (or admin who sees all).
- Notes: add = any authenticated user; delete = `roles.manage` only.
- The page itself doesn't need a new permission string — if you can see the
  tenant in the list, you can see their profile.

## File Structure

```
src/app/(internal)/(dashboard_layout)/residents/tenants/[id]/
  page.tsx                 — async server component (data fetch + layout)
  tenant-profile.tsx       — client component (header card + edit trigger)
  financial-summary.tsx    — server component (4 metric cards, pure computation)
  bookings-section.tsx     — server component (bookings table)
  bills-payments-section.tsx — client component (expandable per-booking)
  notes-section.tsx        — client component (list + add form + delete)
  notes-action.ts          — server actions for add/delete note
src/app/_db/tenant.ts      — add getTenantProfile()
src/app/_db/notes.ts       — getNotesByTenantOrBookings(), createNote(), deleteNote()
```

## UI Details

- Financial summary cards use the existing CSS variables (same style as dashboard
  stat cards).
- Overdue bills card shows red accent (`--color-danger`).
- Booking status rendered as colored badge (same pattern as booking table).
- Deposit status as small colored pill in the bookings table row.
- Notes section has a subtle border-top separator.
- Relative timestamps use a simple helper (no external lib): "baru saja",
  "X menit lalu", "X jam lalu", "X hari lalu", then absolute date.

## Not In Scope

- Booking-level notes (the model supports it, but the UI only shows
  tenant-level notes for now; booking notes deferred to a future booking 360°).
- Edit note (add + delete only for v1).
- File attachments on notes.
- Pagination within sections (not needed at current scale).
- Activity timeline / audit log (Phase 3.1).
