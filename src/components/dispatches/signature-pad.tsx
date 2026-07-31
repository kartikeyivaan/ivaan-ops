"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const LOGICAL_WIDTH = 480;
const LOGICAL_HEIGHT = 160;

type SignaturePadProps = {
  onChange: (dataUrl: string | null) => void;
};

export function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const strokeDrawnRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = LOGICAL_WIDTH * ratio;
    canvas.height = LOGICAL_HEIGHT * ratio;
    canvas.style.width = "100%";
    canvas.style.height = `${LOGICAL_HEIGHT}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.5;
    context.strokeStyle = "#0f172a";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }, []);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT,
    };
  }

  function emitSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    drawingRef.current = true;
    strokeDrawnRef.current = false;
    lastPointRef.current = point;
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const point = pointFromEvent(event);
    const last = lastPointRef.current;
    if (!canvas || !context || !point || !last) return;

    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
    strokeDrawnRef.current = true;
    if (!hasInk) setHasInk(true);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture(event.pointerId);
    if (strokeDrawnRef.current) {
      setHasInk(true);
      emitSignature();
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className="space-y-2 md:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Receiver Signature (optional)</Label>
        <Button type="button" variant="outline" className="h-9" onClick={clear} disabled={!hasInk}>
          Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full touch-none rounded-md border border-slate-200 bg-white"
        style={{ height: LOGICAL_HEIGHT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <p className="text-xs text-slate-500">
        Sign with finger or stylus on a touch device. Leave blank if not available.
      </p>
    </div>
  );
}
