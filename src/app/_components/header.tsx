"use client";

import { usePathname } from "next/navigation";
import { useLocation } from "@/app/_context/location-context";
import { toggleSidebar } from "@/app/_components/sidebar";
import { useState, useRef, useEffect } from "react";
import { TourButton } from "@/app/_components/tour/tour-button";

function useBusinessClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    function update() {
      setTime(
        new Date().toLocaleTimeString("id-ID", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/bookings": "Pemesanan",
  "/bills": "Tagihan",
  "/payments": "Pembayaran",
  "/deposits": "Deposit",
  "/residents/tenants": "Penyewa",
  "/residents/guests": "Tamu",
  "/rooms/all-rooms": "Semua Kamar",
  "/rooms/room-types": "Tipe Kamar",
  "/rooms/durations": "Durasi",
  "/addons": "Add-on",
  "/financials/summary": "Ringkasan Keuangan",
  "/financials/export": "Ekspor",
  "/schedule/calendar": "Kalender",
  "/settings/users": "Pengguna",
  "/locations": "Lokasi",
  "/help": "Bantuan",
};

export function Header() {
  const businessTime = useBusinessClock();
  const pathname = usePathname();
  const { selectedLocationId, setSelectedLocationId, locations } = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find the best matching breadcrumb
  const currentPage =
    Object.entries(breadcrumbMap).find(([path]) =>
      pathname === path || pathname.startsWith(path + "/")
    )?.[1] ?? "Halaman";

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header
      className="h-16 flex items-center justify-between px-4 md:px-6 border-b shrink-0"
      style={{
        backgroundColor: "var(--color-bg-header)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Left side: hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg transition-colors"
          onClick={toggleSidebar}
          aria-label="Open menu"
          style={{ color: "var(--color-text-primary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-accent-light)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path
              fillRule="evenodd"
              d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Breadcrumb */}
        <h1
          className="text-lg font-semibold"
          style={{
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-display), serif",
          }}
        >
          {currentPage}
        </h1>
      </div>

      {/* Right side: tour button + timezone + location picker */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => document.dispatchEvent(new CustomEvent("open-command-palette"))}
          className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
          aria-label="Cari"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <span>Cari…</span>
          <kbd className="text-[10px] px-1 py-0.5 rounded border" style={{ borderColor: "var(--color-border)" }}>⌘K</kbd>
        </button>
        <TourButton />
        <span
          data-tour="wib-clock"
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium"
          style={{ backgroundColor: "var(--color-bg-primary)", color: "var(--color-text-secondary)" }}
          title="Semua tanggal dan waktu ditampilkan dalam zona waktu lokasi bisnis (WIB)"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          {businessTime} WIB
        </span>
        {locations.length > 0 && (
          <div className="relative" ref={dropdownRef} data-tour="location-picker">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
                backgroundColor: dropdownOpen ? "var(--color-accent-light)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!dropdownOpen) {
                  e.currentTarget.style.backgroundColor = "var(--color-accent-light)";
                }
              }}
              onMouseLeave={(e) => {
                if (!dropdownOpen) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-accent)" }}>
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span className="max-w-[150px] truncate">
                {selectedLocation?.name ?? "Pilih lokasi"}
              </span>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }}>
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Dropdown */}
            {dropdownOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-56 rounded-lg border py-1 z-50"
                style={{
                  backgroundColor: "var(--color-bg-card)",
                  borderColor: "var(--color-border)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                {locations.map((location) => (
                  <button
                    key={location.id}
                    onClick={() => {
                      setSelectedLocationId(location.id);
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors duration-100"
                    style={{
                      color:
                        location.id === selectedLocationId
                          ? "var(--color-accent)"
                          : "var(--color-text-primary)",
                      backgroundColor:
                        location.id === selectedLocationId
                          ? "var(--color-accent-light)"
                          : "transparent",
                      fontWeight: location.id === selectedLocationId ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (location.id !== selectedLocationId) {
                        e.currentTarget.style.backgroundColor = "var(--color-accent-light)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (location.id !== selectedLocationId) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {location.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
