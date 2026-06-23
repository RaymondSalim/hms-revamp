"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { AddonForm } from "./addon-form";
import { upsertAddonAction, deleteAddonAction } from "./addons-action";
import { formatCurrency } from "@/app/_lib/util/currency";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { toast } from "react-toastify";

interface PricingTier {
  id?: string;
  price: number | string;
  interval_start: number;
  interval_end: number | null;
  is_full_payment: boolean;
}

interface AddonRow {
  id: string;
  name: string;
  description: string | null;
  location_id: number | null;
  parent_addon_id: string | null;
  requires_input: boolean;
  pricing: PricingTier[];
  children: { id: string }[];
}

interface Props {
  addons: AddonRow[];
  locationId: number;
}

export function AddonTable({ addons, locationId }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AddonRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AddonRow | null>(null);
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: AddonRow) => {
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleSubmit = async (data: {
    id?: string;
    name: string;
    description?: string;
    location_id: number;
    parent_addon_id?: string;
    requires_input: boolean;
    pricing: Array<{
      id?: string;
      price: number;
      interval_start: number;
      interval_end: number | null;
      is_full_payment: boolean;
    }>;
  }) => {
    setLoading(true);
    const result = await upsertAddonAction(data);
    setLoading(false);
    if (result.success) {
      toast.success(editingRow ? "Add-on berhasil diperbarui" : "Add-on berhasil ditambahkan");
      setModalOpen(false);
      router.refresh();
    } else {
      toast.error("Gagal menyimpan add-on");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);
    const result = await deleteAddonAction(deleteConfirm.id);
    setLoading(false);
    if (result.success) {
      toast.success("Add-on berhasil dihapus");
      setDeleteConfirm(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Gagal menghapus add-on");
      setDeleteConfirm(null);
    }
  };

  const formatPricingTiers = (pricing: PricingTier[]) => {
    if (!pricing || pricing.length === 0) return "-";
    return pricing
      .sort((a, b) => a.interval_start - b.interval_start)
      .map((p) => {
        const end = p.interval_end !== null ? `${p.interval_end}` : "∞";
        const full = p.is_full_payment ? " (full)" : "";
        return `Bln ${p.interval_start}-${end}: ${formatCurrency(p.price)}${full}`;
      })
      .join("; ");
  };

  const existingAddons = addons.map((a) => ({ id: a.id, name: a.name }));

  const columns: ColumnDef<AddonRow, unknown>[] = [
    { accessorKey: "name", header: "Nama" },
    {
      accessorKey: "description",
      header: "Deskripsi",
      cell: ({ getValue }) => (getValue() as string) || "-",
    },
    {
      id: "pricing",
      header: "Tier Harga",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {formatPricingTiers(row.original.pricing)}
        </span>
      ),
    },
    {
      id: "children",
      header: "Punya Sub-item",
      cell: ({ row }) => (row.original.children?.length > 0 ? "Ya" : "Tidak"),
    },
    {
      accessorKey: "requires_input",
      header: "Perlu Input",
      cell: ({ getValue }) => (getValue() ? "Ya" : "Tidak"),
    },
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
          Add-ons
        </h1>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          + Tambah Add-on
        </button>
      </div>

      <DataTable columns={columns} data={addons} searchPlaceholder="Cari add-on..." />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRow ? "Edit Add-on" : "Tambah Add-on"}
        size="lg"
      >
        <AddonForm
          addon={editingRow}
          locationId={locationId}
          existingAddons={existingAddons}
          onSubmit={handleSubmit}
          onCancel={() => setModalOpen(false)}
          loading={loading}
        />
      </Modal>

      {/* Delete Confirm */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Hapus Add-on"
        size="sm"
      >
        <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
          Apakah Anda yakin ingin menghapus add-on <strong>{deleteConfirm?.name}</strong>?
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
