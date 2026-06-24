import { Decimal } from "@prisma/client/runtime/library";

interface Booking {
  id: number;
  start_date: string | Date;
  end_date: string | Date | null;
  fee: string | number | Decimal;
  is_rolling: boolean;
  rooms: { room_number: string; locations: { name: string } | null; roomtypes: { type: string } | null } | null;
  durations: { duration: string } | null;
  bookingstatuses: { status: string } | null;
  deposit: { status: string; amount: string | number | Decimal } | null;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: "#D1FAE5", text: "#059669" },
  PENDING: { bg: "#FEF3C7", text: "#D97706" },
  COMPLETED: { bg: "#E5E7EB", text: "#6B7280" },
  CANCELLED: { bg: "#FEE2E2", text: "#DC2626" },
};

const depositColors: Record<string, { bg: string; text: string }> = {
  HELD: { bg: "#D1FAE5", text: "#059669" },
  UNPAID: { bg: "#FEE2E2", text: "#DC2626" },
  APPLIED: { bg: "#DBEAFE", text: "#2563EB" },
  REFUNDED: { bg: "#E5E7EB", text: "#6B7280" },
  PARTIALLY_REFUNDED: { bg: "#FEF3C7", text: "#D97706" },
  FORFEITED: { bg: "#FEE2E2", text: "#DC2626" },
};

function formatDate(dateStr: string | Date) {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatCurrency(amount: string | number | Decimal) {
  return `Rp${Number(amount).toLocaleString("id-ID")}`;
}

function Badge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return (
    <span
      className="px-2 py-0.5 text-xs font-medium rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  );
}

export function BookingsSection({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
          Pemesanan
        </h2>
        <p className="text-sm italic" style={{ color: "var(--color-text-secondary)" }}>
          Belum ada pemesanan.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
        Pemesanan ({bookings.length})
      </h2>
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-card)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Kamar", "Lokasi", "Mulai", "Akhir", "Durasi", "Biaya/Bulan", "Status", "Deposit"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const status = b.bookingstatuses?.status || "UNKNOWN";
                const sColor = statusColors[status] || statusColors.PENDING;
                return (
                  <tr
                    key={b.id}
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                  >
                    <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                      {b.rooms?.room_number || "-"}
                      {b.rooms?.roomtypes && (
                        <span className="text-xs ml-1" style={{ color: "var(--color-text-secondary)" }}>
                          ({b.rooms.roomtypes.type})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                      {b.rooms?.locations?.name || "-"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                      {formatDate(b.start_date)}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                      {b.is_rolling ? "Bergulir" : b.end_date ? formatDate(b.end_date) : "-"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                      {b.is_rolling ? "Rolling" : b.durations?.duration || "-"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-primary)" }}>
                      {formatCurrency(b.fee)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={status} colors={sColor} />
                    </td>
                    <td className="px-4 py-3">
                      {b.deposit ? (
                        <Badge
                          label={b.deposit.status}
                          colors={depositColors[b.deposit.status] || depositColors.UNPAID}
                        />
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
