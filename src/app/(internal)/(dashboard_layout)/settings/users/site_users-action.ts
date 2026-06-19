"use server";

import { createUser, updateUser, deleteUser, setUserLocations } from "@/app/_db/site-users";
import bcrypt from "bcrypt";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";

export async function upsertSiteUserAction(data: {
  id?: string;
  name: string;
  email: string;
  password?: string;
  role_id: number;
  location_ids: number[];
}) {
  const { authorized } = await checkPermission("users.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  try {
    let userId: string;
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
      userId = data.id;
    } else {
      if (!data.password) return { success: false, error: "Password required for new user" };
      const hashedPassword = await bcrypt.hash(data.password, 10);
      const created = await createUser({
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role_id: data.role_id,
      });
      userId = created.id;
    }
    await setUserLocations(userId, data.location_ids);
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
  const { authorized } = await checkPermission("users.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  await deleteUser(id);
  revalidatePath("/settings/users");
  return { success: true };
}
