"use client";

/**
 * Shared error UI for route-level error boundaries (error.tsx). Renders a
 * branded recovery card with a "try again" button wired to Next's `reset()`.
 * In development it also shows the error message and digest to aid debugging.
 */
export function ErrorState({
  error,
  reset,
  title = "Terjadi Kesalahan",
  message = "Maaf, terjadi kesalahan saat memuat halaman ini. Silakan coba lagi.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  message?: string;
}) {
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <div
        className="text-center p-8 rounded-2xl border max-w-md w-full"
        style={{
          backgroundColor: "var(--color-bg-card)",
          borderColor: "var(--color-border)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "#FEE2E2" }}
        >
          <svg className="w-8 h-8" viewBox="0 0 20 20" fill="#DC2626">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h2
          className="text-xl font-semibold mb-2"
          style={{
            fontFamily: "var(--font-display), serif",
            color: "var(--color-text-primary)",
          }}
        >
          {title}
        </h2>
        <p className="mb-6" style={{ color: "var(--color-text-secondary)" }}>
          {message}
        </p>

        {isDev && (
          <pre
            className="text-left text-xs mb-6 p-3 rounded-lg overflow-auto max-h-40"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-danger)",
              border: "1px solid var(--color-border)",
            }}
          >
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        )}

        <button
          onClick={reset}
          className="px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
