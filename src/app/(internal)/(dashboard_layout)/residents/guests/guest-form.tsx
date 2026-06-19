"use client";

import { useState, useMemo } from "react";
import { upsertGuestAction, upsertGuestStayAction } from "./guest-action";
import { toast } from "react-toastify";
import { formatCurrency } from "@/app/_lib/util/currency";
import { lastDayOfUtcMonth } from "@/app/_lib/util/business-time";
import { SearchableSelect } from "@/app/_components/searchable-select";
import type { GuestRow, BookingOption } from "./guest-table";

interface GuestFormProps {
  guest: GuestRow | null;
  bookings: BookingOption[];
  onSuccess: () => void;
}

interface StayFormData {
  start_date: string;
  end_date: string;
  daily_fee: string;
}

const INDONESIAN_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function computeMonthlyBreakdown(startDate: string, endDate: string, dailyFee: number) {
  if (!startDate || !endDate || !dailyFee || dailyFee <= 0) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end < start) return [];

  const segments: Array<{ month: string; days: number; amount: number }> = [];
  let current = new Date(start);

  while (current <= end) {
    const monthEnd = lastDayOfUtcMonth(current);
    const segmentEnd = monthEnd < end ? monthEnd : end;
    const days = Math.round((segmentEnd.getTime() - current.getTime()) / 86400000) + 1;
    const amount = days * dailyFee;

    segments.push({
      month: `${INDONESIAN_MONTHS[current.getUTCMonth()]} ${current.getUTCFullYear()}`,
      days,
      amount,
    });

    current = new Date(segmentEnd.getTime() + 86400000);
  }

  return segments;
}

