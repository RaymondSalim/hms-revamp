"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { TenantForm } from "./tenant-form";
import { deleteTenantAction } from "./tenant-action";
import { toast } from "react-toastify";

export interface TenantRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  id_number: string;
  current_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  referral_source: string | null;
  id_file: string | null;
  family_certificate_file: string | null;
  second_resident_name: string | null;
  second_resident_email: string | null;
  second_resident_phone: string | null;
  second_resident_id_number: string | null;
  second_resident_id_file: string | null;
  second_resident_relation: string | null;
}

export function TenantTable({ data }: { data: TenantRow[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);

  const handleEdit = (tenant: TenantRow) => {
    setEditingTenant(tenant);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus penghuni ini?")) return;
    const result = await deleteTenantAction(id);
    if (result.success) {
      toast.success("Penghuni berhasil dihapus");
    } else {
      toast.error("Gagal menghapus penghuni");
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTenant(null);
  };

  const columns: ColumnDef<TenantRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Nama",
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ getValue }) => getValue() || "-",
    },
    {
      accessorKey: "phone",
      header: "Telepon",
      cell: ({ getValue }) => getValue() || "-",
    },
    {
      accessorKey: "id_number",
      header: "No. Identitas",
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(row.original)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150"
            style={{
              color: "var(--color-accent)",
              backgroundColor: "var(--color-accent-light)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-accent)";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-accent-light)";
              e.currentTarget.style.color = "var(--color-accent)";
            }}
          >
            Edit
          </button>
          <button
            onClick={() => handleDelete(row.original.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150"
            style={{
              color: "#DC2626",
              backgroundColor: "#FEF2F2",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#DC2626";
              e.currentTarget.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FEF2F2";
              e.currentTarget.style.color = "#DC2626";
            }}
          >
            Hapus
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-semibold"
          style={{
            fontFamily: "var(--font-display), serif",
            color: "var(--color-text-primary)",
          }}
        >
          Penghuni
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          + Tambah Penghuni
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Cari penghuni..."
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTenant ? "Edit Penghuni" : "Tambah Penghuni"}
        size="lg"
      >
        <TenantForm
          tenant={editingTenant}
          onSuccess={handleCloseModal}
        />
      </Modal>
    </>
  );
}
