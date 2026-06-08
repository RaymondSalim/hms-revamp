# HMS Codebase Reconstruction Specification

---

## 1. Executive Summary

**What the application does:**
HMS (Housing/Hotel Management System) is an internal operations platform for managing residential property rentals. It handles the full lifecycle of room bookings, tenant management, billing, payments, deposits, and financial reporting for a property management company called "MICASA Suites" operating in Indonesia.

**Primary users/actors:**
- Property managers/administrators (site users with role-based access)
- System cron jobs (automated billing and email reminders)

**Main workflows:**
1. Booking creation (fixed-term and rolling/month-to-month)
2. Monthly bill generation (auto-generated for rolling bookings)
3. Payment recording with allocation across bills (auto or manual)
4. Deposit lifecycle management (UNPAID → HELD → APPLIED/REFUNDED)
5. Financial transaction tracking, reporting, and export (Excel/PDF)
6. Email reminders for unpaid bills
7. Calendar/event scheduling

**Core business purpose:**
Automate and track all financial operations for a multi-location residential property business, ensuring accurate billing, payment allocation, deposit accounting, and financial reporting in Indonesian Rupiah (IDR).

**Most important behaviours to preserve:**
- Payment allocation algorithm (deposit-first prioritization)
- Rolling booking bill generation with proration
- Deposit status machine and its interaction with transactions
- Bill item generation for addons with tiered pricing
- Payment-to-bill mapping determinism (sorted by date)

**What the application is NOT responsible for:**
- Tenant-facing portal/self-service
- Online payment processing (payments are recorded manually)
- Property maintenance/work orders
- Inventory management

---

## 2. Repository Overview

| Path | Purpose | Important Notes |
|---|---|---|
| `src/app/(external)/(auth)/` | Authentication pages (login, register, reset) | Unauthenticated routes |
| `src/app/(internal)/(dashboard_layout)/` | Main business modules | Protected by auth + setup check |
| `src/app/(internal)/first-time-setup/` | Initial app setup wizard | Only shown when APP_SETUP is false |
| `src/app/api/` | API routes (auth, cron, debug, exports) | Mix of internal/external endpoints |
| `src/app/_db/` | Database access layer | Prisma queries, no business logic |
| `src/app/_lib/` | Shared utilities, auth, zod schemas, mailer | Core infrastructure |
| `src/app/_components/` | Reusable UI components | Sidebar, header, table, inputs |
| `src/app/_enum/` | Enum definitions | Financial periods, settings keys |
| `src/app/_hooks/` | Custom React hooks | Query params, changelog |
| `src/app/_context/` | React contexts | Header/sidebar state |
| `prisma/` | Database schema and migrations | 70+ migrations, seed data |
| `prisma/scripts/` | One-off SQL migration scripts | Data correction scripts |
| `__tests__/unit/` | Unit tests | Mocked Prisma, fast |
| `__tests__/integration/` | Integration tests | Real DB via Docker |
| `cron/` | Cronicle scheduler stack | Docker compose + job scripts |
| `docs/` | Project documentation | Architecture, cron, runbooks |
| `.docker/` | Docker configs for app and test DB | Compose files |
| `public/` | Static assets | Logo, favicons |
| `scripts/` | Helper scripts | Integration test DB setup |

**Main entry points:**
- `src/app/layout.tsx` (root layout)
- `src/app/page.tsx` (root page, redirects)
- `src/middleware.ts` (request logging)
- `src/instrumentation.ts` (app startup)

**Generated files (not source of truth):**
- `.next/` (build output)
- `node_modules/`
- `tsconfig.tsbuildinfo`
- `coverage/`

---

## 3. Technology Stack

