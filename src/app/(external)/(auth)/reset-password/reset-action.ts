"use server";

import { prisma } from "@/app/_lib/prisma";
import { getUserByEmail } from "@/app/_db/site-users";
import { sendPasswordResetEmail } from "@/app/_lib/mailer";
import {
  generateResetToken,
  hashResetToken,
  getAppBaseUrl,
  RESET_TOKEN_TTL_MS,
} from "@/app/_lib/util/reset-token";

export async function resetPasswordAction(formData: { email: string }) {
  // Always return success so this endpoint never reveals which emails exist.
  const user = await getUserByEmail(formData.email);
  if (!user) return { success: true as const };

  // Issue a fresh single-use token. Only its hash is stored, so a leaked DB
  // cannot be used to reset anyone's password. Clearing prior tokens for this
  // email invalidates any earlier link the user may have requested.
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: { identifier: user.email },
    }),
    prisma.verificationToken.create({
      data: { identifier: user.email, token: tokenHash, expires },
    }),
  ]);

  const params = new URLSearchParams({ token, email: user.email });
  const resetLink = `${getAppBaseUrl()}/reset-password/confirm?${params.toString()}`;

  await sendPasswordResetEmail(user.email, resetLink);

  return { success: true as const };
}
