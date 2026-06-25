"use client";

import Link from "next/link";
import type { TodayTaskCounts } from "@/app/_db/today-tasks";

interface Tile {
  key: keyof TodayTaskCounts;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const TILES: Tile[] = [
  {
    key: "checkInsDue",
    label: "Check-in Hari Ini",
    href: "/bookings?checkin=today",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
      </svg>
    ),
  },
  {
    key: "unverifiedPayments",
    label: "Pembayaran Belum Diverifikasi",
    href: "/payments?status=pending",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "overdueBills",
    label: "Tagihan Terlambat",
    href: "/bills?overdue=1",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "expiringBookings",
    label: "Pemesanan Akan Berakhir",
    href: "/bookings?expiring=1",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export function TodayTasks({ counts }: { counts: TodayTaskCounts }) {
  return (
    <div data-tour="today-tasks">
      <h2
        className="text-sm font-semibold uppercase tracking-wide mb-3"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Tugas Hari Ini
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TILES.map((tile) => {
          const value = counts[tile.key];
          const active = value > 0;
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className="rounded-xl border p-5 flex items-start gap-4 transition-shadow duration-150 hover:shadow-md"
              style={{
                backgroundColor: "var(--color-bg-card)",
                borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                className="p-2.5 rounded-lg"
                style={{
                  backgroundColor: active ? "var(--color-accent)" : "var(--color-accent-light)",
                  color: active ? "white" : "var(--color-accent)",
                }}
              >
                {tile.icon}
              </div>
              <div>
                <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  {tile.label}
                </p>
                <p
                  className="text-2xl font-bold mt-0.5"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {value}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
