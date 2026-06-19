"use client";

import { useState, useTransition } from "react";
import { updateRolePermissionsAction } from "./roles-action";

interface Role {
  id: number;
  name: string;
  description: string | null;
  permissionIds: number[];
}

interface PermissionItem {
  id: number;
  permission: string;
}

const PERMISSION_GROUPS: Record<string, string> = {
  dashboard: "Dashboard",
  bookings: "Pemesanan",
  bills: "Tagihan",
  payments: "Pembayaran",
  deposits: "Deposit",
  tenants: "Penyewa",
  guests: "Tamu",
  rooms: "Kamar",
  room_types: "Tipe Kamar",
  durations: "Durasi",
  addons: "Add-on",
  financials: "Keuangan",
  calendar: "Kalender",
  locations: "Lokasi",
  users: "Pengguna",
  roles: "Role",
};

function groupPermissions(permissions: PermissionItem[]) {
  const groups: Record<string, PermissionItem[]> = {};
  for (const p of permissions) {
    const parts = p.permission.split(".");
    const group = parts.slice(0, -1).join("_");
    if (!groups[group]) groups[group] = [];
    groups[group].push(p);
  }
  return groups;
}

export function RolesManager({
  roles,
  permissions,
}: {
  roles: Role[];
  permissions: PermissionItem[];
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<number>(roles[0]?.id ?? 0);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => {
    const role = roles.find((r) => r.id === roles[0]?.id);
    return new Set(role?.permissionIds ?? []);
  });
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const grouped = groupPermissions(permissions);
  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  function handleRoleChange(roleId: number) {
    setSelectedRoleId(roleId);
    const role = roles.find((r) => r.id === roleId);
    setCheckedIds(new Set(role?.permissionIds ?? []));
    setSaved(false);
  }

  function togglePermission(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  function toggleGroup(groupPerms: PermissionItem[]) {
    const allChecked = groupPerms.every((p) => checkedIds.has(p.id));
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const p of groupPerms) {
        if (allChecked) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateRolePermissionsAction(
        selectedRoleId,
        [...checkedIds]
      );
      if (result.success) setSaved(true);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Kelola Hak Akses
        </h1>
      </div>

      <div className="flex gap-6">
        {/* Role selector */}
        <div className="w-56 flex-shrink-0 space-y-2">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => handleRoleChange(role.id)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                selectedRoleId === role.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              style={{
                backgroundColor:
                  selectedRoleId === role.id ? "var(--color-bg-accent)" : "var(--color-bg-secondary)",
              }}
            >
              <p className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>
                {role.name}
              </p>
              {role.description && (
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  {role.description}
                </p>
              )}
            </button>
          ))}
        </div>

        {/* Permissions grid */}
        <div className="flex-1 rounded-lg border p-6" style={{ backgroundColor: "var(--color-bg-secondary)", borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {selectedRole?.name ?? ""}
            </h2>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="text-sm text-green-600 font-medium">Tersimpan</span>
              )}
              <button
                onClick={handleSave}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {isPending ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(grouped).map(([group, perms]) => {
              const allChecked = perms.every((p) => checkedIds.has(p.id));
              const someChecked = perms.some((p) => checkedIds.has(p.id));
              return (
                <div
                  key={group}
                  className="border rounded-lg p-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked && !allChecked;
                      }}
                      onChange={() => toggleGroup(perms)}
                      className="rounded"
                    />
                    <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {PERMISSION_GROUPS[group] ?? group}
                    </span>
                  </label>
                  <div className="space-y-1 ml-6">
                    {perms.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checkedIds.has(p.id)}
                          onChange={() => togglePermission(p.id)}
                          className="rounded"
                        />
                        <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          {p.permission.split(".").pop()}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
