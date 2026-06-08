"use server";

import bcrypt from "bcrypt";
import { getUserByEmail, updateUser } from "@/app/_db/site-users";
import crypto from "crypto";

export async function resetPasswordAction(formData: { email: string }) {
  // Always return success (don't reveal if email exists)
  const user = await getUserByEmail(formData.email);
  if (!user) return { success: true as const };

  const newPassword = crypto.randomBytes(4).toString("hex"); // 8 chars
  const hashed = await bcrypt.hash(newPassword, 10);
  await updateUser(user.id, { password: hashed, shouldReset: true });

  // TODO: Send email with new password (Phase 20)
  // For now, just update the password
  return { success: true as const };
}
