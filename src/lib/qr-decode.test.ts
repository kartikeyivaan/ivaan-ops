import { describe, expect, it } from "vitest";
import {
  cropCenter,
  decodeQrFromImageData,
  invertColors,
  scaleNearest,
  stretchContrast,
  type QrImageData,
} from "@/lib/qr-decode";

function solidRgba(
  width: number,
  height: number,
  rgb: [number, number, number],
): QrImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

describe("qr-decode helpers", () => {
  it("stretches low-contrast grayscale toward 0–255", () => {
    const source = solidRgba(4, 4, [120, 120, 120]);
    // Punch one darker and one lighter pixel so stretch has range.
    source.data[0] = 100;
    source.data[1] = 100;
    source.data[2] = 100;
    source.data[16] = 140;
    source.data[17] = 140;
    source.data[18] = 140;

    const out = stretchContrast(source);
    const dark = out.data[0]!;
    const light = out.data[16]!;
    expect(dark).toBeLessThan(light);
    expect(dark).toBeLessThanOrEqual(5);
    expect(light).toBeGreaterThanOrEqual(250);
  });

  it("inverts RGB channels", () => {
    const source = solidRgba(1, 1, [10, 20, 30]);
    const out = invertColors(source);
    expect([...out.data.slice(0, 3)]).toEqual([245, 235, 225]);
  });

  it("crops the center square", () => {
    const source = solidRgba(100, 80, [0, 0, 0]);
    // Mark center pixel white so crop retains it.
    const cx = 50;
    const cy = 40;
    const i = (cy * 100 + cx) * 4;
    source.data[i] = 255;
    source.data[i + 1] = 255;
    source.data[i + 2] = 255;

    const cropped = cropCenter(source, 0.5);
    expect(cropped.width).toBe(40);
    expect(cropped.height).toBe(40);
    const mid = ((20 * 40 + 20) * 4);
    expect(cropped.data[mid]).toBe(255);
  });

  it("nearest-neighbor scales without changing corner color", () => {
    const source = solidRgba(2, 2, [0, 0, 0]);
    source.data[0] = 200;
    source.data[1] = 200;
    source.data[2] = 200;
    const scaled = scaleNearest(source, 2);
    expect(scaled.width).toBe(4);
    expect(scaled.height).toBe(4);
    expect(scaled.data[0]).toBe(200);
    expect(scaled.data[4]).toBe(200);
  });

  it("returns null for empty / tiny buffers", () => {
    expect(decodeQrFromImageData({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBeNull();
    expect(decodeQrFromImageData(solidRgba(8, 8, [255, 255, 255]))).toBeNull();
  });
});
