"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { TenantForm } from "./tenant-form";
import { deleteTenantAction } from "./tenant-action";
import { ActionMenu, Icons, DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";
import { useConfirm } from "@/app/_components/confirm-dialog";
import { toast } from "react-toastify";
import { usePermissions } from "@/app/_context/permissions-context";

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

export function TenantTable({ data, editId }: { data: TenantRow[]; editId?: string }) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canManage = can("tenants.manage");

  useEffect(() => {
    if (editId) {
      const tenant = data.find((t) => t.id === editId);
      if (tenant) {
        setEditingTenant(tenant);
        setIsModalOpen(true);
      }
    }
  }, [editId, data]);

  const handleEdit = (tenant: TenantRow) => {
    setEditingTenant(tenant);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ message: "Yakin ingin menghapus penghuni ini?", danger: true }))) return;
    const result = await deleteTenantAction(id);
    if (result.success) {
      toast.success("Penghuni berhasil dihapus");
      router.refresh();
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
      cell: ({ row }) => (
        <Link
          href={`/residents/tenants/${row.original.id}`}
          className="hover:underline font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          {row.original.name}
        </Link>
      ),
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
        <ActionMenu
          items={[
            { label: "Detail", icon: Icons.detail, onClick: () => { window.location.href = `/residents/tenants/${row.original.id}`; } },
            { label: "Edit", icon: Icons.edit, onClick: () => handleEdit(row.original), disabled: !canManage, disabledReason: DEFAULT_DISABLED_REASON },
            { label: "Hapus", icon: Icons.delete, onClick: () => handleDelete(row.original.id), variant: "danger", disabled: !canManage, disabledReason: DEFAULT_DISABLED_REASON },
          ]}
          maxInline={3}
        />
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
          disabled={!canManage}
          title={canManage ? undefined : DEFAULT_DISABLED_REASON}
          className="px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
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
          onSuccess={() => { handleCloseModal(); router.refresh(); }}
        />
      </Modal>
    </>
  );
}
