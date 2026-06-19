"use server";

import { auth } from "@/app/_lib/auth";
import { updateUser } from "@/app/_db/site-users";
import { changePasswordSchema } from "@/app/_lib/zod/settings/zod";
import bcrypt from "bcrypt";

export async function changePasswordAction(data: { password: string; confirmPassword: string }) {
  const session = await auth();
  if (!session) return { success: false, error: "Unauthorized" };

  const parsed = changePasswordSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError =
      fieldErrors.confirmPassword?.[0] ?? fieldErrors.password?.[0] ?? "Validasi gagal";
    return { success: false, error: firstError };
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10);
  await updateUser(session.user.id, { password: hashed, shouldReset: false });

  return { success: true };
}
