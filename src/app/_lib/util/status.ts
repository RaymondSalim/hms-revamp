/**
 * Canonical id references for the status lookup tables, seeded in prisma/seed.ts.
 * These tables are effectively fixed enums; referencing rows by named constant
 * keeps call sites readable and prevents magic-number drift.
 */

export const BOOKING_STATUS = {
  PENDING: 1,
  ACTIVE: 2,
  COMPLETED: 3,
  CANCELLED: 4,
} as const;

export const PAYMENT_STATUS = {
  PENDING: 1,
  VERIFIED: 2,
  REJECTED: 3,
} as const;

export const ROOM_STATUS = {
  AVAILABLE: 1,
  OCCUPIED: 2,
  MAINTENANCE: 3,
} as const;
