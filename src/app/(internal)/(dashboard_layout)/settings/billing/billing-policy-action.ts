"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";
import { logAudit } from "@/app/_lib/audit";
import { captureException } from "@/app/_lib/logger";

export interface BillingPolicyScope {
  // null location_id + null booking_id = system default; location_id set = location override
  location_id: number | null;
  late_fee_type: string | null;
  late_fee_amount: number | null;
  grace_period_days: number | null;
  billing_cycle_day: number | null;
  proration_method: string | null;
  rate_escalation_percentage: number | null;
  rate_escalation_frequency: number | null;
  tax_rate: number | null;
  reminder_days_before: number | null;
}

export async function upsertBillingPolicyAction(scope: BillingPolicyScope) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  try {
    const data = {
      late_fee_type: scope.late_fee_type ?? null,
      late_fee_amount: scope.late_fee_amount ?? null,
      grace_period_days: scope.grace_period_days ?? null,
      billing_cycle_day: scope.billing_cycle_day ?? null,
      proration_method: scope.proration_method ?? null,
      rate_escalation_percentage: scope.rate_escalation_percentage ?? null,
      rate_escalation_frequency: scope.rate_escalation_frequency ?? null,
      tax_rate: scope.tax_rate ?? null,
      reminder_days_before: scope.reminder_days_before ?? null,
    };

    // The @@unique([location_id, booking_id]) treats NULLs as distinct in
    // Postgres, so we cannot rely on a composite-unique upsert. Find-or-create
    // explicitly for the system default / location override scope.
    const existing = await prisma.billingPolicy.findFirst({
      where: { location_id: scope.location_id, booking_id: null },
    });

    if (existing) {
      await prisma.billingPolicy.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.billingPolicy.create({
        data: { ...data, location_id: scope.location_id, booking_id: null },
      });
    }

    await logAudit(
      `billing_policy.upsert: location_id=${scope.location_id ?? "system"}`
    );
    revalidatePath("/settings/billing");
    return { success: true };
  } catch (e: unknown) {
    captureException(e, { message: "Billing policy upsert error" });
    return { success: false, error: "Gagal menyimpan kebijakan tagihan" };
  }
}
