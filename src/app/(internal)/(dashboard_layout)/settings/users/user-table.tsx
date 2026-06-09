"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { upsertSiteUserAction, deleteUserAction } from "./site_users-action";
import { ActionMenu, Icons } from "@/app/_components/action-menu";

interface SiteUser {
  id: string;
  name: string;
  email: string;
  role_id: number | null;
  roles: { id: number; name: string } | null;
}

const ROLES = [
  { id: 1, name: "Admin", color: "#DC2626", bg: "#FEE2E2" },
  { id: 2, name: "Manager", color: "#D97706", bg: "#FEF3C7" },
  { id: 3, name: "Staff", color: "#2563EB", bg: "#DBEAFE" },
  { id: 4, name: "Viewer", color: "#6B7280", bg: "#F3F4F6" },
];

function RoleBadge({ roleId }: { roleId: number | null }) {
  const role = ROLES.find((r) => r.id === roleId) ?? ROLES[3];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: role.bg, color: role.color }}
    >
      {role.name}
    </span>
  );
}

export function UserTable({ users }: { users: SiteUser[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SiteUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SiteUser | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setRoleId(3);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(user: SiteUser) {
    setEditingUser(user);
    setName(user.name);
    setEmail(user.email);
    setPassword("");
    setRoleId(user.role_id ?? 3);
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await upsertSiteUserAction({
      id: editingUser?.id,
      name,
      email,
      password: password || undefined,
      role_id: roleId,
    });

    if (result.success) {
      setModalOpen(false);
    } else {
      setError(result.error ?? "Terjadi kesalahan");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setLoading(true);
    await deleteUserAction(deleteConfirm.id);
    setDeleteConfirm(null);
    setLoading(false);
  }

  const columns: ColumnDef<SiteUser, unknown>[] = [
    {
      accessorKey: "name",
      header: "Nama",
      cell: ({ row }) => (
        <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span style={{ color: "var(--color-text-secondary)" }}>{row.original.email}</span>
      ),
    },
    {
      accessorKey: "role_id",
      header: "Role",
      cell: ({ row }) => <RoleBadge roleId={row.original.role_id} />,
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Icons.edit, onClick: () => openEdit(row.original) },
            { label: "Hapus", icon: Icons.delete, onClick: () => setDeleteConfirm(row.original), variant: "danger" },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--font-display), serif", color: "var(--color-text-primary)" }}
          >
            Manajemen Pengguna
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
            Kelola akun pengguna dan hak akses sistem
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 text-sm font-medium rounded-lg text-white transition-all duration-150"
          style={{ backgroundColor: "var(--color-accent)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          + Tambah Pengguna
        </button>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={users} searchPlaceholder="Cari pengguna..." />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? "Edit Pengguna" : "Tambah Pengguna"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--color-text-primary)" }}
            >
              Nama
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-focus)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194, 65, 12, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
              placeholder="Nama lengkap"
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--color-text-primary)" }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-focus)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194, 65, 12, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
              placeholder="email@contoh.com"
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--color-text-primary)" }}
            >
              {editingUser ? "Kata Sandi Baru (opsional)" : "Kata Sandi"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!editingUser}
              minLength={8}
              maxLength={32}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-focus)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194, 65, 12, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
              placeholder={editingUser ? "Kosongkan jika tidak ingin mengubah" : "Min. 8 karakter"}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--color-text-primary)" }}
            >
              Role
            </label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-focus)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(194, 65, 12, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="text-sm p-3 rounded-lg" style={{ color: "#DC2626", backgroundColor: "#FEE2E2" }}>
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors duration-150"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium rounded-lg text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {loading ? "Menyimpan..." : editingUser ? "Simpan Perubahan" : "Tambah Pengguna"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Hapus Pengguna"
        size="sm"
      >
        <div className="space-y-4">
          <p style={{ color: "var(--color-text-secondary)" }}>
            Apakah Anda yakin ingin menghapus pengguna{" "}
            <strong style={{ color: "var(--color-text-primary)" }}>{deleteConfirm?.name}</strong>?
            Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors duration-150"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium rounded-lg text-white transition-all duration-150 disabled:opacity-50"
              style={{ backgroundColor: "#DC2626" }}
            >
              {loading ? "Menghapus..." : "Hapus"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