| Technology / Dependency | Where Used | Purpose | Behavioural Importance |
|---|---|---|---|
| Next.js 15 (App Router) | Entire app | Full-stack framework | Server actions, route handlers, middleware |
| React 19 | Frontend | UI rendering | Client components, hooks |
| TypeScript 5 | Entire app | Type safety | Compile-time checks |
| Prisma 5 | Database layer | ORM | Schema, migrations, queries |
| PostgreSQL | Persistence | Database | All application state |
| NextAuth 5 (beta 30) | Auth | Authentication | JWT sessions, credential provider |
| Zod | Validation | Schema validation | All input validation |
| bcrypt | Auth | Password hashing | Salt rounds: 10 |
| AWS S3 (@aws-sdk/client-s3) | File storage | Payment proofs, tenant IDs | File upload/retrieval |
| AWS SES (@aws-sdk/client-sesv2) | Email (prod) | Transactional emails | Bill reminders, password resets |
| Nodemailer | Email transport | Email sending | Wraps SES in prod, Ethereal in dev |
| Axiom (@axiomhq/*) | Logging | Observability | Request tracing, error logging |
| TanStack React Table | UI | Data tables | Sorting, filtering, pagination |
| FullCalendar | UI | Schedule/calendar | Booking timeline visualization |
| Chart.js + react-chartjs-2 | UI | Financial graphs | Income/expense visualization |
| ExcelJS | Export | Excel generation | Transaction export |
| PDFKit | Export | PDF generation | Transaction export |
| date-fns | Utils | Date manipulation | Formatting, calculations |
| react-toastify | UI | Notifications | Success/error toasts |
| Framer Motion | UI | Animations | Sidebar, setup wizard transitions |
| @material-tailwind/react | UI | Component library | Forms, buttons, dialogs |
| react-select | UI | Dropdowns | Searchable selects |
| react-day-picker | UI | Date picking | Calendar inputs |
| libphonenumber-js | Validation | Phone formatting | Tenant phone numbers |
| p-limit | Async | Concurrency control | Email batch sending (14/sec) |
| Tailwind CSS 3 | Styling | Utility CSS | Layout and design |
| Jest 29 | Testing | Test runner | Unit + integration tests |
| jest-mock-extended | Testing | Prisma mocking | Deep mock for Prisma client |
| Cronicle | Scheduling | Cron jobs | External Docker service |

---

## 4. Application Architecture

### High-Level Architecture

```mermaid
flowchart LR
  U[User Browser] --> N[Next.js App Router]
  N --> MW[Middleware - Request ID + Logging]
  MW --> SA[Server Actions]
  MW --> API[API Routes]
  SA --> DBL[_db Data Layer]
  API --> DBL
  DBL --> P[(PostgreSQL via Prisma)]
  SA --> S3[(AWS S3)]
  SA --> SES[Email via Nodemailer/SES]
  SA --> AX[Axiom Logging]
  CR[Cronicle Scheduler] --> API
```

### Layers

1. **Presentation**: Next.js pages/components under `src/app` with CSS Modules + Tailwind
2. **Action Layer**: Server actions in feature folders (`*-action.ts`) + route handlers in `src/app/api`
3. **Data Access Layer**: `src/app/_db/*` - Prisma queries with typed includes
4. **Persistence**: PostgreSQL via Prisma ORM
5. **Integrations**: S3 (files), SES/Nodemailer (email), Axiom (logging)

### Request Lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant MW as Middleware
  participant SA as Server Action
  participant DB as Prisma/DB
  participant AX as Axiom

  B->>MW: HTTP Request
  MW->>MW: Generate x-request-id UUID
  MW->>AX: Log request
  MW->>SA: Forward with request-id header
  SA->>SA: withAction() wraps in AsyncLocalStorage
  SA->>DB: Execute queries
  DB-->>SA: Results
  SA->>SA: serializeForClient() (Decimal→string)
  SA-->>B: Response
  SA->>AX: after(() => serverLogger.flush())
```

### Domain Model (ER Diagram)

```mermaid
erDiagram
  BOOKING ||--o{ BILL : has
  BILL ||--o{ BILL_ITEM : has
  BOOKING ||--o{ PAYMENT : has
  PAYMENT ||--o{ PAYMENT_BILL : allocates
  BILL ||--o{ PAYMENT_BILL : receives
  BOOKING ||--o| DEPOSIT : has
  BOOKING ||--o{ BOOKING_ADDON : has
  BOOKING_ADDON }o--|| ADDON : uses
  ADDON ||--o{ ADDON_PRICING : has
  BOOKING }o--|| ROOM : assigned_to
  ROOM }o--|| LOCATION : at
  ROOM }o--|| ROOM_TYPE : categorized_by
  ROOM_TYPE ||--o{ ROOM_TYPE_DURATION : priced_at
  BOOKING }o--|| TENANT : occupied_by
  BOOKING }o--|| DURATION : lasts
  TRANSACTION }o--|| LOCATION : belongs_to
  BOOKING ||--o{ GUEST : has
  GUEST ||--o{ GUEST_STAY : stays
```

---

## 5. Runtime Entry Points

| Entry Point | File | What It Starts | Important Initialisation Logic |
|---|---|---|---|
| Root Layout | `src/app/layout.tsx` | HTML shell, global CSS | Loads globals.css |
| Middleware | `src/middleware.ts` | Request logging | Generates UUID, injects x-request-id header, logs to Axiom |
| Instrumentation | `src/instrumentation.ts` | App startup hooks | Registers Axiom error handler |
| Auth Config | `src/app/_lib/auth.ts` | NextAuth setup | JWT strategy, 15-min session, Prisma adapter |
| Prisma Singleton | `src/app/_lib/primsa.ts` | DB connection | Global singleton, query logging in dev |
| Internal Layout | `src/app/(internal)/layout.tsx` | Auth guard | Redirects to /login if no session |
| Dashboard Layout | `src/app/(internal)/(dashboard_layout)/layout.tsx` | Setup guard + UI shell | Checks APP_SETUP setting, renders sidebar/header |
| Cron Monthly Billing | `src/app/api/(internal)/cron/monthly-billing/route.ts` | Bill generation | POST handler, no auth header check |
| Cron Email Reminder | `src/app/api/(internal)/tasks/email/invoice-reminder/route.ts` | Email sending | GET handler, Bearer token auth |

---

## 6. Local Run and Inspection Procedure

| Task | Command / Procedure | Required Preconditions | Expected Result | Source |
|---|---|---|---|---|
| Install dependencies | `npm install` | Node.js 18+ | node_modules populated, Prisma client generated | [DOC_EVIDENCE] |
| Copy env | `cp env.example .env` | None | .env file with DATABASE_URL, AUTH_SECRET, etc. | [DOC_EVIDENCE] |
| Start local DB | `docker compose -f .docker/docker-compose.yml up -d db` | Docker running | PostgreSQL on port 5432 | [DOC_EVIDENCE] |
| Generate Prisma client | `npm run prisma-gen` | .env with DATABASE_URL | Generated Prisma types | [DOC_EVIDENCE] |
| Run migrations | `npm run prisma-migrate` | DB running | All tables created | [DOC_EVIDENCE] |
| Start dev server | `npm run dev` | All above | App on http://localhost:3000 | [DOC_EVIDENCE] |
| Run unit tests | `npm test` | npm install | Jest runs __tests__/unit/ | [DOC_EVIDENCE] |
| Start integration test DB | `./scripts/intg-test-db.sh up` | Docker | Test PostgreSQL on port 55432 | [DOC_EVIDENCE] |
| Run integration tests | `npm run test:integration` | Test DB running | Jest runs __tests__/integration/ | [DOC_EVIDENCE] |
| Stop integration test DB | `./scripts/intg-test-db.sh down` | Test DB running | Container removed | [DOC_EVIDENCE] |
| Start cron stack | `docker compose -f cron/docker-compose.yml --env-file cron/.env up -d` | cron/.env configured | Cronicle UI on http://localhost:3012 | [DOC_EVIDENCE] |
| Build for production | `npm run build` | All deps + env | .next/ output | [SOURCE_CODE] |

**Required environment variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - NextAuth secret key
- `CRON_SECRET` - Bearer token for cron endpoints
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` - S3/SES
- `AXIOM_DATASET`, `AXIOM_TOKEN` - Logging (optional for local)

---

## 7. Playwright MCP Behavioural Exploration

The application is not currently running and no Playwright MCP browser automation was performed during this analysis.

**Reason:** No live dev server available. All behaviour documented from source code analysis.

[BLOCKED_AUTH] - Would require running app + seeded database + valid user credentials.

---

## 8. Configuration and Environment Variables

| Config Key | Source | Required? | Default | Used By | Behavioural Effect |
|---|---|---|---|---|---|
| `DATABASE_URL` | .env | Yes | `postgresql://postgres:docker@localhost:5432/hms?schema=public` | Prisma | All DB operations fail without it |
| `AUTH_SECRET` | .env | Yes | None | NextAuth | Session encryption key |
| `CRON_SECRET` | .env | Yes | None | Cron routes | Bearer token auth for scheduled jobs |
| `AWS_REGION` | .env | For S3/SES | `ap-southeast-1` | S3, SES | File storage and email region |
| `AWS_ACCESS_KEY_ID` | .env | For S3/SES | None | AWS SDK | Auth for AWS services |
| `AWS_SECRET_ACCESS_KEY` | .env | For S3/SES | None | AWS SDK | Auth for AWS services |
| `S3_BUCKET` | .env | For uploads | None | S3 client | Target bucket for file uploads |
| `AXIOM_DATASET` | .env | No | None | Axiom logger | Log dataset name |
| `AXIOM_TOKEN` | .env | No | None | Axiom logger | Auth for logging service |
| `NODE_ENV` | .env | No | `development` | Prisma, mailer | Controls query logging, email transport |
| `VERSION` | .env | No | `0.0.0` | Version display | Shown in UI |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | Build | No | None | Version display | Commit hash |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF` | Build | No | None | Version display | Branch name |
| `NEXT_PUBLIC_BUILD_TIME` | Build | No | current ISO | Version display | Build timestamp |

**Settings table (runtime config):**

| Setting Key | Purpose | Default Behaviour When Missing |
|---|---|---|
| `APP_SETUP` | Whether initial setup completed | Redirects all users to /first-time-setup |
| `COMPANY_NAME` | Display name | Falls back to "Perusahaan Anda" |
| `COMPANY_IMAGE` | Logo (base64) | Empty string |
| `REGISTRATION_ENABLED` | Allow new user registration | false |
| `MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED` | Enable email reminders | Reminders not sent |

---

## 9. Domain Model

### Entity: `Booking`

- **Purpose:** Core entity representing a room rental agreement
- **Fields:** id, room_id, start_date, duration_id, status_id, fee (Decimal 10,2), tenant_id, end_date, second_resident_fee (Decimal 10,2), is_rolling (boolean)
- **Relationships:** Room, Tenant, Duration, BookingStatus, Bills[], Payments[], Deposit, BookingAddOns[], Guests[], CheckInOutLogs[], Penalties[]
- **Lifecycle:**
  - Created with bills auto-generated
  - Rolling bookings: bills generated monthly by cron
  - Fixed-term: all bills generated at creation
  - Ended via check-out or schedule-end-of-stay
- **Validation rules:**
  - If `is_rolling=true`, `duration_id` must be null
  - If `is_rolling=false`, `duration_id` required
  - Room overlap check prevents conflicting bookings
- **Business rules:**
  - Rolling booking: `is_rolling=true`, `end_date=null` until terminated
  - Fixed-term: calculated end_date from start_date + duration.month_count
  - Fee is monthly rental amount
  - second_resident_fee adds to monthly bill if set
- **Source files:** `src/app/(internal)/(dashboard_layout)/bookings/booking-action.ts`, `src/app/_db/bookings.ts`

### Entity: `Bill`

- **Purpose:** Monthly invoice for a booking
- **Fields:** id, booking_id, description, due_date
- **Relationships:** Booking, BillItems[], PaymentBills[]
- **Lifecycle:** Created during booking creation or by monthly cron; paid via payment allocation
- **Business rules:**
  - Description format: "Tagihan untuk Bulan {Month} {Year}" (Indonesian)
  - Due date: last day of the billing month
  - Total amount derived from sum of bill_items
  - Paid amount derived from sum of payment_bills
- **Source files:** `src/app/_db/bills.ts`, `src/app/(internal)/(dashboard_layout)/bills/bill-action.ts`

### Entity: `BillItem`

- **Purpose:** Line item within a bill
- **Fields:** id, bill_id, description, amount (Decimal 10,2), internal_description, type (GENERATED|CREATED), related_id (JSON)
- **Relationships:** Bill
- **Business rules:**
  - Type `GENERATED`: auto-created by system (room fee, addon fee, deposit)
  - Type `CREATED`: manually added by user
  - `related_id` can contain: `{ deposit_id }`, `{ guest_stay_id }`, or null
  - Deposit bill items have `related_id.deposit_id` set
- **Source files:** `src/app/_lib/zod/bill-item/zod.ts`

### Entity: `Payment`

- **Purpose:** Records money received from tenant
- **Fields:** id, booking_id, amount (Decimal 10,2), payment_date, payment_proof (S3 key), status_id
- **Relationships:** Booking, PaymentBills[], PaymentStatus
- **Lifecycle:** Created/updated via payment form; triggers allocation + transaction creation
- **Business rules:**
  - Supports auto and manual allocation modes
  - Payment proof uploaded to S3
  - Triggers income transaction creation
- **Source files:** `src/app/(internal)/(dashboard_layout)/payments/payment-action.ts`

### Entity: `PaymentBill`

- **Purpose:** Junction table mapping payment amounts to specific bills
- **Fields:** id, payment_id, bill_id, amount (Decimal 10,2)
- **Business rules:**
  - Sum of PaymentBill.amount for a payment = Payment.amount
  - Represents how a payment is distributed across bills
  - Regenerated deterministically when bookings change

### Entity: `Deposit`

- **Purpose:** Security deposit for a booking
- **Fields:** id, booking_id (unique), amount (Decimal 10,2), status (enum), refunded_at, applied_at, refunded_amount (Decimal 10,2)
- **Lifecycle:** UNPAID → HELD → APPLIED | REFUNDED | PARTIALLY_REFUNDED | FORFEITED
- **Business rules:**
  - One deposit per booking (unique constraint on booking_id)
  - Automatically creates a BillItem in the first bill
  - When paid, status moves to HELD (deposit income transaction created)
  - APPLIED: no additional transaction (already counted as income)
  - REFUNDED/PARTIALLY_REFUNDED: creates expense transaction
  - FORFEITED: no transaction
- **Source files:** `src/app/_db/deposit.ts`, `src/app/(internal)/(dashboard_layout)/deposits/deposit-action.ts`

### Entity: `Transaction`

- **Purpose:** Financial record (income or expense)
- **Fields:** id, amount (Decimal 12,2), description, date, category, location_id, type (INCOME|EXPENSE), related_id (JSON)
- **Business rules:**
  - `related_id` stores: `{ payment_id, booking_id, deposit_id }` as applicable
  - Category "Deposit" for deposit income/refund transactions
  - Category "Biaya Sewa" for regular rental income
  - Auto-created by payment allocation; also manually creatable
- **Source files:** `src/app/_db/transaction.ts`, `src/app/(internal)/(dashboard_layout)/financials/transaction-action.ts`

### Entity: `Tenant`

- **Purpose:** Long-term resident/renter
- **Fields:** id (cuid), name, email, phone, id_number, current_address, emergency_contact_name/phone, referral_source, id_file (S3 key), family_certificate_file (S3 key), second_resident_* fields
- **Business rules:**
  - Supports a "second resident" linked via self-referential relation
  - If second resident fields are set, family_certificate_file required
  - ID files uploaded to S3 under `tenants/id/{timestamp}/{name}_{file}`
- **Source files:** `src/app/_db/tenant.ts`, `src/app/(internal)/(dashboard_layout)/residents/tenants/tenant-action.ts`

### Entity: `AddOn`

- **Purpose:** Optional service that can be attached to a booking (e.g., parking, WiFi)
- **Fields:** id (cuid), name, description, location_id, parent_addon_id, requires_input
- **Relationships:** AddOnPricing[], BookingAddOns[], Location, parent/children (self-ref)
- **Business rules:**
  - Supports tiered pricing with interval-based pricing
  - `is_full_payment` pricing: charges full amount once at interval_start
  - Regular pricing: charges monthly amount
- **Source files:** `src/app/(internal)/(dashboard_layout)/addons/addons-action.ts`

### Entity: `Room`

- **Purpose:** Physical room unit
- **Fields:** id, room_number, room_type_id, status_id, location_id
- **Constraints:** Unique on (room_number, location_id)
- **Relationships:** Location, RoomType, RoomStatus, Bookings[]

### Entity: `Location`

- **Purpose:** Property/building location
- **Fields:** id, name, address
- **Relationships:** Rooms[], Transactions[], AddOns[], RoomTypeDurations[]
- **Business rules:** Most queries are scoped by location (selected in header)

---

## 10. Data Model and Persistence

### Tables (from Prisma schema)

| Table | Key Fields | Constraints | Indexes | Relationships | Source |
|---|---|---|---|---|---|
| bookings | id, room_id, start_date, duration_id, status_id, fee, tenant_id, end_date, is_rolling, second_resident_fee | - | PK(id) | → rooms, tenants, durations, bookingstatuses | [SOURCE_CODE] schema.prisma |
| bills | id, booking_id, description, due_date | - | PK(id) | → bookings; ← bill_items, payment_bills | [SOURCE_CODE] |
| bill_items | id, bill_id, description, amount, internal_description, type, related_id | - | IX(bill_id) | → bills | [SOURCE_CODE] |
| payments | id, booking_id, amount, payment_date, payment_proof, status_id | - | PK(id) | → bookings, paymentstatuses; ← payment_bills | [SOURCE_CODE] |
| payment_bills | id, payment_id, bill_id, amount | - | PK(id) | → payments, bills | [SOURCE_CODE] |
| deposits | id, booking_id, amount, status, refunded_at, applied_at, refunded_amount | UNIQUE(booking_id) | PK(id) | → bookings | [SOURCE_CODE] |
| transactions | id, amount, description, date, category, location_id, type, related_id | - | PK(id) | → locations | [SOURCE_CODE] |
| tenants | id(cuid), name, email, phone, id_number, second_resident_id(unique) | UNIQUE(second_resident_id) | PK(id) | → self (second_resident); ← bookings | [SOURCE_CODE] |
| rooms | id, room_number, room_type_id, status_id, location_id | UNIQUE(room_number, location_id) | PK(id) | → roomtypes, roomstatuses, locations | [SOURCE_CODE] |
| roomtypes | id, type, description | UNIQUE(type) | PK(id) | ← rooms, roomtypedurations | [SOURCE_CODE] |
| roomtypedurations | id, room_type_id, duration_id, suggested_price, location_id | UNIQUE(room_type_id, duration_id, location_id) | PK(id) | → roomtypes, durations, locations | [SOURCE_CODE] |
| durations | id, duration, month_count | - | PK(id) | ← bookings, roomtypedurations | [SOURCE_CODE] |
| locations | id, name, address | - | PK(id) | ← rooms, transactions, addons, roomtypedurations | [SOURCE_CODE] |
| siteusers | id(cuid), name, email(unique), password, role_id, shouldReset | UNIQUE(email) | PK(id) | → roles; ← accounts, sessions, logs | [SOURCE_CODE] |
| AddOn | id(cuid), name, location_id, parent_addon_id, requires_input | UNIQUE(name, location_id) | PK(id) | → locations, self; ← AddOnPricing, BookingAddOn | [SOURCE_CODE] |
| AddOnPricing | id(cuid), price, addon_id, interval_start, interval_end, is_full_payment | - | PK(id) | → AddOn | [SOURCE_CODE] |
| BookingAddOn | id(cuid), addon_id, booking_id, start_date, end_date, input, is_rolling | - | PK(id) | → AddOn, bookings | [SOURCE_CODE] |
| guests | id, name, email, phone, booking_id | - | PK(id) | → bookings; ← guest_stays | [SOURCE_CODE] |
| guest_stays | id, guest_id, start_date, end_date, daily_fee | - | PK(id) | → guests | [SOURCE_CODE] |
| events | id, title, description, start, end, allDay, recurring, extendedProps(JSON) | - | PK(id) | - | [SOURCE_CODE] |
| settings | id, setting_key(unique), setting_value | UNIQUE(setting_key) | PK(id) | - | [SOURCE_CODE] |
| emaillogs | id, status, payload, from, to, subject | - | PK(id) | - | [SOURCE_CODE] |
| checkinoutlogs | id, booking_id, event_type, event_date, tenant_id | - | PK(id) | → bookings, tenants | [SOURCE_CODE] |
| penalties | id, description, amount, booking_id | - | PK(id) | → bookings | [SOURCE_CODE] |

### Enums

```
TransactionType: INCOME, EXPENSE
BillType: GENERATED, CREATED
DepositStatus: UNPAID, HELD, APPLIED, REFUNDED, PARTIALLY_REFUNDED, FORFEITED
```

### Cascade Behaviour

- `Bill` → CASCADE delete from Booking
- `BillItem` → CASCADE delete from Bill
- `PaymentBill` → CASCADE delete from Payment AND Bill
- `Payment` → CASCADE delete from Booking
- `Deposit` → CASCADE delete from Booking
- `BookingAddOn` → CASCADE delete from Booking
- `Guest` → CASCADE delete from Booking
- `GuestStay` → CASCADE delete from Guest
- `CheckInOutLog` → CASCADE delete from Booking
- `Penalty` → CASCADE delete from Booking
- `Room.room_type_id` → RESTRICT delete (cannot delete type with rooms)
- `Booking.duration_id` → RESTRICT delete (cannot delete duration with bookings)

---

## 11. API Contract

### API: `POST /api/cron/monthly-billing`

- **Purpose:** Generate monthly bills for active rolling bookings
- **Source file:** `src/app/api/(internal)/cron/monthly-billing/route.ts`
- **Authentication:** None explicitly checked in code [SOURCE_CODE]
- **Request body:** None
- **Response (200):**
```json
{
  "message": "Successfully processed X bookings and created Y new bills.",
  "summary": {
    "totalBookingsProcessed": 5,
    "newBillsCreated": 3,
    "processedDate": "2024-09-01T00:00:00.000Z"
  },
  "processedBookings": [{
    "bookingId": 123,
    "tenantName": "John Doe",
    "roomName": "A101",
    "roomType": "Standard",
    "fee": 2000000,
    "status": "processed",
    "billId": 456,
    "billDescription": "Tagihan untuk Bulan September 2024"
  }]
}
```
- **Error response (500):** `{ "error": "..." }`
- **Side effects:** Creates Bill + BillItem records
- **Configuration:** `maxDuration=60`

### API: `GET /api/tasks/email/invoice-reminder`

- **Purpose:** Send email reminders for unpaid bills due within 7 days
- **Source file:** `src/app/api/(internal)/tasks/email/invoice-reminder/route.ts`
- **Authentication:** `Authorization: Bearer {CRON_SECRET}` header
- **Request params:** None
- **Response (200):** `{ "success": true, "stats": { "sent": 3, "target": 5 } }`
- **Error response (401):** `{ "error": "Unauthorized" }`
- **Side effects:** Sends emails, creates EmailLogs records
- **Rate limit:** 14 emails/second (p-limit)
- **Feature flag:** Checks `MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED` setting

### API: `GET /api/debug/cron/monthly-billing`

- **Purpose:** Simulate monthly billing without creating records
- **Authentication:** Session-based (logged-in user)
- **Query params:** `target_date` (optional, YYYY-MM-DD)
- **Side effects:** None (read-only simulation)

### API: `GET /api/debug/tasks/email/invoice-reminder`

- **Purpose:** Simulate email reminders without sending
- **Authentication:** Session-based
- **Query params:** `start_date` (optional, YYYY-MM-DD)
- **Side effects:** None

### API: `GET /api/(internal)/financials/transactions/export`

- **Purpose:** Export transactions as Excel or PDF
- **Authentication:** Session-based
- **Query params:** `format` (xlsx|pdf), `startDate`, `endDate`, `locationId`
- **Response:** Binary file download

### API: `POST /api/auth/[...nextauth]`

- **Purpose:** NextAuth authentication endpoints
- **Handles:** Sign-in, sign-out, session, CSRF
- **Strategy:** JWT with 15-minute max age

### API: `GET|POST /api/axiom`

- **Purpose:** Client-side log forwarding to Axiom
- **Source:** `@axiomhq/nextjs` package

### API: `GET /api/version`

- **Purpose:** Returns application version info

### API: `GET /(internal)/(dashboard_layout)/s3/[[...s3Path]]`

- **Purpose:** Proxies S3 file retrieval
- **Authentication:** Session-based
- **Path params:** S3 key path segments
- **Response:** Binary file with content-type from S3

---

## 12. UI / UX Behaviour Specification

### Screen: Dashboard (`/dashboard`)

- **Purpose:** Overview of property status and financials
- **Components:** Overview (check-in/out counts, room stats), Events (upcoming activities), Payments (recent), FinancialGraph (income/expense chart), Bills (outstanding)
- **Data:** Fetched server-side, serialized for client
- **Location-scoped:** Filtered by selected location in header

### Screen: Bookings (`/bookings`)

- **Purpose:** CRUD for bookings (fixed-term and rolling)
- **Key actions:** Create, Edit, Check-in, Check-out, Schedule End-of-Stay, Schedule End-of-Addon, Delete
- **Form fields:** Tenant, Room (filtered by location), Start Date, Duration/Rolling toggle, Fee (auto-suggests from room type pricing), Status, Deposit, Second Resident Fee, Add-ons
- **Validation:** Overlap detection, required fields, rolling/fixed-term constraints
- **Side effects:** Bill generation, deposit creation, payment reallocation on edit
- **Warning:** Edit mode shows amber warning about payment allocation impacts

### Screen: Bills (`/bills`)

- **Purpose:** View and manage bills
- **Key actions:** Create, Edit due_date, Add/Edit/Delete bill items, Send email reminder
- **Business rule:** Only due_date can be changed on existing bills
- **Warning:** Edit triggers payment reallocation warning

### Screen: Payments (`/payments`)

- **Purpose:** Record and allocate payments
- **Key actions:** Create, Edit, Delete
- **Allocation modes:** Auto (earliest unpaid bill first) or Manual (user specifies per-bill amounts)
- **Validation:** Total allocation must equal payment amount; cannot over-allocate a bill
- **File upload:** Payment proof (PNG/JPG/JPEG/WEBP, max 2MB)
- **Side effects:** Creates/updates PaymentBill records, creates/updates Transaction records, updates Deposit status

### Screen: Deposits (`/deposits`)

- **Purpose:** View and manage deposit lifecycle
- **Key actions:** Create, Edit amount, Update status
- **Status transitions:** UNPAID→HELD (via payment), HELD→APPLIED/REFUNDED/PARTIALLY_REFUNDED/FORFEITED
- **Validation:** Refund amount required for REFUNDED/PARTIALLY_REFUNDED; full refund must equal deposit amount
- **Warning:** Edit shows amber warning about payment allocation

### Screen: Tenants (`/residents/tenants`)

- **Purpose:** Manage tenant records with document uploads
- **File uploads:** ID document (max 5MB), Family certificate (max 3MB), Second resident ID (max 5MB)
- **Second resident:** Optional linked resident with all same fields
- **Validation:** If any second_resident field set, all required fields must be filled + family certificate required

### Screen: Guests (`/residents/guests`)

- **Purpose:** Manage short-term guest stays
- **Guest stays:** Date range + daily fee; auto-generates bill items split by month

### Screen: Rooms (`/rooms/all-rooms`)

- **Purpose:** CRUD for physical rooms
- **Includes:** Room number, type, status, location
- **Related:** Room Types, Durations, Availability views

### Screen: Add-ons (`/addons`)

- **Purpose:** Define addon services with tiered pricing
- **Pricing model:** Interval-based (month ranges) with optional full-payment mode

### Screen: Financials Summary (`/financials/summary`)

- **Purpose:** Income/expense overview with period selection
- **Periods:** 7 days, 1/3/6 months, 1 year, all-time, custom range
- **Features:** Deposit split view, location filter

### Screen: Financials Export (`/financials/export`)

- **Purpose:** Export transactions to Excel or PDF
- **Formats:** .xlsx (ExcelJS) and .pdf (PDFKit)

### Screen: Schedule Calendar (`/schedule/calendar`)

- **Purpose:** FullCalendar view of bookings and events
- **Events:** Booking start/end dates, custom recurring events

### Screen: Settings Users (`/settings/users`)

- **Purpose:** Manage site users
- **Authorization:** Only role_id=1 users can manage others
- **Actions:** Create (with hashed password), Update, Delete

### Screen: First-Time Setup (`/first-time-setup`)

- **Purpose:** 3-step wizard for initial app configuration
- **Steps:** Introduction → Company Name + Logo → Location Name + Address
- **Image validation:** Max 2MB, must be image MIME type
- **Side effects:** Sets APP_SETUP=true, creates COMPANY_NAME, COMPANY_IMAGE settings, creates Location

---

## 13. Business Logic Catalogue

| Rule ID | Rule Description | Inputs | Output/Effect | Edge Cases | Source Evidence |
|---|---|---|---|---|---|
| BL-001 | **Booking end date calculation**: If start_date is 1st of month, end = last day of (start_month + month_count). If start_date is NOT 1st, end = last day of (start_month + month_count + 1) | start_date, duration.month_count | Calculated end_date | Start on Jan 1 with 1 month → Jan 31. Start on Jan 5 with 1 month → Feb 28/29. | [SOURCE_CODE] `src/app/_lib/util/booking.ts:9-16` [TEST_EVIDENCE] `__tests__/unit/util.test.ts` |
| BL-002 | **Rolling booking active check**: A rolling booking is active if start_date ≤ today AND end_date is null | start_date, end_date, is_rolling | boolean | Rolling with end_date set = inactive | [SOURCE_CODE] `src/app/_lib/util/booking.ts:61-85` [TEST_EVIDENCE] |
| BL-003 | **Payment allocation (auto mode)**: Bills sorted by due_date ascending; payment allocated to earliest unpaid bill first, carry remainder to next bill | payment_amount, unpaid_bills[] | PaymentBill[] allocations | Payment exceeds all bills: remainder unallocated. Payment less than first bill: partial allocation. | [SOURCE_CODE] `bills/bill-action.ts:simulateUnpaidBillPaymentAction` [TEST_EVIDENCE] `bill-action.test.ts` |
| BL-004 | **Payment allocation (manual mode)**: User specifies exact amounts per bill; total must equal payment amount | manualAllocations (bill_id→amount), paymentAmount | PaymentBill[] records | Total != payment amount → throws error "Total manual allocation must equal payment amount" | [SOURCE_CODE] `payments/payment-action.ts` [TEST_EVIDENCE] `payment-action.test.ts` |
| BL-005 | **Deposit-first prioritization in transaction splitting**: When allocating payment across bill items, deposit items are processed first. Within each PaymentBill, the allocated amount fills deposit items before regular items. | PaymentBill.amount, bill.bill_items (sorted: deposit first) | deposit_amount + regular_amount split | If PaymentBill amount < deposit item amount, entire amount goes to deposit | [SOURCE_CODE] `payment-action.ts:createOrUpdatePaymentTransactions` [TEST_EVIDENCE] `payment-action.test.ts` |
| BL-006 | **Deposit status UNPAID→HELD**: When deposit payment detected (transaction created for deposit), deposit status updates to HELD | deposit.status == UNPAID, deposit transaction created | status = HELD | Only triggers if current status is UNPAID | [SOURCE_CODE] `payment-action.ts` [TEST_EVIDENCE] `deposits.test.ts` |
| BL-007 | **Deposit status HELD→UNPAID**: When all deposit income transactions are removed (payment deleted/edited), deposit reverts to UNPAID | All deposit transactions removed | status = UNPAID | [INFERRED] from createOrUpdatePaymentTransactions logic |
| BL-008 | **Deposit refund creates expense transaction**: REFUNDED/PARTIALLY_REFUNDED status creates a Transaction with type=EXPENSE, category="Deposit" | refunded_amount, deposit_id | Transaction record | Full refund: refunded_amount must equal deposit.amount. Partial: must be less. | [SOURCE_CODE] `src/app/_db/deposit.ts:updateDepositStatus` [TEST_EVIDENCE] `deposits.test.ts` |
| BL-009 | **Deposit APPLIED creates NO transaction**: Moving to APPLIED only sets applied_at timestamp, no income transaction (already counted when HELD) | deposit.status = HELD | status = APPLIED, applied_at = now | Prevents double-counting | [SOURCE_CODE] `src/app/_db/deposit.ts` [DOC_EVIDENCE] `docs/architecture.md` |
| BL-010 | **Rolling booking bill generation (initial)**: Creates prorated first month + full months up to current month | booking.start_date, fee, today | Bill[] + BillItem[] | First month proration: (daysInMonth - startDay + 1) / daysInMonth * fee | [SOURCE_CODE] `booking-action.ts:generateInitialBillsForRollingBooking` [TEST_EVIDENCE] `rolling-booking.test.ts` |
| BL-011 | **Rolling booking bill generation (monthly cron)**: Creates next month's bill if not already exists | booking, targetDate | Bill or null | Returns null if: booking has end_date, or month already billed | [SOURCE_CODE] `booking-action.ts:generateNextMonthlyBill` [TEST_EVIDENCE] `rolling-booking.test.ts` |
| BL-012 | **Bill due date**: Last day of the billing month | billing month/year | due_date (Date) | Feb in leap year: 29th | [SOURCE_CODE] `booking-action.ts` |
| BL-013 | **Bill description format**: "Tagihan untuk Bulan {MonthName} {Year}" | month, year | Indonesian month name string | Uses Indonesian locale | [SOURCE_CODE] `booking-action.ts` [DOC_EVIDENCE] `docs/cron-jobs.md` |
| BL-014 | **Payment-bill mapping regeneration**: On booking edit, all existing PaymentBill records are deleted and regenerated deterministically. Payments sorted by payment_date, bills by due_date. | all payments, all bills for booking | New PaymentBill[] | Deposit bill items sorted first within each bill | [SOURCE_CODE] `bill-action.ts:generatePaymentBillMappingFromPaymentsAndBills` [TEST_EVIDENCE] `bill-action.test.ts` |
| BL-015 | **Booking overlap detection (rolling)**: Rejects if another active rolling booking exists for same room without end_date, or if end dates overlap | room_id, start_date, end_date, is_rolling | Accept/reject | Excludes self (current booking ID) on edit | [SOURCE_CODE] `booking-action.ts:upsertBookingAction` |
| BL-016 | **Booking overlap detection (fixed)**: Rejects if `new.start_date < existing.end_date AND new.end_date > existing.start_date` for same room | room_id, start_date, end_date | Accept/reject | Date normalization to midnight | [SOURCE_CODE] `booking-action.ts` |
| BL-017 | **Addon tiered pricing**: Pricing entries define interval_start/interval_end (in months). Only last entry may have null interval_end (perpetual). Full-payment mode charges once. | addon_pricing[], month_index | charge_amount | is_full_payment=true: full amount at interval_start, 0 for remaining months in that tier | [SOURCE_CODE] `addons-action.ts`, `booking-action.ts:processAddonsForPeriod` [TEST_EVIDENCE] `rolling-booking.test.ts` |
| BL-018 | **Guest stay bill item generation**: Multi-month stays split into monthly segments; each segment gets a bill item with (days × daily_fee) | guest_stay, start_date, end_date, daily_fee | BillItem[] mapped to bills | Days calculation: (endDate - startDate) / (ms per day) + 1 | [SOURCE_CODE] `guests/guest-action.ts:splitGuestStayByMonth` |
| BL-019 | **Currency formatting**: IDR with no decimal places, Indonesian locale (Rp1.500.000) | number | formatted string | NaN returns "-" | [SOURCE_CODE] `src/app/_lib/util/currency.ts` |
| BL-020 | **Session timeout**: JWT sessions expire after 15 minutes | - | Forced re-authentication | `maxAge: 60 * 15` | [SOURCE_CODE] `src/app/_lib/auth.ts` |
| BL-021 | **Password requirements**: Min 8 chars, max 32 chars | password string | Accept/reject | No complexity requirements beyond length | [SOURCE_CODE] `src/app/_lib/zod/auth/zod.ts` |
| BL-022 | **Password reset flow**: Generates random 8-char password, hashes with bcrypt(10), sets shouldReset=true, emails new password | email | New temp password sent | Always returns success (doesn't reveal if email exists) | [SOURCE_CODE] `reset-action.ts` |
| BL-023 | **User authorization for user management**: Only users with role_id=1 can create/update/delete other users | session.user.role_id | Allow/deny | Returns "Unauthorized" if role_id != 1 | [SOURCE_CODE] `site_users-action.ts` |
| BL-024 | **S3 key format for payment proofs**: `booking-payments/{booking_id}/{ISO_timestamp}/{filename}` | booking_id, timestamp, filename | S3 key string | Timestamp ensures uniqueness | [SOURCE_CODE] `payment-action.ts` |
| BL-025 | **S3 key format for tenant IDs**: `tenants/id/{ISO_timestamp}/{name}_{filename}` | tenant_name, timestamp, filename | S3 key string | | [SOURCE_CODE] `tenant-action.ts` |
| BL-026 | **Email reminder window**: Bills due within next 7 days from target date | targetDate | Bills[] to remind | Only bills with outstanding balance > 0 and tenant has email | [SOURCE_CODE] `invoice-reminder-action.ts` [DOC_EVIDENCE] `docs/cron-jobs.md` |
| BL-027 | **countMonths utility**: First partial month does NOT count, last month ALWAYS counts. Order-independent. | start, end | integer month count | Start day != 1 subtracts one month. Base = calendar month diff + 1. | [SOURCE_CODE] `src/app/_lib/util/datetime.ts:65-92` |
| BL-028 | **Dashboard financial grouping**: Ranges < 90 days group by day; longer ranges group by month | date range | "day" or "month" grouping | All-time uses earliest transaction date | [SOURCE_CODE] `src/app/_db/dashboard.ts` [TEST_EVIDENCE] `dashboard-financial-summary.test.ts` |
| BL-029 | **Deposit split in financial reporting**: When splitDeposit=true, income/expense queries exclude "Deposit" category; deposit shown separately | splitDeposit flag | Separate deposit arrays | Both modes return deposit arrays in result | [TEST_EVIDENCE] `dashboard-financial-summary.test.ts` |
| BL-030 | **Transaction export filename**: `transaksi-keuangan_{startYYYYMMDD}_{endYYYYMMDD}.{format}` | dates, format | filename string | No dates: "semua-waktu" | [SOURCE_CODE] `transaction-export.ts` |
| BL-031 | **Registration gate**: Registration page only accessible when REGISTRATION_ENABLED setting is "true" (case-insensitive) | setting value | Page accessible or not | Default: false (registration disabled) | [SOURCE_CODE] `src/app/_db/settings.ts:getRegistrationEnabled` |
| BL-032 | **Booking edit triggers full payment reallocation (auto mode)**: Editing a booking regenerates all bills, then regenerates all payment-bill mappings, then recomputes transactions for ALL affected payments | booking changes | Complete financial recalculation | Can affect deposit status | [SOURCE_CODE] `booking-action.ts:upsertBookingAction` |
| BL-033 | **Schedule end of stay**: Sets end_date, is_rolling=false, deletes bills beyond end_date | booking_id, end_date | Booking updated, future bills removed | end_date must be >= start_date | [SOURCE_CODE] `booking-action.ts:scheduleEndOfStayAction` |
| BL-034 | **Check-out flow**: Creates CheckInOutLog, updates deposit status, sets end_date and is_rolling=false | booking_id, event_date, deposit_status, refund_amount | Multiple records updated | Can create refund expense transaction | [SOURCE_CODE] `booking-action.ts:checkInOutAction` |

---

## 14. Validation and Error Handling

| Error / Validation Case | Trigger | Behaviour | User/API Response | Source |
|---|---|---|---|---|
| Invalid email format | Login/Register/Tenant forms | Zod validation failure | "Alamat email tidak valid" | [SOURCE_CODE] auth/zod.ts |
| Password too short (<8) | Login/Register | Zod validation | "Kata sandi harus lebih dari 8 karakter" | [SOURCE_CODE] |
| Duplicate email (register) | P2002 constraint | Prisma error caught | "Alamat email sudah terdaftar" | [SOURCE_CODE] register-action.ts |
| Invalid credentials (login) | bcrypt compare fails | CredentialsSignin error | "Nama pengguna atau kata sandi tidak valid" | [SOURCE_CODE] login-action.ts |
| Room number taken | P2002 on (room_number, location_id) | Prisma error caught | "Room Number is taken" | [SOURCE_CODE] room-actions.ts |
| Room type in use (delete) | P2003 foreign key | Prisma error caught | "There are rooms with this type..." | [SOURCE_CODE] room-type-actions.ts |
| Duration in use (delete) | P2003 foreign key | Prisma error caught | "There are rooms with this duration..." | [SOURCE_CODE] duration-actions.ts |
| Manual allocation mismatch | Sum != payment amount | Throws Error | "Total manual allocation must equal payment amount" | [SOURCE_CODE] payment-action.ts |
| Booking overlap (rolling) | Conflicting active booking | Validation check | Returns failure message | [SOURCE_CODE] booking-action.ts |
| Fee must be > 0 | Booking/payment creation | Zod min(1) | "Fee should be greater than 0" | [SOURCE_CODE] booking/zod.ts |
| Missing required field | Any form submission | Zod .min(1) or required | Field-specific Indonesian error message | [SOURCE_CODE] various zod files |
| File too large | Client-side check | Toast notification | Size-specific error message | [SOURCE_CODE] form components |
| Deposit refund > amount | REFUNDED status | Zod superRefine | "Untuk pengembalian dana penuh, jumlah pengembalian dana harus sama dengan jumlah deposit" | [SOURCE_CODE] deposit/zod.ts |
| Partial refund >= amount | PARTIALLY_REFUNDED | Zod superRefine | "Untuk pengembalian dana sebagian, jumlahnya harus lebih kecil dari jumlah deposit" | [SOURCE_CODE] deposit/zod.ts |
| S3 upload failure | AWS error | Logged, file cleanup attempted | Payment still created (non-blocking) | [SOURCE_CODE] tenant-action.ts, payment-action.ts |
| Cron unauthorized | Missing/invalid Bearer token | 401 response | `{ "error": "Unauthorized" }` | [SOURCE_CODE] invoice-reminder route.ts |
| Generic server error | Unhandled exception | Caught, logged to Axiom | "Request unsuccessful" / "Internal Server Error" | [SOURCE_CODE] various action files |

---

## 15. Authentication, Authorization, and Security

| Security Concern | Implementation | Source | Rebuild Requirement |
|---|---|---|---|
| Authentication method | NextAuth v5 with Credentials provider | `src/app/_lib/auth.ts` | JWT strategy, 15-min maxAge |
| Password hashing | bcrypt with salt rounds 10 | auth.ts, register-action.ts | Must use bcrypt(10) for compatibility |
| Session strategy | JWT (not database sessions) | auth.ts `strategy: "jwt"` | Stateless, validated per request |
| Route protection | Internal layout checks `auth()` → redirect to /login | `(internal)/layout.tsx` | All internal routes protected |
| Setup guard | Dashboard layout checks APP_SETUP setting | `(dashboard_layout)/layout.tsx` | Redirect to /first-time-setup if false |
| Role-based access | Only role_id=1 can manage users | `site_users-action.ts` | Hard-coded admin check |
| CRON endpoint auth | Bearer token matching CRON_SECRET env var | invoice-reminder route.ts | x-cron-secret or Authorization header |
| Password reset | Generates random password, sets shouldReset flag | reset-action.ts | Does not reveal email existence |
| Input sanitization | Zod schemas validate all server action inputs | All *-action.ts files | Prevents injection |
| File upload validation | Client-side size limits + base64 regex validation | Zod schemas + form components | Limits: 2-5MB depending on type |
| Secrets handling | Environment variables, not in code | .env, env.example | Never committed to source |
| CORS/CSRF | NextAuth built-in CSRF protection | NextAuth config | Default behaviour |
| Request tracing | x-request-id header on all requests | middleware.ts | UUID per request |

**Security gaps identified:**
- Monthly billing cron route has no explicit auth check [SOURCE_CODE]
- Ethereal email credentials hardcoded in mailer.ts (dev only) [SOURCE_CODE]
- No rate limiting on login attempts [INFERRED]
- No password complexity beyond length (no uppercase/special char requirements) [SOURCE_CODE]

---

## 16. External Integrations

### Integration: AWS S3

- **Purpose:** File storage for payment proofs and tenant identity documents
- **Source files:** `src/app/_lib/s3.ts`, `payment-action.ts`, `tenant-action.ts`
- **Configuration:** `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`
- **Operations:** PutObject (upload), GetObject (retrieve via proxy route), DeleteObject (cleanup)
- **Key patterns:** `booking-payments/{id}/{timestamp}/{file}`, `tenants/id/{timestamp}/{name}_{file}`, `tenants/family-certificate/{timestamp}/{file}`
- **Error handling:** Upload failures logged; payment creation continues without proof; tenant upload does full S3 cleanup on partial failure
- **Retry behaviour:** None (single attempt)

### Integration: AWS SES (via Nodemailer)

- **Purpose:** Transactional email sending in production
- **Source files:** `src/app/_lib/mailer.ts`
- **Configuration:** Region `ap-southeast-1`, uses IAM credentials from environment
- **Rate limit:** 14 emails/second (configured in Nodemailer transport)
- **Default from:** `"MICASA Suites" <noreply@micasasuites.com>`
- **Error handling:** Logs success/failure to `emaillogs` table; categorizes as FAIL_CLIENT or FAIL_SERVER
- **Dev fallback:** Ethereal email (`nora56@ethereal.email`)
- **Templates:** RESET_PASSWORD, BILL_REMINDER (Indonesian text with hardcoded bank account: BCA 5491118777 Adriana Nugroho)

### Integration: Axiom Logging

- **Purpose:** Structured logging and observability
- **Source files:** `src/app/_lib/axiom/`, `src/instrumentation.ts`, `src/middleware.ts`
- **Configuration:** `AXIOM_DATASET`, `AXIOM_TOKEN`
- **Behaviour:** Request-scoped logging with x-request-id; auto-flush after server actions via `after()` callback
- **Client/Server:** Both client and server loggers available

### Integration: Cronicle Scheduler

- **Purpose:** External cron job management (Docker container)
- **Source files:** `cron/docker-compose.yml`, `cron/jobs/*.sh`
- **Configuration:** `HMS_BASE_URL`, `HMS_CRON_SECRET`, SMTP settings
- **Jobs:** Monthly billing (1st of month, 00:00 Jakarta), Email reminder (28th of month, 00:00 Jakarta)
- **Retries:** 3 attempts with 60-second delay
- **Notifications:** Email on failure to `micasa@raymonds.dev`
- **UI:** Accessible at port 3012

---

## 17. Background Jobs, Scheduled Tasks, and Async Flows

| Job / Worker | Trigger | Payload | Behaviour | Retry / Failure Handling | Source |
|---|---|---|---|---|---|
| Monthly Billing | 1st of month, 00:00 Asia/Jakarta | None | Fetches all active rolling bookings (is_rolling=true, end_date=null). For each, calls generateNextMonthlyBill(). Creates Bill + BillItems. | 3 retries, 60s delay. Email notification on failure. | [SOURCE_CODE] `cron/monthly-billing route`, [DOC_EVIDENCE] `docs/cron-jobs.md` |
| Email Reminder | 28th of month, 00:00 Asia/Jakarta | None | Checks feature flag. Queries unpaid bills due within 7 days. Generates and sends emails concurrently (14/sec). Logs all attempts. | 3 retries, 60s delay. Email notification on failure. Individual email failures don't block batch. | [SOURCE_CODE] `invoice-reminder route` |
| Log Cleanup | [UNKNOWN] schedule | None | Deletes HMS log files older than 30 days from `/opt/cronicle/logs/hms/` | Always exits 0 | [SOURCE_CODE] `cron/jobs/cleanup-logs.sh` |

---

## 18. State Machines and Lifecycle Flows

### Deposit Status Machine

```mermaid
stateDiagram-v2
    [*] --> UNPAID: Deposit created
    UNPAID --> HELD: Payment allocated to deposit bill item
    HELD --> UNPAID: All deposit transactions removed
    HELD --> APPLIED: Manual status update (no transaction)
    HELD --> REFUNDED: Full refund (creates expense transaction)
    HELD --> PARTIALLY_REFUNDED: Partial refund (creates expense transaction)
    HELD --> FORFEITED: Manual status update (no transaction)
    APPLIED --> [*]
    REFUNDED --> [*]
    PARTIALLY_REFUNDED --> [*]
    FORFEITED --> [*]
```

| State | Can Transition To | Trigger | Side Effects | Source |
|---|---|---|---|---|
| UNPAID | HELD | Payment transaction covers deposit item | Creates INCOME transaction (category: "Deposit") | [SOURCE_CODE] [TEST_EVIDENCE] |
| HELD | UNPAID | All deposit transactions deleted | Removes transactions | [SOURCE_CODE] |
| HELD | APPLIED | Manual status update via action | Sets applied_at timestamp; NO transaction created | [SOURCE_CODE] [DOC_EVIDENCE] |
| HELD | REFUNDED | Manual status update with refunded_amount = deposit.amount | Creates EXPENSE transaction; sets refunded_at | [SOURCE_CODE] [TEST_EVIDENCE] |
| HELD | PARTIALLY_REFUNDED | Manual status update with refunded_amount < deposit.amount | Creates EXPENSE transaction; sets refunded_at, refunded_amount | [SOURCE_CODE] [TEST_EVIDENCE] |
| HELD | FORFEITED | Manual status update | No transaction | [SOURCE_CODE] |

### Booking Lifecycle

```mermaid
stateDiagram-v2
    [*] --> ACTIVE_ROLLING: Create rolling booking
    [*] --> ACTIVE_FIXED: Create fixed-term booking
    ACTIVE_ROLLING --> ENDING: Schedule end-of-stay (sets end_date)
    ENDING --> COMPLETED: Check-out (sets is_rolling=false)
    ACTIVE_FIXED --> COMPLETED: Check-out or end_date passed
    ACTIVE_ROLLING --> COMPLETED: Direct check-out
```

### Payment Processing Flow

```mermaid
stateDiagram-v2
    [*] --> RECORDED: Payment created
    RECORDED --> ALLOCATED_AUTO: Auto-allocation mode
    RECORDED --> ALLOCATED_MANUAL: Manual allocation mode
    ALLOCATED_AUTO --> TRANSACTIONS_CREATED: createOrUpdatePaymentTransactions
    ALLOCATED_MANUAL --> TRANSACTIONS_CREATED: createOrUpdatePaymentTransactions
    TRANSACTIONS_CREATED --> DEPOSIT_UPDATED: If deposit items involved
    TRANSACTIONS_CREATED --> [*]: No deposit items
    DEPOSIT_UPDATED --> [*]
```

---

## 19. Algorithms and Non-Trivial Implementation Details

### Algorithm: Payment Auto-Allocation (`simulateUnpaidBillPaymentAction`)

- **Purpose:** Distribute a payment amount across multiple unpaid bills
- **Inputs:** payment_amount (number), unpaid_bills[] (sorted by due_date ascending)
- **Outputs:** Allocation map (bill_id → amount)
- **Step-by-step logic:**
  1. Sort bills by due_date ascending
  2. Set `remainingBalance = payment_amount`
  3. For each bill:
     a. Calculate `outstanding = sum(bill_items.amount) - sum(existing_paymentBills.amount)`
     b. `allocated = min(remainingBalance, outstanding)`
     c. Record allocation: `bill_id → allocated`
     d. `remainingBalance -= allocated`
     e. If `remainingBalance <= 0`, stop
  4. Return allocations
- **Important constants:** None
- **Edge cases:** Over-payment (remainder unallocated); payment exactly covers one bill
- **Source files:** `src/app/(internal)/(dashboard_layout)/bills/bill-action.ts`

### Algorithm: Deterministic Payment-Bill Mapping (`generatePaymentBillMappingFromPaymentsAndBills`)

- **Purpose:** Regenerate all PaymentBill records for a booking after changes
- **Inputs:** payments[] (for booking), bills[] (for booking)
- **Outputs:** PaymentBill[] records
- **Step-by-step logic:**
  1. Sort payments by payment_date ascending
  2. Sort bills by due_date ascending
  3. Within each bill, sort bill_items: deposit items first (has `related_id.deposit_id`)
  4. For each payment (in date order):
     a. Set `remainingPayment = payment.amount`
     b. For each bill (in date order):
        - Calculate outstanding for this bill
        - `allocated = min(remainingPayment, outstanding)`
        - Create PaymentBill record: `{ payment_id, bill_id, amount: allocated }`
        - Update bill's tracked paid amount
        - `remainingPayment -= allocated`
        - If `remainingPayment <= 0`, move to next payment
  5. Return all PaymentBill records
- **Source files:** `bills/bill-action.ts`

### Algorithm: Transaction Splitting (`createOrUpdatePaymentTransactions`)

- **Purpose:** Create income Transaction records from payment allocations, splitting deposit vs regular income
- **Inputs:** payment_id
- **Outputs:** Transaction records (Deposit INCOME + Biaya Sewa INCOME)
- **Step-by-step logic:**
  1. Delete existing transactions with `related_id.payment_id = payment_id`
  2. Fetch all PaymentBill records for payment (with bill items)
  3. For each PaymentBill:
     a. Sort bill_items: deposit items first
     b. Set `remainingAllocation = paymentBill.amount`
     c. For each bill_item:
        - `itemShare = min(remainingAllocation, bill_item.amount)`
        - If item has `related_id.deposit_id`: add to `depositTotal`
        - Else: add to `regularTotal`
        - `remainingAllocation -= itemShare`
  4. If `depositTotal > 0`: Create/update Transaction (type=INCOME, category="Deposit", related_id includes deposit_id)
  5. If `regularTotal > 0`: Create/update Transaction (type=INCOME, category="Biaya Sewa")
  6. Update deposit status to HELD if was UNPAID and deposit payment detected
- **Source files:** `payments/payment-action.ts`

### Algorithm: Rolling Booking Initial Bill Generation (`generateInitialBillsForRollingBooking`)

- **Purpose:** Create all bills from booking start to current date
- **Inputs:** booking (with fee, start_date, second_resident_fee, addons, deposit)
- **Outputs:** Bill[] + BillItem[]
- **Step-by-step logic:**
  1. Calculate first month proration: `(daysInFirstMonth - startDay + 1) / daysInFirstMonth * fee`
  2. Create first bill with:
     - Prorated room fee bill item
     - Deposit bill item (if exists, on first bill only)
     - Prorated second_resident_fee (if exists)
     - Prorated addon fees for first month
  3. For each subsequent full month up to current month:
     - Create bill with full room fee
     - Add second_resident_fee if applicable
     - Add addon fees (using tiered pricing based on month index)
  4. Bill due_date = last day of billing month
  5. Bill description = "Tagihan untuk Bulan {MonthName} {Year}"
- **Source files:** `bookings/booking-action.ts`

### Algorithm: Addon Pricing Resolution

- **Purpose:** Determine addon charge for a given month
- **Inputs:** addon.pricing[] (sorted by interval_start), month_index (0-based from addon start)
- **Outputs:** charge amount for that month
- **Step-by-step logic:**
  1. Find pricing tier where `interval_start <= month_index` and (`interval_end >= month_index` or `interval_end is null`)
  2. If `is_full_payment = true`:
     - Charge full price at `interval_start` month only
     - Charge 0 for all other months in that tier
  3. If `is_full_payment = false`:
     - Charge price amount every month in the tier
- **Source files:** `booking-action.ts:processAddonsForPeriod`, `addons-action.ts`

---

## 20. Testing Inventory

| Test File | Test Name / Scope | Behaviour Covered | Important Fixtures | Notes |
|---|---|---|---|---|
| `__tests__/unit/bill-action.test.ts` | BillAction | dedupePaymentsByLatestDate, simulateUnpaidBillPaymentAction, generateBookingBillandBillItems, generateBookingAddonsBillItems, generatePaymentBillMappingFromPaymentsAndBills, getUnpaidBillsDueAction | Mock bills, payments, addons | 84.7KB, comprehensive |
| `__tests__/unit/booking-lifecycle.test.ts` | Booking Lifecycle Integration | Create booking with bills/deposit, payment allocation, check-in/out with deposit, edit booking reallocation | Mock booking data helper | Tests full lifecycle flow |
| `__tests__/unit/rolling-booking.test.ts` | Rolling Booking Feature | generateInitialBillsForRollingBooking, generateNextMonthlyBill, scheduleEndOfRollingBooking, addon pricing intervals | Mock bookings with addons, pricing tiers | 52.4KB |
| `__tests__/unit/payment-action.test.ts` | Payment Actions | createPaymentBillsFromBillAllocations, createOrUpdatePaymentTransactions (deposit split, update existing) | Mock payment+bill structures | |
| `__tests__/unit/payment-auto-allocation.test.ts` | Payment Auto-Allocation | upsertPaymentAction auto mode, deposit status update | Full mock booking/bill chain | |
| `__tests__/unit/deposits.test.ts` | Deposit Logic | Create HELD, Apply, Partial refund, Full refund | Simple deposit mocks | Status transitions |
| `__tests__/unit/is-booking-active.test.ts` | isBookingActive, getNextUpcomingBooking | Active detection for rolling/fixed, upcoming booking selection | Date mocking | |
| `__tests__/unit/util.test.ts` | Utility functions | getLastDateOfBooking, generateDatesBetween, generateDatesFromBooking | Duration objects | Date calculation accuracy |
| `__tests__/unit/dashboard-financial-summary.test.ts` | Dashboard financials | getGroupedIncomeExpense (periods, deposit split, location), getRecentTransactions | Fake timers, mock transactions | |
| `__tests__/unit/guest-action.test.ts` | Guest actions | [UNKNOWN - not read] | | |
| `__tests__/unit/enum-translations.test.ts` | Enum translations | Label mapping | | |
| `__tests__/unit/request-id.test.ts` | Request ID tracing | withAction/withRequestId request context | | |
| `__tests__/unit/serialize-for-client.test.ts` | serializeForClient | Decimal→string conversion | | |
| `__tests__/unit/tanTableFilters.test.ts` | Table filters | [UNKNOWN] | | |
| `__tests__/unit/transaction-export.test.ts` | Transaction export | [UNKNOWN] | | |
| `__tests__/integration/booking-action.upsert.test.ts` | Booking upsert (real DB) | Full booking creation with DB | Real PostgreSQL | |
| `__tests__/integration/payment-action.test.ts` | Payment (real DB) | Payment with real allocation | Real PostgreSQL | |
| `__tests__/integration/payment-action.upsert.test.ts` | Payment upsert (real DB) | Payment create/update with real DB | Real PostgreSQL | |
| `__tests__/integration/transaction-action.test.ts` | Transaction (real DB) | Transaction CRUD with real DB | Real PostgreSQL | |

---

## 21. Rebuild Requirements

### Must Preserve Exactly

- Payment allocation algorithm (auto mode: earliest due_date first)
- Deposit-first prioritization in transaction splitting
- Deterministic payment-bill mapping regeneration (sorted by dates)
- Deposit status machine and its side effects (transaction creation)
- Rolling booking bill generation with proration formula
- Bill description format in Indonesian
- getLastDateOfBooking calculation (start date == 1st vs not)
- Addon tiered pricing resolution
- S3 key path structure (existing files must remain accessible)
- Database schema (tables, columns, constraints, types)
- Zod validation rules (error messages can change, validation logic cannot)
- Email templates (bank account, format)
- Currency formatting (IDR, no decimals)
- Cron job behaviour and timing
- API response shapes for cron endpoints

### Can Be Reimplemented Differently

- Internal folder structure and component decomposition
- CSS styling and visual layout (preserve functional UI behaviour)
- Sidebar menu structure (as long as routes match)
- React component library choice (Material-Tailwind replaceable)
- Logging implementation (Axiom replaceable)
- Chart library (Chart.js replaceable)
- Calendar library (FullCalendar replaceable)
- Animation library (Framer Motion replaceable)
- Test framework (Jest replaceable)
- Build tooling

### Must Not Be Changed

- PostgreSQL schema (exact tables, columns, types, constraints)
- S3 key format (existing data depends on it)
- Email template text (hardcoded bank account info)
- Auth session shape (JWT with user data)
- Cron endpoint paths and auth mechanism
- API route paths
- Business calculation precision (Decimal 10,2 and 12,2)
- Enum values in database (DepositStatus, TransactionType, BillType)

---

## 22. Known Ambiguities and Missing Information

| Area | What Is Unknown | Why It Matters | Suggested Follow-Up |
|---|---|---|---|
| Booking statuses | Which status IDs map to which labels (PENDING, CONFIRMED, etc.) | UI displays differ by status; status_id is just an integer FK | Query bookingstatuses table in running DB |
| Payment statuses | Which status IDs map to which labels | Payment UI may filter/display differently | Query paymentstatuses table |
| Room statuses | Status values and their meaning | Room availability may depend on status | Query roomstatuses table |
| Role definitions | Which roles exist beyond role_id=1 (admin) | Authorization behaviour for non-admin roles | Query roles table |
| Monthly billing cron auth | No explicit auth check in POST handler | Potentially accessible without CRON_SECRET | Verify if middleware or network restriction exists |
| Registration page access | Logic for when /register is shown vs hidden | UI may not link to it when disabled | Check external layout or register page component |
| Notification settings page | What `/notifications` and `/notifications/settings` do | Listed in routes but not deeply analyzed | Read those page files |
| Email settings page | What `/settings/email-settings` configures | May control SMTP or template settings | Read that page file |
| Financial reports pages | What custom/occupancy/profit-loss report pages do | May have significant business logic | Read those page files |
| Seed data | What `prisma/seed.js` creates | Integration test fixtures vs required lookup data | Run seed and inspect |
| Version.json | Where/how `/version.json` is generated | Build pipeline dependency | Check CI/CD or build scripts |
| `shouldReset` flag behaviour | How reset password + shouldReset=true affects login | May force password change on next login (TODO in code) | Read login flow carefully |
| Penalty module | Full penalty creation/management flow | Listed in schema but page commented out in sidebar | Potentially unused/deprecated |
| Rules module | What rules table/page does | Route exists but commented out | Likely unused |

---

# Artefact 2: Behavioural Test Matrix

## A. Happy Path Tests

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-001 | P0 | Booking | Create fixed-term booking | Location, room, tenant, duration, status exist | fee=1000000, start_date=2024-01-01, duration=3months | Submit booking form | Booking created with end_date calculated | 3 bills generated with correct proration; deposit bill item on first bill | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-002 | P0 | Booking | Create rolling booking | Same as TC-001 | is_rolling=true, fee=2000000, start_date=2024-07-15 | Submit booking form | Booking with is_rolling=true, end_date=null | Bills generated from July (prorated) to current month | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-003 | P0 | Payment | Create payment with auto allocation | Booking with unpaid bills exists | amount=1500000, booking_id, payment_date | Submit payment form (auto mode) | Payment created, allocated to earliest bills | PaymentBill records created; Transaction records created | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-004 | P0 | Payment | Create payment with manual allocation | Booking with 2+ unpaid bills | amount=500000, manual: {bill_1: 300000, bill_2: 200000} | Submit with manual allocations | Payment created with exact allocations | PaymentBill with specified amounts | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-005 | P0 | Deposit | Deposit paid via payment | Booking with deposit (UNPAID) | Payment covering deposit bill item | Auto-allocate payment | Deposit status → HELD | Deposit INCOME transaction created | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-006 | P0 | Deposit | Refund deposit | Deposit in HELD status | status=REFUNDED, refunded_amount=deposit.amount | Update deposit status | Deposit status → REFUNDED | EXPENSE transaction created with deposit amount | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-007 | P1 | Cron | Monthly billing generates bill | Active rolling booking exists | POST /api/cron/monthly-billing | Trigger cron | New bill for current month | Bill + BillItems created | [SOURCE_CODE] [DOC_EVIDENCE] |
| TC-008 | P1 | Auth | Successful login | User exists with correct password | email, password | Submit login form | Redirect to dashboard | JWT session created | [SOURCE_CODE] |
| TC-009 | P1 | Tenant | Create tenant with file uploads | Location exists | tenant data + ID file (base64) | Submit tenant form | Tenant created | File uploaded to S3 | [SOURCE_CODE] |
| TC-010 | P1 | Financial | Export transactions to Excel | Transactions exist | date range, format=xlsx | Request export | Excel file download | Correct headers, formatted amounts in IDR | [SOURCE_CODE] |
| TC-011 | P1 | Bill | Send bill email reminder | Bill with tenant email exists | bill_id | Trigger send email | Email sent | EmailLogs record created | [SOURCE_CODE] |
| TC-012 | P1 | Booking | Check-out with deposit application | Active booking with HELD deposit | event_type=CHECK_OUT, deposit_status=APPLIED | Submit check-out | Booking ended | end_date set, is_rolling=false, deposit.applied_at set | [SOURCE_CODE] |
| TC-013 | P1 | Guest | Create guest stay | Guest exists with booking | start_date, end_date, daily_fee | Submit guest stay | GuestStay created | Bill items generated per month | [SOURCE_CODE] |
| TC-014 | P2 | Addon | Create addon with tiered pricing | Location exists | name, pricing=[{interval_start:0, price:100000}] | Submit addon form | Addon + pricing created | | [SOURCE_CODE] |
| TC-015 | P2 | Room | Create room | Location, room type, status exist | room_number, room_type_id, status_id, location_id | Submit form | Room created | RoomTypeDuration upserted | [SOURCE_CODE] |

## B. Validation Tests

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-020 | P0 | Payment | Manual allocation total != payment amount | Booking with bills | amount=500, allocations sum=400 | Submit payment | Error: "Total manual allocation must equal payment amount" | No records created | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-021 | P0 | Booking | Overlapping booking (same room, fixed) | Existing booking Jan 1 - Mar 31, Room 101 | New booking Feb 1 - Apr 30, Room 101 | Submit booking | Overlap error returned | No booking created | [SOURCE_CODE] |
| TC-022 | P1 | Auth | Login with wrong password | User exists | Correct email, wrong password | Submit login | "Nama pengguna atau kata sandi tidak valid" | No session | [SOURCE_CODE] |
| TC-023 | P1 | Auth | Register with existing email | Email already registered | Duplicate email | Submit register | "Alamat email sudah terdaftar" | No user created | [SOURCE_CODE] |
| TC-024 | P1 | Deposit | Full refund amount != deposit amount | Deposit amount=1000 | status=REFUNDED, refunded_amount=800 | Submit status update | Validation error | No status change | [SOURCE_CODE] |
| TC-025 | P1 | Deposit | Partial refund amount >= deposit amount | Deposit amount=1000 | status=PARTIALLY_REFUNDED, refunded_amount=1000 | Submit | Validation error | No status change | [SOURCE_CODE] |
| TC-026 | P1 | Booking | Rolling booking with duration_id | - | is_rolling=true, duration_id=1 | Submit | Validation error: "Duration ID must be null for rolling bookings" | No booking created | [SOURCE_CODE] |
| TC-027 | P1 | Tenant | Second resident fields partial | - | second_resident_name set, second_resident_id_number empty | Submit | Error: "'Nomor identitas' harus diisi jika salah satu field penghuni kedua diisi" | No tenant created | [SOURCE_CODE] |
| TC-028 | P2 | Room | Duplicate room number at location | Room "101" exists at location 1 | room_number="101", location_id=1 | Submit | "Room Number is taken" | No room created | [SOURCE_CODE] |
| TC-029 | P2 | Auth | Password too short | - | password="abc" (3 chars) | Submit register | "Kata sandi harus lebih dari 8 karakter" | No user created | [SOURCE_CODE] |
| TC-030 | P2 | File upload | File exceeds size limit | - | 6MB image file for tenant ID | Select file | Toast: file too large | Upload blocked client-side | [SOURCE_CODE] |

## C. Business Rule Tests

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-040 | P0 | Bill Generation | Prorated first month (start mid-month) | Rolling booking starts Jul 15 | fee=2000000, start_date=Jul 15 | Create booking | First bill prorated: (31-15+1)/31 * 2000000 = ~1,096,774 | Bill with prorated BillItem | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-041 | P0 | Bill Generation | Full month billing | Rolling booking, next month | fee=2000000 | Cron runs | Full 2000000 bill | Single BillItem with fee amount | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-042 | P0 | Payment | Deposit-first prioritization | Bill has deposit item (200) + rent item (800), payment=300 | payment_amount=300 | Auto-allocate | 200 to deposit, 100 to rent | Deposit INCOME: 200, Biaya Sewa INCOME: 100 | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-043 | P0 | Payment | Edit payment triggers reallocation (auto) | Payment exists with auto mode | Change amount | Submit edit | All payments for booking reallocated | PaymentBills regenerated for all payments | [SOURCE_CODE] |
| TC-044 | P0 | Deposit | APPLIED creates no transaction | Deposit in HELD status | Change status to APPLIED | Update | Status=APPLIED, applied_at set | NO new Transaction created | [SOURCE_CODE] [DOC_EVIDENCE] |
| TC-045 | P0 | Booking | End date calculation (start=1st) | - | start_date=Jan 1, month_count=3 | Calculate | end_date=Mar 31 (last day of month 3) | | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-046 | P0 | Booking | End date calculation (start!=1st) | - | start_date=Jan 5, month_count=3 | Calculate | end_date=Apr 30 (last day of month 4) | | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-047 | P1 | Addon | Full payment addon pricing | Addon with is_full_payment=true at interval_start=0 | Month 0, Month 1, Month 2 | Calculate charges | Month 0: full price, Month 1: 0, Month 2: 0 | | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-048 | P1 | Cron | No duplicate bill for same month | Bill already exists for current month | Trigger cron | Process booking | Returns null (no bill created) | No new records | [SOURCE_CODE] [TEST_EVIDENCE] |
| TC-049 | P1 | Booking | Schedule end of stay removes future bills | Rolling booking with bills through Dec | End date=Oct 31 | Schedule end | Bills for Nov, Dec deleted | is_rolling=false, end_date set | [SOURCE_CODE] |
| TC-050 | P1 | Guest | Multi-month stay splits correctly | Guest stay: Jan 15 - Mar 10, daily_fee=50000 | Create guest stay | Bill items generated | Jan: 17 days, Feb: 29 days, Mar: 10 days (each × daily_fee) | BillItems per month | [SOURCE_CODE] |
| TC-051 | P1 | Dashboard | Short range uses daily grouping | Custom range < 90 days | 3-day range | Get grouped data | Labels: ["01-01-2024", "02-01-2024", "03-01-2024"] | | [TEST_EVIDENCE] |
| TC-052 | P1 | Dashboard | Long range uses monthly grouping | Custom range > 90 days | 6-month range | Get grouped data | Labels: ["Jan 2024", "Feb 2024", ...] | | [TEST_EVIDENCE] |
| TC-053 | P2 | Util | isBookingActive - rolling, no end_date, after start | is_rolling=true, start_date past, end_date=null | Check active | Returns true | | [TEST_EVIDENCE] |
| TC-054 | P2 | Util | isBookingActive - fixed, within range | is_rolling=false, today between start and end | Check active | Returns true | | [TEST_EVIDENCE] |
| TC-055 | P2 | Util | isBookingActive - fixed, no end_date | is_rolling=false, end_date=null | Check active | Returns false | | [TEST_EVIDENCE] |

## D. Permission and Security Tests

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-060 | P0 | Auth | Unauthenticated access to internal route | No session | Navigate to /dashboard | Request | Redirect to /login | | [SOURCE_CODE] |
| TC-061 | P0 | Auth | No setup access to dashboard | APP_SETUP=false, valid session | Navigate to /dashboard | Request | Redirect to /first-time-setup | | [SOURCE_CODE] |
| TC-062 | P1 | Users | Non-admin creates user | User with role_id=2 logged in | Attempt upsertSiteUserAction | Submit | "Unauthorized" returned | No user created | [SOURCE_CODE] |
| TC-063 | P1 | Users | Non-admin deletes user | User with role_id=2 logged in | Attempt deleteUserAction | Submit | "Unauthorized" returned | No user deleted | [SOURCE_CODE] |
| TC-064 | P1 | Cron | Email reminder without Bearer token | No auth header | GET /api/tasks/email/invoice-reminder | Request | 401 "Unauthorized" | No emails sent | [SOURCE_CODE] |
| TC-065 | P2 | Auth | Password reset doesn't reveal email existence | Non-existent email | Submit reset form | Request | Success message returned | No email sent, no error | [SOURCE_CODE] |

## E. Error Handling Tests

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-070 | P1 | S3 | Upload failure during payment proof | Invalid AWS credentials | Payment with file | Submit | Payment still created (without proof) | Error logged | [SOURCE_CODE] |
| TC-071 | P1 | Tenant | S3 partial upload failure | First file uploads, second fails | Tenant with 2 files | Submit | Error returned | First uploaded file cleaned up from S3 | [SOURCE_CODE] |
| TC-072 | P1 | Email | Email send failure | SMTP unreachable | Trigger reminder | Send | Error logged | EmailLogs with FAIL_CLIENT/FAIL_SERVER status | [SOURCE_CODE] |
| TC-073 | P2 | Room Type | Delete room type with rooms | Rooms reference this type | Delete room type | Submit | "There are rooms with this type..." | No deletion | [SOURCE_CODE] |
| TC-074 | P2 | Duration | Delete duration with bookings | Booking references duration | Delete duration | Submit | "There are rooms with this duration..." | No deletion | [SOURCE_CODE] |

## F. Data Persistence Tests

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-080 | P0 | Booking | Delete booking cascades | Booking with bills, payments, deposit, guests | Delete booking | Execute | Booking removed | All related bills, bill_items, payments, payment_bills, deposit, guests, guest_stays, check-in-out logs cascaded | [SOURCE_CODE] |
| TC-081 | P0 | Payment | Delete payment cascades | Payment with payment_bills | Delete payment | Execute | Payment removed | PaymentBills cascaded; Transactions deleted | [SOURCE_CODE] |
| TC-082 | P1 | Booking | Update booking regenerates bills | Existing booking with payments | Change fee | Submit | New bills generated | Old bills deleted; PaymentBills regenerated; CREATED bill items preserved and remapped | [SOURCE_CODE] |
| TC-083 | P1 | Deposit | Unique constraint on booking_id | Booking already has deposit | Create second deposit | Execute | P2002 error | No duplicate deposit | [SOURCE_CODE] |
| TC-084 | P2 | Transaction | Delete transaction with deposit_id | Transaction has related_id.deposit_id | Delete transaction | Execute | Transaction removed | Deposit status reset to UNPAID | [SOURCE_CODE] |

## G. UI Behaviour Tests

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-090 | P1 | Payment Form | Auto-allocation simulation display | Booking selected with unpaid bills | Enter amount | Type amount | Shows per-bill allocation preview | | [SOURCE_CODE] |
| TC-091 | P1 | Booking Form | Suggested price auto-fill | Room type + duration selected | Select room and duration | Fields populate | Fee field auto-fills with suggested_price from RoomTypeDuration | | [SOURCE_CODE] |
| TC-092 | P1 | Booking Form | Edit warning checkbox | Editing existing booking | Open edit form | Warning appears | Submit disabled until checkbox acknowledged | | [SOURCE_CODE] |
| TC-093 | P2 | Setup Wizard | Image size validation | - | Select 3MB image | File picker | Toast error about max 2MB | Upload blocked | [SOURCE_CODE] |
| TC-094 | P2 | Sidebar | Mobile collapse behaviour | Window < 720px | Click menu item | Navigate | Sidebar auto-closes | | [SOURCE_CODE] |
| TC-095 | P2 | Location Picker | Scopes data by location | Multiple locations exist | Select different location | Header picker | All data tables filter by location | | [SOURCE_CODE] |

## H. Integration Tests

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-100 | P0 | Payment + Transaction | Full payment flow with transaction creation | Booking with bills | Create payment | Auto-allocate | Transactions created with correct amounts | Deposit INCOME + Biaya Sewa INCOME | [TEST_EVIDENCE] integration tests |
| TC-101 | P0 | Booking + Bills | Booking creation generates correct bills | All fixtures | Create 3-month booking starting Jan 1 | Execute | 3 bills, each with correct due_date and amount | | [TEST_EVIDENCE] |
| TC-102 | P1 | Cron + Bills | Monthly billing for multiple bookings | 3 active rolling bookings | Trigger monthly billing | POST cron | 3 new bills created | Summary response with details | [SOURCE_CODE] |
| TC-103 | P1 | Email + DB | Email reminder logs all attempts | Unpaid bills exist | Trigger reminder | GET endpoint | Emails sent, all logged to emaillogs | | [SOURCE_CODE] |

## I. Regression Tests for Quirks

| Test ID | Priority | Feature / Module | Scenario | Preconditions | Input | Steps | Expected Output | Expected Side Effects | Source / Observation Evidence |
|---|---|---|---|---|---|---|---|---|---|
| TC-110 | P1 | Booking | Stale bill items preserved on edit | Booking has manually CREATED bill items | Edit booking details | Submit | CREATED items remapped to new bills by due_date matching | Items not lost | [SOURCE_CODE] booking-action.ts |
| TC-111 | P1 | Payment | Payment edit (manual) only recomputes own transactions | Payment in manual mode edited | Change allocations | Submit | Only this payment's transactions updated; other payments untouched | Unlike auto mode which recomputes all | [SOURCE_CODE] |
| TC-112 | P2 | Room Actions | Error message says "guest" instead of "room" | Delete room fails | Delete room | Submit | Error message incorrectly says "Error deleting guest" | Copy-paste bug in room-actions.ts line 77 | [SOURCE_CODE] |
| TC-113 | P2 | Auth | Login action returns success on certain error paths | Specific error condition | - | - | May return success despite error (line 51 of login-action.ts) | Potential bug | [SOURCE_CODE] |
| TC-114 | P2 | Calendar | Rolling booking without end_date renders check-out event with null date | Rolling booking has end_date=null | View calendar | Load events | Event pushed with `start: null.toISOString()` - may throw | | [SOURCE_CODE] calendar-action.ts line 86 |
| TC-115 | P1 | Deposit | Deposit bill item created on first bill | Create booking with deposit | Execute | First bill has extra BillItem with related_id.deposit_id | If no bills exist, deposit item may be lost | [SOURCE_CODE] |

---

## Business Rule to Test Case Mapping

| Business Rule ID | Covered By Test IDs |
|---|---|
| BL-001 | TC-045, TC-046 |
| BL-002 | TC-053, TC-054, TC-055 |
| BL-003 | TC-003, TC-040, TC-041 |
| BL-004 | TC-004, TC-020 |
| BL-005 | TC-042, TC-005 |
| BL-006 | TC-005 |
| BL-007 | TC-084 |
| BL-008 | TC-006 |
| BL-009 | TC-044 |
| BL-010 | TC-002, TC-040 |
| BL-011 | TC-007, TC-048 |
| BL-012 | TC-001, TC-002 |
| BL-013 | TC-001, TC-002, TC-007 |
| BL-014 | TC-043, TC-082 |
| BL-015 | TC-021 |
| BL-016 | TC-021 |
| BL-017 | TC-047, TC-014 |
| BL-018 | TC-050, TC-013 |
| BL-019 | TC-010 |
| BL-020 | TC-060 |
| BL-021 | TC-029 |
| BL-022 | TC-065 |
| BL-023 | TC-062, TC-063 |
| BL-024 | TC-003 |
| BL-026 | TC-011, TC-103 |
| BL-027 | TC-040 |
| BL-028 | TC-051, TC-052 |
| BL-029 | TC-051 |
| BL-031 | TC-023 |
| BL-032 | TC-043 |
| BL-033 | TC-049 |
| BL-034 | TC-012 |

---

## Rebuild Risk Assessment

| Risk Area | Severity | Description | Mitigation |
|---|---|---|---|
| Payment allocation algorithm | Critical | Incorrect allocation breaks financial integrity; deposit-first order is non-obvious | Unit tests cover this; verify with real booking scenarios |
| Deposit status machine | Critical | Double-counting or missing transactions corrupt financials | Test all transitions; verify no INCOME on APPLIED |
| Rolling booking bill generation | High | Proration errors accumulate over months; cron must be idempotent | Test with multiple months; verify no duplicate bills |
| Payment-bill regeneration on edit | High | Editing booking can cascade through all payments/transactions | Integration test full edit cycle |
| Addon tiered pricing | Medium | is_full_payment logic and month indexing are complex | Test with multiple tiers and full-payment mode |
| S3 path compatibility | Medium | Existing files use specific key format; changing breaks access | Preserve exact key pattern |
| Date calculation (start=1st vs not) | Medium | Off-by-one month errors in end date calculation | Comprehensive date tests already exist |
| Transaction related_id JSON queries | Medium | Prisma JSON path queries are fragile | Verify filter syntax works identically |
| Email templates (hardcoded bank info) | Low | Business-critical info (bank account) must be preserved | Keep template constants |
| Indonesian locale formatting | Low | Currency/date formatting depends on locale | Use same Intl.NumberFormat/DateTimeFormat config |

---

## Questions / Unknowns

1. **What are the actual BookingStatus, PaymentStatus, and RoomStatus values in production?** - Seed data or live database would reveal these.
2. **Does the monthly billing cron have any network-level auth?** - Code shows no explicit check; may rely on Vercel/infrastructure.
3. **What happens when `shouldReset=true` on login?** - Code has a TODO; the check-and-redirect may not be implemented.
4. **Are penalty and rule modules actively used?** - Commented out in sidebar; schema exists but may be legacy.
5. **How is the version.json file generated?** - Referenced in code but generation mechanism not found in repository.
6. **What is the exact cleanup order when a payment is deleted?** - Cascade behaviour + explicit transaction deletion; ordering matters for deposit status.
7. **Are there any Vercel-specific middleware or edge function configurations?** - Only vercel.json with cron schedule found.
8. **What role IDs exist beyond 1 (admin)?** - Permissions table and role_permission junction exist but values unknown.
