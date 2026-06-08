# HMS Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the HMS (Housing/Hotel Management System) as a fully working Next.js 15 application preserving all observable behaviour from the reconstruction spec.

**Architecture:** Next.js 15 App Router with route groups `(external)` for auth and `(internal)` for protected pages. Server actions handle business logic, `_db/` layer handles Prisma queries, Zod validates all inputs. Financial calculations use Prisma Decimal. JWT sessions with 15-min expiry.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Prisma 5/PostgreSQL, NextAuth 5 (beta), Zod, bcrypt, Tailwind CSS 3, AWS S3, Nodemailer/SES, date-fns, ExcelJS, PDFKit, TanStack React Table, p-limit, react-toastify

---

## Seed Data Definitions

These values are used across multiple tasks:

```typescript
// BookingStatus: 1=PENDING, 2=ACTIVE, 3=COMPLETED, 4=CANCELLED
// PaymentStatus: 1=PENDING, 2=VERIFIED, 3=REJECTED
// RoomStatus: 1=AVAILABLE, 2=OCCUPIED, 3=MAINTENANCE
// Roles: 1=Admin, 2=Manager, 3=Staff, 4=Viewer
// Permissions: defined per role (Admin=all, Manager=most, Staff=CRUD, Viewer=read-only)
```

---

## Phase 1: Project Setup

### Task 1.1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `.env.example`, `.gitignore`

- [ ] **Step 1: Initialize git and create Next.js app**

```bash
cd /Users/rsalim/personal/hms-revamp
git init
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install prisma @prisma/client next-auth@5.0.0-beta.30 zod bcrypt date-fns react-toastify @aws-sdk/client-s3 nodemailer exceljs pdfkit @tanstack/react-table p-limit framer-motion react-select react-day-picker libphonenumber-js
npm install -D @types/bcrypt @types/nodemailer @types/pdfkit
```

- [ ] **Step 3: Create .env.example**

```env
DATABASE_URL="postgresql://postgres:docker@localhost:5432/hms?schema=public"
AUTH_SECRET="your-secret-here"
CRON_SECRET="your-cron-secret"
AWS_REGION="ap-southeast-1"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
S3_BUCKET=""
NODE_ENV="development"
VERSION="0.0.0"
```

- [ ] **Step 4: Update .gitignore**

Add to `.gitignore`:
```
node_modules/
.next/
.env
.env.local
coverage/
```

- [ ] **Step 5: Create next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: initialize Next.js project with TypeScript and Tailwind"
```

---

### Task 1.2: Configure Prisma

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/app/_lib/prisma.ts`

- [ ] **Step 1: Initialize Prisma and copy schema**

```bash
mkdir -p prisma
```

Copy the existing `schema.prisma` from root to `prisma/schema.prisma` (the file already exists at root).

- [ ] **Step 2: Create Prisma singleton**

Create `src/app/_lib/prisma.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: Create seed file**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Booking Statuses
  await prisma.bookingStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "ACTIVE" },
      { id: 3, status: "COMPLETED" },
      { id: 4, status: "CANCELLED" },
    ],
    skipDuplicates: true,
  });

  // Payment Statuses
  await prisma.paymentStatus.createMany({
    data: [
      { id: 1, status: "PENDING" },
      { id: 2, status: "VERIFIED" },
      { id: 3, status: "REJECTED" },
    ],
    skipDuplicates: true,
  });

  // Room Statuses
  await prisma.roomStatus.createMany({
    data: [
      { id: 1, status: "AVAILABLE" },
      { id: 2, status: "OCCUPIED" },
      { id: 3, status: "MAINTENANCE" },
    ],
    skipDuplicates: true,
  });

  // Roles
  await prisma.role.createMany({
    data: [
      { id: 1, name: "Admin", description: "Full system access" },
      { id: 2, name: "Manager", description: "Property management access" },
      { id: 3, name: "Staff", description: "Day-to-day operations" },
      { id: 4, name: "Viewer", description: "Read-only access" },
    ],
    skipDuplicates: true,
  });

  // Default admin user
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await prisma.siteUser.upsert({
    where: { email: "admin@micasasuites.com" },
    update: {},
    create: {
      name: "Administrator",
      email: "admin@micasasuites.com",
      password: hashedPassword,
      role_id: 1,
    },
  });

  // Settings
  await prisma.setting.createMany({
    data: [
      { setting_key: "APP_SETUP", setting_value: "false" },
      { setting_key: "COMPANY_NAME", setting_value: "Perusahaan Anda" },
      { setting_key: "COMPANY_IMAGE", setting_value: "" },
      { setting_key: "REGISTRATION_ENABLED", setting_value: "false" },
      { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED", setting_value: "false" },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Add package.json scripts**

Add to `package.json` scripts:
```json
{
  "prisma-gen": "prisma generate",
  "prisma-migrate": "prisma migrate deploy",
  "prisma-seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
  "db:push": "prisma db push"
}
```

Also add to `package.json`:
```json
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

- [ ] **Step 5: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add Prisma schema, singleton, and seed data"
```

---

## Phase 2: Database Access Layer

### Task 2.1: Core Database Query Files

**Files:**
- Create: `src/app/_db/bookings.ts`, `src/app/_db/bills.ts`, `src/app/_db/payments.ts`, `src/app/_db/deposit.ts`, `src/app/_db/transaction.ts`, `src/app/_db/tenant.ts`, `src/app/_db/rooms.ts`, `src/app/_db/settings.ts`, `src/app/_db/site-users.ts`, `src/app/_db/dashboard.ts`, `src/app/_db/locations.ts`, `src/app/_db/durations.ts`, `src/app/_db/room-types.ts`, `src/app/_db/guests.ts`, `src/app/_db/addons.ts`, `src/app/_db/events.ts`, `src/app/_db/email-logs.ts`

- [ ] **Step 1: Create settings DB layer**

Create `src/app/_db/settings.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getSetting(key: string) {
  return prisma.setting.findUnique({ where: { setting_key: key } });
}

export async function getSettingValue(key: string): Promise<string | null> {
  const setting = await getSetting(key);
  return setting?.setting_value ?? null;
}

export async function upsertSetting(key: string, value: string) {
  return prisma.setting.upsert({
    where: { setting_key: key },
    update: { setting_value: value },
    create: { setting_key: key, setting_value: value },
  });
}

export async function getAppSetup(): Promise<boolean> {
  const val = await getSettingValue("APP_SETUP");
  return val === "true";
}

export async function getRegistrationEnabled(): Promise<boolean> {
  const val = await getSettingValue("REGISTRATION_ENABLED");
  return val?.toLowerCase() === "true";
}

export async function getCompanyName(): Promise<string> {
  const val = await getSettingValue("COMPANY_NAME");
  return val || "Perusahaan Anda";
}

export async function getCompanyImage(): Promise<string> {
  const val = await getSettingValue("COMPANY_IMAGE");
  return val || "";
}
```

- [ ] **Step 2: Create locations DB layer**

Create `src/app/_db/locations.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getLocations() {
  return prisma.location.findMany({ orderBy: { name: "asc" } });
}

export async function getLocationById(id: number) {
  return prisma.location.findUnique({ where: { id } });
}

export async function createLocation(data: { name: string; address: string }) {
  return prisma.location.create({ data });
}

export async function updateLocation(id: number, data: { name: string; address: string }) {
  return prisma.location.update({ where: { id }, data });
}

export async function deleteLocation(id: number) {
  return prisma.location.delete({ where: { id } });
}
```

- [ ] **Step 3: Create rooms DB layer**

Create `src/app/_db/rooms.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getRoomsByLocation(locationId: number) {
  return prisma.room.findMany({
    where: { location_id: locationId },
    include: { roomtypes: true, roomstatuses: true, locations: true },
    orderBy: { room_number: "asc" },
  });
}

export async function getRoomById(id: number) {
  return prisma.room.findUnique({
    where: { id },
    include: { roomtypes: true, roomstatuses: true, locations: true, bookings: true },
  });
}

export async function createRoom(data: {
  room_number: string;
  room_type_id: number;
  status_id: number;
  location_id: number;
}) {
  return prisma.room.create({ data });
}

export async function updateRoom(id: number, data: {
  room_number?: string;
  room_type_id?: number;
  status_id?: number;
  location_id?: number;
}) {
  return prisma.room.update({ where: { id }, data });
}

export async function deleteRoom(id: number) {
  return prisma.room.delete({ where: { id } });
}

export async function getAvailableRoomsByLocation(locationId: number) {
  return prisma.room.findMany({
    where: { location_id: locationId, status_id: 1 },
    include: { roomtypes: true },
    orderBy: { room_number: "asc" },
  });
}
```

- [ ] **Step 4: Create site-users DB layer**

Create `src/app/_db/site-users.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getUserByEmail(email: string) {
  return prisma.siteUser.findUnique({
    where: { email },
    include: { roles: true },
  });
}

export async function getUserById(id: string) {
  return prisma.siteUser.findUnique({
    where: { id },
    include: { roles: true },
  });
}

export async function getAllUsers() {
  return prisma.siteUser.findMany({
    include: { roles: true },
    orderBy: { name: "asc" },
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role_id: number;
}) {
  return prisma.siteUser.create({ data });
}

export async function updateUser(id: string, data: {
  name?: string;
  email?: string;
  password?: string;
  role_id?: number;
  shouldReset?: boolean;
}) {
  return prisma.siteUser.update({ where: { id }, data });
}

export async function deleteUser(id: string) {
  return prisma.siteUser.delete({ where: { id } });
}
```

- [ ] **Step 5: Create tenants DB layer**

Create `src/app/_db/tenant.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getTenants() {
  return prisma.tenant.findMany({ orderBy: { name: "asc" } });
}

export async function getTenantById(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    include: { second_resident: true, bookings: true },
  });
}

export async function createTenant(data: {
  name: string;
  email?: string;
  phone?: string;
  id_number: string;
  current_address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  referral_source?: string;
  id_file?: string;
  family_certificate_file?: string;
  second_resident_name?: string;
  second_resident_email?: string;
  second_resident_phone?: string;
  second_resident_id_number?: string;
  second_resident_id_file?: string;
  second_resident_relation?: string;
}) {
  return prisma.tenant.create({ data });
}

export async function updateTenant(id: string, data: Partial<Parameters<typeof createTenant>[0]>) {
  return prisma.tenant.update({ where: { id }, data });
}

export async function deleteTenant(id: string) {
  return prisma.tenant.delete({ where: { id } });
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add database access layer for settings, locations, rooms, users, tenants"
```

---

### Task 2.2: Financial Database Layers

**Files:**
- Create: `src/app/_db/bookings.ts`, `src/app/_db/bills.ts`, `src/app/_db/payments.ts`, `src/app/_db/deposit.ts`, `src/app/_db/transaction.ts`

- [ ] **Step 1: Create bookings DB layer**

Create `src/app/_db/bookings.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";

export async function getBookingsByLocation(locationId: number) {
  return prisma.booking.findMany({
    where: { rooms: { location_id: locationId } },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true,
      durations: true,
      bookingstatuses: true,
      deposit: true,
      bills: { include: { bill_item: true, paymentBills: true } },
      payments: { include: { paymentBills: true, paymentstatuses: true } },
      addOns: { include: { addOn: { include: { pricing: true } } } },
      guests: { include: { GuestStay: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBookingById(id: number) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true,
      durations: true,
      bookingstatuses: true,
      deposit: true,
      bills: {
        include: { bill_item: true, paymentBills: true },
        orderBy: { due_date: "asc" },
      },
      payments: {
        include: { paymentBills: true, paymentstatuses: true },
        orderBy: { payment_date: "asc" },
      },
      addOns: { include: { addOn: { include: { pricing: true } } } },
      guests: { include: { GuestStay: true } },
      checkInOutLogs: true,
      penalties: true,
    },
  });
}

export async function getActiveRollingBookings() {
  return prisma.booking.findMany({
    where: { is_rolling: true, end_date: null },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true,
      bills: { include: { bill_item: true }, orderBy: { due_date: "asc" } },
      deposit: true,
      addOns: { include: { addOn: { include: { pricing: true } } } },
    },
  });
}

export async function createBooking(data: Prisma.BookingCreateInput) {
  return prisma.booking.create({ data });
}

export async function updateBooking(id: number, data: Prisma.BookingUpdateInput) {
  return prisma.booking.update({ where: { id }, data });
}

export async function deleteBooking(id: number) {
  return prisma.booking.delete({ where: { id } });
}

export async function checkBookingOverlap(
  roomId: number,
  startDate: Date,
  endDate: Date | null,
  isRolling: boolean,
  excludeBookingId?: number
) {
  const where: Prisma.BookingWhereInput = {
    room_id: roomId,
    id: excludeBookingId ? { not: excludeBookingId } : undefined,
    status_id: { in: [1, 2] }, // PENDING or ACTIVE
  };

  if (isRolling) {
    // Rolling: conflict if another booking overlaps with no end or end > our start
    where.OR = [
      { end_date: null, start_date: { lte: startDate } },
      { end_date: { gt: startDate }, start_date: { lte: startDate } },
      { start_date: { gte: startDate }, end_date: null },
    ];
  } else {
    // Fixed: standard date range overlap
    where.AND = [
      { start_date: { lt: endDate! } },
      {
        OR: [
          { end_date: { gt: startDate } },
          { end_date: null },
        ],
      },
    ];
  }

  const conflict = await prisma.booking.findFirst({ where });
  return conflict !== null;
}
```

- [ ] **Step 2: Create bills DB layer**

Create `src/app/_db/bills.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";

export async function getBillsByBooking(bookingId: number) {
  return prisma.bill.findMany({
    where: { booking_id: bookingId },
    include: { bill_item: true, paymentBills: true },
    orderBy: { due_date: "asc" },
  });
}

export async function getBillById(id: number) {
  return prisma.bill.findUnique({
    where: { id },
    include: {
      bill_item: true,
      paymentBills: { include: { payment: true } },
      bookings: { include: { tenants: true, rooms: true } },
    },
  });
}

export async function createBill(data: {
  booking_id: number;
  description: string;
  due_date: Date;
}) {
  return prisma.bill.create({ data });
}

export async function createBillWithItems(
  billData: { booking_id: number; description: string; due_date: Date },
  items: { description: string; amount: Prisma.Decimal; internal_description?: string; type?: "GENERATED" | "CREATED"; related_id?: Prisma.InputJsonValue }[]
) {
  return prisma.bill.create({
    data: {
      ...billData,
      bill_item: { create: items },
    },
    include: { bill_item: true },
  });
}

export async function updateBillDueDate(id: number, due_date: Date) {
  return prisma.bill.update({ where: { id }, data: { due_date } });
}

export async function deleteBill(id: number) {
  return prisma.bill.delete({ where: { id } });
}

export async function deleteBillsByBooking(bookingId: number) {
  return prisma.bill.deleteMany({ where: { booking_id: bookingId } });
}

export async function getUnpaidBillsByBooking(bookingId: number) {
  const bills = await prisma.bill.findMany({
    where: { booking_id: bookingId },
    include: { bill_item: true, paymentBills: true },
    orderBy: { due_date: "asc" },
  });

  return bills.filter((bill) => {
    const total = bill.bill_item.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
    const paid = bill.paymentBills.reduce((sum, pb) => sum.add(pb.amount), new Prisma.Decimal(0));
    return total.gt(paid);
  });
}
```

- [ ] **Step 3: Create payments DB layer**

Create `src/app/_db/payments.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getPaymentsByBooking(bookingId: number) {
  return prisma.payment.findMany({
    where: { booking_id: bookingId },
    include: { paymentBills: true, paymentstatuses: true },
    orderBy: { payment_date: "asc" },
  });
}

export async function getPaymentById(id: number) {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      paymentBills: { include: { bill: { include: { bill_item: true } } } },
      paymentstatuses: true,
      bookings: { include: { tenants: true, rooms: true, deposit: true } },
    },
  });
}

