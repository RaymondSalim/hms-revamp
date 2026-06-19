import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { RolesManager } from "./roles-manager";

export default async function RolesPage() {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return <AccessDenied />;

  const roles = await prisma.role.findMany({
    include: { rolepermissions: { include: { permissions: true } } },
    orderBy: { id: "asc" },
  });

  const allPermissions = await prisma.permission.findMany({
    orderBy: { id: "asc" },
  });

  const serialized = roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissionIds: r.rolepermissions.map((rp) => rp.permission_id),
  }));

  const permissionList = allPermissions.map((p) => ({
    id: p.id,
    permission: p.permission,
  }));

  return <RolesManager roles={serialized} permissions={permissionList} />;
}
