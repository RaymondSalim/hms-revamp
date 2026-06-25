"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ServerDataTable } from "@/app/_components/server-data-table";
import { Modal } from "@/app/_components/modal";
import { formatCurrency } from "@/app/_lib/util/currency";
import {
  createBillAction,
  updateBillDueDateAction,
  addBillItemAction,
  updateBillItemAction,
  deleteBillItemAction,
  resendBillEmailAction,
} from "./bill-action";
import { ActionMenu, Icons, DEFAULT_DISABLED_REASON } from "@/app/_components/action-menu";
import { toast } from "react-toastify";
import { usePermissions } from "@/app/_context/permissions-context";

// --- Types ---

interface BillItemRow {
  id: number;
  bill_id: number;
  description: string;
  amount: string;
  internal_description: string | null;
  type: "GENERATED" | "CREATED";
}

interface PaymentBillRow {
  id: number;
  payment_id: number;
  bill_id: number;
  amount: string;
}

interface BillRow {
  id: number;
  booking_id: number;
  description: string;
  due_date: string;
  invoice_number: string | null;
  bill_item: BillItemRow[];
  paymentBills: PaymentBillRow[];
  bookings: {
    id: number;
    tenants: { id: string; name: string } | null;
    rooms: { id: number; room_number: string } | null;
  };
}

interface Props {
  bills: BillRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  search: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
}

// --- Helpers ---

