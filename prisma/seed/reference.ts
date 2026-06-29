import { PrismaClient } from "@prisma/client";
import { seedRbac } from "../seed-rbac";

/**
 * Seed location-independent reference data: statuses, RBAC, settings, and
 * the system-default billing policy. All data in this module is location-
 * agnostic and can be created before locations exist.
 */
export async function seedReference(prisma: PrismaClient): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════
  // Reference Data: Booking / Payment / Room statuses
  // ═══════════════════════════════════════════════════════════════════════

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
      { id: 1, status: "Available" },
      { id: 2, status: "Occupied" },
      { id: 3, status: "Maintenance" },
    ],
    skipDuplicates: true,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // RBAC: Roles, Permissions, and Grants
  // ═══════════════════════════════════════════════════════════════════════

  await seedRbac(prisma);

  // ═══════════════════════════════════════════════════════════════════════
  // Settings
  // ═══════════════════════════════════════════════════════════════════════

  await prisma.setting.createMany({
    data: [
      { setting_key: "APP_SETUP", setting_value: "true" },
      { setting_key: "COMPANY_NAME", setting_value: "Mi Casa Suites" },
      { setting_key: "COMPANY_IMAGE", setting_value: "" },
      { setting_key: "REGISTRATION_ENABLED", setting_value: "false" },
      { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED", setting_value: "true" },
      // CRITICAL: This flag gates the late-fee cron. Must be "true" for derivation
      // to generate penalties on overdue bills.
      { setting_key: "LATE_FEE_AUTOMATION_ENABLED", setting_value: "true" },
      // CRITICAL: This flag gates the booking-status-sync cron. Must be "true" for
      // derivation to sync booking statuses based on dates.
      { setting_key: "BOOKING_STATUS_SYNC_ENABLED", setting_value: "true" },
    ],
    skipDuplicates: true,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Billing Policy: System Default
  // ═══════════════════════════════════════════════════════════════════════
  // This is the fallback policy when a booking has no booking-level or
  // location-level policy. It is location-independent (location_id: null).
  // Per-location policies will be created in Task 5 (locations.ts) after
  // Location records exist.

  await prisma.billingPolicy.create({
    data: {
      location_id: null,
      booking_id: null,
      late_fee_type: "flat",
      late_fee_amount: 200000,
      grace_period_days: 7,
      billing_cycle_day: 1,
      proration_method: "DAILY",
      tax_rate: 11.0,
      reminder_days_before: 5,
    },
  });
}
