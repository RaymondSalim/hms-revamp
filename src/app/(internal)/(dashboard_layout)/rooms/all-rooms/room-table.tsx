"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { upsertRoomAction, deleteRoomAction } from "./room-action";
import { useLocation } from "@/app/_context/location-context";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { toast } from "react-toastify";
import { usePermissions } from "@/app/_context/permissions-context";
import { DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";

interface RoomRow {
  id: number;
  room_number: string;
  room_type_id: number | null;
  status_id: number | null;
  location_id: number | null;
  roomtypes: { id: number; type: string } | null;
  roomstatuses: { id: number; status: string } | null;
}

interface RoomTypeOption {
  id: number;
  type: string;
}

interface RoomStatusOption {
  id: number;
  status: string;
}

interface Props {
  rooms: RoomRow[];
  roomTypes: RoomTypeOption[];
  roomStatuses: RoomStatusOption[];
}

export function RoomTable({ rooms, roomTypes, roomStatuses }: Props) {
  const router = useRouter();
  const { selectedLocationId } = useLocation();
  const { can } = usePermissions();
  const canManage = can("rooms.manage");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RoomRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<RoomRow | null>(null);
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: RoomRow) => {
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      id: editingRow?.id,
      room_number: fd.get("room_number") as string,
      room_type_id: parseInt(fd.get("room_type_id") as string, 10),
      status_id: parseInt(fd.get("status_id") as string, 10),
      location_id: selectedLocationId!,
    };
    const result = await upsertRoomAction(payload);
    setLoading(false);
    if (result.success) {
      toast.success(editingRow ? "Kamar berhasil diperbarui" : "Kamar berhasil ditambahkan");
      setModalOpen(false);
      router.refresh();
    } else {
      toast.error(typeof result.error === "string" ? result.error : "Gagal menyimpan kamar");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);
    const result = await deleteRoomAction(deleteConfirm.id);
    setLoading(false);
    if (result.success) {
      toast.success("Kamar berhasil dihapus");
      setDeleteConfirm(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Gagal menghapus kamar");
      setDeleteConfirm(null);
    }
  };

  const columns: ColumnDef<RoomRow, unknown>[] = [
    { accessorKey: "room_number", header: "Nomor Kamar" },
    {
      id: "room_type",
      header: "Tipe Kamar",
      accessorFn: (row) => row.roomtypes?.type ?? "-",
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.roomstatuses?.status ?? "-",
    },
    {
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: ({ row }) => (
        <ActionMenu
          items={[
            { label: "Edit", icon: Icons.edit, onClick: () => openEdit(row.original), disabled: !canManage },
            { label: "Hapus", icon: Icons.delete, onClick: () => setDeleteConfirm(row.original), variant: "danger", disabled: !canManage },
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
          Semua Kamar
        </h1>
        <button
          onClick={openCreate}
          disabled={!canManage}
          title={canManage ? undefined : DEFAULT_DISABLED_REASON}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          + Tambah Kamar
        </button>
      </div>

      <DataTable columns={columns} data={rooms} searchPlaceholder="Cari kamar..." />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRow ? "Edit Kamar" : "Tambah Kamar"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Nomor Kamar
            </label>
            <input
              name="room_number"
              defaultValue={editingRow?.room_number ?? ""}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Tipe Kamar
            </label>
            <select
              name="room_type_id"
              defaultValue={editingRow?.room_type_id ?? ""}
              required
              className="w-full pl-3 pr-9 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
            >
              <option value="">Pilih tipe kamar</option>
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Status
            </label>
            <select
              name="status_id"
              defaultValue={editingRow?.status_id ?? ""}
              required
              className="w-full pl-3 pr-9 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
            >
              <option value="">Pilih status</option>
              {roomStatuses.map((rs) => (
                <option key={rs.id} value={rs.id}>
                  {rs.status}
                </option>
              ))}
            </select>
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
        title="Hapus Kamar"
        size="sm"
      >
        <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
          Apakah Anda yakin ingin menghapus kamar <strong>{deleteConfirm?.room_number}</strong>?
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
