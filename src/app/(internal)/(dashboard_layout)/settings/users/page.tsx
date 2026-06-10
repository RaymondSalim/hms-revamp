import { getAllUsers } from "@/app/_db/site-users";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { UserTable } from "./user-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

type SerializedUser = {
  id: string;
  name: string;
  email: string;
  role_id: number | null;
  roles: { id: number; name: string } | null;
};

export default async function UsersPage() {
  const { authorized } = await checkPermission("users.view");
  if (!authorized) return <AccessDenied />;

  const users = await getAllUsers();
  const serializedUsers = serializeForClient(users) as unknown as SerializedUser[];

  return <UserTable users={serializedUsers} />;
}
