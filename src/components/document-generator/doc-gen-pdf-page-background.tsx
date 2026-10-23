"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a single-page background PDF into a canvas sized to the designer page box
 * so overlay fields align with form lines on the official PDF.
 */
export function DocGenPdfPageBackground({
  pdfUrl,
  widthPx,
  heightPx,
}: {
  pdfUrl: string;
  widthPx: number;
  heightPx: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;

    async function renderPage() {
      setStatus("loading");
      try {
        const pdfjs = await import("pdfjs-dist");
        // Pin worker to the installed pdfjs-dist version (avoids shipping a 1MB+ file in /public).
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const response = await fetch(pdfUrl, { credentials: "same-origin" });
        if (!response.ok) throw new Error("Failed to load background PDF.");
        const data = new Uint8Array(await response.arrayBuffer());
        const doc = await pdfjs.getDocument({ data }).promise;
        const page = await doc.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        const base = page.getViewport({ scale: 1 });
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const scale = (widthPx / base.width) * dpr;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${widthPx}px`;
        canvas.style.height = `${heightPx}px`;

        const task = page.render({
          canvasContext: context,
          viewport,
        });
        renderTask = task;
        await task.promise;
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfUrl, widthPx, heightPx]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-white">
      <canvas ref={canvasRef} className="block" aria-hidden />
      {status === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-slate-600">
          Loading PDF background…
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50/90 px-4 text-center text-xs text-amber-900">
          Could not render the uploaded PDF background. You can still place fields; try re-uploading if this persists.
        </div>
      ) : null}
    </div>
  );
}
