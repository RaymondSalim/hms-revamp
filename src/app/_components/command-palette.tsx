"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "@/app/_context/location-context";
import type { SearchHit, SearchResults } from "@/app/_db/search";

const GROUPS: { key: keyof SearchResults; title: string }[] = [
  { key: "tenants", title: "Penyewa" },
  { key: "bookings", title: "Pemesanan" },
  { key: "bills", title: "Tagihan" },
  { key: "rooms", title: "Kamar" },
];

const EMPTY: SearchResults = { tenants: [], bookings: [], bills: [], rooms: [] };

export function CommandPalette() {
  const router = useRouter();
  const { selectedLocationId } = useLocation();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Flattened list (in group order) for keyboard nav + index mapping.
  const flat: SearchHit[] = GROUPS.flatMap((g) => results[g.key]);

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setResults(EMPTY);
    setError(false);
    setHighlight(0);
  }, []);

  // Global ⌘K / Ctrl-K toggle + custom event from the header trigger.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("open-command-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  // Focus the input when opened; lock body scroll.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      // focus after paint
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        clearTimeout(t);
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Debounced, abortable fetch.
  useEffect(() => {
    if (!open) return;
    const q = term.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("search failed");
        const data: SearchResults = await res.json();
        setResults(data);
        setHighlight(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      close();
      if (hit.locationId != null && hit.locationId !== selectedLocationId) {
        // Switch location (cookie) then full-navigate so the server re-scopes.
        document.cookie = `selectedLocationId=${hit.locationId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
        window.location.href = hit.href;
      } else {
        router.push(hit.href);
      }
    },
    [close, router, selectedLocationId]
  );

  // Keyboard nav within the palette.
  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[highlight];
      if (hit) go(hit);
    }
  }

  let flatIndex = -1; // running index across groups for highlight mapping

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh]"
          style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            className="w-full max-w-xl rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--color-bg-card)", boxShadow: "var(--shadow-lg)" }}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Cari penyewa, pemesanan, tagihan, kamar…"
              className="w-full px-5 py-4 text-base outline-none border-b"
              style={{
                backgroundColor: "transparent",
                color: "var(--color-text-primary)",
                borderColor: "var(--color-border)",
              }}
            />
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {loading && (
                <p className="px-5 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Mencari…
                </p>
              )}
              {!loading && error && (
                <p className="px-5 py-3 text-sm" style={{ color: "#DC2626" }}>
                  Gagal memuat hasil pencarian
                </p>
              )}
              {!loading && !error && term.trim().length < 2 && (
                <p className="px-5 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Ketik untuk mencari…
                </p>
              )}
              {!loading && !error && term.trim().length >= 2 && flat.length === 0 && (
                <p className="px-5 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                  Tidak ada hasil
                </p>
              )}
              {!loading && !error &&
                GROUPS.map((g) => {
                  const hits = results[g.key];
                  if (hits.length === 0) return null;
                  return (
                    <div key={g.key} className="py-1">
                      <p
                        className="px-5 py-1 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {g.title}
                      </p>
                      {hits.map((hit) => {
                        flatIndex += 1;
                        const idx = flatIndex;
                        const active = idx === highlight;
                        const showLoc =
                          hit.locationName != null && hit.locationId !== selectedLocationId;
                        return (
                          <button
                            key={`${hit.type}-${hit.id}`}
                            onMouseEnter={() => setHighlight(idx)}
                            onClick={() => go(hit)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left"
                            style={{ backgroundColor: active ? "var(--color-accent-light)" : "transparent" }}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                                {hit.label}
                              </span>
                              <span className="block text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
                                {hit.sublabel}
                              </span>
                            </span>
                            {showLoc && (
                              <span
                                className="shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "var(--color-bg-primary)", color: "var(--color-text-secondary)" }}
                              >
                                {hit.locationName}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
