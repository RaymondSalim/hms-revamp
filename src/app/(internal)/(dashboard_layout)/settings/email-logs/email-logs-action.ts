"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";
import { getEmailLogById } from "@/app/_db/email-logs";
import { resendStoredEmail } from "@/app/_lib/mailer";

/**
 * Re-send a previously logged email. Only SUCCESS rows are resendable: their
 * payload is the rendered HTML that was delivered. FAIL rows store an error
 * message, not a body, so there's nothing to re-send.
 */
export async function resendEmailLogAction(id: number) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return { success: false, error: "Tidak memiliki akses" };

  const log = await getEmailLogById(id);
  if (!log) return { success: false, error: "Log email tidak ditemukan" };
  if (log.status !== "SUCCESS") {
    return { success: false, error: "Hanya email yang berhasil terkirim yang dapat dikirim ulang" };
  }

  try {
    await resendStoredEmail(log.to, log.subject, log.payload);
    revalidatePath("/settings/email-logs");
    return { success: true };
  } catch {
    return { success: false, error: "Gagal mengirim email. Silakan coba lagi." };
  }
}
