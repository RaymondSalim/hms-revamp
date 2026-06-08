"use server";
import { createRoom, updateRoom, deleteRoom } from "@/app/_db/rooms";
import { revalidatePath } from "next/cache";
import { roomSchema } from "@/app/_lib/zod/room/zod";

export async function upsertRoomAction(data: { id?: number; room_number: string; room_type_id: number; status_id: number; location_id: number }) {
  const parsed = roomSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  try {
    if (data.id) {
      await updateRoom(data.id, data);
    } else {
      await createRoom(data);
    }
    revalidatePath("/rooms/all-rooms");
    return { success: true };
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code === "P2002") return { success: false, error: "Room Number is taken" };
    return { success: false, error: "Error saving room" };
  }
}

export async function deleteRoomAction(id: number) {
  try {
    await deleteRoom(id);
    revalidatePath("/rooms/all-rooms");
    return { success: true };
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error.code === "P2003") return { success: false, error: "Room has active bookings" };
    return { success: false, error: "Error deleting guest" };
  }
}
