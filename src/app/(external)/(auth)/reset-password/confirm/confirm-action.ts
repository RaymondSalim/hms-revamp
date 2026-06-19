"use server";

import bcrypt from "bcrypt";
import { prisma } from "@/app/_lib/prisma";
import { getUserByEmail } from "@/app/_db/site-users";
import { resetPasswordConfirmSchema } from "@/app/_lib/zod/auth/zod";
import { hashResetToken } from "@/app/_lib/util/reset-token";

export async function confirmResetAction(formData: {
  email: string;
  token: string;
  password: string;
  confirmPassword: string;
}) {
  const parsed = resetPasswordConfirmSchema.safeParse(formData);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError =
      fieldErrors.confirmPassword?.[0] ??
      fieldErrors.password?.[0] ??
      "Permintaan tidak valid";
    return { success: false as const, error: firstError };
  }

  // Generic message for every token failure (missing/expired/wrong) so we never
  // reveal whether a given email or token exists.
  const invalid = {
    success: false as const,
    error: "Tautan reset tidak valid atau telah kedaluwarsa",
  };

  const tokenHash = hashResetToken(parsed.data.token);
  const record = await prisma.verificationToken.findUnique({
    where: {
      identifier_token: { identifier: parsed.data.email, token: tokenHash },
    },
  });
  if (!record) return invalid;

  if (record.expires < new Date()) {
    // Expired: clean it up and reject.
    await prisma.verificationToken.delete({
      where: {
        identifier_token: { identifier: parsed.data.email, token: tokenHash },
      },
    });
    return invalid;
  }

  const user = await getUserByEmail(parsed.data.email);
  if (!user) return invalid;

  const hashed = await bcrypt.hash(parsed.data.password, 10);
  // Set the new password and consume the token in one transaction so the link
  // cannot be replayed. shouldReset stays false — the user chose this password.
  await prisma.$transaction([
    prisma.siteUser.update({
      where: { id: user.id },
      data: { password: hashed, shouldReset: false },
    }),
    prisma.verificationToken.deleteMany({
      where: { identifier: parsed.data.email },
    }),
  ]);

  return { success: true as const };
}
