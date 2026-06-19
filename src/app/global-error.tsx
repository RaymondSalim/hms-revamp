"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches errors thrown in the root layout itself.
 * It replaces the entire document, so it must render its own <html>/<body>
 * and cannot depend on globals.css or the app's CSS variables being present.
 * Styles are therefore inlined.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global root error:", error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FEFBF6",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: 16,
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: 32,
            borderRadius: 16,
            border: "1px solid #E7E5E4",
            backgroundColor: "#FFFFFF",
            maxWidth: 420,
            width: "100%",
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#1E293B",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            Terjadi Kesalahan
          </h2>
          <p style={{ color: "#64748B", marginBottom: 24 }}>
            Maaf, terjadi kesalahan tak terduga. Silakan coba lagi.
          </p>

          {isDev && (
            <pre
              style={{
                textAlign: "left",
                fontSize: 12,
                marginBottom: 24,
                padding: 12,
                borderRadius: 8,
                overflow: "auto",
                maxHeight: 160,
                backgroundColor: "#FEFBF6",
                color: "#DC2626",
                border: "1px solid #E7E5E4",
              }}
            >
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          )}

          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 500,
              color: "#FFFFFF",
              backgroundColor: "#C2410C",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Coba Lagi
          </button>
        </div>
      </body>
    </html>
  );
}