export async function createPayment(data: {
  booking_id: number;
  amount: number;
  payment_date: Date;
  payment_proof?: string;
  status_id?: number;
}) {
  return prisma.payment.create({ data: { ...data, amount: data.amount } });
}

export async function updatePayment(id: number, data: {
  amount?: number;
  payment_date?: Date;
  payment_proof?: string;
  status_id?: number;
}) {
  return prisma.payment.update({ where: { id }, data });
}

export async function deletePayment(id: number) {
  return prisma.payment.delete({ where: { id } });
}

export async function createPaymentBills(data: { payment_id: number; bill_id: number; amount: number }[]) {
  return prisma.paymentBill.createMany({
    data: data.map((d) => ({ ...d, amount: d.amount })),
  });
}

export async function deletePaymentBillsByPayment(paymentId: number) {
  return prisma.paymentBill.deleteMany({ where: { payment_id: paymentId } });
}

export async function deletePaymentBillsByBooking(bookingId: number) {
  const payments = await prisma.payment.findMany({
    where: { booking_id: bookingId },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);
  if (paymentIds.length > 0) {
    return prisma.paymentBill.deleteMany({ where: { payment_id: { in: paymentIds } } });
  }
}
```

- [ ] **Step 4: Create deposit DB layer**

Create `src/app/_db/deposit.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";
import { DepositStatus, Prisma } from "@prisma/client";

export async function getDepositByBooking(bookingId: number) {
  return prisma.deposit.findUnique({ where: { booking_id: bookingId } });
}

export async function createDeposit(data: {
  booking_id: number;
  amount: number;
  status?: DepositStatus;
}) {
  return prisma.deposit.create({
    data: { ...data, amount: data.amount, status: data.status || "UNPAID" },
  });
}

export async function updateDepositAmount(id: number, amount: number) {
  return prisma.deposit.update({ where: { id }, data: { amount } });
}

export async function updateDepositStatus(
  id: number,
  status: DepositStatus,
  extra?: { refunded_amount?: number; refunded_at?: Date; applied_at?: Date }
) {
  return prisma.deposit.update({
    where: { id },
    data: { status, ...extra },
  });
}

export async function deleteDeposit(id: number) {
  return prisma.deposit.delete({ where: { id } });
}
```

- [ ] **Step 5: Create transaction DB layer**

Create `src/app/_db/transaction.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";
import { Prisma, TransactionType } from "@prisma/client";

export async function getTransactionsByLocation(locationId: number) {
  return prisma.transaction.findMany({
    where: { location_id: locationId },
    include: { locations: true },
    orderBy: { date: "desc" },
  });
}

export async function getTransactionsByDateRange(
  locationId: number,
  startDate: Date,
  endDate: Date,
  excludeCategory?: string
) {
  const where: Prisma.TransactionWhereInput = {
    location_id: locationId,
    date: { gte: startDate, lte: endDate },
  };
  if (excludeCategory) {
    where.category = { not: excludeCategory };
  }
  return prisma.transaction.findMany({ where, orderBy: { date: "asc" } });
}

export async function createTransaction(data: {
  amount: number;
  description: string;
  date: Date;
  category: string;
  location_id: number;
  type: TransactionType;
  related_id?: Prisma.InputJsonValue;
}) {
  return prisma.transaction.create({ data: { ...data, amount: data.amount } });
}

export async function deleteTransactionsByPaymentId(paymentId: number) {
  return prisma.transaction.deleteMany({
    where: {
      related_id: { path: ["payment_id"], equals: paymentId },
    },
  });
}

export async function deleteTransactionsByDepositId(depositId: number, type?: TransactionType) {
  const where: Prisma.TransactionWhereInput = {
    related_id: { path: ["deposit_id"], equals: depositId },
  };
  if (type) where.type = type;
  return prisma.transaction.deleteMany({ where });
}

export async function getTransactionsByPaymentId(paymentId: number) {
  return prisma.transaction.findMany({
    where: { related_id: { path: ["payment_id"], equals: paymentId } },
  });
}

export async function getDepositIncomeTransactions(depositId: number) {
  return prisma.transaction.findMany({
    where: {
      related_id: { path: ["deposit_id"], equals: depositId },
      type: "INCOME",
      category: "Deposit",
    },
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add financial database layers for bookings, bills, payments, deposits, transactions"
```

---

### Task 2.3: Remaining Database Layers

**Files:**
- Create: `src/app/_db/durations.ts`, `src/app/_db/room-types.ts`, `src/app/_db/guests.ts`, `src/app/_db/addons.ts`, `src/app/_db/events.ts`, `src/app/_db/email-logs.ts`, `src/app/_db/dashboard.ts`

- [ ] **Step 1: Create durations DB layer**

Create `src/app/_db/durations.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getDurations() {
  return prisma.duration.findMany({ orderBy: { month_count: "asc" } });
}

export async function getDurationById(id: number) {
  return prisma.duration.findUnique({ where: { id } });
}

export async function createDuration(data: { duration: string; month_count: number }) {
  return prisma.duration.create({ data });
}

export async function updateDuration(id: number, data: { duration: string; month_count: number }) {
  return prisma.duration.update({ where: { id }, data });
}

export async function deleteDuration(id: number) {
  return prisma.duration.delete({ where: { id } });
}
```

- [ ] **Step 2: Create room-types DB layer**

Create `src/app/_db/room-types.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getRoomTypes() {
  return prisma.roomType.findMany({ orderBy: { type: "asc" } });
}

export async function getRoomTypeById(id: number) {
  return prisma.roomType.findUnique({
    where: { id },
    include: { roomtypedurations: { include: { durations: true, locations: true } } },
  });
}

export async function createRoomType(data: { type: string; description?: string }) {
  return prisma.roomType.create({ data });
}

export async function updateRoomType(id: number, data: { type?: string; description?: string }) {
  return prisma.roomType.update({ where: { id }, data });
}

export async function deleteRoomType(id: number) {
  return prisma.roomType.delete({ where: { id } });
}

export async function upsertRoomTypeDuration(data: {
  room_type_id: number;
  duration_id: number;
  location_id: number;
  suggested_price?: number;
}) {
  return prisma.roomTypeDuration.upsert({
    where: {
      room_type_id_duration_id_location_id: {
        room_type_id: data.room_type_id,
        duration_id: data.duration_id,
        location_id: data.location_id,
      },
    },
    update: { suggested_price: data.suggested_price },
    create: data,
  });
}

export async function getRoomTypeDurations(locationId: number) {
  return prisma.roomTypeDuration.findMany({
    where: { location_id: locationId },
    include: { roomtypes: true, durations: true },
  });
}
```

- [ ] **Step 3: Create guests DB layer**

Create `src/app/_db/guests.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getGuestsByBooking(bookingId: number) {
  return prisma.guest.findMany({
    where: { booking_id: bookingId },
    include: { GuestStay: true },
  });
}

export async function getGuestById(id: number) {
  return prisma.guest.findUnique({
    where: { id },
    include: { GuestStay: true, booking: true },
  });
}

export async function createGuest(data: {
  name: string;
  email?: string;
  phone?: string;
  booking_id: number;
}) {
  return prisma.guest.create({ data });
}

export async function updateGuest(id: number, data: { name?: string; email?: string; phone?: string }) {
  return prisma.guest.update({ where: { id }, data });
}

export async function deleteGuest(id: number) {
  return prisma.guest.delete({ where: { id } });
}

export async function createGuestStay(data: {
  guest_id: number;
  start_date: Date;
  end_date: Date;
  daily_fee: number;
}) {
  return prisma.guestStay.create({ data: { ...data, daily_fee: data.daily_fee } });
}

export async function updateGuestStay(id: number, data: {
  start_date?: Date;
  end_date?: Date;
  daily_fee?: number;
}) {
  return prisma.guestStay.update({ where: { id }, data });
}

export async function deleteGuestStay(id: number) {
  return prisma.guestStay.delete({ where: { id } });
}
```

- [ ] **Step 4: Create addons DB layer**

Create `src/app/_db/addons.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getAddonsByLocation(locationId: number) {
  return prisma.addOn.findMany({
    where: { location_id: locationId },
    include: { pricing: { orderBy: { interval_start: "asc" } }, children: true },
    orderBy: { name: "asc" },
  });
}

export async function getAddonById(id: string) {
  return prisma.addOn.findUnique({
    where: { id },
    include: { pricing: { orderBy: { interval_start: "asc" } }, children: true, parentAddOn: true },
  });
}

export async function createAddon(data: {
  name: string;
  description?: string;
  location_id: number;
  parent_addon_id?: string;
  requires_input?: boolean;
  pricing?: { price: number; interval_start: number; interval_end?: number; is_full_payment?: boolean }[];
}) {
  const { pricing, ...addonData } = data;
  return prisma.addOn.create({
    data: {
      ...addonData,
      pricing: pricing ? { create: pricing } : undefined,
    },
    include: { pricing: true },
  });
}

export async function deleteAddon(id: string) {
  return prisma.addOn.delete({ where: { id } });
}
```

- [ ] **Step 5: Create events and email-logs DB layers**

Create `src/app/_db/events.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getEvents() {
  return prisma.event.findMany({ orderBy: { start: "asc" } });
}

export async function getEventById(id: number) {
  return prisma.event.findUnique({ where: { id } });
}

export async function createEvent(data: {
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  recurring?: boolean;
  extendedProps?: object;
}) {
  return prisma.event.create({ data });
}

export async function updateEvent(id: number, data: Partial<Parameters<typeof createEvent>[0]>) {
  return prisma.event.update({ where: { id }, data });
}

export async function deleteEvent(id: number) {
  return prisma.event.delete({ where: { id } });
}
```

Create `src/app/_db/email-logs.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function createEmailLog(data: {
  status: string;
  payload: string;
  from: string;
  to: string;
  subject?: string;
}) {
  return prisma.emailLogs.create({ data });
}

export async function getEmailLogs() {
  return prisma.emailLogs.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
}
```

- [ ] **Step 6: Create dashboard DB layer**

Create `src/app/_db/dashboard.ts`:

```typescript
import { prisma } from "@/app/_lib/prisma";
import { Prisma, TransactionType } from "@prisma/client";

export async function getGroupedIncomeExpense(
  locationId: number,
  startDate: Date,
  endDate: Date,
  splitDeposit: boolean
) {
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const groupBy = diffDays < 90 ? "day" : "month";

  const where: Prisma.TransactionWhereInput = {
    location_id: locationId,
    date: { gte: startDate, lte: endDate },
  };

  if (splitDeposit) {
    where.category = { not: "Deposit" };
  }

  const transactions = await prisma.transaction.findMany({ where, orderBy: { date: "asc" } });

  const depositWhere: Prisma.TransactionWhereInput = {
    location_id: locationId,
    date: { gte: startDate, lte: endDate },
    category: "Deposit",
  };
  const depositTransactions = await prisma.transaction.findMany({ where: depositWhere, orderBy: { date: "asc" } });

  return { transactions, depositTransactions, groupBy };
}

export async function getDashboardStats(locationId: number) {
  const rooms = await prisma.room.count({ where: { location_id: locationId } });
  const occupiedRooms = await prisma.room.count({ where: { location_id: locationId, status_id: 2 } });
  const activeBookings = await prisma.booking.count({
    where: { rooms: { location_id: locationId }, status_id: 2 },
  });

  return { totalRooms: rooms, occupiedRooms, activeBookings };
}

export async function getRecentPayments(locationId: number, limit = 5) {
  return prisma.payment.findMany({
    where: { bookings: { rooms: { location_id: locationId } } },
    include: { bookings: { include: { tenants: true, rooms: true } }, paymentstatuses: true },
    orderBy: { payment_date: "desc" },
    take: limit,
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add database layers for durations, room-types, guests, addons, events, email-logs, dashboard"
```

---

## Phase 3: Authentication System

### Task 3.1: NextAuth Configuration

**Files:**
- Create: `src/app/_lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Create NextAuth configuration**

Create `src/app/_lib/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { getUserByEmail } from "@/app/_db/site-users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await getUserByEmail(credentials.email as string);
        if (!user) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!passwordMatch) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role_id: user.role_id,
          shouldReset: user.shouldReset,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 15, // 15 minutes
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role_id = (user as any).role_id;
        token.shouldReset = (user as any).shouldReset;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role_id = token.role_id as number;
        (session.user as any).shouldReset = token.shouldReset as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
```

- [ ] **Step 2: Create auth route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/app/_lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 3: Create auth type declarations**

Create `src/types/next-auth.d.ts`:

```typescript
import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role_id: number | null;
    shouldReset: boolean;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role_id: number | null;
      shouldReset: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role_id: number | null;
    shouldReset: boolean;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): implement NextAuth with credentials provider and JWT strategy"
```

---

### Task 3.2: Auth Actions (Login, Register, Reset)

**Files:**
- Create: `src/app/(external)/(auth)/login/login-action.ts`, `src/app/(external)/(auth)/register/register-action.ts`, `src/app/(external)/(auth)/reset/reset-action.ts`

- [ ] **Step 1: Create login action**

Create `src/app/(external)/(auth)/login/login-action.ts`:

```typescript
"use server";

import { signIn } from "@/app/_lib/auth";
import { AuthError } from "next-auth";

export async function loginAction(formData: { email: string; password: string }) {
  try {
    await signIn("credentials", {
      email: formData.email,
      password: formData.password,
      redirect: false,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: "Nama pengguna atau kata sandi tidak valid" };
    }
    return { success: false, error: "Nama pengguna atau kata sandi tidak valid" };
  }
}
```

- [ ] **Step 2: Create register action**

Create `src/app/(external)/(auth)/register/register-action.ts`:

```typescript
"use server";

import bcrypt from "bcrypt";
import { createUser } from "@/app/_db/site-users";
import { getRegistrationEnabled } from "@/app/_db/settings";

export async function registerAction(formData: {
  name: string;
  email: string;
  password: string;
}) {
  const registrationEnabled = await getRegistrationEnabled();
  if (!registrationEnabled) {
    return { success: false, error: "Registrasi tidak tersedia" };
  }

  try {
    const hashedPassword = await bcrypt.hash(formData.password, 10);
    await createUser({
      name: formData.name,
      email: formData.email,
      password: hashedPassword,
      role_id: 4, // Default to Viewer
    });
    return { success: true };
  } catch (error: any) {
    if (error?.code === "P2002") {
      return { success: false, error: "Alamat email sudah terdaftar" };
    }
    return { success: false, error: "Request unsuccessful" };
  }
}
```

- [ ] **Step 3: Create reset password action**

Create `src/app/(external)/(auth)/reset/reset-action.ts`:

```typescript
"use server";

import bcrypt from "bcrypt";
import { getUserByEmail, updateUser } from "@/app/_db/site-users";
import { sendPasswordResetEmail } from "@/app/_lib/mailer";

function generateRandomPassword(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function resetPasswordAction(formData: { email: string }) {
  // Always return success to not reveal email existence
  const user = await getUserByEmail(formData.email);

  if (user) {
    const newPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await updateUser(user.id, { password: hashedPassword, shouldReset: true });
    await sendPasswordResetEmail(user.email, newPassword);
  }

  return { success: true, message: "Jika email terdaftar, kata sandi baru telah dikirim" };
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): add login, register, and password reset server actions"
```

---

## Phase 4: Utility Functions

### Task 4.1: Date and Booking Utilities

**Files:**
- Create: `src/app/_lib/util/booking.ts`, `src/app/_lib/util/datetime.ts`, `src/app/_lib/util/currency.ts`, `src/app/_lib/util/serialize.ts`, `src/app/_lib/util/request-context.ts`

- [ ] **Step 1: Create date utility**

Create `src/app/_lib/util/datetime.ts`:

```typescript
import { format, lastDayOfMonth, addMonths, differenceInCalendarMonths, getDaysInMonth } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export function getIndonesianMonthName(date: Date): string {
  return format(date, "MMMM", { locale: idLocale });
}

export function getLastDayOfMonth(year: number, month: number): Date {
  return lastDayOfMonth(new Date(year, month - 1));
}

export function formatDateIndonesian(date: Date): string {
  return format(date, "dd MMMM yyyy", { locale: idLocale });
}

/**
 * Count months between two dates.
 * First partial month does NOT count, last month ALWAYS counts.
 * Order-independent.
 */
export function countMonths(start: Date, end: Date): number {
  let earlier = start < end ? start : end;
  let later = start < end ? end : start;

  const baseDiff = differenceInCalendarMonths(later, earlier) + 1;

  // If start day is not the 1st, subtract one month
  if (earlier.getDate() !== 1) {
    return baseDiff - 1;
  }

  return baseDiff;
}

export function generateDatesBetween(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
```

- [ ] **Step 2: Create booking utility**

Create `src/app/_lib/util/booking.ts`:

```typescript
import { addMonths, lastDayOfMonth } from "date-fns";

/**
 * Calculate booking end date.
 * If start_date is 1st of month: end = last day of (start_month + month_count - 1)
 * If start_date is NOT 1st: end = last day of (start_month + month_count)
 */
export function getLastDateOfBooking(startDate: Date, monthCount: number): Date {
  const day = startDate.getDate();

  if (day === 1) {
    // Start on 1st: end = last day of (start + monthCount - 1) months
    const targetMonth = addMonths(startDate, monthCount - 1);
    return lastDayOfMonth(targetMonth);
  } else {
    // Start NOT on 1st: end = last day of (start + monthCount) months
    const targetMonth = addMonths(startDate, monthCount);
    return lastDayOfMonth(targetMonth);
  }
}

/**
 * Check if a booking is currently active.
 */
export function isBookingActive(
  isRolling: boolean,
  startDate: Date,
  endDate: Date | null,
  today: Date = new Date()
): boolean {
  if (isRolling) {
    // Rolling: active if started and no end_date
    return startDate <= today && endDate === null;
  } else {
    // Fixed: active if today is between start and end
    if (!endDate) return false;
    return startDate <= today && today <= endDate;
  }
}

/**
 * Get the next upcoming booking for a room.
 */
export function getNextUpcomingBooking<T extends { start_date: Date; end_date: Date | null; is_rolling: boolean }>(
  bookings: T[],
  today: Date = new Date()
): T | null {
  const upcoming = bookings
    .filter((b) => b.start_date > today)
    .sort((a, b) => a.start_date.getTime() - b.start_date.getTime());
  return upcoming[0] || null;
}
```

- [ ] **Step 3: Create currency utility**

Create `src/app/_lib/util/currency.ts`:

```typescript
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "-";

  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}
```

- [ ] **Step 4: Create serialization utility**

Create `src/app/_lib/util/serialize.ts`:

```typescript
import { Prisma } from "@prisma/client";

/**
 * Recursively converts Prisma Decimal values to strings for client serialization.
 */
export function serializeForClient<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (data instanceof Prisma.Decimal) {
    return data.toString() as unknown as T;
  }

  if (data instanceof Date) {
    return data.toISOString() as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => serializeForClient(item)) as unknown as T;
  }

  if (typeof data === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeForClient(value);
    }
    return result;
  }

  return data;
}
```

- [ ] **Step 5: Create request context utility**

Create `src/app/_lib/util/request-context.ts`:

```typescript
import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  requestId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string {
  return requestContextStorage.getStore()?.requestId ?? "no-request-id";
}

export function withRequestId<T>(requestId: string, fn: () => T): T {
  return requestContextStorage.run({ requestId }, fn);
}

export function withAction<T>(fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    const requestId = crypto.randomUUID();
    return requestContextStorage.run({ requestId }, fn);
  };
}
```

- [ ] **Step 6: Create barrel export**

Create `src/app/_lib/util/index.ts`:

```typescript
export * from "./booking";
export * from "./currency";
export * from "./datetime";
export * from "./serialize";
export * from "./request-context";
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(util): add date calculation, currency formatting, serialization, and request context helpers"
```

---

## Phase 5: Zod Validation Schemas

### Task 5.1: Auth and Entity Schemas

**Files:**
- Create: `src/app/_lib/zod/auth/zod.ts`, `src/app/_lib/zod/booking/zod.ts`, `src/app/_lib/zod/bill-item/zod.ts`, `src/app/_lib/zod/payment/zod.ts`, `src/app/_lib/zod/deposit/zod.ts`, `src/app/_lib/zod/tenant/zod.ts`, `src/app/_lib/zod/room/zod.ts`, `src/app/_lib/zod/addon/zod.ts`, `src/app/_lib/zod/guest/zod.ts`, `src/app/_lib/zod/event/zod.ts`, `src/app/_lib/zod/settings/zod.ts`

- [ ] **Step 1: Create auth schema**

Create `src/app/_lib/zod/auth/zod.ts`:

```typescript
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Alamat email tidak valid"),
  password: z.string().min(8, "Kata sandi harus lebih dari 8 karakter"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Nama harus diisi"),
  email: z.string().email("Alamat email tidak valid"),
  password: z.string().min(8, "Kata sandi harus lebih dari 8 karakter").max(32, "Kata sandi maksimal 32 karakter"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Kata sandi tidak cocok",
  path: ["confirmPassword"],
});

export const resetSchema = z.object({
  email: z.string().email("Alamat email tidak valid"),
});

export const changePasswordSchema = z.object({
  newPassword: z.string().min(8, "Kata sandi harus lebih dari 8 karakter").max(32, "Kata sandi maksimal 32 karakter"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Kata sandi tidak cocok",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 2: Create booking schema**

Create `src/app/_lib/zod/booking/zod.ts`:

```typescript
import { z } from "zod";

export const bookingSchema = z.object({
  id: z.number().optional(),
  room_id: z.number({ required_error: "Kamar harus dipilih" }),
  tenant_id: z.string().min(1, "Penghuni harus dipilih"),
  start_date: z.string().min(1, "Tanggal mulai harus diisi"),
  duration_id: z.number().nullable(),
  is_rolling: z.boolean().default(false),
  fee: z.number().min(1, "Fee should be greater than 0"),
  status_id: z.number({ required_error: "Status harus dipilih" }),
  second_resident_fee: z.number().nullable().optional(),
  deposit_amount: z.number().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.is_rolling && data.duration_id !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Duration ID must be null for rolling bookings",
      path: ["duration_id"],
    });
  }
  if (!data.is_rolling && !data.duration_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Durasi harus dipilih untuk booking fixed-term",
      path: ["duration_id"],
    });
  }
});

export type BookingInput = z.infer<typeof bookingSchema>;
```

- [ ] **Step 3: Create payment schema**

Create `src/app/_lib/zod/payment/zod.ts`:

```typescript
import { z } from "zod";

export const paymentSchema = z.object({
  id: z.number().optional(),
  booking_id: z.number(),
  amount: z.number().min(1, "Jumlah pembayaran harus lebih dari 0"),
  payment_date: z.string().min(1, "Tanggal pembayaran harus diisi"),
  status_id: z.number().optional(),
  allocation_mode: z.enum(["auto", "manual"]),
  manual_allocations: z.array(z.object({
    bill_id: z.number(),
    amount: z.number(),
  })).optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
```

- [ ] **Step 4: Create deposit schema**

Create `src/app/_lib/zod/deposit/zod.ts`:

```typescript
import { z } from "zod";

export const depositSchema = z.object({
  id: z.number().optional(),
  booking_id: z.number(),
  amount: z.number().min(1, "Jumlah deposit harus lebih dari 0"),
});

export const depositStatusSchema = z.object({
  id: z.number(),
  status: z.enum(["UNPAID", "HELD", "APPLIED", "REFUNDED", "PARTIALLY_REFUNDED", "FORFEITED"]),
  refunded_amount: z.number().optional(),
}).superRefine((data, ctx) => {
  if (data.status === "REFUNDED" && !data.refunded_amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Jumlah pengembalian dana harus diisi",
      path: ["refunded_amount"],
    });
  }
  if (data.status === "PARTIALLY_REFUNDED" && !data.refunded_amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Jumlah pengembalian dana harus diisi",
      path: ["refunded_amount"],
    });
  }
});

