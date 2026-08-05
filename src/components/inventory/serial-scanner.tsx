"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Aperture, Camera, Flashlight, ZoomIn } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { parseSerialInput } from "@/lib/inventory";
import { captureVideoFrame, decodeQrFromImageData } from "@/lib/qr-decode";
import { cn } from "@/lib/utils";

const FEEDBACK_MS = 2000;
const SAME_CODE_COOLDOWN_MS = 2500;
/** Secondary jsQR pass while live decode misses dense pallet codes. */
const HARDENED_POLL_MS = 450;
/** Preferred zoom steps; clipped to what the device actually supports. */
const ZOOM_STEPS = [1, 2, 3] as const;
const DEFAULT_ZOOM = 2;
/** Larger center ROI gives dense QRs more pixels in the decode canvas. */
const QRBOX_FRACTION = 0.78;

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

function clampZoom(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function availableZoomSteps(min: number, max: number): number[] {
  const steps = ZOOM_STEPS.map((step) => clampZoom(step, min, max)).filter(
    (step, index, all) => all.indexOf(step) === index,
  );
  return steps.length > 0 ? steps : [clampZoom(1, min, max)];
}

function nearestZoomStep(value: number, steps: number[]): number {
  return steps.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );
}

function formatZoomLabel(level: number): string {
  const rounded = Math.round(level * 10) / 10;
  return `${rounded}×`;
}

/** Prefer main rear camera; avoid ultrawide / front / telephoto when labels allow. */
function scoreCameraLabel(label: string): number {
  const l = label.toLowerCase().trim();
  let score = 0;

  if (/(front|user|selfie|face)/.test(l)) score -= 100;
  if (/(ultra\s*-?\s*wide|ultrawide|wide[- ]angle|fisheye)/.test(l)) score -= 50;
  if (/(tele\s*-?\s*photo|telephoto|\btele\b)/.test(l)) score -= 20;
  if (/dual\s*wide/.test(l)) score -= 10;

  if (/(back|rear|environment)/.test(l)) score += 30;
  if (/\b0,\s*facing\s*back\b/.test(l) || /camera2\s*0\b/.test(l)) score += 25;
  if (/^back camera$/.test(l) || /\brear camera\b/.test(l)) score += 20;
  if (/\b(standard|main|primary)\b/.test(l)) score += 15;

  return score;
}

function pickPreferredCameraId(
  cameras: Array<{ id: string; label: string }>,
): string | null {
  if (cameras.length === 0) return null;
  if (cameras.length === 1) return cameras[0].id;

  const ranked = [...cameras].sort(
    (a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label),
  );

  return ranked[0]?.id ?? null;
}

async function resolvePreferredCameraId(
  getCameras: () => Promise<Array<{ id: string; label: string }>>,
): Promise<string | null> {
  try {
    const cameras = await getCameras();
    return pickPreferredCameraId(cameras);
  } catch {
    return null;
  }
}

async function applyPreferredZoom(scanner: Html5Qrcode): Promise<{
  zoomSupported: boolean;
  zoomLevel: number;
}> {
  try {
    const zoom = scanner.getRunningTrackCameraCapabilities().zoomFeature();
    if (!zoom.isSupported()) {
      return { zoomSupported: false, zoomLevel: 1 };
    }
    const min = zoom.min();
    const max = zoom.max();
    const steps = availableZoomSteps(min, max);
    const preferred = nearestZoomStep(DEFAULT_ZOOM, steps);
    await zoom.apply(preferred);
    return { zoomSupported: true, zoomLevel: preferred };
  } catch {
    return { zoomSupported: false, zoomLevel: 1 };
  }
}

function detectTorchSupport(scanner: Html5Qrcode): boolean {
  try {
    return scanner.getRunningTrackCameraCapabilities().torchFeature().isSupported();
  } catch {
    return false;
  }
}

function findScannerVideo(readerId: string): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(`#${CSS.escape(readerId)} video`);
}

