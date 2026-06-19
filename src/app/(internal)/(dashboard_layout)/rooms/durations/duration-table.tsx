"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { upsertDurationAction, deleteDurationAction } from "./duration-action";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { toast } from "react-toastify";

interface DurationRow {
  id: number;
  duration: string;
  month_count: number;
}

export function DurationTable({ data }: { data: DurationRow[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DurationRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DurationRow | null>(null);
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: DurationRow) => {
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      id: editingRow?.id,
      duration: fd.get("duration") as string,
      month_count: parseInt(fd.get("month_count") as string, 10),
    };
    const result = await upsertDurationAction(payload);
    setLoading(false);
    if (result.success) {
      toast.success(editingRow ? "Durasi berhasil diperbarui" : "Durasi berhasil ditambahkan");
      setModalOpen(false);
    } else {
      toast.error("Gagal menyimpan durasi");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);
    const result = await deleteDurationAction(deleteConfirm.id);
    setLoading(false);
    if (result.success) {
      toast.success("Durasi berhasil dihapus");
      setDeleteConfirm(null);
    } else {
      toast.error(result.error ?? "Gagal menghapus durasi");
      setDeleteConfirm(null);
    }
  };

  const columns: ColumnDef<DurationRow, unknown>[] = [
    { accessorKey: "duration", header: "Durasi" },
    { accessorKey: "month_count", header: "Jumlah Bulan" },
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
          Durasi
        </h1>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          + Tambah Durasi
        </button>
      </div>

      <DataTable columns={columns} data={data} searchPlaceholder="Cari durasi..." />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRow ? "Edit Durasi" : "Tambah Durasi"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Label Durasi
            </label>
            <input
              name="duration"
              defaultValue={editingRow?.duration ?? ""}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
              placeholder="contoh: 1 Bulan"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Jumlah Bulan
            </label>
            <input
              name="month_count"
              type="number"
              min={1}
              defaultValue={editingRow?.month_count ?? ""}
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

      {/* Delete Confirm */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Hapus Durasi"
        size="sm"
      >
        <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
          Apakah Anda yakin ingin menghapus durasi <strong>{deleteConfirm?.duration}</strong>?
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
