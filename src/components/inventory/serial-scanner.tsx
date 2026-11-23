"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Aperture, Barcode, Camera, Flashlight, QrCode, X, ZoomIn } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { parseSerialInput } from "@/lib/inventory";
import { captureVideoFrame, decodeQrFromImageData } from "@/lib/qr-decode";
import { cn } from "@/lib/utils";

/** Success banner stays this long (ms). Scanning keeps running meanwhile. */
const FEEDBACK_OK_MS = 1200;
/** Error banner stays this long (ms). */
const FEEDBACK_ERR_MS = 2500;
/** The same serial cannot be scanned again within this window (per open session). */
const REPEAT_BLOCK_MS = 10_000;
/** Minimum gap between "already scanned" notices for the same code. */
const DUP_NOTICE_MS = 2000;
/** Preferred zoom steps; clipped to what the device actually supports. */
const ZOOM_STEPS = [1, 2, 3] as const;
const DEFAULT_ZOOM = 2;
/**
 * Square focus box (QR / DataMatrix) as a fraction of the shorter screen edge.
 * Kept below the top and bottom control bars so the box is never covered.
 */
const QR_BOX_FRACTION = 0.6;
const MODE_STORAGE_KEY = "serial-scanner-mode";

export type ScanMode = "qr" | "barcode";

export type SerialScanResult =
  | { ok: true; message?: string }
  | { ok: false; reason: string };

type Feedback =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | { kind: "info"; text: string };

// ---------- Audio & haptics -------------------------------------------------

let sharedAudioCtx: AudioContext | null = null;

/** One AudioContext per page, created/resumed inside a user gesture (required on iOS). */
function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === "suspended") void sharedAudioCtx.resume();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playTone(frequency: number, durationMs: number, type: OscillatorType, volume: number) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime;
    osc.start(start);
    osc.stop(start + durationMs / 1000);
  } catch {
    /* ignore */
  }
}

/** Short, pleasant high beep for a successful scan. */
function playSuccessBeep() {
  playTone(1046, 130, "sine", 0.25);
}

/** Low buzz for a wrong / rejected scan. */
function playErrorBeep() {
  playTone(330, 260, "square", 0.12);
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported (e.g. iOS Safari) */
  }
}

// ---------- Helpers ----------------------------------------------------------

const QR_FORMAT_NAMES = ["QR_CODE", "DATA_MATRIX"] as const;
const BARCODE_FORMAT_NAMES = [
  "CODE_128",
  "CODE_39",
  "CODE_93",
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
  "ITF",
] as const;

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
    const steps = availableZoomSteps(zoom.min(), zoom.max());
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
  // 720p is plenty for labels and decodes much faster than 1440p on phones.
  const base: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
  };

  if (preferredCameraId) {
    return { ...base, deviceId: { exact: preferredCameraId } };
  }
  return { ...base, facingMode: { ideal: "environment" } };
}

/** Square box for QR / DataMatrix. */
function squareQrbox(viewfinderWidth: number, viewfinderHeight: number) {
  const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * QR_BOX_FRACTION);
  return { width: edge, height: edge };
}

/** Wide, short strip for 1D barcodes (Code 128, EAN, UPC …). */
function barcodeStripQrbox(viewfinderWidth: number, viewfinderHeight: number) {
  const width = Math.floor(viewfinderWidth * 0.9);
  const height = Math.floor(Math.max(90, Math.min(viewfinderHeight * 0.3, width * 0.35)));
  return { width, height };
}

function loadStoredMode(): ScanMode {
  try {
    const value = window.localStorage.getItem(MODE_STORAGE_KEY);
    return value === "barcode" ? "barcode" : "qr";
  } catch {
    return "qr";
  }
}