function TypeBadge({ type }: { type: "GENERATED" | "CREATED" }) {
  const isGenerated = type === "GENERATED";
  return (
    <span
      className="px-2 py-0.5 text-xs font-medium rounded-full"
      style={{
        backgroundColor: isGenerated ? "#F3F4F6" : "#DBEAFE",
        color: isGenerated ? "#6B7280" : "#2563EB",
      }}
    >
      {isGenerated ? "Auto" : "Manual"}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  // due_date is a @db.Date stored at midnight UTC; format in UTC so the
  // displayed calendar day matches what was stored regardless of client TZ.
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// --- Main Component ---

export function BillTable({
  bills,
  total,
  page,
  pageSize,
  pageCount,
  search,
  sortBy,
  sortDir,
}: Props) {
  const [expandedBillId, setExpandedBillId] = useState<number | null>(null);
  const [editBillModal, setEditBillModal] = useState<BillRow | null>(null);
  const [editItemModal, setEditItemModal] = useState<BillItemRow | null>(null);
  const [deleteItemConfirm, setDeleteItemConfirm] =
    useState<BillItemRow | null>(null);
  const [createBillModal, setCreateBillModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [dueDateValue, setDueDateValue] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemInternal, setItemInternal] = useState("");

  // Create bill form states
  const [newBillBookingId, setNewBillBookingId] = useState("");
  const [newBillDescription, setNewBillDescription] = useState("");
  const [newBillDueDate, setNewBillDueDate] = useState("");
  const [newBillItems, setNewBillItems] = useState<
    Array<{ description: string; amount: string; internal_description: string }>
  >([{ description: "", amount: "", internal_description: "" }]);

  const { can } = usePermissions();
  const canManage = can("bills.manage");

  const handleUpdateDueDate = async () => {
    if (!editBillModal || !dueDateValue) return;
    setLoading(true);
    const result = await updateBillDueDateAction(
      editBillModal.id,
      new Date(dueDateValue)
    );
    setLoading(false);
    if (result.success) {
      toast.success("Tanggal jatuh tempo berhasil diperbarui");
    } else {
      toast.error(result.error ?? "Gagal memperbarui tanggal");
    }
  };

  const handleAddItem = async () => {
    if (!editBillModal || !itemDesc || !itemAmount) return;
    setLoading(true);
    const result = await addBillItemAction(editBillModal.id, {
      description: itemDesc,
      amount: parseFloat(itemAmount),
      internal_description: itemInternal || undefined,
    });
    setLoading(false);
    if (result.success) {
      toast.success("Item tagihan berhasil ditambahkan");
      resetItemForm();
    } else {
      toast.error(result.error ?? "Gagal menambahkan item");
    }
  };

  const handleEditItem = async () => {
    if (!editItemModal || !itemDesc || !itemAmount) return;
    setLoading(true);
    const result = await updateBillItemAction(editItemModal.id, {
      description: itemDesc,
      amount: parseFloat(itemAmount),
      internal_description: itemInternal || undefined,
    });
    setLoading(false);
    if (result.success) {
      toast.success("Item tagihan berhasil diperbarui");
      setEditItemModal(null);
      resetItemForm();
    } else {
      toast.error(result.error ?? "Gagal memperbarui item");
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItemConfirm) return;
    setLoading(true);
    const result = await deleteBillItemAction(deleteItemConfirm.id);
    setLoading(false);
    if (result.success) {
      toast.success("Item tagihan berhasil dihapus");
      setDeleteItemConfirm(null);
    } else {
      toast.error(result.error ?? "Gagal menghapus item");
    }
  };

  const handleCreateBill = async () => {
    if (!newBillBookingId || !newBillDescription || !newBillDueDate) return;
    const validItems = newBillItems.filter(
      (i) => i.description && i.amount
    );
    if (validItems.length === 0) {
      toast.error("Minimal satu item harus diisi");
      return;
    }
    setLoading(true);
    const result = await createBillAction({
      booking_id: parseInt(newBillBookingId, 10),
      description: newBillDescription,
      due_date: new Date(newBillDueDate),
      items: validItems.map((i) => ({
        description: i.description,
        amount: parseFloat(i.amount),
        internal_description: i.internal_description || undefined,
      })),
    });
    setLoading(false);
    if (result.success) {
      toast.success("Tagihan berhasil dibuat");
      setCreateBillModal(false);
      resetCreateForm();
    } else {
      toast.error("Gagal membuat tagihan");
    }
  };

  const resetItemForm = () => {
    setItemDesc("");
    setItemAmount("");
    setItemInternal("");
  };

  const resetCreateForm = () => {
    setNewBillBookingId("");
    setNewBillDescription("");
    setNewBillDueDate("");
    setNewBillItems([{ description: "", amount: "", internal_description: "" }]);
  };

  const openEditItem = (item: BillItemRow) => {
    setEditItemModal(item);
    setItemDesc(item.description);
    setItemAmount(String(Number(item.amount)));
    setItemInternal(item.internal_description ?? "");
  };

  const columns: ColumnDef<BillRow, unknown>[] = [
    {
      id: "invoice_number",
      header: "No. Invoice",
      accessorFn: (row) => row.invoice_number ?? "-",
      cell: ({ row }) => (
        <span
          className="text-sm font-mono"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {row.original.invoice_number ?? "-"}
        </span>
      ),
    },
    {
      id: "room_tenant",
      header: "Kamar / Penyewa",
      accessorFn: (row) =>
        `${row.bookings.rooms?.room_number ?? "-"} - ${row.bookings.tenants?.name ?? "-"}`,
      cell: ({ row }) => (
        <div>
          <div
            className="font-medium text-sm"
            style={{ color: "var(--color-text-primary)" }}
          >
            {row.original.bookings.rooms?.room_number ?? "-"}
          </div>
          <div
            className="text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {row.original.bookings.tenants?.name ?? "-"}
          </div>
        </div>
      ),
    },
    {
      id: "description",
      header: "Deskripsi",
      accessorKey: "description",
    },
    {
      id: "due_date",
      header: "Jatuh Tempo",
      accessorFn: (row) => row.due_date,
      cell: ({ row }) => formatDate(row.original.due_date),
    },
    {
      id: "total",
      header: "Total",
      accessorFn: (row) =>
        row.bill_item.reduce((s, i) => s + Number(i.amount), 0),
      cell: ({ row }) => {
        const total = row.original.bill_item.reduce(
          (s, i) => s + Number(i.amount),
          0
        );
        return formatCurrency(total);
      },
    },
    {
      id: "paid",
      header: "Dibayar",
      accessorFn: (row) =>
        row.paymentBills.reduce((s, p) => s + Number(p.amount), 0),
      cell: ({ row }) => {
        const paid = row.original.paymentBills.reduce(
          (s, p) => s + Number(p.amount),
          0
        );
        return formatCurrency(paid);
      },
    },
    {
      id: "outstanding",
      header: "Sisa",
      accessorFn: (row) => {
        const total = row.bill_item.reduce((s, i) => s + Number(i.amount), 0);
        const paid = row.paymentBills.reduce(
          (s, p) => s + Number(p.amount),
          0
        );
        return total - paid;
      },
      cell: ({ row }) => {
        const total = row.original.bill_item.reduce(
          (s, i) => s + Number(i.amount),
          0
        );
        const paid = row.original.paymentBills.reduce(
          (s, p) => s + Number(p.amount),
          0
        );
        const outstanding = total - paid;
        return (
          <span
            style={{
              color: outstanding > 0 ? "#DC2626" : "#059669",
              fontWeight: 600,
            }}
          >
            {formatCurrency(outstanding)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: ({ row }) => (
        <ActionMenu
          items={[
            {
              label: "Detail",
              icon: Icons.detail,
              onClick: () => setExpandedBillId(row.original.id),
            },
            {
              label: "Unduh Invoice",
              icon: Icons.download,
              onClick: () =>
                window.open(`/api/bills/${row.original.id}/pdf`, "_blank"),
            },
            {
              label: "Edit",
              icon: Icons.edit,
              onClick: () => { setEditBillModal(row.original); setDueDateValue(row.original.due_date.split("T")[0]); resetItemForm(); },
              disabled: !canManage,
            },
            {
              label: "Kirim Email",
              icon: Icons.email,
              onClick: async () => {
                const result = await resendBillEmailAction(row.original.id);
                if (result.success) {
                  toast.success("Email tagihan berhasil dikirim");
                } else {
                  toast.error(result.error ?? "Gagal mengirim email");
                }
              },
              disabled: !canManage,
            },
          ]}
          maxInline={2}
        />
      ),
    },
  ];

  // Find the expanded bill for detail rendering
  const expandedBill = bills.find((b) => b.id === expandedBillId);

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
          Tagihan
        </h1>
        <button
          onClick={() => setCreateBillModal(true)}
          disabled={!canManage}
          title={canManage ? undefined : DEFAULT_DISABLED_REASON}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          + Tambah Tagihan
        </button>
      </div>

      <ServerDataTable
        columns={columns}
        data={bills}
        total={total}
        page={page}
        pageSize={pageSize}
        pageCount={pageCount}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        sortableColumns={["due_date", "description", "invoice_number", "room_tenant"]}
        searchPlaceholder="Cari tagihan..."
      />

      {/* Bill Detail Modal */}
      <Modal
        isOpen={!!expandedBill}
        onClose={() => setExpandedBillId(null)}
        title={`Item Tagihan - ${expandedBill?.description ?? ""}`}
        size="lg"
      >
        {expandedBill && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--color-bg-primary)",
                  }}
                >
                  <th
                    className="px-3 py-2 text-left font-medium text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Deskripsi
                  </th>
                  <th
                    className="px-3 py-2 text-left font-medium text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Jumlah
                  </th>
                  <th
                    className="px-3 py-2 text-left font-medium text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Tipe
                  </th>
                  <th
                    className="px-3 py-2 text-left font-medium text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Catatan Internal
                  </th>
                  <th
                    className="px-3 py-2 text-left font-medium text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {expandedBill.bill_item.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <TypeBadge type={item.type} />
                    </td>
                    <td
                      className="px-3 py-2 text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {item.internal_description ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditItem(item)}
                          disabled={!canManage}
                          title={canManage ? undefined : DEFAULT_DISABLED_REASON}
                          className="px-2 py-0.5 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            backgroundColor: "var(--color-accent-light)",
                            color: "var(--color-accent)",
                          }}
                        >
                          Edit
                        </button>
                        {item.type === "CREATED" && (
                          <button
                            onClick={() => setDeleteItemConfirm(item)}
                            disabled={!canManage}
                            title={canManage ? undefined : DEFAULT_DISABLED_REASON}
                            className="px-2 py-0.5 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: "#FEE2E2",
                              color: "#DC2626",
                            }}
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {expandedBill.bill_item.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-4 text-center text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Tidak ada item
                    </td>
                  </tr>
                )}
              </tbody>
              {expandedBill.bill_item.length > 0 &&
                (() => {
                  // PPN (tax) lines are GENERATED items whose description
                  // starts with "PPN ". Subtotal = everything except tax.
                  const taxItems = expandedBill.bill_item.filter((i) =>
                    i.description.startsWith("PPN ")
                  );
                  const subtotal = expandedBill.bill_item
                    .filter((i) => !i.description.startsWith("PPN "))
                    .reduce((s, i) => s + Number(i.amount), 0);
                  const total = expandedBill.bill_item.reduce(
                    (s, i) => s + Number(i.amount),
                    0
                  );
                  return (
                    <tfoot>
                      {taxItems.length > 0 && (
                        <tr
                          className="border-t"
                          style={{ borderColor: "var(--color-border)" }}
                        >
                          <td
                            className="px-3 py-2 text-right font-medium"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            Subtotal
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {formatCurrency(subtotal)}
                          </td>
                          <td colSpan={3} />
                        </tr>
                      )}
                      <tr
                        className="border-t"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <td
                          className="px-3 py-2 text-right font-semibold"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          Total
                        </td>
                        <td
                          className="px-3 py-2 font-semibold"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {formatCurrency(total)}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  );
                })()}
            </table>
          </div>
        )}
      </Modal>

      {/* Edit Bill Modal (due date + items) */}
      <Modal
        isOpen={!!editBillModal}
        onClose={() => {
          setEditBillModal(null);
          setDueDateValue("");
          resetItemForm();
        }}
        title={`Edit Tagihan - ${editBillModal?.description ?? ""}`}
        size="lg"
      >
        {editBillModal && (
          <div className="space-y-6">
            {/* Due Date Section */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--color-text-primary)" }}
              >
                Tanggal Jatuh Tempo
              </label>
              <div className="flex gap-2 items-end">
                <input
                  type="date"
                  value={dueDateValue}
                  onChange={(e) => setDueDateValue(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-sm rounded-lg border outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-card)",
                  }}
                />
                <button
                  onClick={handleUpdateDueDate}
                  disabled={loading || !dueDateValue || dueDateValue === editBillModal.due_date.split("T")[0] || !canManage}
                  title={canManage ? undefined : DEFAULT_DISABLED_REASON}
                  className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  {loading ? "..." : "Simpan"}
                </button>
              </div>
            </div>

            {/* Existing Items Section */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "var(--color-text-primary)" }}
              >
                Item Tagihan ({editBillModal.bill_item.length})
              </label>
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "var(--color-bg-primary)" }}>
                      <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Deskripsi</th>
                      <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Jumlah</th>
                      <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Tipe</th>
                      <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: "var(--color-text-secondary)" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editBillModal.bill_item.map((item) => (
                      <tr key={item.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2">{formatCurrency(item.amount)}</td>
                        <td className="px-3 py-2"><TypeBadge type={item.type} /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => openEditItem(item)}
                              disabled={!canManage}
                              title={canManage ? undefined : DEFAULT_DISABLED_REASON}
                              className="px-2 py-0.5 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ backgroundColor: "var(--color-accent-light)", color: "var(--color-accent)" }}
                            >
                              Edit
                            </button>
                            {item.type === "CREATED" && (
                              <button
                                onClick={() => setDeleteItemConfirm(item)}
                                disabled={!canManage}
                                title={canManage ? undefined : DEFAULT_DISABLED_REASON}
                                className="px-2 py-0.5 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {editBillModal.bill_item.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          Tidak ada item
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add New Item Section */}
            <div
              className="border rounded-lg p-4"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-primary)" }}
            >
              <label
                className="block text-sm font-semibold mb-3"
                style={{ color: "var(--color-text-primary)" }}
              >
                Tambah Item Baru
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <input
                    type="text"
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                    placeholder="Deskripsi"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={itemAmount}
                    onChange={(e) => setItemAmount(e.target.value)}
                    placeholder="Jumlah (Rp)"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={itemInternal}
                    onChange={(e) => setItemInternal(e.target.value)}
                    placeholder="Catatan internal (opsional)"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
                  />
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={handleAddItem}
                  disabled={loading || !itemDesc || !itemAmount || !canManage}
                  title={canManage ? undefined : DEFAULT_DISABLED_REASON}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  {loading ? "Menyimpan..." : "+ Tambah Item"}
                </button>
              </div>
            </div>

            {/* Close button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => { setEditBillModal(null); setDueDateValue(""); resetItemForm(); }}
                className="px-4 py-2.5 text-sm font-medium rounded-lg border"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Item Modal */}
      <Modal
        isOpen={!!editItemModal}
        onClose={() => {
          setEditItemModal(null);
          resetItemForm();
        }}
        title="Edit Item Tagihan"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Deskripsi
            </label>
            <input
              type="text"
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Jumlah (Rp)
            </label>
            <input
              type="number"
              value={itemAmount}
              onChange={(e) => setItemAmount(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Catatan Internal (opsional)
            </label>
            <input
              type="text"
              value={itemInternal}
              onChange={(e) => setItemInternal(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setEditItemModal(null);
                resetItemForm();
              }}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              Batal
            </button>
            <button
              onClick={handleEditItem}
              disabled={loading || !itemDesc || !itemAmount || !canManage}
              title={canManage ? undefined : DEFAULT_DISABLED_REASON}
              className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Item Confirm Modal */}
      <Modal
        isOpen={!!deleteItemConfirm}
        onClose={() => setDeleteItemConfirm(null)}
        title="Hapus Item Tagihan"
        size="sm"
      >
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Apakah Anda yakin ingin menghapus item{" "}
          <strong>{deleteItemConfirm?.description}</strong> senilai{" "}
          <strong>{formatCurrency(deleteItemConfirm?.amount ?? "0")}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteItemConfirm(null)}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            Batal
          </button>
          <button
            onClick={handleDeleteItem}
            disabled={loading}
            className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "#DC2626" }}
          >
            {loading ? "Menghapus..." : "Hapus"}
          </button>
        </div>
      </Modal>

      {/* Create Bill Modal */}
      <Modal
        isOpen={createBillModal}
        onClose={() => {
          setCreateBillModal(false);
          resetCreateForm();
        }}
        title="Tambah Tagihan Baru"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Booking ID
            </label>
            <input
              type="number"
              value={newBillBookingId}
              onChange={(e) => setNewBillBookingId(e.target.value)}
              placeholder="ID pemesanan"
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Deskripsi Tagihan
            </label>
            <input
              type="text"
              value={newBillDescription}
              onChange={(e) => setNewBillDescription(e.target.value)}
              placeholder="Contoh: Tagihan tambahan"
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              Tanggal Jatuh Tempo
            </label>
            <input
              type="date"
              value={newBillDueDate}
              onChange={(e) => setNewBillDueDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
              }}
            />
          </div>

          {/* Bill Items */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              Item Tagihan
            </label>
            {newBillItems.map((item, idx) => (
              <div
                key={idx}
                className="flex gap-2 mb-2 items-start"
              >
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => {
                    const updated = [...newBillItems];
                    updated[idx] = { ...updated[idx], description: e.target.value };
                    setNewBillItems(updated);
                  }}
                  placeholder="Deskripsi"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-card)",
                  }}
                />
                <input
                  type="number"
                  value={item.amount}
                  onChange={(e) => {
                    const updated = [...newBillItems];
                    updated[idx] = { ...updated[idx], amount: e.target.value };
                    setNewBillItems(updated);
                  }}
                  placeholder="Jumlah"
                  className="w-32 px-3 py-2 text-sm rounded-lg border outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-card)",
                  }}
                />
                <input
                  type="text"
                  value={item.internal_description}
                  onChange={(e) => {
                    const updated = [...newBillItems];
                    updated[idx] = {
                      ...updated[idx],
                      internal_description: e.target.value,
                    };
                    setNewBillItems(updated);
                  }}
                  placeholder="Internal"
                  className="w-32 px-3 py-2 text-sm rounded-lg border outline-none"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-card)",
                  }}
                />
                {newBillItems.length > 1 && (
                  <button
                    onClick={() => {
                      setNewBillItems(newBillItems.filter((_, i) => i !== idx));
                    }}
                    className="px-2 py-2 text-xs font-medium rounded-lg"
                    style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
                  >
                    X
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                setNewBillItems([
                  ...newBillItems,
                  { description: "", amount: "", internal_description: "" },
                ])
              }
              disabled={!canManage}
              title={canManage ? undefined : DEFAULT_DISABLED_REASON}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "var(--color-accent-light)",
                color: "var(--color-accent)",
              }}
            >
              + Tambah Item
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setCreateBillModal(false);
                resetCreateForm();
              }}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            >
              Batal
            </button>
            <button
              onClick={handleCreateBill}
              disabled={
                loading ||
                !newBillBookingId ||
                !newBillDescription ||
                !newBillDueDate ||
                !canManage
              }
              title={canManage ? undefined : DEFAULT_DISABLED_REASON}
              className="px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {loading ? "Menyimpan..." : "Buat Tagihan"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
