"use server";

import bcrypt from "bcrypt";
import { getUserByEmail, updateUser } from "@/app/_db/site-users";
import { sendPasswordResetEmail } from "@/app/_lib/mailer";
import crypto from "crypto";

export async function resetPasswordAction(formData: { email: string }) {
  // Always return success (don't reveal if email exists)
  const user = await getUserByEmail(formData.email);
  if (!user) return { success: true as const };

  // 16 bytes = 128 bits of entropy (32 hex chars). The previous 4-byte token was
  // only 32 bits — brute-forceable. It is still emailed in cleartext as a
  // one-time password, but shouldReset forces the user to change it on first
  // login, so the window is a single sign-in. A full tokenized reset-link flow
  // (store a VerificationToken, email a link, set password behind it) is the
  // stronger design and is tracked as a follow-up.
  const newPassword = crypto.randomBytes(16).toString("hex");
  const hashed = await bcrypt.hash(newPassword, 10);
  await updateUser(user.id, { password: hashed, shouldReset: true });

  await sendPasswordResetEmail(user.email, newPassword);

  return { success: true as const };
}
