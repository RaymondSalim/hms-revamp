"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { GuestForm } from "./guest-form";
import { deleteGuestAction, deleteGuestStayAction } from "./guest-action";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { toast } from "react-toastify";
import { formatCurrency } from "@/app/_lib/util/currency";

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

export function GuestTable({ data, bookings }: { data: GuestRow[]; bookings: BookingOption[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestRow | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const handleEdit = (guest: GuestRow) => {
    setEditingGuest(guest);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Yakin ingin menghapus tamu ini?")) return;
    const result = await deleteGuestAction(id);
    if (result.success) {
      toast.success("Tamu berhasil dihapus");
    } else {
      toast.error("Gagal menghapus tamu");
    }
  };

  const handleDeleteStay = async (stayId: number) => {
    if (!confirm("Yakin ingin menghapus masa tinggal ini?")) return;
    const result = await deleteGuestStayAction(stayId);
    if (result.success) {
      toast.success("Masa tinggal berhasil dihapus");
    } else {
      toast.error("Gagal menghapus masa tinggal");
    }
  };

  const toggleExpand = (guestId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) {
        next.delete(guestId);
      } else {
        next.add(guestId);
      }
      return next;
    });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingGuest(null);
  };

  const columns: ColumnDef<GuestRow, unknown>[] = [
    {
      id: "expand",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={() => toggleExpand(row.original.id)}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${expandedRows.has(row.original.id) ? "rotate-90" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      ),
      size: 40,
    },
    {
      accessorKey: "name",
      header: "Nama Tamu",
    },
    {
      id: "booking",
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
            { label: "Edit", icon: Icons.edit, onClick: () => handleEdit(row.original) },
            { label: "Hapus", icon: Icons.delete, onClick: () => handleDelete(row.original.id), variant: "danger" },
          ]}
        />
      ),
    },
  ];

  // Flatten data for rendering with expansion
  const renderExpandedRow = (guest: GuestRow) => {
    if (!expandedRows.has(guest.id) || guest.GuestStay.length === 0) return null;
    return (
      <tr key={`expanded-${guest.id}`}>
        <td
          colSpan={columns.length}
          className="px-4 py-3"
          style={{ backgroundColor: "var(--color-bg-primary)" }}
        >
          <div className="ml-10">
            <h4
              className="text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Riwayat Masa Tinggal
            </h4>
            <div className="space-y-2">
              {guest.GuestStay.map((stay) => (
                <div
                  key={stay.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-card)",
                  }}
                >
                  <div className="flex items-center gap-4 text-sm">
                    <span style={{ color: "var(--color-text-primary)" }}>
                      {new Date(stay.start_date).toLocaleDateString("id-ID")} -{" "}
                      {new Date(stay.end_date).toLocaleDateString("id-ID")}
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
          </div>
        </td>
      </tr>
    );
  };

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
          + Tambah Tamu
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Cari tamu..."
      />

      {/* Render expanded rows manually below the table */}
      {data.some((g) => expandedRows.has(g.id)) && (
        <div className="mt-4 space-y-3">
          {data.map((guest) => {
            if (!expandedRows.has(guest.id) || guest.GuestStay.length === 0) return null;
            return (
              <div
                key={`expand-panel-${guest.id}`}
                className="rounded-xl border p-4"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg-primary)",
                }}
              >
                <h4
                  className="text-sm font-semibold mb-3"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Masa Tinggal - {guest.name}
                </h4>
                <div className="space-y-2">
                  {guest.GuestStay.map((stay) => (
                    <div
                      key={stay.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-bg-card)",
                      }}
                    >
                      <div className="flex items-center gap-4 text-sm">
                        <span style={{ color: "var(--color-text-primary)" }}>
                          {new Date(stay.start_date).toLocaleDateString("id-ID")} -{" "}
                          {new Date(stay.end_date).toLocaleDateString("id-ID")}
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
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingGuest ? "Edit Tamu" : "Tambah Tamu"}
        size="lg"
      >
        <GuestForm
          guest={editingGuest}
          bookings={bookings}
          onSuccess={handleCloseModal}
        />
      </Modal>
    </>
  );
}

// Keep the renderExpandedRow export for potential future use
export { };
