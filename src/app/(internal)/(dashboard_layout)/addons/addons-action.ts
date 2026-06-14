"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { addonSchema } from "@/app/_lib/zod/addon/zod";
import { checkPermission } from "@/app/_lib/rbac";
import { getScopedLocationIds, isLocationInScope } from "@/app/_lib/util/location-scope";

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
  const { authorized } = await checkPermission("addons.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const scope = await getScopedLocationIds();
  if (!isLocationInScope(scope, data.location_id)) {
    return { success: false, error: "Unauthorized" };
  }
  // When editing, also confirm the existing add-on is within scope so a scoped
  // user can't reassign someone else's add-on into their own location.
  if (data.id) {
    const existing = await prisma.addOn.findUnique({
      where: { id: data.id },
      select: { location_id: true },
    });
    if (existing?.location_id != null && !isLocationInScope(scope, existing.location_id)) {
      return { success: false, error: "Unauthorized" };
    }
  }

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
  const { authorized } = await checkPermission("addons.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const existing = await prisma.addOn.findUnique({
    where: { id },
    select: { location_id: true },
  });
  if (!existing) return { success: false, error: "Add-on not found" };
  const scope = await getScopedLocationIds();
  if (existing.location_id != null && !isLocationInScope(scope, existing.location_id)) {
    return { success: false, error: "Unauthorized" };
  }

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
  const { authorized } = await checkPermission("addons.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  const bookingAddon = await prisma.bookingAddOn.findUnique({
    where: { id: bookingAddonId },
    select: { booking: { select: { rooms: { select: { location_id: true } } } } },
  });
  if (!bookingAddon) return { success: false, error: "Add-on not found" };
  const locationId = bookingAddon.booking?.rooms?.location_id;
  const scope = await getScopedLocationIds();
  if (scope !== null && (locationId == null || !scope.includes(locationId))) {
    return { success: false, error: "Unauthorized" };
  }

  await prisma.bookingAddOn.update({
    where: { id: bookingAddonId },
    data: { end_date: new Date(endDate), is_rolling: false },
  });
  revalidatePath("/bookings");
  return { success: true };
}
