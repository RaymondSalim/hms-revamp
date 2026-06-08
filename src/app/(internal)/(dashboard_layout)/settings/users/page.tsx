import { auth } from "@/app/_lib/auth";
import { getAllUsers } from "@/app/_db/site-users";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { UserTable } from "./user-table";

type SerializedUser = {
  id: string;
  name: string;
  email: string;
  role_id: number | null;
  roles: { id: number; name: string } | null;
};

export default async function UsersPage() {
  const session = await auth();

  if (!session || session.user.role_id !== 1) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div
          className="text-center p-8 rounded-2xl border"
          style={{
            backgroundColor: "var(--color-bg-card)",
            borderColor: "var(--color-border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#FEE2E2" }}
          >
            <svg
              className="w-8 h-8"
              viewBox="0 0 20 20"
              fill="#DC2626"
            >
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h2
            className="text-xl font-semibold mb-2"
            style={{ fontFamily: "var(--font-display), serif", color: "var(--color-text-primary)" }}
          >
            Akses Ditolak
          </h2>
          <p style={{ color: "var(--color-text-secondary)" }}>
            Anda tidak memiliki izin untuk mengakses halaman ini.
          </p>
        </div>
      </div>
    );
  }

  const users = await getAllUsers();
  const serializedUsers = serializeForClient(users) as unknown as SerializedUser[];

  return <UserTable users={serializedUsers} />;
}
