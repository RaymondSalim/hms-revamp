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
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code === "P2003") return { success: false, error: "Location has associated rooms" };
    return { success: false, error: "Error deleting location" };
  }
}
