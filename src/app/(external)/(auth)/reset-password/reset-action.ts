"use server";

import bcrypt from "bcrypt";
import { getUserByEmail, updateUser } from "@/app/_db/site-users";
import { sendPasswordResetEmail } from "@/app/_lib/mailer";
import crypto from "crypto";

export async function resetPasswordAction(formData: { email: string }) {
  // Always return success (don't reveal if email exists)
  const user = await getUserByEmail(formData.email);
  if (!user) return { success: true as const };

  const newPassword = crypto.randomBytes(4).toString("hex"); // 8 chars
  const hashed = await bcrypt.hash(newPassword, 10);
  await updateUser(user.id, { password: hashed, shouldReset: true });

  await sendPasswordResetEmail(user.email, newPassword);

  return { success: true as const };
}
