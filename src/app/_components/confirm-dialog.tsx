"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal } from "@/app/_components/modal";

export interface ConfirmOptions {
  /** Dialog heading. Defaults to a generic confirmation title. */
  title?: string;
  /** Body text describing the consequence of the action. */
  message: string;
  /** Label for the confirm button. */
  confirmLabel?: string;
  /** Label for the cancel button. */
  cancelLabel?: string;
  /** Style the confirm button as a destructive action (red). */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Provides a branded replacement for the browser `confirm()`. Mount once
 * near the app root; consume via {@link useConfirm}.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  // Track the active resolver so closing via backdrop/Esc resolves to false.
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPending(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        isOpen={pending !== null}
        onClose={() => settle(false)}
        title={pending?.title ?? "Konfirmasi"}
        size="sm"
      >
        {pending && (
          <div className="space-y-5">
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              {pending.message}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => settle(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors duration-150"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {pending.cancelLabel ?? "Batal"}
              </button>
              <button
                autoFocus
                onClick={() => settle(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-all duration-150"
                style={{
                  backgroundColor: pending.danger
                    ? "var(--color-danger)"
                    : "var(--color-accent)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                {pending.confirmLabel ?? "Ya, lanjutkan"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/**
 * Returns an async `confirm(options)` that resolves to `true` when the user
 * confirms and `false` otherwise. Mirrors the imperative flow of the native
 * `confirm()`:
 *
 * ```ts
 * if (!(await confirm({ message: "Hapus item ini?", danger: true }))) return;
 * ```
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}
