"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";
import { logAudit } from "@/app/_lib/audit";

function utilityLabel(utilityType: string): string {
  return utilityType === "electricity" ? "Listrik" : "Air";
}

export async function createMeterReadingAction(data: {
  booking_id: number;
  utility_type: string;
  reading_date: Date | string;
  reading_value: number;
  rate_per_unit: number;
  photo_proof?: string | null;
}): Promise<{ success: boolean; error?: string; note?: string }> {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const readingDate = new Date(data.reading_date);

  // Auto-fill previous_value from the most recent prior reading for the same
  // booking + utility_type (by reading_date desc, then id desc).
  const prior = await prisma.meterReading.findFirst({
    where: {
      booking_id: data.booking_id,
      utility_type: data.utility_type,
    },
    orderBy: [{ reading_date: "desc" }, { id: "desc" }],
  });

  const previousValue = prior ? Number(prior.reading_value) : null;

  const reading = await prisma.meterReading.create({
    data: {
      booking_id: data.booking_id,
      utility_type: data.utility_type,
      reading_date: readingDate,
      reading_value: data.reading_value,
      previous_value: previousValue,
      rate_per_unit: data.rate_per_unit,
      photo_proof: data.photo_proof ?? null,
    },
  });

  let note: string | undefined;

  // Auto-create a BillItem only when we can compute consumption (i.e. a prior
  // reading exists). The first reading just establishes a baseline.
  if (previousValue !== null) {
    const consumption = Math.max(0, data.reading_value - previousValue);
    const amount = Math.round(consumption * data.rate_per_unit);

    // Attach to the booking's CURRENT bill: latest bill by due_date.
    const latestBill = await prisma.bill.findFirst({
      where: { booking_id: data.booking_id },
      orderBy: { due_date: "desc" },
    });

    if (latestBill) {
      await prisma.billItem.create({
        data: {
          bill_id: latestBill.id,
          description: `Pemakaian ${utilityLabel(data.utility_type)}`,
          amount,
          type: "CREATED",
          related_id: { meter_reading_id: reading.id, utility: true },
        },
      });
    } else {
      note = "No bill found for booking; reading recorded without bill item.";
    }
  }

  await logAudit(
    `Created meter reading #${reading.id} (${data.utility_type}) for booking #${data.booking_id}`
  );
  revalidatePath("/utilities");

  return { success: true, note };
}

export async function deleteMeterReadingAction(
  id: number
): Promise<{ success: boolean; error?: string }> {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const reading = await prisma.meterReading.findUnique({ where: { id } });
  if (!reading) return { success: false, error: "Reading not found" };

  // Remove any generated bill item tagged with this meter reading to avoid
  // orphan charges.
  await prisma.billItem.deleteMany({
    where: {
      bill: { booking_id: reading.booking_id },
      related_id: { path: ["meter_reading_id"], equals: id },
    },
  });

  await prisma.meterReading.delete({ where: { id } });

  await logAudit(`Deleted meter reading #${id}`);
  revalidatePath("/utilities");

  return { success: true };
}
