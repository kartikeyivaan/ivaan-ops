"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { parseSerialInput } from "@/lib/inventory";
import { cn } from "@/lib/utils";

const FEEDBACK_MS = 2000;
const SAME_CODE_COOLDOWN_MS = 2500;

export type SerialScanResult =
  | { ok: true; message?: string }
  | { ok: false; reason: string };

type Feedback =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

function vibrateSuccess() {
  try {
    navigator.vibrate?.(80);
  } catch {
    /* ignore */
  }
}

function playErrorBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 420;
    gain.gain.value = 0.09;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    window.setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 200);
  } catch {
    /* ignore */
  }
}

function formatScanMessage(serials: string[], fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  const text = serials.join(", ");
  if (text.length <= 80) return text;
  return `${text.slice(0, 77)}…`;
}

export function SerialScanner({
  open,
  onClose,
  onScan,
  title = "Scan serial numbers",
}: {
  open: boolean;
  onClose: () => void;
  onScan: (serials: string[]) => Promise<SerialScanResult>;
  title?: string;
}) {
  const reactId = useId().replace(/:/g, "");
  const readerId = `serial-scanner-${reactId}`;
  const scannerRef = useRef<{
    stop: () => Promise<void>;
    pause: (shouldPauseVideo?: boolean) => void;
    resume: () => void;
    getState: () => number;
  } | null>(null);
  const onScanRef = useRef(onScan);
  const busyRef = useRef(false);
  const lastHandledRef = useRef<{ raw: string; at: number } | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let scanner: (typeof scannerRef)["current"] = null;

    async function start() {
      setCameraError("");
      setFeedback(null);
      setStarting(true);
      busyRef.current = false;
      lastHandledRef.current = null;

      if (typeof window !== "undefined" && !window.isSecureContext) {
        setCameraError(
          "Camera needs HTTPS (or localhost). Open the app on a secure URL to scan.",
        );
        setStarting(false);
        return;
      }

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;

        const instance = new Html5Qrcode(readerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          verbose: false,
        });
        scanner = instance;
        scannerRef.current = instance;

        await instance.start(
          { facingMode: "environment" },
          {
            fps: 8,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
              return { width: edge, height: edge };
            },
            aspectRatio: 1,
            disableFlip: false,
          },
          async (decodedText) => {
            if (cancelled || busyRef.current) return;

            const now = Date.now();
            const last = lastHandledRef.current;
            if (last && last.raw === decodedText && now - last.at < SAME_CODE_COOLDOWN_MS) {
              return;
            }

            const serials = parseSerialInput(decodedText);
            if (serials.length === 0) return;

            busyRef.current = true;
            lastHandledRef.current = { raw: decodedText, at: now };

            try {
              scannerRef.current?.pause(true);
            } catch {
              /* ignore */
            }

            try {
              const result = await onScanRef.current(serials);
              if (cancelled) return;

              if (result.ok) {
                vibrateSuccess();
                setFeedback({
                  kind: "success",
                  text: formatScanMessage(serials, result.message),
                });
              } else {
                playErrorBeep();
                setFeedback({ kind: "error", text: result.reason });
              }
            } catch {
              if (cancelled) return;
              playErrorBeep();
              setFeedback({ kind: "error", text: "Unable to process this scan." });
            }

            window.setTimeout(() => {
              if (cancelled) return;
              setFeedback(null);
              busyRef.current = false;
              try {
                scannerRef.current?.resume();
              } catch {
                /* ignore */
              }
            }, FEEDBACK_MS);
          },
          () => {
            /* ignore frame-level not-found */
          },
        );
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Unable to open the camera.";
        setCameraError(
          message.includes("Permission") || message.includes("NotAllowed")
            ? "Camera permission denied. Allow camera access and try again."
            : message,
        );
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
      const active = scanner;
      scannerRef.current = null;
      if (active) {
        void active.stop().catch(() => undefined);
      }
    };
  }, [open, readerId]);

  if (!open) return null;

  return (
    <Modal onClose={onClose} size="lg" className="max-w-lg">
      <ModalHeader
        title={title}
        description="Point at a QR code or barcode. Camera stays open for continuous scanning."
        onClose={onClose}
      />
      <ModalBody className="space-y-3">
        <div className="relative overflow-hidden rounded-lg bg-slate-950">
          <div id={readerId} className="min-h-[280px] w-full overflow-hidden [&_video]:h-auto [&_video]:w-full" />
          {starting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-sm text-white">
              Starting camera…
            </div>
          ) : null}
          {feedback ? (
            <div
              className={cn(
                "absolute inset-x-3 bottom-3 rounded-md px-3 py-3 text-center text-sm font-medium shadow-lg",
                feedback.kind === "success"
                  ? "bg-emerald-600 text-white"
                  : "bg-red-600 text-white",
              )}
            >
              <p className="break-all">{feedback.text}</p>
            </div>
          ) : null}
        </div>
        {cameraError ? <p className="text-sm text-red-600">{cameraError}</p> : null}
        <p className="text-xs text-slate-500">
          Pallet codes with comma-separated serials are accepted. Paste/type still works if you
          close the scanner.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="outline" className="h-12 w-full" onClick={onClose}>
          Done
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function ScanSerialsButton({
  onClick,
  disabled,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("h-12", className)}
      disabled={disabled}
      onClick={onClick}
    >
      <Camera className="h-4 w-4" />
      Scan
    </Button>
  );
}
