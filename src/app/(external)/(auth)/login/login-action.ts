"use server";

import { signIn } from "@/app/_lib/auth";
import { loginSchema } from "@/app/_lib/zod/auth/zod";

export async function loginAction(formData: {
  email: string;
  password: string;
}) {
  const parsed = loginSchema.safeParse(formData);
  if (!parsed.success) return { success: false as const, error: parsed.error.flatten() };

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    return { success: true as const };
  } catch (error: unknown) {
    return {
      success: false as const,
      error: "Nama pengguna atau kata sandi tidak valid",
    };
  }
}
