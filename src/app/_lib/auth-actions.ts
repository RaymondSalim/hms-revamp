"use server";

import { signOut } from "@/app/_lib/auth";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
