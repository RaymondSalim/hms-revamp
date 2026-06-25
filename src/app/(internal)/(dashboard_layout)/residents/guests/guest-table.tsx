"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { ServerDataTable } from "@/app/_components/server-data-table";
import { Modal } from "@/app/_components/modal";
import { GuestForm } from "./guest-form";
import { deleteGuestAction, deleteGuestStayAction } from "./guest-action";
import { ActionMenu, Icons, DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";
import { useConfirm } from "@/app/_components/confirm-dialog";
import { toast } from "react-toastify";
import { formatCurrency } from "@/app/_lib/util/currency";
import { usePermissions } from "@/app/_context/permissions-context";

export interface GuestStayRow {
  id: number;
  guest_id: number;
  start_date: string;
  end_date: string;
  daily_fee: string;
}

export interface GuestRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  booking_id: number;
  GuestStay: GuestStayRow[];
  booking: {
    id: number;
    rooms: { id: number; room_number: string } | null;
    tenants: { id: string; name: string } | null;
  };
}

export interface BookingOption {
  id: number;
  rooms: { id: number; room_number: string } | null;
  tenants: { id: string; name: string } | null;
}

export function GuestTable({
  data,
  bookings,
  total,
  page,
  pageSize,
  pageCount,
  search,
  sortBy,
  sortDir,
}: {
  data: GuestRow[];
  bookings: BookingOption[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  search: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
}) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestRow | null>(null);
  const [detailGuest, setDetailGuest] = useState<GuestRow | null>(null);
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canManage = can("guests.manage");

  const handleEdit = (guest: GuestRow) => {
    setEditingGuest(guest);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm({ message: "Yakin ingin menghapus tamu ini?", danger: true }))) return;
    const result = await deleteGuestAction(id);
    if (result.success) {
      toast.success("Tamu berhasil dihapus");
      router.refresh();
    } else {
      toast.error("Gagal menghapus tamu");
    }
  };

  const handleDeleteStay = async (stayId: number) => {
    if (!(await confirm({ message: "Yakin ingin menghapus masa tinggal ini?", danger: true }))) return;
    const result = await deleteGuestStayAction(stayId);
    if (result.success) {
      toast.success("Masa tinggal berhasil dihapus");
      router.refresh();
    } else {
      toast.error("Gagal menghapus masa tinggal");
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingGuest(null);
  };

  const columns: ColumnDef<GuestRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Nama Tamu",
    },
    {
      id: "room",
      header: "Booking (Kamar)",
      cell: ({ row }) => {
        const room = row.original.booking?.rooms;
        const tenant = row.original.booking?.tenants;
        return (
          <span>
            {room ? `Kamar ${room.room_number}` : "-"}
            {tenant ? ` (${tenant.name})` : ""}
          </span>
        );
      },
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ getValue }) => (getValue() as string) || "-",
    },
    {
      accessorKey: "phone",
      header: "Telepon",
      cell: ({ getValue }) => (getValue() as string) || "-",
    },
    {
      id: "stays",
      header: "Masa Tinggal",
      cell: ({ row }) => (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: "var(--color-accent-light)",
            color: "var(--color-accent)",
          }}
        >
          {row.original.GuestStay.length}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => (
        <ActionMenu
          items={[
            ...(row.original.GuestStay.length > 0
              ? [{ label: "Detail", icon: Icons.detail, onClick: () => setDetailGuest(row.original) }]
              : []),
            { label: "Edit", icon: Icons.edit, onClick: () => handleEdit(row.original), disabled: !canManage, disabledReason: DEFAULT_DISABLED_REASON },
            { label: "Hapus", icon: Icons.delete, onClick: () => handleDelete(row.original.id), variant: "danger" as const, disabled: !canManage, disabledReason: DEFAULT_DISABLED_REASON },
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
          style={{
            fontFamily: "var(--font-display), serif",
            color: "var(--color-text-primary)",
          }}
        >
          Tamu
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
          + Tambah Tamu
        </button>
      </div>

      <ServerDataTable
        columns={columns}
        data={data}
        searchPlaceholder="Cari tamu..."
        total={total}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        sortableColumns={["name", "email", "phone", "room"]}
      />

      {/* Guest Stay Detail Modal */}
      <Modal
        isOpen={!!detailGuest}
        onClose={() => setDetailGuest(null)}
        title={`Masa Tinggal - ${detailGuest?.name ?? ""}`}
        size="md"
      >
        {detailGuest && (
          <div className="space-y-2">
            {detailGuest.GuestStay.map((stay) => (
              <div
                key={stay.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg-primary)",
                }}
              >
                <div className="flex items-center gap-4 text-sm">
                  <span style={{ color: "var(--color-text-primary)" }}>
                    {new Date(stay.start_date).toLocaleDateString("id-ID", { timeZone: "UTC" })} -{" "}
                    {new Date(stay.end_date).toLocaleDateString("id-ID", { timeZone: "UTC" })}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {formatCurrency(stay.daily_fee)}/hari
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteStay(stay.id)}
                  className="px-2 py-1 text-xs font-medium rounded transition-colors"
                  style={{ color: "#DC2626" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#FEF2F2";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingGuest ? "Edit Tamu" : "Tambah Tamu"}
        size="lg"
      >
        <GuestForm
          guest={editingGuest}
          bookings={bookings}
          onSuccess={() => { handleCloseModal(); router.refresh(); }}
        />
      </Modal>
    </>
  );
}
