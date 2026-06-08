"use client";

import { useState } from "react";
import { useLocation } from "@/app/_context/location-context";

export default function ExportPage() {
  const { selectedLocationId } = useLocation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [allTime, setAllTime] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!selectedLocationId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        format: exportFormat,
        locationId: String(selectedLocationId),
      });
      if (!allTime && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }

      const response = await fetch(
        `/api/financials/transactions/export?${params}`
      );

      if (!response.ok) {
        throw new Error("Export gagal");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("Content-Disposition")
          ?.split("filename=")[1]
          ?.replace(/"/g, "") || `export.${exportFormat === "xlsx" ? "xlsx" : "html"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Terjadi kesalahan saat mengekspor data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Ekspor Transaksi
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Unduh data transaksi keuangan dalam format Excel atau HTML.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-5">
        {/* Period selection */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
            <input
              type="checkbox"
              checked={allTime}
              onChange={(e) => setAllTime(e.target.checked)}
              className="rounded border-[var(--color-border)]"
            />
            Semua waktu (tanpa filter tanggal)
          </label>

          {!allTime && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Tanggal Mulai
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  Tanggal Akhir
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Format selection */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-[var(--color-text-primary)]">
            Format Ekspor
          </span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input
                type="radio"
                name="format"
                value="xlsx"
                checked={exportFormat === "xlsx"}
                onChange={() => setExportFormat("xlsx")}
                className="border-[var(--color-border)]"
              />
              Excel (.xlsx)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input
                type="radio"
                name="format"
                value="pdf"
                checked={exportFormat === "pdf"}
                onChange={() => setExportFormat("pdf")}
                className="border-[var(--color-border)]"
              />
              HTML (.html)
            </label>
          </div>
        </div>

        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={loading || (!allTime && (!startDate || !endDate))}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent)]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Mengekspor...
            </>
          ) : (
            "Unduh Ekspor"
          )}
        </button>
      </div>
    </div>
  );
}
