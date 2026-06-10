"use server";

import { prisma } from "@/app/_lib/prisma";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/app/_lib/rbac";

export async function updateRolePermissionsAction(
  roleId: number,
  permissionIds: number[]
) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return { success: false, error: "Unauthorized" };

  await prisma.rolePermission.deleteMany({ where: { role_id: roleId } });

  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((pid) => ({
        role_id: roleId,
        permission_id: pid,
      })),
    });
  }

  revalidatePath("/settings/roles");
  return { success: true };
}
