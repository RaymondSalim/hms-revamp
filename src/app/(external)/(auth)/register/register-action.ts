"use server";

import bcrypt from "bcrypt";
import { createUser, getUserByEmail } from "@/app/_db/site-users";
import { registerSchema } from "@/app/_lib/zod/auth/zod";

export async function registerAction(formData: {
  name: string;
  email: string;
  password: string;
}) {
  const parsed = registerSchema.safeParse(formData);
  if (!parsed.success)
    return { success: false as const, error: parsed.error.flatten() };

  const existing = await getUserByEmail(parsed.data.email);
  if (existing)
    return { success: false as const, error: "Alamat email sudah terdaftar" };

  const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
  await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    password: hashedPassword,
    role_id: 4, // Default: Viewer
  });

  return { success: true as const };
}
