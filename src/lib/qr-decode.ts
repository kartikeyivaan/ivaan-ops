import jsQR from "jsqr";

export type QrImageData = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type QrDecodeResult = {
  text: string;
  /** Which preprocessing pass succeeded. */
  pass: string;
};

type DecodePass = {
  name: string;
  run: (source: QrImageData) => QrImageData;
};

function cloneImageData(source: QrImageData): QrImageData {
  return {
    data: new Uint8ClampedArray(source.data),
    width: source.width,
    height: source.height,
  };
}

/** Stretch luminance so dense/low-contrast labels separate better. */
export function stretchContrast(source: QrImageData): QrImageData {
  const out = cloneImageData(source);
  const { data } = out;
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8;
    if (y < min) min = y;
    if (y > max) max = y;
  }

  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8;
    const stretched = Math.round(((y - min) * 255) / range);
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }

  return out;
}

/** Invert black/white — helps some print/ink combinations. */
export function invertColors(source: QrImageData): QrImageData {
  const out = cloneImageData(source);
  const { data } = out;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]!;
    data[i + 1] = 255 - data[i + 1]!;
    data[i + 2] = 255 - data[i + 2]!;
  }
  return out;
}

/** Center crop as a fraction of the shorter edge (0–1). */
export function cropCenter(source: QrImageData, fraction: number): QrImageData {
  const edge = Math.max(
    32,
    Math.floor(Math.min(source.width, source.height) * Math.min(1, Math.max(0.2, fraction))),
  );
  const sx = Math.floor((source.width - edge) / 2);
  const sy = Math.floor((source.height - edge) / 2);
  const data = new Uint8ClampedArray(edge * edge * 4);

  for (let y = 0; y < edge; y++) {
    const srcRow = ((sy + y) * source.width + sx) * 4;
    const dstRow = y * edge * 4;
    data.set(source.data.subarray(srcRow, srcRow + edge * 4), dstRow);
  }

  return { data, width: edge, height: edge };
}

/** Nearest-neighbor upscale — preserves module edges on dense QRs. */
export function scaleNearest(source: QrImageData, factor: number): QrImageData {
  if (factor === 1) return cloneImageData(source);
  const width = Math.max(1, Math.round(source.width * factor));
  const height = Math.max(1, Math.round(source.height * factor));
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const sy = Math.min(source.height - 1, Math.floor(y / factor));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor(x / factor));
      const si = (sy * source.width + sx) * 4;
      const di = (y * width + x) * 4;
      data[di] = source.data[si]!;
      data[di + 1] = source.data[si + 1]!;
      data[di + 2] = source.data[si + 2]!;
      data[di + 3] = source.data[si + 3]!;
    }
  }

  return { data, width, height };
}

function tryJsQr(image: QrImageData): string | null {
  const code = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "attemptBoth",
  });
  const text = code?.data?.trim();
  return text ? text : null;
}

const FAST_PASSES: DecodePass[] = [
  { name: "raw", run: (s) => s },
  { name: "contrast", run: stretchContrast },
  { name: "crop-0.8-contrast", run: (s) => stretchContrast(cropCenter(s, 0.8)) },
];

const FULL_PASSES: DecodePass[] = [
  ...FAST_PASSES,
  { name: "invert", run: invertColors },
  { name: "contrast-invert", run: (s) => invertColors(stretchContrast(s)) },
  { name: "crop-0.7-contrast", run: (s) => stretchContrast(cropCenter(s, 0.7)) },
  { name: "scale-1.5-contrast", run: (s) => stretchContrast(scaleNearest(s, 1.5)) },
  { name: "scale-2-contrast", run: (s) => stretchContrast(scaleNearest(s, 2)) },
];

export type QrDecodeMode = "fast" | "full";

/**
 * Multi-pass QR decode tuned for dense pallet labels (high version, low contrast).
 * `fast` is for the live secondary poll; `full` for still Snap captures.
 */
export function decodeQrFromImageData(
  source: QrImageData,
  mode: QrDecodeMode = "full",
): QrDecodeResult | null {
  if (source.width < 16 || source.height < 16 || source.data.length < 64) {
    return null;
  }

  const passes = mode === "fast" ? FAST_PASSES : FULL_PASSES;

  for (const pass of passes) {
    try {
      const prepared = pass.run(source);
      const text = tryJsQr(prepared);
      if (text) return { text, pass: pass.name };
    } catch {
      /* try next pass */
    }
  }

  return null;
}

/** Grab RGBA pixels from a video element (optionally limited to a max edge). */
export function captureVideoFrame(
  video: HTMLVideoElement,
  maxEdge = 1600,
): QrImageData | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const scale = Math.min(1, maxEdge / Math.max(vw, vh));
  const width = Math.max(1, Math.round(vw * scale));
  const height = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  return { data: image.data, width: image.width, height: image.height };
}
