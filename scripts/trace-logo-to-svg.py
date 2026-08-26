"""Trace PNG logo to SVG using potrace."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
import potrace


def trace_png_to_svg(input_path: Path, output_path: Path, threshold: int = 128) -> None:
    img = Image.open(input_path).convert("RGBA")
    width, height = img.size

    # Build binary mask from non-transparent dark pixels.
    rgba = np.array(img)
    alpha = rgba[:, :, 3]
    rgb = rgba[:, :, :3]
    luminance = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    mask = (alpha > 32) & (luminance < threshold)

    bitmap = potrace.Bitmap(mask.astype(np.uint8))
    path = bitmap.trace(turdsize=2, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=1, opttolerance=0.2)

    parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<g fill="#2D2E30" stroke="none">',
    ]

    for curve in path:
        segments = []
        start = curve.start_point
        segments.append(f"M {start.x:.3f} {start.y:.3f}")
        for segment in curve:
            if segment.is_corner:
                c = segment.c
                end = segment.end_point
                segments.append(f"L {c.x:.3f} {c.y:.3f} L {end.x:.3f} {end.y:.3f}")
            else:
                c1 = segment.c1
                c2 = segment.c2
                end = segment.end_point
                segments.append(
                    f"C {c1.x:.3f} {c1.y:.3f} {c2.x:.3f} {c2.y:.3f} {end.x:.3f} {end.y:.3f}"
                )
        segments.append("Z")
        parts.append(f'<path d="{" ".join(segments)}"/>')

    parts.extend(["</g>", "</svg>"])
    output_path.write_text("\n".join(parts), encoding="utf-8")


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        r"C:\Users\pcmve\.cursor\projects\c-Users-pcmve-IvaanWebOps\assets\c__Users_pcmve_AppData_Roaming_Cursor_User_workspaceStorage_c12e8c9bf86751b1c5a7e5e96c3b77f8_images_LOGO_1-removebg-preview-a7cb9aab-cd95-4409-a9d8-73b0a48f1b4e.png"
    )
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(r"c:\Users\pcmve\IvaanWebOps\assets\ivaan-logo.svg")
    trace_png_to_svg(src, dst)
    print(f"Wrote {dst}")
