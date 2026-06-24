"use server";

import { signIn, auth } from "@/app/_lib/auth";
import { loginSchema } from "@/app/_lib/zod/auth/zod";

export async function loginAction(formData: {
  email: string;
  password: string;
  rememberMe?: boolean;
}) {
  const parsed = loginSchema.safeParse(formData);
  if (!parsed.success) return { success: false as const, error: parsed.error.flatten() };

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      rememberMe: formData.rememberMe ? "true" : "false",
      redirect: false,
    });
    const session = await auth();
    return {
      success: true as const,
      redirectTo: session?.user?.shouldReset ? "/change-password" : "/dashboard",
    };
  } catch (error: unknown) {
    return {
      success: false as const,
      error: "Nama pengguna atau kata sandi tidak valid",
    };
  }
}
