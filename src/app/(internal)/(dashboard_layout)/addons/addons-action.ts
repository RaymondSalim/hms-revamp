"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { addonSchema } from "@/app/_lib/zod/addon/zod";

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
    interval_end?: number | null;
    is_full_payment: boolean;
  }>;
}) {
  const parsed = addonSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  if (data.id) {
    await prisma.addOn.update({
      where: { id: data.id },
      data: {
        name: data.name,
        description: data.description,
        location_id: data.location_id,
        parent_addon_id: data.parent_addon_id || null,
        requires_input: data.requires_input,
      },
    });
    // Replace pricing
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
        parent_addon_id: data.parent_addon_id || null,
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
  try {
    await prisma.addOn.delete({ where: { id } });
    revalidatePath("/addons");
    return { success: true };
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code === "P2003")
      return { success: false, error: "Add-on is in use by bookings" };
    return { success: false, error: "Error deleting add-on" };
  }
}

export async function scheduleEndOfAddonAction(
  bookingAddonId: string,
  endDate: Date
) {
  await prisma.bookingAddOn.update({
    where: { id: bookingAddonId },
    data: { end_date: new Date(endDate), is_rolling: false },
  });
  revalidatePath("/bookings");
  return { success: true };
}
