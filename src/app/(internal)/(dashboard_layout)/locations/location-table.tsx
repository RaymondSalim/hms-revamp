"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { upsertLocationAction, deleteLocationAction } from "./location-action";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { toast } from "react-toastify";

interface LocationRow {
  id: number;
  name: string;
  address: string;
}

export function LocationTable({ data }: { data: LocationRow[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<LocationRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<LocationRow | null>(null);
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: LocationRow) => {
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      id: editingRow?.id,
      name: fd.get("name") as string,
      address: fd.get("address") as string,
    };
    const result = await upsertLocationAction(payload);
    setLoading(false);
    if (result.success) {
      toast.success(editingRow ? "Lokasi berhasil diperbarui" : "Lokasi berhasil ditambahkan");
      setModalOpen(false);
    } else {
      toast.error("Gagal menyimpan lokasi");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);
    const result = await deleteLocationAction(deleteConfirm.id);
    setLoading(false);
    if (result.success) {
      toast.success("Lokasi berhasil dihapus");
      setDeleteConfirm(null);
    } else {
      toast.error(result.error ?? "Gagal menghapus lokasi");
      setDeleteConfirm(null);
    }
  };

  const columns: ColumnDef<LocationRow, unknown>[] = [
    { accessorKey: "name", header: "Nama" },
    { accessorKey: "address", header: "Alamat" },
    {
      id: "actions",
      header: "Aksi",
      enableSorting: false,
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
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display), serif", color: "var(--color-text-primary)" }}
        >
          Lokasi
        </h1>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          + Tambah Lokasi
        </button>
      </div>

      <DataTable columns={columns} data={data} searchPlaceholder="Cari lokasi..." />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRow ? "Edit Lokasi" : "Tambah Lokasi"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Nama Lokasi
            </label>
            <input
              name="name"
              defaultValue={editingRow?.name ?? ""}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Alamat
            </label>
            <input
              name="address"
              defaultValue={editingRow?.address ?? ""}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Hapus Lokasi"
        size="sm"
      >
        <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
          Apakah Anda yakin ingin menghapus lokasi <strong>{deleteConfirm?.name}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteConfirm(null)}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
          >
            Batal
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "#DC2626" }}
          >
            {loading ? "Menghapus..." : "Hapus"}
          </button>
        </div>
      </Modal>
    </>
  );
}
