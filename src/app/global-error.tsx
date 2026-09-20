"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "no-digest", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, marginBottom: 12 }}>IvaanOps failed to load</h1>
            <p style={{ color: "#475569", marginBottom: 16 }}>
              A server error stopped the app.
              {error.digest ? ` Digest: ${error.digest}.` : ""}
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#065f46",
                color: "white",
                border: 0,
                borderRadius: 8,
                padding: "10px 16px",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
