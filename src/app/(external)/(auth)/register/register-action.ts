"use server";

import bcrypt from "bcrypt";
import { createUser, getUserByEmail } from "@/app/_db/site-users";
import { getRegistrationEnabled } from "@/app/_db/settings";
import { registerSchema } from "@/app/_lib/zod/auth/zod";

export async function registerAction(formData: {
  name: string;
  email: string;
  password: string;
}) {
  // Self-registration is disabled by default and must be explicitly enabled by
  // an admin. Re-check on the server: the page also hides the form, but the
  // action is independently reachable over HTTP.
  if (!(await getRegistrationEnabled())) {
    return { success: false as const, error: "Pendaftaran sedang dinonaktifkan" };
  }

  const parsed = registerSchema.safeParse(formData);
  if (!parsed.success)
    return { success: false as const, error: parsed.error.flatten() };

  const existing = await getUserByEmail(parsed.data.email);
  if (existing)
    return { success: false as const, error: "Alamat email sudah terdaftar" };

  const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
  // No role is assigned on self-registration: the account can authenticate but
  // has zero permissions (getUserPermissions returns an empty set for a null
  // role_id) until an admin grants a role + location scope. This prevents a
  // public signup from gaining any data access.
  await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    password: hashedPassword,
    role_id: null,
  });

  return { success: true as const };
}