export function GuestForm({ guest, bookings, onSuccess }: GuestFormProps) {
  const [loading, setLoading] = useState(false);

  // Guest info state
  const [name, setName] = useState(guest?.name || "");
  const [email, setEmail] = useState(guest?.email || "");
  const [phone, setPhone] = useState(guest?.phone || "");
  const [bookingId, setBookingId] = useState<number>(guest?.booking_id || (bookings[0]?.id ?? 0));

  // Stay form state
  const [showStayForm, setShowStayForm] = useState(false);
  const [stayForm, setStayForm] = useState<StayFormData>({
    start_date: "",
    end_date: "",
    daily_fee: "",
  });

  const monthlyBreakdown = useMemo(
    () => computeMonthlyBreakdown(stayForm.start_date, stayForm.end_date, parseFloat(stayForm.daily_fee) || 0),
    [stayForm.start_date, stayForm.end_date, stayForm.daily_fee]
  );

  const handleSubmitGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await upsertGuestAction({
        id: guest?.id,
        name,
        email: email || undefined,
        phone: phone || undefined,
        booking_id: bookingId,
      });

      if (result.success) {
        toast.success(guest ? "Tamu berhasil diperbarui" : "Tamu berhasil ditambahkan");
        onSuccess();
      } else {
        const err = result.error;
        if (typeof err === "string") {
          toast.error(err);
        } else if (err && "fieldErrors" in err) {
          const messages = Object.values(err.fieldErrors || {}).flat();
          toast.error((messages[0] as string) || "Validasi gagal");
        } else {
          toast.error("Validasi gagal");
        }
      }
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitStay = async () => {
    if (!guest) {
      toast.error("Simpan data tamu terlebih dahulu sebelum menambahkan masa tinggal");
      return;
    }

    setLoading(true);
    try {
      const result = await upsertGuestStayAction({
        guest_id: guest.id,
        start_date: new Date(stayForm.start_date),
        end_date: new Date(stayForm.end_date),
        daily_fee: parseFloat(stayForm.daily_fee),
      });

      if (result.success) {
        toast.success("Masa tinggal berhasil ditambahkan");
        setStayForm({ start_date: "", end_date: "", daily_fee: "" });
        setShowStayForm(false);
        onSuccess();
      } else {
        if (typeof result.error === "string") {
          toast.error(result.error);
        } else {
          toast.error("Validasi gagal");
        }
      }
    } catch {
      toast.error("Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    borderColor: "var(--color-border)",
    backgroundColor: "var(--color-bg-card)",
    color: "var(--color-text-primary)",
  };

  const labelStyle = {
    color: "var(--color-text-primary)",
  };

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">
      {/* Guest Info Form */}
      <form onSubmit={handleSubmitGuest} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={labelStyle}>
              Nama <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={labelStyle}>
              Booking <span className="text-red-500">*</span>
            </label>
            {guest ? (
              <input
                type="text"
                disabled
                value={bookings.find((b) => b.id === bookingId)
                  ? `${bookings.find((b) => b.id === bookingId)?.rooms ? `Kamar ${bookings.find((b) => b.id === bookingId)!.rooms!.room_number}` : `Booking #${bookingId}`}${bookings.find((b) => b.id === bookingId)?.tenants ? ` - ${bookings.find((b) => b.id === bookingId)!.tenants!.name}` : ""}`
                  : `Booking #${bookingId}`}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none opacity-60"
                style={inputStyle}
              />
            ) : (
              <SearchableSelect
                options={bookings.map((b) => ({
                  value: String(b.id),
                  label: `${b.rooms ? `Kamar ${b.rooms.room_number}` : `Booking #${b.id}`}${b.tenants ? ` - ${b.tenants.name}` : ""}`,
                }))}
                value={bookingId ? String(bookingId) : ""}
                onChange={(v) => setBookingId(v ? parseInt(v, 10) : 0)}
                placeholder="Cari booking..."
                required
                isClearable={false}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={labelStyle}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={labelStyle}>
              Telepon
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-all duration-150"
              style={inputStyle}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "white",
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            {loading ? "Menyimpan..." : guest ? "Perbarui Tamu" : "Simpan Tamu"}
          </button>
        </div>
      </form>

      {/* Guest Stays Section - only show when editing */}
      {guest && (
        <div
          className="border rounded-xl p-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Masa Tinggal ({guest.GuestStay.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowStayForm(!showStayForm)}
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
              + Tambah Masa Tinggal
            </button>
          </div>

          {/* Existing stays list */}
          {guest.GuestStay.length > 0 && (
            <div className="space-y-2 mb-4">
              {guest.GuestStay.map((stay) => (
                <div
                  key={stay.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border text-sm"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-primary)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ color: "var(--color-text-primary)" }}>
                      {new Date(stay.start_date).toLocaleDateString("id-ID", { timeZone: "UTC" })} -{" "}
                      {new Date(stay.end_date).toLocaleDateString("id-ID", { timeZone: "UTC" })}
                    </span>
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      {formatCurrency(stay.daily_fee)}/hari
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add stay form */}
          {showStayForm && (
            <div
              className="border rounded-lg p-4 space-y-4"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={labelStyle}>
                    Tanggal Mulai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={stayForm.start_date}
                    onChange={(e) => setStayForm({ ...stayForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-all duration-150"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={labelStyle}>
                    Tanggal Selesai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={stayForm.end_date}
                    onChange={(e) => setStayForm({ ...stayForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-all duration-150"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={labelStyle}>
                    Biaya Harian (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={stayForm.daily_fee}
                    onChange={(e) => setStayForm({ ...stayForm, daily_fee: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border outline-none transition-all duration-150"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Monthly breakdown preview */}
              {monthlyBreakdown.length > 0 && (
                <div
                  className="rounded-lg border p-3"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-card)",
                  }}
                >
                  <h4
                    className="text-xs font-semibold mb-2 uppercase tracking-wide"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Preview Pembagian Bulanan
                  </h4>
                  <div className="space-y-1">
                    {monthlyBreakdown.map((segment, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-sm"
                      >
                        <span style={{ color: "var(--color-text-primary)" }}>
                          {segment.month} ({segment.days} hari)
                        </span>
                        <span
                          className="font-medium"
                          style={{ color: "var(--color-accent)" }}
                        >
                          {formatCurrency(segment.amount)}
                        </span>
                      </div>
                    ))}
                    <div
                      className="flex items-center justify-between text-sm pt-2 mt-2 border-t"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <span
                        className="font-semibold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        Total
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: "var(--color-accent)" }}
                      >
                        {formatCurrency(monthlyBreakdown.reduce((sum, s) => sum + s.amount, 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStayForm(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150"
                  style={{
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmitStay}
                  disabled={loading || !stayForm.start_date || !stayForm.end_date || !stayForm.daily_fee}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) e.currentTarget.style.opacity = "0.9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  {loading ? "Menyimpan..." : "Simpan Masa Tinggal"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
