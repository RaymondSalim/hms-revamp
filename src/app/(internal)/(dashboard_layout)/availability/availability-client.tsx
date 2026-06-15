"use client";

import { useState, useTransition } from "react";
import { getAvailabilityAction, type RoomTypeAvailability } from "./availability-action";

interface Props {
  locationId: number;
}

export function AvailabilityClient({ locationId }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [results, setResults] = useState<RoomTypeAvailability[] | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCheck() {
    if (!startDate || !endDate) return;
    setError("");
    startTransition(async () => {
      const res = await getAvailabilityAction(locationId, startDate, endDate);
      if (res.success) {
        setResults(res.data);
      } else {
        setError(res.error);
        setResults(null);
      }
    });
  }

  function availabilityColor(available: number, total: number) {
    if (available === 0) return { bg: "#FEE2E2", text: "#DC2626" };
    if (available / total <= 0.3) return { bg: "#FEF3C7", text: "#92400E" };
    return { bg: "#D1FAE5", text: "#065F46" };
  }

  return (
    <div className="space-y-6">
      <h1
        className="text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display), serif", color: "var(--color-text-primary)" }}
      >
        Ketersediaan Kamar
      </h1>

      {/* Date range picker */}
      <div
        className="rounded-lg border p-4"
        style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border)" }}
      >
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Tanggal Mulai
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-primary)" }}
            />
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Tanggal Selesai
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              className="px-3 py-2.5 text-sm rounded-lg border outline-none"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-primary)" }}
            />
          </div>
          <button
            onClick={handleCheck}
            disabled={isPending || !startDate || !endDate}
            className="px-5 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {isPending ? "Memeriksa..." : "Cek Ketersediaan"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm" style={{ color: "#DC2626" }}>
          {error}
        </p>
      )}

      {/* Results */}
      {results && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map((rt) => {
            const color = availabilityColor(rt.available, rt.total);
            return (
              <div
                key={rt.roomTypeId}
                className="rounded-lg border p-4"
                style={{ backgroundColor: "var(--color-bg-card)", borderColor: "var(--color-border)" }}
              >
                <h3
                  className="text-sm font-semibold mb-3"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {rt.roomType}
                </h3>
                <div
                  className="rounded-lg px-3 py-2 text-center"
                  style={{ backgroundColor: color.bg }}
                >
                  <span className="text-2xl font-bold" style={{ color: color.text }}>
                    {rt.available}
                  </span>
                  <span className="text-sm ml-1" style={{ color: color.text }}>
                    / {rt.total}
                  </span>
                </div>
                <p
                  className="text-xs text-center mt-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  tersedia dari {rt.total} kamar
                </p>
                {rt.booked > 0 && (
                  <p className="text-xs text-center mt-1" style={{ color: "#DC2626" }}>
                    {rt.booked} terisi
                  </p>
                )}
              </div>
            );
          })}
          {results.length === 0 && (
            <div
              className="col-span-full text-center py-8"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Tidak ada kamar terdaftar di lokasi ini.
            </div>
          )}
        </div>
      )}

      {/* Initial state */}
      {!results && !error && (
        <div
          className="text-center py-12"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <p className="text-sm">Pilih rentang tanggal lalu klik &quot;Cek Ketersediaan&quot; untuk melihat kamar yang tersedia.</p>
        </div>
      )}
    </div>
  );
}
