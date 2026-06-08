"use client";

export interface CheckInOutCounts {
  checkIns: number;
  checkOuts: number;
}

export interface RoomStats {
  total: number;
  available: number;
  occupied: number;
  maintenance: number;
}

export interface RecentPayment {
  id: number;
  amount: string;
  payment_date: string;
  bookings: {
    tenants: { name: string } | null;
    rooms: { room_number: string } | null;
  };
  paymentstatuses: { status: string } | null;
}

export interface OutstandingBill {
  id: number;
  description: string;
  due_date: string;
  bill_item: { amount: string }[];
  paymentBills: { amount: string }[];
  bookings: {
    tenants: { name: string } | null;
    rooms: { room_number: string } | null;
  };
}

export interface UpcomingEvent {
  id: number;
  title: string;
  description: string | null;
  start: string;
}

interface DashboardClientProps {
  checkInOutCounts: CheckInOutCounts;
  roomStats: RoomStats;
  recentPayments: RecentPayment[];
  outstandingBills: OutstandingBill[];
  upcomingEvents: UpcomingEvent[];
}

function formatCurrency(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DashboardClient({
  checkInOutCounts,
  roomStats,
  recentPayments,
  outstandingBills,
  upcomingEvents,
}: DashboardClientProps) {
  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Dashboard
      </h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Check-in Hari Ini"
          value={checkInOutCounts.checkIns}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          }
        />
        <StatCard
          label="Check-out Hari Ini"
          value={checkInOutCounts.checkOuts}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          }
        />
        <StatCard
          label="Kamar Tersedia"
          value={roomStats.available}
          subtitle={`dari ${roomStats.total} kamar`}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          }
        />
        <StatCard
          label="Kamar Terisi"
          value={roomStats.occupied}
          subtitle={`${roomStats.maintenance} maintenance`}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
      </div>

      {/* Recent Payments */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          Pembayaran Terbaru
        </h2>
        {recentPayments.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Belum ada pembayaran.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--color-text-secondary)" }}>
                  <th className="text-left py-2 px-3 font-medium">Kamar</th>
                  <th className="text-left py-2 px-3 font-medium">Penghuni</th>
                  <th className="text-right py-2 px-3 font-medium">Jumlah</th>
                  <th className="text-left py-2 px-3 font-medium">Tanggal</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-t"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <td className="py-2.5 px-3" style={{ color: "var(--color-text-primary)" }}>
                      {payment.bookings?.rooms?.room_number ?? "-"}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: "var(--color-text-primary)" }}>
                      {payment.bookings?.tenants?.name ?? "-"}
                    </td>
                    <td
                      className="py-2.5 px-3 text-right font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {formatCurrency(Number(payment.amount))}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: "var(--color-text-secondary)" }}>
                      {formatDate(payment.payment_date)}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={payment.paymentstatuses?.status ?? "Pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Outstanding Bills */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          Tagihan Belum Lunas
        </h2>
        {outstandingBills.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Tidak ada tagihan belum lunas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--color-text-secondary)" }}>
                  <th className="text-left py-2 px-3 font-medium">Kamar / Penghuni</th>
                  <th className="text-left py-2 px-3 font-medium">Deskripsi</th>
                  <th className="text-left py-2 px-3 font-medium">Jatuh Tempo</th>
                  <th className="text-right py-2 px-3 font-medium">Sisa Tagihan</th>
                </tr>
              </thead>
              <tbody>
                {outstandingBills.map((bill) => {
                  const total = bill.bill_item.reduce(
                    (s, i) => s + Number(i.amount),
                    0
                  );
                  const paid = bill.paymentBills.reduce(
                    (s, p) => s + Number(p.amount),
                    0
                  );
                  const outstanding = total - paid;
                  return (
                    <tr
                      key={bill.id}
                      className="border-t"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <td className="py-2.5 px-3" style={{ color: "var(--color-text-primary)" }}>
                        <span className="font-medium">
                          {bill.bookings?.rooms?.room_number ?? "-"}
                        </span>
                        <span
                          className="block text-xs"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {bill.bookings?.tenants?.name ?? "-"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3" style={{ color: "var(--color-text-primary)" }}>
                        {bill.description}
                      </td>
                      <td className="py-2.5 px-3" style={{ color: "var(--color-text-secondary)" }}>
                        {formatDate(bill.due_date)}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-semibold"
                        style={{ color: "#DC2626" }}
                      >
                        {formatCurrency(outstanding)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upcoming Events */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h2
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--color-text-primary)" }}
        >
          Acara Mendatang
        </h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Tidak ada acara mendatang.
          </p>
        ) : (
          <ul className="space-y-3">
            {upcomingEvents.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div
                  className="w-2 h-2 mt-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: "var(--color-accent)" }}
                />
                <div>
                  <p
                    className="font-medium text-sm"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {event.title}
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {formatDate(event.start)}
                  </p>
                  {event.description && (
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {event.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  icon,
}: {
  label: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-5 flex items-start gap-4"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="p-2.5 rounded-lg"
        style={{ backgroundColor: "var(--color-accent-light)", color: "var(--color-accent)" }}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {label}
        </p>
        <p
          className="text-2xl font-bold mt-0.5"
          style={{ color: "var(--color-text-primary)" }}
        >
          {value}
        </p>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    Verified: { bg: "#DEF7EC", text: "#03543F" },
    Pending: { bg: "#FEF3C7", text: "#92400E" },
    Rejected: { bg: "#FDE8E8", text: "#9B1C1C" },
  };
  const colors = colorMap[status] ?? { bg: "#F3F4F6", text: "#374151" };

  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}