export type DepositInput = z.infer<typeof depositSchema>;
export type DepositStatusInput = z.infer<typeof depositStatusSchema>;
```

- [ ] **Step 5: Create tenant schema**

Create `src/app/_lib/zod/tenant/zod.ts`:

```typescript
import { z } from "zod";

const base64FileRegex = /^data:image\/(png|jpeg|jpg|webp);base64,/;

export const tenantSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nama harus diisi"),
  email: z.string().email("Alamat email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  id_number: z.string().min(1, "Nomor identitas harus diisi"),
  current_address: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  referral_source: z.string().optional(),
  id_file: z.string().optional(),
  family_certificate_file: z.string().optional(),
  second_resident_name: z.string().optional(),
  second_resident_email: z.string().optional(),
  second_resident_phone: z.string().optional(),
  second_resident_id_number: z.string().optional(),
  second_resident_id_file: z.string().optional(),
  second_resident_relation: z.string().optional(),
}).superRefine((data, ctx) => {
  const hasSecondResident = data.second_resident_name || data.second_resident_email ||
    data.second_resident_phone || data.second_resident_id_number ||
    data.second_resident_id_file || data.second_resident_relation;

  if (hasSecondResident) {
    if (!data.second_resident_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "'Nama' harus diisi jika salah satu field penghuni kedua diisi", path: ["second_resident_name"] });
    }
    if (!data.second_resident_id_number) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "'Nomor identitas' harus diisi jika salah satu field penghuni kedua diisi", path: ["second_resident_id_number"] });
    }
    if (!data.family_certificate_file) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Kartu keluarga harus diunggah jika ada penghuni kedua", path: ["family_certificate_file"] });
    }
  }
});

export type TenantInput = z.infer<typeof tenantSchema>;
```

- [ ] **Step 6: Create remaining schemas**

Create `src/app/_lib/zod/room/zod.ts`:

```typescript
import { z } from "zod";

export const roomSchema = z.object({
  id: z.number().optional(),
  room_number: z.string().min(1, "Nomor kamar harus diisi"),
  room_type_id: z.number({ required_error: "Tipe kamar harus dipilih" }),
  status_id: z.number({ required_error: "Status harus dipilih" }),
  location_id: z.number({ required_error: "Lokasi harus dipilih" }),
});

export const roomTypeSchema = z.object({
  id: z.number().optional(),
  type: z.string().min(1, "Tipe harus diisi"),
  description: z.string().optional(),
});

export const durationSchema = z.object({
  id: z.number().optional(),
  duration: z.string().min(1, "Nama durasi harus diisi"),
  month_count: z.number().min(1, "Jumlah bulan harus lebih dari 0"),
});

export type RoomInput = z.infer<typeof roomSchema>;
export type RoomTypeInput = z.infer<typeof roomTypeSchema>;
export type DurationInput = z.infer<typeof durationSchema>;
```

Create `src/app/_lib/zod/addon/zod.ts`:

```typescript
import { z } from "zod";

export const addonPricingSchema = z.object({
  price: z.number().min(0, "Harga harus lebih dari atau sama dengan 0"),
  interval_start: z.number().min(0),
  interval_end: z.number().nullable().optional(),
  is_full_payment: z.boolean().default(false),
});

export const addonSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nama addon harus diisi"),
  description: z.string().optional(),
  location_id: z.number(),
  parent_addon_id: z.string().nullable().optional(),
  requires_input: z.boolean().default(false),
  pricing: z.array(addonPricingSchema).min(1, "Minimal satu harga harus ditentukan"),
});

export type AddonInput = z.infer<typeof addonSchema>;
```

Create `src/app/_lib/zod/guest/zod.ts`:

```typescript
import { z } from "zod";

