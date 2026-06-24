// Known values the E2E database is seeded with (prisma/seed.ts + seed-mock.ts).
// Specs assert against these. If the seed scripts change, update here.

export const ADMIN = {
  email: "admin@micasasuites.com",
  password: "admin123",
} as const;

export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  bookings: "/bookings",
  bills: "/bills",
  payments: "/payments",
  emailLogs: "/settings/email-logs",
  tenants: "/residents/tenants",
  locations: "/locations",
  durations: "/rooms/durations",
} as const;

// Where the saved admin session is written by auth.setup.ts.
export const ADMIN_STORAGE_STATE = "e2e/.auth/admin.json";
