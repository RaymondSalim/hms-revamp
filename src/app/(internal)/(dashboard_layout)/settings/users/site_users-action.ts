"use server";

import { auth } from "@/app/_lib/auth";
import { createUser, updateUser, deleteUser } from "@/app/_db/site-users";
import bcrypt from "bcrypt";
import { revalidatePath } from "next/cache";

// BL-023: Only role_id=1 can manage users
async function checkAdmin() {
  const session = await auth();
  if (!session || session.user.role_id !== 1) {
    return { authorized: false as const };
  }
  return { authorized: true as const, session };
}

export async function upsertSiteUserAction(data: {
  id?: string;
  name: string;
  email: string;
  password?: string;
  role_id: number;
}) {
  const { authorized } = await checkAdmin();
  if (!authorized) return { success: false, error: "Unauthorized" };

  try {
    if (data.id) {
      const updateData: {
        name: string;
        email: string;
        role_id: number;
        password?: string;
        shouldReset?: boolean;
      } = { name: data.name, email: data.email, role_id: data.role_id };
      if (data.password) {
        updateData.password = await bcrypt.hash(data.password, 10);
        updateData.shouldReset = true;
      }
      await updateUser(data.id, updateData);
    } else {
      if (!data.password) return { success: false, error: "Password required for new user" };
      const hashedPassword = await bcrypt.hash(data.password, 10);
      await createUser({
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role_id: data.role_id,
      });
    }
    revalidatePath("/settings/users");
    return { success: true };
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { success: false, error: "Alamat email sudah terdaftar" };
    }
    return { success: false, error: "Error saving user" };
  }
}

export async function deleteUserAction(id: string) {
  const { authorized } = await checkAdmin();
  if (!authorized) return { success: false, error: "Unauthorized" };

  await deleteUser(id);
  revalidatePath("/settings/users");
  return { success: true };
}
