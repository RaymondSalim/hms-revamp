"use server";
import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";

export async function upsertRoomTypeAction(data: { id?: number; type: string; description?: string }) {
  const { authorized } = await checkPermission("room_types.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };
  if (data.id) {
    await prisma.roomType.update({ where: { id: data.id }, data: { type: data.type, description: data.description } });
  } else {
    await prisma.roomType.create({ data: { type: data.type, description: data.description } });
  }
  revalidatePath("/rooms/room-types");
  return { success: true };
}

export async function deleteRoomTypeAction(id: number) {
  const { authorized } = await checkPermission("room_types.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };
  try {
    await prisma.roomType.delete({ where: { id } });
    revalidatePath("/rooms/room-types");
    return { success: true };
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code === "P2003") return { success: false, error: "There are rooms with this type. Please reassign them before deleting." };
    return { success: false, error: "Error deleting room type" };
  }
}

export async function upsertRoomTypeDurationAction(data: {
  room_type_id: number; duration_id: number; location_id: number; suggested_price: number | null;
}) {
  const { authorized } = await checkPermission("room_types.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };
  await prisma.roomTypeDuration.upsert({
    where: { room_type_id_duration_id_location_id: { room_type_id: data.room_type_id, duration_id: data.duration_id, location_id: data.location_id } },
    update: { suggested_price: data.suggested_price },
    create: data,
  });
  revalidatePath("/rooms/room-types");
  return { success: true };
}
