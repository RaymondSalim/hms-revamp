"use server";

import { createNote, deleteNote } from "@/app/_db/notes";
import { auth } from "@/app/_lib/auth";
import { checkPermission } from "@/app/_lib/rbac";
import { revalidatePath } from "next/cache";

export async function addNoteAction(tenantId: string, content: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Tidak terautentikasi" };

  const trimmed = content.trim();
  if (!trimmed) return { success: false as const, error: "Catatan tidak boleh kosong" };

  await createNote({
    content: trimmed,
    tenant_id: tenantId,
    created_by: session.user.id,
  });

  revalidatePath(`/residents/tenants/${tenantId}`);
  return { success: true as const };
}

export async function deleteNoteAction(noteId: number) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return { success: false as const, error: "Tidak memiliki izin" };

  await deleteNote(noteId);
  revalidatePath("/residents/tenants");
  return { success: true as const };
}
