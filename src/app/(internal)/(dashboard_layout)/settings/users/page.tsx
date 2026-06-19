import { getAllUsers } from "@/app/_db/site-users";
import { getLocations } from "@/app/_db/locations";
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
  userLocations: { user_id: string; location_id: number }[];
};

type SerializedLocation = { id: number; name: string };

export default async function UsersPage() {
  const { authorized } = await checkPermission("users.view");
  if (!authorized) return <AccessDenied />;

  const [users, locations] = await Promise.all([getAllUsers(), getLocations()]);
  const serializedUsers = serializeForClient(users) as unknown as SerializedUser[];
  const serializedLocations = serializeForClient(locations) as unknown as SerializedLocation[];

  return <UserTable users={serializedUsers} locations={serializedLocations} />;
}