export const guestSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Nama tamu harus diisi"),
  email: z.string().email("Alamat email tidak valid").optional().or(z.literal("")),
  phone: z.string().optional(),
  booking_id: z.number(),
});

export const guestStaySchema = z.object({
  id: z.number().optional(),
  guest_id: z.number(),
  start_date: z.string().min(1, "Tanggal mulai harus diisi"),
  end_date: z.string().min(1, "Tanggal selesai harus diisi"),
  daily_fee: z.number().min(0, "Biaya harian harus lebih dari atau sama dengan 0"),
});

export type GuestInput = z.infer<typeof guestSchema>;
export type GuestStayInput = z.infer<typeof guestStaySchema>;
```

Create `src/app/_lib/zod/event/zod.ts`:

```typescript
import { z } from "zod";

export const eventSchema = z.object({
  id: z.number().optional(),
  title: z.string().min(1, "Judul harus diisi"),
  description: z.string().optional(),
  start: z.string().min(1, "Waktu mulai harus diisi"),
  end: z.string().optional(),
  allDay: z.boolean().default(false),
  backgroundColor: z.string().optional(),
  borderColor: z.string().optional(),
  textColor: z.string().optional(),
  recurring: z.boolean().default(false),
});

export type EventInput = z.infer<typeof eventSchema>;
```

Create `src/app/_lib/zod/settings/zod.ts`:

```typescript
import { z } from "zod";

export const setupSchema = z.object({
  company_name: z.string().min(1, "Nama perusahaan harus diisi"),
  company_image: z.string().optional(),
  location_name: z.string().min(1, "Nama lokasi harus diisi"),
  location_address: z.string().min(1, "Alamat lokasi harus diisi"),
});

export const siteUserSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nama harus diisi"),
  email: z.string().email("Alamat email tidak valid"),
  password: z.string().min(8, "Kata sandi harus lebih dari 8 karakter").max(32).optional(),
  role_id: z.number({ required_error: "Role harus dipilih" }),
});

export type SetupInput = z.infer<typeof setupSchema>;
export type SiteUserInput = z.infer<typeof siteUserSchema>;
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(validation): add Zod schemas for all entities"
```

---

## Phase 6: Core Layout and Middleware

### Task 6.1: Middleware and Route Protection

**Files:**
- Create: `src/middleware.ts`, `src/app/(internal)/layout.tsx`, `src/app/(internal)/(dashboard_layout)/layout.tsx`, `src/app/(external)/layout.tsx`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Create middleware**

Create `src/middleware.ts`:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Create root layout**

Create `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "HMS - Housing Management System",
  description: "Housing Management System by MICASA Suites",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="antialiased">
        {children}
        <ToastContainer position="top-right" autoClose={3000} />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create root page (redirect)**

Create `src/app/page.tsx`:

```typescript
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");
}
```

- [ ] **Step 4: Create external layout (auth pages)**

Create `src/app/(external)/layout.tsx`:

```typescript
export default function ExternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Create internal layout (auth guard)**

Create `src/app/(internal)/layout.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  if (session.user.shouldReset) {
    redirect("/change-password");
  }

  return <>{children}</>;
}
```

- [ ] **Step 6: Create dashboard layout (setup guard + UI shell)**

Create `src/app/(internal)/(dashboard_layout)/layout.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getAppSetup } from "@/app/_db/settings";
import { Sidebar } from "@/app/_components/sidebar";
import { Header } from "@/app/_components/header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const isSetup = await getAppSetup();

  if (!isSetup) {
    redirect("/first-time-setup");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(layout): add middleware, route groups, setup guard, and layouts"
```

---

## Phase 7: First-Time Setup Wizard

### Task 7.1: Setup Page and Server Action

**Files:**
- Create: `src/app/(internal)/first-time-setup/page.tsx`, `src/app/(internal)/first-time-setup/setup-action.ts`, `src/app/(internal)/first-time-setup/setup-form.tsx`

- [ ] **Step 1: Create setup server action**

Create `src/app/(internal)/first-time-setup/setup-action.ts`:

```typescript
"use server";

import { upsertSetting } from "@/app/_db/settings";
import { createLocation } from "@/app/_db/locations";
import { uploadToS3 } from "@/app/_lib/s3";

export async function completeSetupAction(formData: {
  companyName: string;
  companyImage?: string; // base64
  companyImageName?: string;
  locationName: string;
  locationAddress: string;
}) {
  let imageUrl = "";

  if (formData.companyImage && formData.companyImageName) {
    const buffer = Buffer.from(formData.companyImage.split(",")[1], "base64");
    const key = `company/${new Date().toISOString()}/${formData.companyImageName}`;
    await uploadToS3(key, buffer, formData.companyImage.split(";")[0].split(":")[1]);
    imageUrl = key;
  }

  await upsertSetting("COMPANY_NAME", formData.companyName);
  await upsertSetting("COMPANY_IMAGE", imageUrl);
  await createLocation({ name: formData.locationName, address: formData.locationAddress });
  await upsertSetting("APP_SETUP", "true");

  return { success: true };
}
```

- [ ] **Step 2: Create 3-step setup form (client component)**

Create `src/app/(internal)/first-time-setup/setup-form.tsx`:

Multi-step wizard:
- Step 0: Introduction text ("Selamat datang! Mari mengatur aplikasi Anda.")
- Step 1: Company Name (text input) + Logo (image upload, max 2MB, image/* MIME)
- Step 2: Location Name + Address
- Final: Submit calls `completeSetupAction`, redirects to `/dashboard`

Client-side validations:
- Image file size ≤ 2MB
- Image must be image/* MIME type
- Company name required
- Location name and address required

- [ ] **Step 3: Create setup page**

Create `src/app/(internal)/first-time-setup/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { getAppSetup } from "@/app/_db/settings";
import SetupForm from "./setup-form";

export default async function FirstTimeSetupPage() {
  const isSetup = await getAppSetup();
  if (isSetup) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow">
        <SetupForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(setup): add first-time setup wizard with 3-step flow"
```

---

## Phase 8: Rooms, Locations, Durations, Room Types (CRUD)

### Task 8.1: Location Management

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/locations/page.tsx`, `src/app/(internal)/(dashboard_layout)/locations/location-action.ts`, `src/app/(internal)/(dashboard_layout)/locations/location-form.tsx`, `src/app/(internal)/(dashboard_layout)/locations/location-table.tsx`

- [ ] **Step 1: Create location server actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createLocation, updateLocation, deleteLocation } from "@/app/_db/locations";
import { locationSchema } from "@/app/_lib/zod/room/zod";

export async function upsertLocationAction(formData: { id?: number; name: string; address: string }) {
  const parsed = locationSchema.safeParse(formData);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  if (formData.id) {
    await updateLocation(formData.id, parsed.data);
  } else {
    await createLocation(parsed.data);
  }

  revalidatePath("/locations");
  return { success: true };
}

export async function deleteLocationAction(id: number) {
  try {
    await deleteLocation(id);
    revalidatePath("/locations");
    return { success: true };
  } catch (e: any) {
    if (e.code === "P2003") return { success: false, error: "Location has associated rooms" };
    return { success: false, error: "Error deleting location" };
  }
}
```

- [ ] **Step 2: Create location page, form, and table components**

Standard CRUD page with:
- TanStack React Table for listing
- Modal/drawer form for create/edit
- Delete with confirmation
- Fields: name, address

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(locations): add location CRUD with table and form"
```

---

### Task 8.2: Room Type and Duration Management

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/rooms/room-types/page.tsx`, `src/app/(internal)/(dashboard_layout)/rooms/room-types/room-type-action.ts`
- Create: `src/app/(internal)/(dashboard_layout)/rooms/durations/page.tsx`, `src/app/(internal)/(dashboard_layout)/rooms/durations/duration-action.ts`

- [ ] **Step 1: Create room type actions**

```typescript
"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";

export async function upsertRoomTypeAction(data: { id?: number; type: string; description?: string }) {
  if (data.id) {
    await prisma.roomType.update({ where: { id: data.id }, data: { type: data.type, description: data.description } });
  } else {
    await prisma.roomType.create({ data: { type: data.type, description: data.description } });
  }
  revalidatePath("/rooms/room-types");
  return { success: true };
}

export async function deleteRoomTypeAction(id: number) {
  try {
    await prisma.roomType.delete({ where: { id } });
    revalidatePath("/rooms/room-types");
    return { success: true };
  } catch (e: any) {
    if (e.code === "P2003") return { success: false, error: "There are rooms with this type. Please reassign them before deleting." };
    return { success: false, error: "Error deleting room type" };
  }
}
```

- [ ] **Step 2: Create duration actions**

```typescript
"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";

export async function upsertDurationAction(data: { id?: number; duration: string; month_count: number }) {
  if (data.id) {
    await prisma.duration.update({ where: { id: data.id }, data });
  } else {
    await prisma.duration.create({ data });
  }
  revalidatePath("/rooms/durations");
  return { success: true };
}

export async function deleteDurationAction(id: number) {
  try {
    await prisma.duration.delete({ where: { id } });
    revalidatePath("/rooms/durations");
    return { success: true };
  } catch (e: any) {
    if (e.code === "P2003") return { success: false, error: "There are rooms with this duration. Please reassign them before deleting." };
    return { success: false, error: "Error deleting duration" };
  }
}
```

- [ ] **Step 3: Create room-type-duration pricing (RoomTypeDuration)**

Actions for managing suggested prices per room-type + duration + location combination:

```typescript
export async function upsertRoomTypeDurationAction(data: {
  room_type_id: number;
  duration_id: number;
  location_id: number;
  suggested_price: number | null;
}) {
  await prisma.roomTypeDuration.upsert({
    where: { room_type_id_duration_id_location_id: {
      room_type_id: data.room_type_id,
      duration_id: data.duration_id,
      location_id: data.location_id,
    }},
    update: { suggested_price: data.suggested_price },
    create: data,
  });
  revalidatePath("/rooms/room-types");
  return { success: true };
}
```

- [ ] **Step 4: Create pages and table components for room types and durations**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(rooms): add room type, duration, and pricing CRUD"
```

---

### Task 8.3: Room Management

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/page.tsx`, `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/room-action.ts`, `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/room-form.tsx`, `src/app/(internal)/(dashboard_layout)/rooms/all-rooms/room-table.tsx`

- [ ] **Step 1: Create room server actions**

```typescript
"use server";

import { createRoom, updateRoom, deleteRoom } from "@/app/_db/rooms";
import { revalidatePath } from "next/cache";

export async function upsertRoomAction(data: {
  id?: number;
  room_number: string;
  room_type_id: number;
  status_id: number;
  location_id: number;
}) {
  try {
    if (data.id) {
      await updateRoom(data.id, data);
    } else {
      await createRoom(data);
    }
    revalidatePath("/rooms/all-rooms");
    return { success: true };
  } catch (e: any) {
    if (e.code === "P2002") return { success: false, error: "Room Number is taken" };
    return { success: false, error: "Error saving room" };
  }
}

export async function deleteRoomAction(id: number) {
  try {
    await deleteRoom(id);
    revalidatePath("/rooms/all-rooms");
    return { success: true };
  } catch (e: any) {
    if (e.code === "P2003") return { success: false, error: "Room has active bookings" };
    return { success: false, error: "Error deleting guest" }; // NOTE: preserves original bug per TC-112
  }
}
```

- [ ] **Step 2: Create room page with table, form, and status/type dropdowns**

Room form includes:
- Room number (text)
- Room type (select from roomtypes)
- Status (select from roomstatuses)
- Location (pre-selected from header context)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(rooms): add room CRUD with type and status selection"
```

---

## Phase 9: Tenants + S3 File Uploads

### Task 9.1: S3 Utility Module

**Files:**
- Create: `src/app/_lib/s3.ts`

- [ ] **Step 1: Create S3 helper**

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET!;

export async function uploadToS3(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return key;
}

export async function getFromS3(key: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return response;
}

export async function deleteFromS3(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
```

- [ ] **Step 2: Create S3 proxy route**

Create `src/app/(internal)/(dashboard_layout)/s3/[[...s3Path]]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/_lib/auth";
import { getFromS3 } from "@/app/_lib/s3";

export async function GET(request: NextRequest, { params }: { params: { s3Path?: string[] } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = params.s3Path?.join("/") || "";
  try {
    const response = await getFromS3(key);
    const body = await response.Body?.transformToByteArray();
    return new NextResponse(body, {
      headers: { "Content-Type": response.ContentType || "application/octet-stream" },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(s3): add S3 upload/download utility and proxy route"
```

---

### Task 9.2: Tenant Management

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/residents/tenants/page.tsx`, `src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-action.ts`, `src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-form.tsx`, `src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-table.tsx`

- [ ] **Step 1: Create tenant server action**

Key points:
- S3 key format for ID: `tenants/id/{ISO_timestamp}/{name}_{filename}`
- S3 key format for family cert: `tenants/family-certificate/{ISO_timestamp}/{filename}`
- S3 key format for second resident ID: `tenants/id/{ISO_timestamp}/{second_resident_name}_{filename}`
- On partial S3 failure: clean up already-uploaded files
- Second resident validation: if ANY second_resident field is set, all required fields must be filled + family_certificate required
- File validation: ID max 5MB, family cert max 3MB, second resident ID max 5MB

```typescript
"use server";

import { createTenant, updateTenant, deleteTenant } from "@/app/_db/tenant";
import { uploadToS3, deleteFromS3 } from "@/app/_lib/s3";
import { tenantSchema } from "@/app/_lib/zod/tenant/zod";
import { revalidatePath } from "next/cache";

export async function upsertTenantAction(data: {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  id_number: string;
  current_address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  referral_source?: string;
  id_file?: string; // base64
  id_file_name?: string;
  family_certificate_file?: string; // base64
  family_certificate_file_name?: string;
  second_resident_name?: string;
  second_resident_email?: string;
  second_resident_phone?: string;
  second_resident_id_number?: string;
  second_resident_id_file?: string; // base64
  second_resident_id_file_name?: string;
  second_resident_relation?: string;
}) {
  const parsed = tenantSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  const uploadedKeys: string[] = [];

  try {
    let id_file_key: string | undefined;
    let family_cert_key: string | undefined;
    let second_id_key: string | undefined;

    if (data.id_file && data.id_file_name) {
      const buffer = Buffer.from(data.id_file.split(",")[1], "base64");
      const key = `tenants/id/${new Date().toISOString()}/${data.name}_${data.id_file_name}`;
      await uploadToS3(key, buffer, data.id_file.split(";")[0].split(":")[1]);
      uploadedKeys.push(key);
      id_file_key = key;
    }

    if (data.family_certificate_file && data.family_certificate_file_name) {
      const buffer = Buffer.from(data.family_certificate_file.split(",")[1], "base64");
      const key = `tenants/family-certificate/${new Date().toISOString()}/${data.family_certificate_file_name}`;
      await uploadToS3(key, buffer, data.family_certificate_file.split(";")[0].split(":")[1]);
      uploadedKeys.push(key);
      family_cert_key = key;
    }

    if (data.second_resident_id_file && data.second_resident_id_file_name) {
      const buffer = Buffer.from(data.second_resident_id_file.split(",")[1], "base64");
      const key = `tenants/id/${new Date().toISOString()}/${data.second_resident_name}_${data.second_resident_id_file_name}`;
      await uploadToS3(key, buffer, data.second_resident_id_file.split(";")[0].split(":")[1]);
      uploadedKeys.push(key);
      second_id_key = key;
    }

    const tenantData = {
      name: data.name,
      email: data.email,
      phone: data.phone,
      id_number: data.id_number,
      current_address: data.current_address,
      emergency_contact_name: data.emergency_contact_name,
      emergency_contact_phone: data.emergency_contact_phone,
      referral_source: data.referral_source,
      second_resident_name: data.second_resident_name,
      second_resident_email: data.second_resident_email,
      second_resident_phone: data.second_resident_phone,
      second_resident_id_number: data.second_resident_id_number,
      second_resident_relation: data.second_resident_relation,
      ...(id_file_key && { id_file: id_file_key }),
      ...(family_cert_key && { family_certificate_file: family_cert_key }),
      ...(second_id_key && { second_resident_id_file: second_id_key }),
    };

    if (data.id) {
      await updateTenant(data.id, tenantData);
    } else {
      await createTenant(tenantData);
    }

    revalidatePath("/residents/tenants");
    return { success: true };
  } catch (error) {
    // Cleanup uploaded files on failure
    for (const key of uploadedKeys) {
      try { await deleteFromS3(key); } catch {}
    }
    return { success: false, error: "Error saving tenant" };
  }
}

export async function deleteTenantAction(id: string) {
  await deleteTenant(id);
  revalidatePath("/residents/tenants");
  return { success: true };
}
```

- [ ] **Step 2: Create tenant form with file upload fields**

Form fields:
- name (required), email, phone, id_number (required), current_address
- emergency_contact_name, emergency_contact_phone, referral_source
- id_file (image upload, max 5MB)
- Second resident section (expandable):
  - second_resident_name, second_resident_email, second_resident_phone
  - second_resident_id_number, second_resident_relation
  - second_resident_id_file (max 5MB)
  - family_certificate_file (max 3MB, required if any second_resident field filled)

- [ ] **Step 3: Create tenant table and page**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tenants): add tenant CRUD with S3 file uploads and second resident"
```

---

## Phase 10: Bookings (Critical Phase)

### Task 10.1: Booking Utility Functions

**Files:**
- Create: `src/app/_lib/util/booking.ts`, `src/app/_lib/util/datetime.ts`

- [ ] **Step 1: Create datetime utilities**

Create `src/app/_lib/util/datetime.ts`:

```typescript
import { format, getDaysInMonth, addMonths, differenceInCalendarMonths } from "date-fns";

const INDONESIAN_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function getIndonesianMonthName(month: number): string {
  return INDONESIAN_MONTHS[month];
}

/**
 * BL-027: countMonths
 * First partial month does NOT count, last month ALWAYS counts.
 * Base = calendar month diff + 1. If start day != 1, subtract one.
 */
export function countMonths(start: Date, end: Date): number {
  const [earlier, later] = start <= end ? [start, end] : [end, start];
  const base = differenceInCalendarMonths(later, earlier) + 1;
  return earlier.getDate() !== 1 ? base - 1 : base;
}
```

- [ ] **Step 2: Create booking utilities**

Create `src/app/_lib/util/booking.ts`:

```typescript
import { addMonths, lastDayOfMonth } from "date-fns";

/**
 * BL-001: getLastDateOfBooking
 * If start_date is 1st: end = last day of (start_month + month_count - 1)
 * If start_date is NOT 1st: end = last day of (start_month + month_count)
 */
export function getLastDateOfBooking(startDate: Date, monthCount: number): Date {
  const isFirstOfMonth = startDate.getDate() === 1;
  const monthsToAdd = isFirstOfMonth ? monthCount - 1 : monthCount;
  const targetMonth = addMonths(startDate, monthsToAdd);
  return lastDayOfMonth(targetMonth);
}

/**
 * BL-002: isBookingActive
 * Rolling: active if start_date <= today AND end_date is null
 * Fixed: active if start_date <= today AND end_date >= today AND end_date is not null
 */
export function isBookingActive(booking: {
  start_date: Date;
  end_date: Date | null;
  is_rolling: boolean;
}): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(booking.start_date);
  start.setHours(0, 0, 0, 0);

  if (start > today) return false;

  if (booking.is_rolling) {
    return booking.end_date === null;
  }

  if (!booking.end_date) return false;

  const end = new Date(booking.end_date);
  end.setHours(0, 0, 0, 0);
  return end >= today;
}

export function getNextUpcomingBooking(bookings: Array<{
  start_date: Date;
  end_date: Date | null;
  is_rolling: boolean;
}>): typeof bookings[number] | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = bookings
    .filter((b) => new Date(b.start_date) > today)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  return upcoming[0] || null;
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(util): add booking and datetime utility functions"
```

---

### Task 10.2: Booking Bill Generation Logic

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/bookings/booking-action.ts`

- [ ] **Step 1: Implement core bill generation for fixed-term bookings**

Key logic (`generateBookingBillAndBillItems`):
1. For each month from start to end:
   - First month: prorate if start != 1st: `(daysInMonth - startDay + 1) / daysInMonth * fee`
   - Subsequent months: full fee
   - Last month of fixed booking: full month (end date is always last day of month)
2. Bill due_date = last day of billing month
3. Bill description = `"Tagihan untuk Bulan {MonthName} {Year}"` (BL-013)
4. First bill includes deposit BillItem if deposit exists (related_id: { deposit_id })
5. Second resident fee: same proration logic as room fee
6. Addon fees: resolved per month via tiered pricing (see Task 10.3)

- [ ] **Step 2: Implement rolling booking initial bill generation**

Key logic (`generateInitialBillsForRollingBooking`):
1. Calculate months from start_date to current month
2. First month: prorated as above
3. Each subsequent month up to today: full fee + addons + second resident
4. No end_date calculation needed (rolling)
5. Same bill description format and due_date logic

- [ ] **Step 3: Implement monthly cron bill generation**

Key logic (`generateNextMonthlyBill`):
1. Check booking is rolling (is_rolling=true, end_date=null)
2. Check no bill already exists for target month (idempotent - BL-011)
3. Generate single bill for target month with full fee
4. Include second_resident_fee and addon items

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(bookings): implement bill generation for fixed and rolling bookings"
```

---

### Task 10.3: Addon Pricing Resolution

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/bookings/booking-action.ts`

- [ ] **Step 1: Implement addon fee calculation**

Key logic (`processAddonsForPeriod`):
```typescript
function getAddonChargeForMonth(
  pricing: Array<{ interval_start: number; interval_end: number | null; price: number; is_full_payment: boolean }>,
  monthIndex: number // 0-based from addon start_date
): number {
  const tier = pricing.find(
    (p) => p.interval_start <= monthIndex && (p.interval_end === null || p.interval_end >= monthIndex)
  );
  if (!tier) return 0;

  if (tier.is_full_payment) {
    // Charge full price only at interval_start, 0 for rest
    return monthIndex === tier.interval_start ? tier.price : 0;
  }
  return tier.price;
}
```

- For each BookingAddOn:
  1. Calculate month index from addon start_date
  2. Resolve charge using tiered pricing
  3. Create BillItem with addon description and charge amount
  4. If addon has end_date and billing month > end_date month, skip (no charge)

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(bookings): add addon tiered pricing resolution"
```

---

### Task 10.4: Booking Overlap Detection and Upsert Action

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/bookings/booking-action.ts`

- [ ] **Step 1: Implement overlap detection**

```typescript
// BL-015: Rolling overlap
// Rejects if another active rolling booking exists for same room without end_date
async function checkRollingOverlap(roomId: number, startDate: Date, excludeBookingId?: number) {
  const conflicts = await prisma.booking.findMany({
    where: {
      room_id: roomId,
      is_rolling: true,
      end_date: null,
      ...(excludeBookingId && { id: { not: excludeBookingId } }),
    },
  });
  return conflicts.length > 0;
}

// BL-016: Fixed overlap
// Rejects if new.start < existing.end AND new.end > existing.start
async function checkFixedOverlap(roomId: number, startDate: Date, endDate: Date, excludeBookingId?: number) {
  const conflicts = await prisma.booking.findMany({
    where: {
      room_id: roomId,
      start_date: { lt: endDate },
      end_date: { gt: startDate },
      ...(excludeBookingId && { id: { not: excludeBookingId } }),
    },
  });
  return conflicts.length > 0;
}
```

- [ ] **Step 2: Implement upsertBookingAction**

Full flow:
1. Validate with Zod (bookingSchema)
2. Check overlap (rolling or fixed)
3. Calculate end_date (fixed only, using getLastDateOfBooking)
4. Create/update booking record
5. Create deposit record if amount > 0
6. Generate bills (fixed: all at once; rolling: initial bills up to today)
7. If editing: delete old GENERATED bills, preserve CREATED bill items, regenerate bills, then regenerate payment-bill mapping (BL-032)
8. Revalidate paths

- [ ] **Step 3: Implement scheduleEndOfStayAction**

```typescript
// BL-033: Sets end_date, is_rolling=false, deletes bills beyond end_date
export async function scheduleEndOfStayAction(bookingId: number, endDate: Date) {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { end_date: endDate, is_rolling: false },
  });

  // Delete bills with due_date after end_date
  await prisma.bill.deleteMany({
    where: { booking_id: bookingId, due_date: { gt: endDate } },
  });

  revalidatePath("/bookings");
  return { success: true };
}
```

- [ ] **Step 4: Implement checkInOutAction**

```typescript
// BL-034: Creates CheckInOutLog, updates deposit, sets end_date
export async function checkInOutAction(data: {
  booking_id: number;
  event_type: "CHECK_IN" | "CHECK_OUT";
  event_date: Date;
  tenant_id: string;
  deposit_status?: DepositStatus;
  refunded_amount?: number;
}) {
  await prisma.checkInOutLog.create({
    data: {
      booking_id: data.booking_id,
      event_type: data.event_type,
      event_date: data.event_date,
      tenant_id: data.tenant_id,
    },
  });

  if (data.event_type === "CHECK_OUT") {
    await prisma.booking.update({
      where: { id: data.booking_id },
      data: { end_date: data.event_date, is_rolling: false },
    });

    if (data.deposit_status) {
      // Update deposit status (handled by deposit action)
    }
  }

  revalidatePath("/bookings");
  return { success: true };
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(bookings): add overlap detection, upsert, end-of-stay, check-in/out"
```

---

### Task 10.5: Booking UI (Page, Form, Table)

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/bookings/page.tsx`, `src/app/(internal)/(dashboard_layout)/bookings/booking-form.tsx`, `src/app/(internal)/(dashboard_layout)/bookings/booking-table.tsx`

- [ ] **Step 1: Create booking page (server component)**

Fetches bookings by selected location, serializes Decimals, passes to client table.

- [ ] **Step 2: Create booking form (client component)**

Key form behaviours:
- Tenant select (searchable dropdown)
- Room select (filtered by current location, only available rooms)
- Start date picker
- Duration select OR rolling toggle (mutually exclusive)
- Fee field (auto-suggests from RoomTypeDuration when room type + duration selected)
- Deposit amount field
- Second resident fee field
- Add-ons section (multi-select with start_date per addon)
- Status select
- Edit mode: amber warning about payment reallocation, disabled submit until checkbox acknowledged (TC-092)

- [ ] **Step 3: Create booking table (client component)**

TanStack React Table with columns:
- Room number, Tenant name, Start date, End date, Fee, Status, Duration/Rolling indicator
- Actions: Edit, Check-in, Check-out, Schedule End, Delete

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(bookings): add booking page, form with auto-suggest, and table"
```

---

## Phase 11: Bills + Bill Items

### Task 11.1: Bill Server Actions

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/bills/bill-action.ts`

- [ ] **Step 1: Implement simulateUnpaidBillPaymentAction**

Algorithm (BL-003 - Payment Auto-Allocation):
```typescript
export async function simulateUnpaidBillPaymentAction(bookingId: number, paymentAmount: number) {
  // 1. Get all bills for booking, sorted by due_date ascending
  // 2. For each bill, calculate outstanding = sum(bill_items) - sum(existing paymentBills)
  // 3. Allocate min(remaining, outstanding) to each bill
  // 4. Return allocation map: { bill_id: allocated_amount }[]
}
```

- [ ] **Step 2: Implement generatePaymentBillMappingFromPaymentsAndBills**

Algorithm (BL-014 - Deterministic Regeneration):
```typescript
export async function generatePaymentBillMappingFromPaymentsAndBills(
  payments: Payment[],  // sorted by payment_date asc
  bills: Bill[],        // sorted by due_date asc, bill_items sorted deposit-first
) {
  // 1. Delete all existing PaymentBill records for these payments
  // 2. For each payment (date order):
  //    a. remainingPayment = payment.amount
  //    b. For each bill (due_date order):
  //       - outstanding = sum(bill_items) - already_allocated_to_this_bill
  //       - allocated = min(remainingPayment, outstanding)
  //       - Create PaymentBill { payment_id, bill_id, amount: allocated }
  //       - remainingPayment -= allocated
  //       - if remainingPayment <= 0, next payment
  // 3. Return all new PaymentBill records
}
```

- [ ] **Step 3: Implement bill CRUD actions**

```typescript
export async function createBillAction(data: {
  booking_id: number;
  description: string;
  due_date: Date;
  items: Array<{ description: string; amount: number; internal_description?: string }>;
}) {
  // Creates bill with type=CREATED bill items
  // Triggers payment reallocation for booking (auto mode)
}

export async function updateBillDueDateAction(billId: number, dueDate: Date) {
  // Only due_date can be changed on existing bills (per spec)
  // Triggers payment reallocation
}

export async function addBillItemAction(billId: number, item: {
  description: string;
  amount: number;
  internal_description?: string;
}) {
  // Creates BillItem with type=CREATED
  // Triggers payment reallocation
}

export async function updateBillItemAction(itemId: number, data: {
  description: string;
  amount: number;
  internal_description?: string;
}) {
  // Update item, trigger reallocation
}

export async function deleteBillItemAction(itemId: number) {
  // Delete item, trigger reallocation
}
```

- [ ] **Step 4: Implement getUnpaidBillsDueAction (for email reminder)**

```typescript
export async function getUnpaidBillsDueAction(targetDate: Date) {
  // BL-026: Bills due within 7 days of targetDate
  // Only bills with outstanding balance > 0
  // Only bills where tenant has email
  const dueWindow = addDays(targetDate, 7);
  return prisma.bill.findMany({
    where: {
      due_date: { gte: targetDate, lte: dueWindow },
      // outstanding > 0 (computed after fetch)
    },
    include: { bill_item: true, paymentBills: true, bookings: { include: { tenants: true, rooms: true } } },
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(bills): implement allocation simulation, regeneration, and CRUD"
```

---

### Task 11.2: Bills UI

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/bills/page.tsx`, `src/app/(internal)/(dashboard_layout)/bills/bill-table.tsx`, `src/app/(internal)/(dashboard_layout)/bills/bill-form.tsx`

- [ ] **Step 1: Create bills page**

Server component fetches bills by location with all related data.

- [ ] **Step 2: Create bills table**

Columns: Booking (room + tenant), Description, Due Date, Total Amount, Paid Amount, Outstanding, Actions
Actions: Edit due_date, Add item, Send reminder email

- [ ] **Step 3: Create bill item management UI**

Expandable row or modal showing:
- List of bill items with description, amount, type badge (GENERATED/CREATED)
- Add new item form
- Edit/delete for CREATED items only (GENERATED items are read-only to user)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(bills): add bills page with table and item management"
```

---

## Phase 12: Payments (Auto/Manual Allocation + Transactions)

### Task 12.1: Payment Transaction Logic

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/payments/payment-action.ts`

- [ ] **Step 1: Implement createOrUpdatePaymentTransactions**

Algorithm (BL-005 - Transaction Splitting):
```typescript
async function createOrUpdatePaymentTransactions(paymentId: number) {
  // 1. Delete existing transactions with related_id containing payment_id
  await prisma.transaction.deleteMany({
    where: { related_id: { path: ["payment_id"], equals: paymentId } },
  });

  // 2. Fetch PaymentBills with bill items
  const paymentBills = await prisma.paymentBill.findMany({
    where: { payment_id: paymentId },
    include: { bill: { include: { bill_item: true } } },
  });

  let depositTotal = 0;
  let regularTotal = 0;
  let depositId: number | null = null;

  // 3. For each PaymentBill, split into deposit vs regular
  for (const pb of paymentBills) {
    const items = [...pb.bill.bill_item].sort((a, b) => {
      // Deposit items first
      const aIsDeposit = a.related_id && (a.related_id as any).deposit_id;
      const bIsDeposit = b.related_id && (b.related_id as any).deposit_id;
      return (bIsDeposit ? 1 : 0) - (aIsDeposit ? 1 : 0);
    });

    let remaining = Number(pb.amount);
    for (const item of items) {
      const itemShare = Math.min(remaining, Number(item.amount));
      if (item.related_id && (item.related_id as any).deposit_id) {
        depositTotal += itemShare;
        depositId = (item.related_id as any).deposit_id;
      } else {
        regularTotal += itemShare;
      }
      remaining -= itemShare;
    }
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { bookings: { include: { rooms: true } } },
  });
  const locationId = payment!.bookings.rooms!.location_id!;

  // 4. Create deposit transaction if any
  if (depositTotal > 0 && depositId) {
    await prisma.transaction.create({
      data: {
        amount: depositTotal,
        description: "Deposit",
        date: payment!.payment_date,
        category: "Deposit",
        type: "INCOME",
        location_id: locationId,
        related_id: { payment_id: paymentId, deposit_id: depositId },
      },
    });
  }

  // 5. Create regular income transaction if any
  if (regularTotal > 0) {
    await prisma.transaction.create({
      data: {
        amount: regularTotal,
        description: "Biaya Sewa",
        date: payment!.payment_date,
        category: "Biaya Sewa",
        type: "INCOME",
        location_id: locationId,
        related_id: { payment_id: paymentId },
      },
    });
  }

  // 6. BL-006: Update deposit status UNPAID → HELD if deposit payment detected
  if (depositTotal > 0 && depositId) {
    const deposit = await prisma.deposit.findUnique({ where: { id: depositId } });
    if (deposit && deposit.status === "UNPAID") {
      await prisma.deposit.update({
        where: { id: depositId },
        data: { status: "HELD" },
      });
    }
  }

  // 7. BL-007: If no deposit transactions exist anymore, revert to UNPAID
  if (depositTotal === 0 && depositId) {
    const remainingDepositTxns = await prisma.transaction.findMany({
      where: { related_id: { path: ["deposit_id"], equals: depositId }, type: "INCOME" },
    });
    if (remainingDepositTxns.length === 0) {
      await prisma.deposit.update({
        where: { id: depositId },
        data: { status: "UNPAID" },
      });
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(payments): implement transaction splitting with deposit-first priority"
```

---

### Task 12.2: Payment Upsert Action

**Files:**
- Modify: `src/app/(internal)/(dashboard_layout)/payments/payment-action.ts`

- [ ] **Step 1: Implement upsertPaymentAction**

```typescript
export async function upsertPaymentAction(data: {
  id?: number;
  booking_id: number;
  amount: number;
  payment_date: Date;
  status_id?: number;
  payment_proof?: string; // base64
  payment_proof_name?: string;
  allocation_mode: "auto" | "manual";
  manual_allocations?: Array<{ bill_id: number; amount: number }>;
}) {
  // 1. Validate with Zod
  // 2. Handle file upload (S3 key: booking-payments/{booking_id}/{ISO_timestamp}/{filename})
  // 3. Create or update Payment record

  // 4. Create PaymentBill records based on mode:
  if (data.allocation_mode === "auto") {
    // BL-003: Auto mode - calls simulateUnpaidBillPaymentAction then creates records
    // BL-032: If editing, regenerate ALL payment-bill mappings for booking
    await generatePaymentBillMappingFromPaymentsAndBills(allPayments, allBills);
  } else {
    // BL-004: Manual mode - validate sum equals amount
    const total = data.manual_allocations!.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(total - data.amount) > 0.01) {
      throw new Error("Total manual allocation must equal payment amount");
    }
    // Create PaymentBill for each allocation
    // BL-111: Manual edit only recomputes own transactions
  }

  // 5. Create/update transactions
  await createOrUpdatePaymentTransactions(paymentId);

  revalidatePath("/payments");
  return { success: true };
}
```

- [ ] **Step 2: Implement deletePaymentAction**

```typescript
export async function deletePaymentAction(paymentId: number) {
  // 1. Delete transactions linked to this payment
  // 2. Delete payment (cascades PaymentBills)
  // 3. Check if deposit needs status revert (BL-007)
  // 4. Revalidate
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(payments): add upsert and delete with allocation modes"
```

---

### Task 12.3: Payments UI

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/payments/page.tsx`, `src/app/(internal)/(dashboard_layout)/payments/payment-form.tsx`, `src/app/(internal)/(dashboard_layout)/payments/payment-table.tsx`

- [ ] **Step 1: Create payment form**

Key behaviours:
- Booking select (with room and tenant info)
- Amount input
- Payment date picker
- Status select (PENDING/VERIFIED/REJECTED)
- File upload for payment proof (PNG/JPG/JPEG/WEBP, max 2MB)
- Allocation mode toggle: Auto vs Manual
- Auto mode: shows simulation preview (per-bill breakdown) when amount entered (TC-090)
- Manual mode: shows each bill with amount input, must sum to payment total
- Edit mode: warning about reallocation impacts

- [ ] **Step 2: Create payment table and page**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(payments): add payment page with form and allocation preview"
```

---

## Phase 13: Deposits (Status Machine)

### Task 13.1: Deposit Actions

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/deposits/deposit-action.ts`

- [ ] **Step 1: Implement deposit status update action**

```typescript
export async function updateDepositStatusAction(data: {
  deposit_id: number;
  status: DepositStatus;
  refunded_amount?: number;
}) {
  const deposit = await prisma.deposit.findUnique({
    where: { id: data.deposit_id },
    include: { booking: { include: { rooms: true } } },
  });

  // Validate transitions:
  // - HELD → APPLIED: set applied_at, NO transaction (BL-009)
  // - HELD → REFUNDED: refunded_amount must equal deposit.amount (full refund)
  // - HELD → PARTIALLY_REFUNDED: refunded_amount must be < deposit.amount
  // - HELD → FORFEITED: no transaction

  const updateData: any = { status: data.status };

  if (data.status === "APPLIED") {
    updateData.applied_at = new Date();
  }

  if (data.status === "REFUNDED" || data.status === "PARTIALLY_REFUNDED") {
    updateData.refunded_at = new Date();
    updateData.refunded_amount = data.refunded_amount;

    // BL-008: Create EXPENSE transaction for refund
    const locationId = deposit!.booking.rooms!.location_id!;
    await prisma.transaction.create({
      data: {
        amount: data.refunded_amount!,
        description: "Deposit",
        date: new Date(),
        category: "Deposit",
        type: "EXPENSE",
        location_id: locationId,
        related_id: { deposit_id: data.deposit_id },
      },
    });
  }

  await prisma.deposit.update({ where: { id: data.deposit_id }, data: updateData });

  revalidatePath("/deposits");
  return { success: true };
}
```

- [ ] **Step 2: Implement deposit edit action**

```typescript
export async function updateDepositAmountAction(depositId: number, amount: number) {
  await prisma.deposit.update({ where: { id: depositId }, data: { amount } });
  // Triggers bill item update and payment reallocation
  revalidatePath("/deposits");
  return { success: true };
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(deposits): implement deposit status machine with refund transactions"
```

---

### Task 13.2: Deposits UI

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/deposits/page.tsx`, `src/app/(internal)/(dashboard_layout)/deposits/deposit-table.tsx`, `src/app/(internal)/(dashboard_layout)/deposits/deposit-status-form.tsx`

- [ ] **Step 1: Create deposits page and table**

Columns: Booking (room + tenant), Amount, Status (badge), Refunded Amount, Applied At, Actions
Actions: Edit amount, Update status

- [ ] **Step 2: Create deposit status form**

- Shows current status with allowed transitions
- REFUNDED: requires refunded_amount input = deposit.amount (validated)
- PARTIALLY_REFUNDED: requires refunded_amount < deposit.amount
- Edit mode: amber warning about payment allocation impacts

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(deposits): add deposits page with status management UI"
```

---

## Phase 14: Guests + Guest Stays

### Task 14.1: Guest Stay Bill Item Generation

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/residents/guests/guest-action.ts`

- [ ] **Step 1: Implement guest stay monthly bill item splitting**

Algorithm (BL-018):
```typescript
function splitGuestStayByMonth(
  startDate: Date,
  endDate: Date,
  dailyFee: number
): Array<{ month: number; year: number; days: number; amount: number }> {
  const segments: Array<{ month: number; year: number; days: number; amount: number }> = [];
  let current = new Date(startDate);

  while (current <= endDate) {
    const monthEnd = lastDayOfMonth(current);
    const segmentEnd = monthEnd < endDate ? monthEnd : endDate;

    // Days = (segmentEnd - current) / ms_per_day + 1
    const days = Math.round((segmentEnd.getTime() - current.getTime()) / (86400000)) + 1;
    const amount = days * dailyFee;

    segments.push({
      month: current.getMonth(),
      year: current.getFullYear(),
      days,
      amount,
    });

    // Move to first day of next month
    current = new Date(segmentEnd);
    current.setDate(current.getDate() + 1);
  }

  return segments;
}
```

- [ ] **Step 2: Implement guest upsert action**

```typescript
export async function upsertGuestAction(data: {
  id?: number;
  name: string;
  email?: string;
  phone?: string;
  booking_id: number;
}) {
  if (data.id) {
    await prisma.guest.update({ where: { id: data.id }, data });
  } else {
    await prisma.guest.create({ data });
  }
  revalidatePath("/residents/guests");
  return { success: true };
}

export async function upsertGuestStayAction(data: {
  id?: number;
  guest_id: number;
  start_date: Date;
  end_date: Date;
  daily_fee: number;
}) {
  // 1. Create/update GuestStay record
  // 2. Split into monthly segments
  // 3. For each segment, find matching bill (by month/year) for the booking
  // 4. Create BillItem on that bill with description and amount
  // 5. If no matching bill exists, create one

  revalidatePath("/residents/guests");
  return { success: true };
}

export async function deleteGuestAction(guestId: number) {
  // Cascades guest stays
  await prisma.guest.delete({ where: { id: guestId } });
  revalidatePath("/residents/guests");
  return { success: true };
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(guests): implement guest stays with monthly bill item splitting"
```

---

### Task 14.2: Guests UI

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/residents/guests/page.tsx`, `src/app/(internal)/(dashboard_layout)/residents/guests/guest-table.tsx`, `src/app/(internal)/(dashboard_layout)/residents/guests/guest-form.tsx`

- [ ] **Step 1: Create guests page**

Fetches guests by location (via their booking's room).

- [ ] **Step 2: Create guest form and stay management**

- Guest info: name, email, phone, booking (select)
- Guest stays: list with add/edit/delete
- Stay form: start_date, end_date, daily_fee
- Shows calculated total and monthly breakdown preview

- [ ] **Step 3: Create guest table**

Columns: Guest Name, Booking (room), Email, Phone, Active Stays, Actions

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(guests): add guest management page with stays UI"
```

---

## Phase 15: Add-ons (Tiered Pricing, Full-Payment Mode)

### Task 15.1: Add-on Server Actions

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/addons/addons-action.ts`

- [ ] **Step 1: Implement addon CRUD actions**

```typescript
"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";

export async function upsertAddonAction(data: {
  id?: string;
  name: string;
  description?: string;
  location_id: number;
  parent_addon_id?: string;
  requires_input: boolean;
  pricing: Array<{
    id?: string;
    price: number;
    interval_start: number;
    interval_end?: number;
    is_full_payment: boolean;
  }>;
}) {
  if (data.id) {
    // Update addon and replace pricing entries
    await prisma.addOn.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description,
        location_id: data.location_id,
        parent_addon_id: data.parent_addon_id,
        requires_input: data.requires_input,
      },
    });
    // Delete old pricing and recreate
    await prisma.addOnPricing.deleteMany({ where: { addon_id: data.id } });
    await prisma.addOnPricing.createMany({
      data: data.pricing.map((p) => ({
        addon_id: data.id!,
        price: p.price,
        interval_start: p.interval_start,
        interval_end: p.interval_end ?? null,
        is_full_payment: p.is_full_payment,
      })),
    });
  } else {
    await prisma.addOn.create({
      data: {
        name: data.name,
        description: data.description,
        location_id: data.location_id,
        parent_addon_id: data.parent_addon_id,
        requires_input: data.requires_input,
        pricing: {
          create: data.pricing.map((p) => ({
            price: p.price,
            interval_start: p.interval_start,
            interval_end: p.interval_end ?? null,
            is_full_payment: p.is_full_payment,
          })),
        },
      },
    });
  }

  revalidatePath("/addons");
  return { success: true };
}

export async function deleteAddonAction(id: string) {
  await prisma.addOn.delete({ where: { id } });
  revalidatePath("/addons");
  return { success: true };
}
```

- [ ] **Step 2: Implement BookingAddOn management (schedule end of addon)**

```typescript
export async function scheduleEndOfAddonAction(bookingAddonId: string, endDate: Date) {
  await prisma.bookingAddOn.update({
    where: { id: bookingAddonId },
    data: { end_date: endDate, is_rolling: false },
  });
  revalidatePath("/bookings");
  return { success: true };
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(addons): implement addon CRUD with tiered pricing management"
```

---

### Task 15.2: Add-ons UI

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/addons/page.tsx`, `src/app/(internal)/(dashboard_layout)/addons/addon-form.tsx`, `src/app/(internal)/(dashboard_layout)/addons/addon-table.tsx`

- [ ] **Step 1: Create addons page and table**

Columns: Name, Description, Location, Pricing Tiers Count, Has Children, Actions

- [ ] **Step 2: Create addon form with pricing tier editor**

Form fields:
- Name, Description, Location (select)
- Parent addon (optional, select from existing addons at location)
- Requires input toggle
- Pricing tiers (dynamic list):
  - Interval start (month number)
  - Interval end (month number, optional — last tier can be null/perpetual)
  - Price (IDR)
  - Is full payment toggle
  - Add/remove tier buttons
- Validation: only last tier may have null interval_end

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(addons): add addon management page with pricing tier editor"
```

---

## Phase 16: Financial Summary + Dashboard

### Task 16.1: Dashboard Data Layer

**Files:**
- Create: `src/app/_db/dashboard.ts`

- [ ] **Step 1: Implement dashboard query functions**

```typescript
import { prisma } from "@/app/_lib/prisma";

export async function getCheckInOutCounts(locationId: number) {
  // Count check-ins/check-outs for today
}

export async function getRoomStats(locationId: number) {
  // Count by status: available, occupied, maintenance
}

export async function getRecentPayments(locationId: number, limit = 5) {
  return prisma.payment.findMany({
    where: { bookings: { rooms: { location_id: locationId } } },
    include: { bookings: { include: { tenants: true, rooms: true } }, paymentstatuses: true },
    orderBy: { payment_date: "desc" },
    take: limit,
  });
}

export async function getOutstandingBills(locationId: number, limit = 5) {
  // Bills with outstanding balance > 0
}

export async function getUpcomingEvents(limit = 5) {
  return prisma.event.findMany({
    where: { start: { gte: new Date() } },
    orderBy: { start: "asc" },
    take: limit,
  });
}

// BL-028: Grouping logic
export async function getGroupedIncomeExpense(params: {
  locationId: number;
  startDate: Date;
  endDate: Date;
  splitDeposit?: boolean;
}) {
  const { locationId, startDate, endDate, splitDeposit } = params;
  const diffDays = (endDate.getTime() - startDate.getTime()) / 86400000;
  const groupBy = diffDays < 90 ? "day" : "month";

  // Fetch transactions in range
  const whereClause: any = {
    location_id: locationId,
    date: { gte: startDate, lte: endDate },
  };

  // BL-029: If splitDeposit, exclude "Deposit" from main queries
  if (splitDeposit) {
    whereClause.category = { not: "Deposit" };
  }

  const transactions = await prisma.transaction.findMany({ where: whereClause });

  // Group by day or month, separate income/expense
  // Also fetch deposit transactions separately if splitDeposit
  const depositTransactions = splitDeposit
    ? await prisma.transaction.findMany({
        where: { location_id: locationId, date: { gte: startDate, lte: endDate }, category: "Deposit" },
      })
    : [];

  return { transactions, depositTransactions, groupBy };
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(dashboard): add dashboard data queries with financial grouping"
```

---

### Task 16.2: Dashboard Page

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/dashboard/page.tsx`, `src/app/(internal)/(dashboard_layout)/dashboard/components/`

- [ ] **Step 1: Create dashboard page (server component)**

Fetches all dashboard data, serializes for client components.

- [ ] **Step 2: Create dashboard client components**

- `OverviewCards`: Check-in/out counts, room availability stats
- `RecentPayments`: Table of recent payments
- `OutstandingBills`: Table of unpaid bills
- `UpcomingEvents`: List of upcoming events
- `FinancialGraph`: Income/expense chart (Chart.js or equivalent)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(dashboard): add dashboard page with overview cards and financial chart"
```

---

### Task 16.3: Financial Summary Page

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/financials/summary/page.tsx`, `src/app/(internal)/(dashboard_layout)/financials/summary/summary-client.tsx`

- [ ] **Step 1: Create financial summary page**

Features:
- Period selector: 7 days, 1 month, 3 months, 6 months, 1 year, all-time, custom range
- Location filter (from header context)
- Deposit split toggle (BL-029)
- Income/Expense totals
- Chart visualization
- Transaction table below

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(financials): add financial summary page with period selection"
```

---

## Phase 17: Transaction Export (Excel + PDF)

### Task 17.1: Export API Route

**Files:**
- Create: `src/app/api/(internal)/financials/transactions/export/route.ts`

- [ ] **Step 1: Implement Excel export (ExcelJS)**

```typescript
import ExcelJS from "exceljs";

async function generateExcel(transactions: Transaction[], startDate: string, endDate: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transaksi");

  sheet.columns = [
    { header: "Tanggal", key: "date", width: 15 },
    { header: "Deskripsi", key: "description", width: 30 },
    { header: "Kategori", key: "category", width: 20 },
    { header: "Tipe", key: "type", width: 10 },
    { header: "Jumlah", key: "amount", width: 20 },
  ];

  for (const txn of transactions) {
    sheet.addRow({
      date: format(txn.date, "dd/MM/yyyy"),
      description: txn.description,
      category: txn.category,
      type: txn.type,
      amount: Number(txn.amount),
    });
  }

  return workbook;
}
```

- [ ] **Step 2: Implement PDF export (PDFKit)**

```typescript
import PDFDocument from "pdfkit";

async function generatePDF(transactions: Transaction[], startDate: string, endDate: string) {
  const doc = new PDFDocument({ margin: 50 });
  // Header, table rows with Indonesian currency formatting
  // BL-030: Filename format: transaksi-keuangan_{startYYYYMMDD}_{endYYYYMMDD}.pdf
  return doc;
}
```

- [ ] **Step 3: Implement route handler**

```typescript
import { auth } from "@/app/_lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format"); // "xlsx" or "pdf"
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const locationId = Number(searchParams.get("locationId"));

  const transactions = await prisma.transaction.findMany({
    where: {
      location_id: locationId,
      ...(startDate && endDate && { date: { gte: new Date(startDate), lte: new Date(endDate) } }),
    },
    orderBy: { date: "asc" },
  });

  // BL-030: Filename
  const startStr = startDate ? startDate.replace(/-/g, "") : "semua-waktu";
  const endStr = endDate ? endDate.replace(/-/g, "") : "semua-waktu";
  const filename = `transaksi-keuangan_${startStr}_${endStr}.${format}`;

  if (format === "xlsx") {
    const workbook = await generateExcel(transactions, startDate!, endDate!);
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } else {
    // PDF generation
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(export): add transaction export in Excel and PDF formats"
```

---

### Task 17.2: Export UI Page

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/financials/export/page.tsx`

- [ ] **Step 1: Create export page**

- Date range picker (start, end)
- Format selection (Excel / PDF)
- Location (from context)
- Download button triggers GET to export API route
- "Semua Waktu" option for no date filter

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(export): add transaction export page with date range and format selection"
```

---

## Phase 18: Calendar / Events

### Task 18.1: Events Actions and Data

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/schedule/calendar/calendar-action.ts`

- [ ] **Step 1: Implement event CRUD and booking event generation**

```typescript
"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";

export async function getCalendarEventsAction(locationId: number) {
  // Fetch custom events
  const events = await prisma.event.findMany();

  // Generate booking events (start/end dates as events)
  const bookings = await prisma.booking.findMany({
    where: { rooms: { location_id: locationId } },
    include: { tenants: true, rooms: true },
  });

  const bookingEvents = bookings.flatMap((b) => {
    const events = [];
    events.push({
      title: `Check-in: ${b.tenants?.name} (${b.rooms?.room_number})`,
      start: b.start_date,
      allDay: true,
      backgroundColor: "#4CAF50",
    });
    if (b.end_date) {
      events.push({
        title: `Check-out: ${b.tenants?.name} (${b.rooms?.room_number})`,
        start: b.end_date,
        allDay: true,
        backgroundColor: "#F44336",
      });
    }
    return events;
  });

  return [...events, ...bookingEvents];
}

export async function upsertEventAction(data: {
  id?: number;
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  allDay: boolean;
  backgroundColor?: string;
  recurring: boolean;
}) {
  if (data.id) {
    await prisma.event.update({ where: { id: data.id }, data });
  } else {
    await prisma.event.create({ data });
  }
  revalidatePath("/schedule/calendar");
  return { success: true };
}

export async function deleteEventAction(id: number) {
  await prisma.event.delete({ where: { id } });
  revalidatePath("/schedule/calendar");
  return { success: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(calendar): implement event CRUD and booking event generation"
```

---

### Task 18.2: Calendar UI

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/schedule/calendar/page.tsx`, `src/app/(internal)/(dashboard_layout)/schedule/calendar/calendar-client.tsx`

- [ ] **Step 1: Create calendar page with FullCalendar**

- FullCalendar (or compatible calendar library)
- Month/week/day views
- Click to create event
- Click event to edit/delete
- Booking events shown as colored blocks
- Custom events shown with user-defined colors

- [ ] **Step 2: Create event form modal**

Fields: title, description, start date/time, end date/time, all-day toggle, color picker, recurring toggle

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(calendar): add calendar page with FullCalendar and event management"
```

---

## Phase 19: Cron Endpoints (Monthly Billing + Email Reminder)

### Task 19.1: Monthly Billing Cron

**Files:**
- Create: `src/app/api/cron/monthly-billing/route.ts`

- [ ] **Step 1: Implement monthly billing endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { generateNextMonthlyBill } from "@/app/(internal)/(dashboard_layout)/bookings/booking-action";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Note: No explicit auth check per spec (security gap preserved)
  const targetDate = new Date();

  // Fetch all active rolling bookings
  const bookings = await prisma.booking.findMany({
    where: {
      is_rolling: true,
      end_date: null,
      status_id: 2, // ACTIVE
    },
    include: {
      rooms: { include: { roomtypes: true, locations: true } },
      tenants: true,
      durations: true,
      deposit: true,
      addOns: { include: { addOn: { include: { pricing: true } } } },
      bills: { include: { bill_item: true } },
    },
  });

  const results = [];

  for (const booking of bookings) {
    const bill = await generateNextMonthlyBill(booking, targetDate);
    if (bill) {
      results.push({
        bookingId: booking.id,
        roomName: booking.rooms?.room_number,
        roomType: booking.rooms?.roomtypes?.type,
        fee: Number(booking.fee),
        status: "processed",
        billId: bill.id,
        billDescription: bill.description,
      });
    }
  }

  return NextResponse.json({ success: true, results });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(cron): add monthly billing endpoint for rolling bookings"
```

---

### Task 19.2: Email Invoice Reminder Cron

**Files:**
- Create: `src/app/api/(internal)/tasks/email/invoice-reminder/route.ts`

- [ ] **Step 1: Implement email reminder endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";
import { getSettingValue } from "@/app/_db/settings";
import { sendBillReminderEmail } from "@/app/_lib/mailer";
import pLimit from "p-limit";
import { addDays } from "date-fns";

export async function GET(request: NextRequest) {
  // Auth: Bearer token must match CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Feature flag check
  const enabled = await getSettingValue("MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED");
  if (enabled?.toLowerCase() !== "true") {
    return NextResponse.json({ success: true, stats: { sent: 0, target: 0 } });
  }

  const targetDate = new Date();
  const dueWindow = addDays(targetDate, 7);

  // BL-026: Bills due within 7 days with outstanding balance > 0
  const bills = await prisma.bill.findMany({
    where: {
      due_date: { gte: targetDate, lte: dueWindow },
    },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: { include: { tenants: true, rooms: { include: { locations: true } } } },
    },
  });

  // Filter: outstanding > 0 and tenant has email
  const unpaidBills = bills.filter((bill) => {
    const total = bill.bill_item.reduce((s, i) => s + Number(i.amount), 0);
    const paid = bill.paymentBills.reduce((s, p) => s + Number(p.amount), 0);
    return total - paid > 0 && bill.bookings.tenants?.email;
  });

  // Send emails with rate limit (14/sec)
  const limit = pLimit(14);
  let sent = 0;

  await Promise.all(
    unpaidBills.map((bill) =>
      limit(async () => {
        try {
          await sendBillReminderEmail(bill);
          sent++;
        } catch (e) {
          // Individual failures don't block batch
        }
      })
    )
  );

  return NextResponse.json({ success: true, stats: { sent, target: unpaidBills.length } });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(cron): add email invoice reminder with rate limiting"
```

---

## Phase 20: Email Service (Nodemailer + SES)

### Task 20.1: Mailer Module

**Files:**
- Create: `src/app/_lib/mailer.ts`

- [ ] **Step 1: Implement Nodemailer singleton with SES transport**

```typescript
import nodemailer from "nodemailer";
import { SESClient } from "@aws-sdk/client-sesv2";
import { prisma } from "@/app/_lib/prisma";

const ses = new SESClient({ region: "ap-southeast-1" });

const transporter =
  process.env.NODE_ENV === "production"
    ? nodemailer.createTransport({
        SES: { ses, aws: { SESClient } },
        sendingRate: 14,
      })
    : nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        auth: { user: "nora56@ethereal.email", pass: "jn7jnAPss4f63QBp6D" },
      });

const DEFAULT_FROM = '"MICASA Suites" <noreply@micasasuites.com>';

export async function sendBillReminderEmail(bill: any) {
  const tenant = bill.bookings.tenants;
  const room = bill.bookings.rooms;
  const total = bill.bill_item.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const paid = bill.paymentBills.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const outstanding = total - paid;

  const subject = `Pengingat Tagihan - ${bill.description}`;
  const html = `
    <p>Yth. ${tenant.name},</p>
    <p>Ini adalah pengingat untuk tagihan Anda:</p>
    <ul>
      <li>Kamar: ${room.room_number}</li>
      <li>Deskripsi: ${bill.description}</li>
      <li>Total Tagihan: Rp${outstanding.toLocaleString("id-ID")}</li>
      <li>Jatuh Tempo: ${bill.due_date.toLocaleDateString("id-ID")}</li>
    </ul>
    <p>Silakan melakukan pembayaran ke:</p>
    <p><strong>BCA 5491118777 a.n. Adriana Nugroho</strong></p>
    <p>Terima kasih.</p>
  `;

  try {
    await transporter.sendMail({
      from: DEFAULT_FROM,
      to: tenant.email,
      subject,
      html,
    });
    await prisma.emailLogs.create({
      data: { from: DEFAULT_FROM, to: tenant.email, subject, status: "SUCCESS", payload: html },
    });
  } catch (e: any) {
    const status = e.responseCode ? "FAIL_SERVER" : "FAIL_CLIENT";
    await prisma.emailLogs.create({
      data: { from: DEFAULT_FROM, to: tenant.email, subject, status, payload: e.message },
    });
    throw e;
  }
}

export async function sendPasswordResetEmail(email: string, newPassword: string) {
  const subject = "Reset Password - MICASA Suites";
  const html = `
    <p>Password Anda telah direset.</p>
    <p>Password baru Anda: <strong>${newPassword}</strong></p>
    <p>Silakan login dan ubah password Anda segera.</p>
  `;

  try {
    await transporter.sendMail({ from: DEFAULT_FROM, to: email, subject, html });
    await prisma.emailLogs.create({
      data: { from: DEFAULT_FROM, to: email, subject, status: "SUCCESS", payload: html },
    });
  } catch (e: any) {
    const status = e.responseCode ? "FAIL_SERVER" : "FAIL_CLIENT";
    await prisma.emailLogs.create({
      data: { from: DEFAULT_FROM, to: email, subject, status, payload: e.message },
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(email): add Nodemailer service with SES transport and email templates"
```

---

## Phase 21: Settings / User Management

### Task 21.1: User Management Actions

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/settings/users/site_users-action.ts`

- [ ] **Step 1: Implement user management actions**

```typescript
"use server";

import { auth } from "@/app/_lib/auth";
import { createUser, updateUser, deleteUser } from "@/app/_db/site-users";
import bcrypt from "bcrypt";
import { revalidatePath } from "next/cache";

// BL-023: Only role_id=1 can manage users
async function checkAdmin() {
  const session = await auth();
  if (!session || session.user.role_id !== 1) {
    return { authorized: false };
  }
  return { authorized: true, session };
}

export async function upsertSiteUserAction(data: {
  id?: string;
  name: string;
  email: string;
  password?: string;
  role_id: number;
}) {
  const { authorized } = await checkAdmin();
  if (!authorized) return { success: false, error: "Unauthorized" };

  if (data.id) {
    const updateData: any = {
      name: data.name,
      email: data.email,
      role_id: data.role_id,
    };
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
      updateData.shouldReset = true;
    }
    await updateUser(data.id, updateData);
  } else {
    const hashedPassword = await bcrypt.hash(data.password!, 10);
    await createUser({
      name: data.name,
      email: data.email,
      password: hashedPassword,
      role_id: data.role_id,
    });
  }

  revalidatePath("/settings/users");
  return { success: true };
}

export async function deleteUserAction(id: string) {
  const { authorized } = await checkAdmin();
  if (!authorized) return { success: false, error: "Unauthorized" };

  await deleteUser(id);
  revalidatePath("/settings/users");
  return { success: true };
}
```

- [ ] **Step 2: Create shouldReset flow (change-password page)**

Create `src/app/(internal)/change-password/page.tsx` and action:
- Shown when user.shouldReset is true (redirected from internal layout)
- Form: new password (min 8, max 32 chars)
- On submit: update password, set shouldReset=false
- Redirect to /dashboard

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(users): add user management with admin-only access and password reset flow"
```

---

### Task 21.2: Settings / Users UI

**Files:**
- Create: `src/app/(internal)/(dashboard_layout)/settings/users/page.tsx`, `src/app/(internal)/(dashboard_layout)/settings/users/user-table.tsx`, `src/app/(internal)/(dashboard_layout)/settings/users/user-form.tsx`

- [ ] **Step 1: Create user management page**

- Table: Name, Email, Role, Actions (Edit, Delete)
- Create form: Name, Email, Password, Role select
- Edit form: Name, Email, optional new password, Role select
- Only visible/functional for role_id=1 users

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(users): add user management page with role-based access"
```

---

## Phase 22: Debug Endpoints + Final Wiring

### Task 22.1: Debug Endpoints

**Files:**
- Create: `src/app/api/debug/cron/monthly-billing/route.ts`, `src/app/api/debug/tasks/email/invoice-reminder/route.ts`, `src/app/api/version/route.ts`

- [ ] **Step 1: Implement debug monthly billing (dry-run)**

```typescript
import { auth } from "@/app/_lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetDate = searchParams.get("target_date")
    ? new Date(searchParams.get("target_date")!)
    : new Date();

  // Same logic as monthly billing but NO writes (read-only simulation)
  // Returns what WOULD be generated
}
```

- [ ] **Step 2: Implement debug email reminder (dry-run)**

```typescript
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same logic as email reminder but NO emails sent
  // Returns list of bills that WOULD be reminded
}
```

- [ ] **Step 3: Implement version endpoint**

```typescript
export async function GET() {
  return NextResponse.json({ version: process.env.VERSION || "0.0.0" });
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(debug): add debug endpoints for cron simulation and version"
```

---

### Task 22.2: Shared UI Components

**Files:**
- Create: `src/app/_components/sidebar.tsx`, `src/app/_components/header.tsx`, `src/app/_components/data-table.tsx`, `src/app/_components/modal.tsx`, `src/app/_components/file-upload.tsx`, `src/app/_components/toast-provider.tsx`

- [ ] **Step 1: Create sidebar navigation**

Menu structure (Indonesian labels):
- Dashboard → `/dashboard`
- Pemesanan (Bookings) → `/bookings`
- Tagihan (Bills) → `/bills`
- Pembayaran (Payments) → `/payments`
- Deposit → `/deposits`
- Penghuni (Residents):
  - Penyewa (Tenants) → `/residents/tenants`
  - Tamu (Guests) → `/residents/guests`
- Kamar (Rooms):
  - Semua Kamar → `/rooms/all-rooms`
  - Tipe Kamar → `/rooms/room-types`
  - Durasi → `/rooms/durations`
- Add-on → `/addons`
- Keuangan (Financials):
  - Ringkasan → `/financials/summary`
  - Ekspor → `/financials/export`
- Jadwal (Schedule):
  - Kalender → `/schedule/calendar`
- Pengaturan (Settings):
  - Pengguna → `/settings/users`

Mobile: collapses at < 720px, auto-closes on navigation (TC-094)

- [ ] **Step 2: Create header with location picker**

- Company logo + name (from settings)
- Location selector dropdown (scopes all data)
- User menu (name, logout)
- Location selection stored in cookie/context for persistence

- [ ] **Step 3: Create reusable data table component**

Wraps TanStack React Table with:
- Column sorting
- Text filter
- Pagination
- Responsive design

- [ ] **Step 4: Create reusable modal, file upload, and toast provider**

- Modal: Headless overlay with close-on-escape, focus trap
- FileUpload: Drag/drop + click, size validation, preview, base64 conversion
- ToastProvider: react-toastify wrapper at root layout level

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): add shared components - sidebar, header, data table, modal, file upload"
```

---

### Task 22.3: Utility Modules (Currency, Serialize, Request Context)

**Files:**
- Create: `src/app/_lib/util/currency.ts`, `src/app/_lib/util/serialize.ts`, `src/app/_lib/util/request-context.ts`

- [ ] **Step 1: Create currency formatter**

```typescript
// BL-019
export function formatCurrency(amount: number | string | null | undefined): string {
  const num = Number(amount);
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}
```

- [ ] **Step 2: Create serializeForClient**

```typescript
import { Decimal } from "@prisma/client/runtime/library";

export function serializeForClient<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (data instanceof Decimal) return data.toString() as unknown as T;
  if (data instanceof Date) return data.toISOString() as unknown as T;
  if (Array.isArray(data)) return data.map(serializeForClient) as unknown as T;
  if (typeof data === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeForClient(value);
    }
    return result;
  }
  return data;
}
```

- [ ] **Step 3: Create request context (AsyncLocalStorage)**

```typescript
import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

interface RequestContext {
  requestId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function withRequestId<T>(fn: () => T): T {
  return asyncLocalStorage.run({ requestId: randomUUID() }, fn);
}

export function withAction<T>(fn: () => T): T {
  return asyncLocalStorage.run({ requestId: getRequestId() || randomUUID() }, fn);
}

export function getRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(util): add currency formatter, serialize helper, and request context"
```

---

### Task 22.4: Zod Schemas

**Files:**
- Create: `src/app/_lib/zod/auth/zod.ts`, `src/app/_lib/zod/booking/zod.ts`, `src/app/_lib/zod/payment/zod.ts`, `src/app/_lib/zod/deposit/zod.ts`, `src/app/_lib/zod/tenant/zod.ts`, `src/app/_lib/zod/room/zod.ts`, `src/app/_lib/zod/addon/zod.ts`, `src/app/_lib/zod/guest/zod.ts`, `src/app/_lib/zod/event/zod.ts`, `src/app/_lib/zod/settings/zod.ts`

- [ ] **Step 1: Create auth schemas**

```typescript
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Alamat email tidak valid"),
  password: z.string().min(8, "Kata sandi harus lebih dari 8 karakter").max(32),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Nama harus diisi"),
  email: z.string().email("Alamat email tidak valid"),
  password: z.string().min(8, "Kata sandi harus lebih dari 8 karakter").max(32),
});
```

- [ ] **Step 2: Create booking schema**

```typescript
export const bookingSchema = z.object({
  room_id: z.number().min(1),
  start_date: z.date(),
  duration_id: z.number().nullable(),
  fee: z.number().min(1, "Fee should be greater than 0"),
  tenant_id: z.string().min(1),
  is_rolling: z.boolean(),
  status_id: z.number(),
  second_resident_fee: z.number().nullable().optional(),
  deposit_amount: z.number().min(0).optional(),
}).refine(
  (data) => !(data.is_rolling && data.duration_id),
  { message: "Duration ID must be null for rolling bookings", path: ["duration_id"] }
);
```

- [ ] **Step 3: Create deposit schema with superRefine**

```typescript
export const depositStatusSchema = z.object({
  deposit_id: z.number(),
  status: z.nativeEnum(DepositStatus),
  refunded_amount: z.number().optional(),
}).superRefine((data, ctx) => {
  if (data.status === "REFUNDED" && data.refunded_amount !== depositAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Untuk pengembalian dana penuh, jumlah pengembalian dana harus sama dengan jumlah deposit",
      path: ["refunded_amount"],
    });
  }
  if (data.status === "PARTIALLY_REFUNDED" && data.refunded_amount! >= depositAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Untuk pengembalian dana sebagian, jumlahnya harus lebih kecil dari jumlah deposit",
      path: ["refunded_amount"],
    });
  }
});
```

- [ ] **Step 4: Create tenant schema with second resident validation**

```typescript
export const tenantSchema = z.object({
  name: z.string().min(1, "Nama harus diisi"),
  id_number: z.string().min(1, "Nomor identitas harus diisi"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  // ... other fields
  second_resident_name: z.string().optional(),
  second_resident_id_number: z.string().optional(),
  // ... other second_resident fields
}).superRefine((data, ctx) => {
  const hasAnySecondResident = data.second_resident_name || data.second_resident_id_number;
  if (hasAnySecondResident) {
    if (!data.second_resident_id_number) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "'Nomor identitas' harus diisi jika salah satu field penghuni kedua diisi",
        path: ["second_resident_id_number"],
      });
    }
    // family_certificate required validation
  }
});
```

- [ ] **Step 5: Create remaining schemas (payment, room, addon, guest, event, settings)**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(validation): add Zod schemas for all modules with Indonesian error messages"
```

---

### Task 22.5: Root Page Redirect + Final Integration

**Files:**
- Create: `src/app/page.tsx`, `src/app/(internal)/(dashboard_layout)/page.tsx`

- [ ] **Step 1: Create root redirect**

```typescript
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
```

- [ ] **Step 2: Create dashboard route page (if separate from /dashboard)**

The `(dashboard_layout)` group's default page redirects to `/dashboard`.

- [ ] **Step 3: Final wiring - ensure all imports resolve, paths correct**

Verify:
- All server actions import correctly
- All DB layer functions are referenced
- All Zod schemas are imported in their action files
- Layouts render correctly
- Auth flow works end-to-end

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete application wiring and root page redirect"
```

---

## Summary: Implementation Order & Dependencies

```
Phase 1 (Setup) → Phase 2 (DB Layer) → Phase 3 (Auth) → Phase 4 (Utils)
    ↓
Phase 5 (Zod) → Phase 6 (Layout) → Phase 7 (Setup Wizard)
    ↓
Phase 8 (Rooms/Locations) → Phase 9 (Tenants+S3)
    ↓
Phase 10 (Bookings) → Phase 11 (Bills) → Phase 12 (Payments) → Phase 13 (Deposits)
    ↓
Phase 14 (Guests) → Phase 15 (Addons)
    ↓
Phase 16 (Dashboard) → Phase 17 (Export) → Phase 18 (Calendar)
    ↓
Phase 19 (Crons) → Phase 20 (Email) → Phase 21 (Users) → Phase 22 (Final)
```

**Critical path:** Phases 10-13 contain the most complex business logic and must be implemented with extreme care. All payment allocation, deposit status, and transaction splitting algorithms must match spec exactly.

**Total estimated tasks:** 38 tasks across 22 phases
**Total estimated steps:** ~120 steps
