"use server";
import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";

export async function upsertDurationAction(data: { id?: number; duration: string; month_count: number }) {
  if (data.id) {
    await prisma.duration.update({ where: { id: data.id }, data: { duration: data.duration, month_count: data.month_count } });
  } else {
    await prisma.duration.create({ data: { duration: data.duration, month_count: data.month_count } });
  }
  revalidatePath("/rooms/durations");
  return { success: true };
}

export async function deleteDurationAction(id: number) {
  try {
    await prisma.duration.delete({ where: { id } });
    revalidatePath("/rooms/durations");
    return { success: true };
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code === "P2003") return { success: false, error: "There are rooms with this duration. Please reassign them before deleting." };
    return { success: false, error: "Error deleting duration" };
  }
}