function buildVideoConstraints(preferredCameraId: string | null): MediaTrackConstraints {
  // Prefer high-res when available; avoid hard mins so older phones still start.
  const base: MediaTrackConstraints = {
    width: { ideal: 2560 },
    height: { ideal: 1440 },
  };

  if (preferredCameraId) {
    return { ...base, deviceId: { exact: preferredCameraId } };
  }
  return { ...base, facingMode: { ideal: "environment" } };
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
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const busyRef = useRef(false);
  const snapBusyRef = useRef(false);
  const mountedRef = useRef(false);
  const lastHandledRef = useRef<{ raw: string; at: number } | null>(null);
  const handleDecodedRef = useRef<(decodedText: string) => Promise<void>>(async () => undefined);
  const [cameraError, setCameraError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [starting, setStarting] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleDecoded = useCallback(async (decodedText: string) => {
    if (busyRef.current) return;

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
      if (!mountedRef.current) return;

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
      if (!mountedRef.current) return;
      playErrorBeep();
      setFeedback({ kind: "error", text: "Unable to process this scan." });
    }

    window.setTimeout(() => {
      if (!mountedRef.current) {
        busyRef.current = false;
        return;
      }
      setFeedback(null);
      busyRef.current = false;
      try {
        scannerRef.current?.resume();
      } catch {
        /* ignore */
      }
    }, FEEDBACK_MS);
  }, []);

  useEffect(() => {
    handleDecodedRef.current = handleDecoded;
  }, [handleDecoded]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    let hardenedTimer: number | null = null;
    let hardenedBusy = false;
    mountedRef.current = true;

    async function start() {
      setCameraError("");
      setFeedback(null);
      setStarting(true);
      setZoomSupported(false);
      setZoomLevel(1);
      setTorchSupported(false);
      setTorchOn(false);
      setSnapBusy(false);
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
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        });
        scanner = instance;
        scannerRef.current = instance;

        const preferredCameraId = await resolvePreferredCameraId(() =>
          Html5Qrcode.getCameras(),
        );
        if (cancelled) return;

        const videoConstraints = buildVideoConstraints(preferredCameraId);

        await instance.start(
          preferredCameraId ?? { facingMode: "environment" },
          {
            fps: 12,
            // Wider center ROI: dense pallet QRs need more module pixels.
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const edge = Math.floor(
                Math.min(viewfinderWidth, viewfinderHeight) * QRBOX_FRACTION,
              );
              return { width: edge, height: edge };
            },
            disableFlip: false,
            videoConstraints,
          },
          (decodedText) => {
            if (cancelled) return;
            void handleDecodedRef.current(decodedText);
          },
          () => {
            /* ignore frame-level not-found */
          },
        );

        if (cancelled) return;

        const zoomState = await applyPreferredZoom(instance);
        if (!cancelled) {
          setZoomSupported(zoomState.zoomSupported);
          setZoomLevel(zoomState.zoomLevel);
          setTorchSupported(detectTorchSupport(instance));
        }

        // Secondary decode path for high-density labels that live ZXing misses.
        const pollHardened = () => {
          if (cancelled || busyRef.current || snapBusyRef.current || hardenedBusy) return;
          const video = findScannerVideo(readerId);
          if (!video || video.readyState < 2) return;

          hardenedBusy = true;
          try {
            const frame = captureVideoFrame(video, 1280);
            if (!frame) return;

            const decoded = decodeQrFromImageData(frame, "fast");
            if (decoded?.text) {
              void handleDecodedRef.current(decoded.text);
            }
          } finally {
            hardenedBusy = false;
          }
        };

        hardenedTimer = window.setInterval(pollHardened, HARDENED_POLL_MS);
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
      mountedRef.current = false;
      if (hardenedTimer !== null) {
        window.clearInterval(hardenedTimer);
      }
      const active = scanner;
      scannerRef.current = null;
      if (active) {
        void active.stop().catch(() => undefined);
      }
    };
  }, [open, readerId]);

  const snapDenseQr = useCallback(async () => {
    if (busyRef.current || snapBusyRef.current || starting || cameraError) return;

    const video = findScannerVideo(readerId);
    if (!video || video.readyState < 2) {
      playErrorBeep();
      setFeedback({
        kind: "error",
        text: "Camera not ready yet. Wait a moment and try again.",
      });
      window.setTimeout(() => {
        if (mountedRef.current) setFeedback(null);
      }, FEEDBACK_MS);
      return;
    }

    snapBusyRef.current = true;
    setSnapBusy(true);
    try {
      // Full-resolution still capture for dense pallet codes.
      const frame = captureVideoFrame(video, 2200);
      if (!frame) {
        playErrorBeep();
        setFeedback({ kind: "error", text: "Could not capture a frame." });
        window.setTimeout(() => {
          if (mountedRef.current) setFeedback(null);
        }, FEEDBACK_MS);
        return;
      }

      const decoded = decodeQrFromImageData(frame, "full");
      if (!decoded?.text) {
        playErrorBeep();
        setFeedback({
          kind: "error",
          text: "Couldn’t read this QR. Fill the box, hold steady, then Snap again.",
        });
        window.setTimeout(() => {
          if (mountedRef.current) setFeedback(null);
        }, FEEDBACK_MS);
        return;
      }

      await handleDecoded(decoded.text);
    } finally {
      snapBusyRef.current = false;
      setSnapBusy(false);
    }
  }, [cameraError, handleDecoded, readerId, starting]);

  const toggleZoom = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner || controlBusy) return;
    setControlBusy(true);
    try {
      const zoom = scanner.getRunningTrackCameraCapabilities().zoomFeature();
      if (!zoom.isSupported()) return;
      const steps = availableZoomSteps(zoom.min(), zoom.max());
      const current = nearestZoomStep(zoom.value() ?? zoomLevel, steps);
      const currentIndex = steps.indexOf(current);
      const next = steps[(currentIndex + 1) % steps.length] ?? steps[0];
      await zoom.apply(next);
      setZoomLevel(next);
    } catch {
      /* device may reject mid-scan */
    } finally {
      setControlBusy(false);
    }
  }, [controlBusy, zoomLevel]);

  const toggleTorch = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner || controlBusy) return;
    setControlBusy(true);
    try {
      const torch = scanner.getRunningTrackCameraCapabilities().torchFeature();
      if (!torch.isSupported()) return;
      const next = !(torch.value() ?? torchOn);
      await torch.apply(next);
      setTorchOn(next);
    } catch {
      /* device may reject mid-scan */
    } finally {
      setControlBusy(false);
    }
  }, [controlBusy, torchOn]);

  if (!open) return null;

  const zoomLabel = formatZoomLabel(zoomLevel);
  const controlsReady = !starting && !cameraError;

  return (
    <Modal onClose={onClose} size="lg" className="max-w-lg">
      <ModalHeader
        title={title}
        description="Fill the box with the QR. For dense pallet labels, hold steady or tap Snap to read."
        onClose={onClose}
      />
      <ModalBody className="space-y-3">
        <div className="relative overflow-hidden rounded-lg bg-slate-950">
          <div
            id={readerId}
            className="min-h-[280px] w-full overflow-hidden [&_video]:h-auto [&_video]:w-full"
          />
          {starting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-sm text-white">
              Starting camera…
            </div>
          ) : null}
          {controlsReady ? (
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-10 min-w-14 bg-white/90 px-3 text-slate-900 shadow hover:bg-white"
                disabled={snapBusy}
                onClick={() => void snapDenseQr()}
                aria-label="Snap a still frame and decode dense QR"
              >
                <Aperture className="h-4 w-4" />
                {snapBusy ? "…" : "Snap"}
              </Button>
              {zoomSupported ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-10 min-w-14 bg-white/90 px-3 text-slate-900 shadow hover:bg-white"
                  disabled={controlBusy}
                  onClick={() => void toggleZoom()}
                  aria-label={`Current zoom ${zoomLabel}. Tap to cycle 1×, 2×, 3×`}
                >
                  <ZoomIn className="h-4 w-4" />
                  {zoomLabel}
                </Button>
              ) : null}
              {torchSupported ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className={cn(
                    "h-10 min-w-14 bg-white/90 px-3 text-slate-900 shadow hover:bg-white",
                    torchOn && "bg-amber-200 hover:bg-amber-200",
                  )}
                  disabled={controlBusy}
                  onClick={() => void toggleTorch()}
                  aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
                >
                  <Flashlight className="h-4 w-4" />
                  {torchOn ? "On" : "Off"}
                </Button>
              ) : null}
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
          Dense pallet QRs need a sharp frame — prefer 2×/3× zoom over moving closer. If live scan
          stalls, tap Snap. Comma-separated serial lists are accepted; paste/type still works if you
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