// ---------- Component --------------------------------------------------------

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
  const stopPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const onScanRef = useRef(onScan);
  const snapBusyRef = useRef(false);
  const mountedRef = useRef(false);
  /** Serial-key -> time it was accepted. Cleared each time the scanner opens. */
  const recentScansRef = useRef<Map<string, number>>(new Map());
  const lastDupNoticeRef = useRef<{ key: string; at: number } | null>(null);
  /** Scans are processed one at a time so the parent's onScan never runs concurrently. */
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const feedbackTimerRef = useRef<number | null>(null);
  const handleDecodedRef = useRef<(decodedText: string) => Promise<void>>(async () => undefined);

  const [mode, setMode] = useState<ScanMode>(() =>
    typeof window === "undefined" ? "qr" : loadStoredMode(),
  );
  const [layoutKey, setLayoutKey] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [starting, setStarting] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  /** Full-screen scanner: Escape closes it and page scrolling is locked while open. */
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  /** Unlock audio on the first tap inside the scanner (iOS requires a user gesture). */
  const unlockAudio = useCallback(() => {
    getAudioContext();
  }, []);

  const showFeedback = useCallback((next: Feedback, durationMs: number) => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setFeedback(next);
    feedbackTimerRef.current = window.setTimeout(() => {
      feedbackTimerRef.current = null;
      setFeedback(null);
    }, durationMs);
  }, []);

  const failScan = useCallback(
    (reason: string) => {
      playErrorBeep();
      vibrate([200, 100, 200]);
      showFeedback({ kind: "error", text: reason }, FEEDBACK_ERR_MS);
    },
    [showFeedback],
  );

  const processScan = useCallback(
    async (decodedText: string) => {
      const serials = parseSerialInput(decodedText);
      if (serials.length === 0) {
        failScan("No serial found in this label.");
        return;
      }

      const now = Date.now();
      const key = serials.join("|");

      // Forget entries older than the block window.
      for (const [k, at] of recentScansRef.current) {
        if (now - at >= REPEAT_BLOCK_MS) recentScansRef.current.delete(k);
      }

      if (recentScansRef.current.has(key)) {
        const last = lastDupNoticeRef.current;
        if (!last || last.key !== key || now - last.at >= DUP_NOTICE_MS) {
          lastDupNoticeRef.current = { key, at: now };
          showFeedback(
            { kind: "info", text: `Already scanned: ${formatScanMessage(serials)}` },
            FEEDBACK_OK_MS,
          );
        }
        return;
      }

      // Block repeats immediately; released again if the server rejects the scan.
      recentScansRef.current.set(key, now);

      try {
        const result = await onScanRef.current(serials);
        if (!mountedRef.current) return;

        if (result.ok) {
          playSuccessBeep();
          vibrate(40);
          setScannedCount((count) => count + 1);
          showFeedback(
            { kind: "success", text: formatScanMessage(serials, result.message) },
            FEEDBACK_OK_MS,
          );
        } else {
          recentScansRef.current.delete(key);
          failScan(result.reason);
        }
      } catch {
        recentScansRef.current.delete(key);
        if (mountedRef.current) failScan("Unable to process this scan.");
      }
    },
    [failScan, showFeedback],
  );

  const handleDecoded = useCallback(
    (decodedText: string) => {
      queueRef.current = queueRef.current.then(() => processScan(decodedText));
      return queueRef.current;
    },
    [processScan],
  );

  useEffect(() => {
    handleDecodedRef.current = handleDecoded;
  }, [handleDecoded]);

  // Rotating the device changes the viewfinder size, so restart the camera for the new layout.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    let landscape = window.innerWidth > window.innerHeight;
    let timer: number | null = null;

    const onLayoutChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const nowLandscape = window.innerWidth > window.innerHeight;
        if (nowLandscape !== landscape) {
          landscape = nowLandscape;
          setLayoutKey((key) => key + 1);
        }
      }, 400);
    };

    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("orientationchange", onLayoutChange);
    return () => {
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("orientationchange", onLayoutChange);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    async function start() {
      setCameraError("");
      setFeedback(null);
      setStarting(true);
      setZoomSupported(false);
      setZoomLevel(1);
      setTorchSupported(false);
      setTorchOn(false);
      setSnapBusy(false);
      setScannedCount(0);
      recentScansRef.current = new Map();
      lastDupNoticeRef.current = null;
      getAudioContext();

      // Wait for a previous instance (e.g. before rotation restart) to release the camera.
      await stopPromiseRef.current;
      if (cancelled) return;

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

        // Only enable the formats this mode needs: fewer formats = faster decoding.
        const formatNames = mode === "barcode" ? BARCODE_FORMAT_NAMES : QR_FORMAT_NAMES;
        const formatsToSupport = formatNames.map(
          (name) => Html5QrcodeSupportedFormats[name],
        );

        const instance = new Html5Qrcode(readerId, {
          formatsToSupport,
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
            qrbox: mode === "barcode" ? barcodeStripQrbox : squareQrbox,
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
        stopPromiseRef.current = (async () => {
          try {
            await active.stop();
          } catch {
            /* already stopped */
          }
          try {
            active.clear();
          } catch {
            /* ignore */
          }
        })();
      }
    };
  }, [open, readerId, mode, layoutKey]);

  const changeMode = useCallback((next: ScanMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const snapDenseQr = useCallback(async () => {
    if (snapBusyRef.current || starting || cameraError) return;

    const video = findScannerVideo(readerId);
    if (!video || video.readyState < 2) {
      failScan("Camera not ready yet. Wait a moment and try again.");
      return;
    }

    snapBusyRef.current = true;
    setSnapBusy(true);
    try {
      // Full-resolution still capture for dense pallet codes (on demand only).
      const frame = captureVideoFrame(video, 2200);
      if (!frame) {
        failScan("Could not capture a frame.");
        return;
      }

      const decoded = decodeQrFromImageData(frame, "full");
      if (!decoded?.text) {
        failScan("Couldn’t read this QR. Center it in the box, then Snap again.");
        return;
      }

      await handleDecoded(decoded.text);
    } finally {
      snapBusyRef.current = false;
      setSnapBusy(false);
    }
  }, [cameraError, failScan, handleDecoded, readerId, starting]);

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

  const controlButton =
    "flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDownCapture={unlockAudio}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white"
    >
      {/* Camera fills the whole screen; overlays sit on top of it. */}
      <div className="absolute inset-0">
        <div
          id={readerId}
          className="absolute inset-0 overflow-hidden [&>div]:!absolute [&>div]:!inset-0 [&>div]:!h-full [&>div]:!w-full [&_video]:!absolute [&_video]:!inset-0 [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
        />
        {starting ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 text-sm">
            Starting camera…
          </div>
        ) : null}
      </div>

      {/* Top bar: title, mode toggle, close. */}
      <div className="relative z-10 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-8 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h3>
        <div role="group" aria-label="Scan mode" className="flex shrink-0 rounded-full bg-white/15 p-1">
          {(["qr", "barcode"] as const).map((option) => {
            const active = mode === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => changeMode(option)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                  active ? "bg-white text-slate-900" : "text-white",
                )}
              >
                {option === "qr" ? (
                  <QrCode className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Barcode className="h-3.5 w-3.5" aria-hidden />
                )}
                {option === "qr" ? "QR" : "Barcode"}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1" />

      {/* Result banner and errors sit just above the bottom bar. */}
      {feedback ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "pointer-events-none relative z-10 mx-3 mb-3 rounded-lg px-3 py-3 text-center text-sm font-semibold shadow-lg",
            feedback.kind === "success" && "bg-emerald-600 text-white",
            feedback.kind === "error" && "bg-red-600 text-white",
            feedback.kind === "info" && "bg-amber-400 text-slate-900",
          )}
        >
          <p className="break-all">{feedback.text}</p>
        </div>
      ) : null}
      {cameraError ? (
        <p className="relative z-10 mx-3 mb-3 rounded-lg bg-red-600 px-3 py-2 text-center text-sm">
          {cameraError}
        </p>
      ) : null}

      {/* Bottom bar: capture controls and Done. */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8">
        {controlsReady && mode === "qr" ? (
          <button
            type="button"
            className={controlButton}
            disabled={snapBusy}
            onClick={() => void snapDenseQr()}
            aria-label="Snap a still frame and decode dense QR"
          >
            <Aperture className="h-4 w-4" />
            {snapBusy ? "…" : "Snap"}
          </button>
        ) : null}
        {controlsReady && zoomSupported ? (
          <button
            type="button"
            className={controlButton}
            disabled={controlBusy}
            onClick={() => void toggleZoom()}
            aria-label={`Current zoom ${zoomLabel}. Tap to cycle 1×, 2×, 3×`}
          >
            <ZoomIn className="h-4 w-4" />
            {zoomLabel}
          </button>
        ) : null}
        {controlsReady && torchSupported ? (
          <button
            type="button"
            className={cn(controlButton, torchOn && "bg-amber-300 text-slate-900 hover:bg-amber-200")}
            disabled={controlBusy}
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
          >
            <Flashlight className="h-4 w-4" />
            {torchOn ? "Light on" : "Light"}
          </button>
        ) : null}
        <span className="px-2 text-sm text-white/90">
          Scanned <strong className="tabular-nums">{scannedCount}</strong>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-semibold text-slate-900 hover:bg-slate-100"
        >
          Done
        </button>
      </div>
    </div>
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
