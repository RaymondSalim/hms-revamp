"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/app/_components/data-table";
import { Modal } from "@/app/_components/modal";
import { upsertRoomTypeAction, deleteRoomTypeAction, upsertRoomTypeDurationAction } from "./room-type-action";
import { ActionMenu, Icons } from "@/app/_components/action-menu";
import { toast } from "react-toastify";

interface RoomTypeRow {
  id: number;
  type: string;
  description: string | null;
}

interface DurationRow {
  id: number;
  duration: string;
  month_count: number;
}

interface LocationRow {
  id: number;
  name: string;
}

interface RoomTypeDurationRow {
  room_type_id: number;
  duration_id: number;
  location_id: number;
  suggested_price: string | null;
}

interface Props {
  roomTypes: RoomTypeRow[];
  durations: DurationRow[];
  locations: LocationRow[];
  roomTypeDurations: RoomTypeDurationRow[];
}

export function RoomTypeTable({ roomTypes, durations, locations, roomTypeDurations }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RoomTypeRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<RoomTypeRow | null>(null);
  const [pricingModal, setPricingModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const openCreate = () => {
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEdit = (row: RoomTypeRow) => {
    setEditingRow(row);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      id: editingRow?.id,
      type: fd.get("type") as string,
      description: (fd.get("description") as string) || undefined,
    };
    const result = await upsertRoomTypeAction(payload);
    setLoading(false);
    if (result.success) {
      toast.success(editingRow ? "Tipe kamar berhasil diperbarui" : "Tipe kamar berhasil ditambahkan");
      setModalOpen(false);
      router.refresh();
    } else {
      toast.error("Gagal menyimpan tipe kamar");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);
    const result = await deleteRoomTypeAction(deleteConfirm.id);
    setLoading(false);
    if (result.success) {
      toast.success("Tipe kamar berhasil dihapus");
      setDeleteConfirm(null);
      router.refresh();
    } else {
      toast.error(result.error ?? "Gagal menghapus tipe kamar");
      setDeleteConfirm(null);
    }
  };

  const handlePriceSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const promises: Promise<{ success: boolean }>[] = [];
    for (const rt of roomTypes) {
      for (const dur of durations) {
        for (const loc of locations) {
          const key = `price_${rt.id}_${dur.id}_${loc.id}`;
          const val = fd.get(key) as string;
          const price = val ? parseFloat(val) : null;
          promises.push(
            upsertRoomTypeDurationAction({
              room_type_id: rt.id,
              duration_id: dur.id,
              location_id: loc.id,
              suggested_price: price,
            })
          );
        }
      }
    }
    await Promise.all(promises);
    setLoading(false);
    toast.success("Harga berhasil disimpan");
    setPricingModal(false);
    router.refresh();
  };

  const getPrice = (roomTypeId: number, durationId: number, locationId: number) => {
    const entry = roomTypeDurations.find(
      (rtd) => rtd.room_type_id === roomTypeId && rtd.duration_id === durationId && rtd.location_id === locationId
    );
    return entry?.suggested_price ?? "";
  };

  const columns: ColumnDef<RoomTypeRow, unknown>[] = [
    { accessorKey: "type", header: "Tipe" },
    {
      accessorKey: "description",
      header: "Deskripsi",
      cell: ({ getValue }) => (getValue() as string) || "-",
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
          Tipe Kamar
        </h1>
        <div className="flex gap-3">
          <button
            onClick={() => setPricingModal(true)}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
          >
            Atur Harga
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            + Tambah Tipe
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={roomTypes} searchPlaceholder="Cari tipe kamar..." />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRow ? "Edit Tipe Kamar" : "Tambah Tipe Kamar"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Tipe
            </label>
            <input
              name="type"
              defaultValue={editingRow?.type ?? ""}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
              Deskripsi
            </label>
            <input
              name="description"
              defaultValue={editingRow?.description ?? ""}
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
        title="Hapus Tipe Kamar"
        size="sm"
      >
        <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
          Apakah Anda yakin ingin menghapus tipe <strong>{deleteConfirm?.type}</strong>?
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

      {/* Pricing Grid Modal */}
      <Modal
        isOpen={pricingModal}
        onClose={() => setPricingModal(false)}
        title="Atur Harga Tipe Kamar per Durasi"
        size="lg"
      >
        <form onSubmit={handlePriceSave} className="space-y-4">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            {locations.map((loc) => (
              <div key={loc.id} className="mb-6">
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                  {loc.name}
                </h3>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left p-2 border" style={{ borderColor: "var(--color-border)" }}>
                        Tipe / Durasi
                      </th>
                      {durations.map((dur) => (
                        <th key={dur.id} className="text-center p-2 border" style={{ borderColor: "var(--color-border)" }}>
                          {dur.duration}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roomTypes.map((rt) => (
                      <tr key={rt.id}>
                        <td className="p-2 border font-medium" style={{ borderColor: "var(--color-border)" }}>
                          {rt.type}
                        </td>
                        {durations.map((dur) => (
                          <td key={dur.id} className="p-1 border" style={{ borderColor: "var(--color-border)" }}>
                            <input
                              name={`price_${rt.id}_${dur.id}_${loc.id}`}
                              type="number"
                              step="0.01"
                              defaultValue={getPrice(rt.id, dur.id, loc.id)}
                              className="w-full px-2 py-1 text-xs rounded border outline-none"
                              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
                              placeholder="0"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPricingModal(false)}
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
              {loading ? "Menyimpan..." : "Simpan Harga"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
