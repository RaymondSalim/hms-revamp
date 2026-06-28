"use client";

import { TodayTasks } from "./today-tasks";
import { ActionQueue } from "./action-queue";
import type { TodayTaskCounts, ActionQueue as ActionQueueData } from "@/app/_db/today-tasks";

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

export interface Occupancy {
  totalRooms: number;
  occupiedRooms: number;
  rate: number;
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

export interface UpcomingEvent {
  id: number;
  title: string;
  description: string | null;
  start: string;
}

interface DashboardClientProps {
  checkInOutCounts: CheckInOutCounts;
  roomStats: RoomStats;
  occupancy: Occupancy;
  recentPayments: RecentPayment[];
  upcomingEvents: UpcomingEvent[];
  todayTasks: TodayTaskCounts;
  actionQueue: ActionQueueData;
}

function formatCurrency(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  // All callers pass @db.Date fields (payment_date, due_date, event_date) stored
  // at midnight UTC; format in UTC so the calendar day matches what was stored.
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function DashboardClient({
  checkInOutCounts,
  roomStats,
  occupancy,
  recentPayments,
  upcomingEvents,
  todayTasks,
  actionQueue,
}: DashboardClientProps) {
  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Dashboard
      </h1>

      <TodayTasks counts={todayTasks} />
      <ActionQueue queue={actionQueue} />

      {/* Occupancy — single card (was three room cards) */}
      <div data-tour="dashboard-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Tingkat Hunian"
          value={`${occupancy.rate}%`}
          subtitle={`${roomStats.occupied} terisi · ${roomStats.available} tersedia · ${roomStats.maintenance} maintenance`}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
      </div>

      {/* Realized check-in/out today — passive activity line, not a stat card */}
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Aktivitas hari ini: {checkInOutCounts.checkIns} check-in · {checkInOutCounts.checkOuts} check-out
      </p>

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
  value: number | string;
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
  // PaymentStatus values are stored uppercase (PENDING/VERIFIED/REJECTED); match
  // on the normalized value so the pills color correctly (and stay aligned with
  // the colors used on the payments list page).
  const colorMap: Record<string, { bg: string; text: string }> = {
    VERIFIED: { bg: "#D1FAE5", text: "#059669" },
    PENDING: { bg: "#FEF3C7", text: "#D97706" },
    REJECTED: { bg: "#FEE2E2", text: "#DC2626" },
  };
  const colors = colorMap[status.toUpperCase()] ?? { bg: "#F3F4F6", text: "#374151" };

  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}
