"use client";

import { useState, useMemo } from "react";
import { businessToday } from "@/app/_lib/util/business-time";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface Transaction {
  id: number;
  amount: string;
  description: string;
  date: string;
  category: string | null;
  type: "INCOME" | "EXPENSE" | "CREDIT";
  location_id: number;
}

export interface SummaryData {
  transactions: Transaction[];
  depositTransactions: Transaction[];
  groupBy: "day" | "month";
}

interface SummaryClientProps {
  initialData: SummaryData;
  locationId: number;
}

type PeriodKey = "7d" | "1m" | "3m" | "6m" | "1y" | "all" | "custom";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 Hari" },
  { key: "1m", label: "1 Bulan" },
  { key: "3m", label: "3 Bulan" },
  { key: "6m", label: "6 Bulan" },
  { key: "1y", label: "1 Tahun" },
  { key: "all", label: "Semua" },
  { key: "custom", label: "Kustom" },
];

function formatCurrency(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  // Transaction.date is a @db.Date at midnight UTC; format in UTC so the calendar
  // day matches what was stored regardless of client TZ.
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getDateRange(period: PeriodKey): { start: Date; end: Date } | null {
  if (period === "custom" || period === "all") return null;
  // Transaction.date is a @db.Date at midnight UTC; bound the range in UTC
  // business-calendar terms so it matches the stored dates regardless of client TZ.
  const today = businessToday();
  const end = new Date(today.getTime() + 86_400_000 - 1);
  const start = new Date(today);
  switch (period) {
    case "7d":
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case "1m":
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case "3m":
      start.setUTCMonth(start.getUTCMonth() - 3);
      break;
    case "6m":
      start.setUTCMonth(start.getUTCMonth() - 6);
      break;
    case "1y":
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;
  }
  return { start, end };
}

export function SummaryClient({ initialData, locationId }: SummaryClientProps) {
  const [period, setPeriod] = useState<PeriodKey>("1m");
  const [splitDeposit, setSplitDeposit] = useState(false);
  const [data, setData] = useState<SummaryData>(initialData);
  const [loading, setLoading] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  async function fetchData(
    periodKey: PeriodKey,
    deposit: boolean,
    cStart?: string,
    cEnd?: string
  ) {
    setLoading(true);
    try {
      let startDate: string;
      let endDate: string;

      if (periodKey === "custom" && cStart && cEnd) {
        startDate = new Date(cStart).toISOString();
        endDate = new Date(cEnd + "T23:59:59.999Z").toISOString();
      } else if (periodKey === "all") {
        startDate = new Date("2000-01-01").toISOString();
        endDate = new Date().toISOString();
      } else {
        const range = getDateRange(periodKey);
        if (!range) return;
        startDate = range.start.toISOString();
        endDate = range.end.toISOString();
      }

      const params = new URLSearchParams({
        locationId: locationId.toString(),
        startDate,
        endDate,
        splitDeposit: deposit.toString(),
      });

      const res = await fetch(`/api/financials/summary?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodChange(key: PeriodKey) {
    setPeriod(key);
    if (key !== "custom") {
      fetchData(key, splitDeposit);
    }
  }

  function handleDepositToggle() {
    const next = !splitDeposit;
    setSplitDeposit(next);
    fetchData(period, next, customStart, customEnd);
  }

  function handleCustomApply() {
    if (customStart && customEnd) {
      fetchData("custom", splitDeposit, customStart, customEnd);
    }
  }

  // Compute summaries
  const { totalIncome, totalExpense, net } = useMemo(() => {
    const income = data.transactions
      .filter((t) => t.type === "INCOME")
      .reduce((s, t) => s + Number(t.amount), 0);
    const expense = data.transactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((s, t) => s + Number(t.amount), 0);
    return { totalIncome: income, totalExpense: expense, net: income - expense };
  }, [data.transactions]);

  // Chart data
  const chartData = useMemo(() => {
    const grouped: Record<string, { label: string; income: number; expense: number }> = {};

    for (const t of data.transactions) {
      // t.date is a @db.Date at midnight UTC; group and label in UTC so chart
      // buckets align with the stored calendar day regardless of client TZ.
      const d = new Date(t.date);
      const key =
        data.groupBy === "day"
          ? d.toISOString().slice(0, 10)
          : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const label =
        data.groupBy === "day"
          ? d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" })
          : d.toLocaleDateString("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });

      if (!grouped[key]) {
        grouped[key] = { label, income: 0, expense: 0 };
      }
      if (t.type === "INCOME") {
        grouped[key].income += Number(t.amount);
      } else if (t.type === "EXPENSE") {
        grouped[key].expense += Number(t.amount);
      }
    }

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [data.transactions, data.groupBy]);

  // All transactions combined for table
  const allTransactions = useMemo(() => {
    const combined = [...data.transactions, ...data.depositTransactions];
    combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return combined;
  }, [data.transactions, data.depositTransactions]);

  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Ringkasan Keuangan
      </h1>

      {/* Period Selector */}
      <div
        className="rounded-xl border p-4"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handlePeriodChange(opt.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor:
                  period === opt.key ? "var(--color-accent)" : "transparent",
                color: period === opt.key ? "white" : "var(--color-text-primary)",
                border:
                  period === opt.key
                    ? "1px solid var(--color-accent)"
                    : "1px solid var(--color-border)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm border"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
              }}
            />
            <span style={{ color: "var(--color-text-secondary)" }}>-</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm border"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
              }}
            />
            <button
              onClick={handleCustomApply}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Terapkan
            </button>
          </div>
        )}

        {/* BL-029: Deposit Split Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={splitDeposit}
            onChange={handleDepositToggle}
            className="w-4 h-4 rounded"
            style={{ accentColor: "var(--color-accent)" }}
          />
          <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
            Pisahkan transaksi deposit
          </span>
        </label>
      </div>

      {loading && (
        <div className="text-center py-4" style={{ color: "var(--color-text-secondary)" }}>
          Memuat data...
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Pemasukan" value={totalIncome} color="#16A34A" />
        <SummaryCard label="Total Pengeluaran" value={totalExpense} color="#DC2626" />
        <SummaryCard
          label="Laba Bersih"
          value={net}
          color={net >= 0 ? "#16A34A" : "#DC2626"}
        />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
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
            Grafik Pemasukan &amp; Pengeluaran
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }}
                tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}jt`}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelStyle={{ color: "var(--color-text-primary)" }}
              />
              <Legend />
              <Bar dataKey="income" name="Pemasukan" fill="#16A34A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Pengeluaran" fill="#DC2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Transaction Table */}
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
          Daftar Transaksi
        </h2>
        {allTransactions.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Tidak ada transaksi dalam periode ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--color-text-secondary)" }}>
                  <th className="text-left py-2 px-3 font-medium">Tanggal</th>
                  <th className="text-left py-2 px-3 font-medium">Deskripsi</th>
                  <th className="text-left py-2 px-3 font-medium">Kategori</th>
                  <th className="text-left py-2 px-3 font-medium">Tipe</th>
                  <th className="text-right py-2 px-3 font-medium">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {allTransactions.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <td className="py-2.5 px-3" style={{ color: "var(--color-text-secondary)" }}>
                      {formatDate(t.date)}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: "var(--color-text-primary)" }}>
                      {t.description}
                    </td>
                    <td className="py-2.5 px-3" style={{ color: "var(--color-text-secondary)" }}>
                      {t.category ?? "-"}
                    </td>
                    <td className="py-2.5 px-3">
                      <TypeBadge type={t.type} />
                    </td>
                    <td
                      className="py-2.5 px-3 text-right font-medium"
                      style={{
                        color:
                          t.type === "INCOME"
                            ? "#16A34A"
                            : t.type === "CREDIT"
                              ? "#D97706"
                              : "#DC2626",
                      }}
                    >
                      {t.type === "EXPENSE" ? "-" : ""}
                      {formatCurrency(Number(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: "var(--color-bg-card)",
        borderColor: "var(--color-border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </p>
      <p className="text-xl font-bold mt-1" style={{ color }}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function TypeBadge({ type }: { type: "INCOME" | "EXPENSE" | "CREDIT" }) {
  const styles: Record<
    "INCOME" | "EXPENSE" | "CREDIT",
    { bg: string; color: string; label: string }
  > = {
    INCOME: { bg: "#DEF7EC", color: "#03543F", label: "Pemasukan" },
    EXPENSE: { bg: "#FDE8E8", color: "#9B1C1C", label: "Pengeluaran" },
    CREDIT: { bg: "#FEF3C7", color: "#92400E", label: "Kelebihan Bayar" },
  };
  const s = styles[type];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}
