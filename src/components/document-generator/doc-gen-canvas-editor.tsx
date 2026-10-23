"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasElement, CanvasPage } from "@/lib/doc-gen-template-content";
import { DocGenPdfPageBackground } from "@/components/document-generator/doc-gen-pdf-page-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_SCALE = 0.85;
const FULL_PAGE_PADDING = 48;

function newElementId() {
  return `el_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundPt(value: number) {
  return Math.round(value * 10) / 10;
}

function elementBoxHeight(element: CanvasElement) {
  return "height" in element ? element.height : element.fontSize;
}

type DragState = {
  id: string;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function fitScale(pageWidthPt: number, pageHeightPt: number, fullPage: boolean): number {
  if (typeof window === "undefined") return DEFAULT_SCALE;
  const availW = fullPage
    ? Math.max(320, window.innerWidth - 520 - FULL_PAGE_PADDING * 2)
    : Math.max(320, Math.min(window.innerWidth - 560, 1100));
  const availH = fullPage
    ? Math.max(360, window.innerHeight - FULL_PAGE_PADDING * 2 - 56)
    : Math.max(420, window.innerHeight * 0.62);
  return Math.min(availW / pageWidthPt, availH / pageHeightPt, fullPage ? 2 : 1.15);
}

export function DocGenCanvasEditor({
  pages,
  onChange,
  fields,
  mode,
  templateId,
  versionId,
  hasBackground,
}: {
  pages: CanvasPage[];
  onChange: (pages: CanvasPage[]) => void;
  fields: Array<{ id: string; fieldKey: string; label: string }>;
  mode: "CANVAS" | "PDF_BACKGROUND";
  templateId?: string;
  versionId?: string;
  hasBackground?: boolean;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullPage, setFullPage] = useState(false);
  const [scaleMode, setScaleMode] = useState<"fit" | "manual">("fit");
  const [manualScale, setManualScale] = useState(DEFAULT_SCALE);
  const [viewportTick, setViewportTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const page = pages[pageIndex] ?? pages[0];
  const selected = page?.elements.find((el) => el.id === selectedId) ?? null;
  const pageRef = useRef(page);
  const pagesRef = useRef(pages);
  const pageIndexRef = useRef(pageIndex);
  const scaleRef = useRef(DEFAULT_SCALE);
  const onChangeRef = useRef(onChange);
  pageRef.current = page;
  pagesRef.current = pages;
  pageIndexRef.current = pageIndex;
  onChangeRef.current = onChange;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!fullPage && scaleMode !== "fit") return;
    const onResize = () => setViewportTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fullPage, scaleMode]);

  useEffect(() => {
    if (!fullPage) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullPage(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullPage]);

  const scale = useMemo(() => {
    void viewportTick;
    if (!page) return DEFAULT_SCALE;
    if (scaleMode === "manual") return manualScale;
    if (!mounted) return DEFAULT_SCALE;
    return fitScale(page.widthPt, page.heightPt, fullPage);
  }, [page, scaleMode, manualScale, fullPage, viewportTick, mounted]);
  scaleRef.current = scale;

  const display = useMemo(() => {
    if (!page) return { width: 0, height: 0 };
    return { width: page.widthPt * scale, height: page.heightPt * scale };
  }, [page, scale]);

  const backgroundUrl = useMemo(() => {
    if (mode !== "PDF_BACKGROUND" || !hasBackground || !templateId || !versionId || !page) {
      return null;
    }
    const params = new URLSearchParams({
      versionId,
      pageIndex: String(page.pageIndex),
    });
    return `/api/document-generator/templates/${templateId}/background?${params.toString()}`;
  }, [mode, hasBackground, templateId, versionId, page]);

  function updatePage(next: CanvasPage) {
    onChange(pages.map((p, index) => (index === pageIndex ? next : p)));
  }

  function patchElementPosition(elementId: string, x: number, y: number) {
    const currentPage = pageRef.current;
    if (!currentPage) return;
    const nextPages = pagesRef.current.map((p, index) => {
      if (index !== pageIndexRef.current) return p;
      return {
        ...p,
        elements: p.elements.map((el) =>
          el.id === elementId ? ({ ...el, x, y } as CanvasElement) : el,
        ),
      };
    });
    onChangeRef.current(nextPages);
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>, element: CanvasElement) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(element.id);
    setDraggingId(element.id);
    dragRef.current = {
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: element.x,
      originY: element.y,
      width: element.width,
      height: elementBoxHeight(element),
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.currentTarget.dataset.elementId) return;
    const currentPage = pageRef.current;
    if (!currentPage) return;

    const dx = (event.clientX - drag.startClientX) / scaleRef.current;
    const dy = (event.clientY - drag.startClientY) / scaleRef.current;

    const maxX = Math.max(0, currentPage.widthPt - drag.width);
    const maxY = Math.max(0, currentPage.heightPt - drag.height);
    const x = roundPt(clamp(drag.originX + dx, 0, maxX));
    const y = roundPt(clamp(drag.originY + dy, 0, maxY));
    patchElementPosition(drag.id, x, y);
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.id === event.currentTarget.dataset.elementId) {
      dragRef.current = null;
      setDraggingId(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function addField(field: { id: string; fieldKey: string }) {
    if (!page) return;
    const element: CanvasElement = {
      kind: "field",
      id: newElementId(),
      fieldId: field.id,
      fieldKey: field.fieldKey,
      x: 48,
      y: 48,
      width: 220,
      height: 28,
      fontSize: 11,
      align: "left",
    };
    updatePage({ ...page, elements: [...page.elements, element] });
    setSelectedId(element.id);
  }

  function addStaticText() {
    if (!page) return;
    const element: CanvasElement = {
      kind: "text",
      id: newElementId(),
      text: "Static label",
      x: 48,
      y: 96,
      width: 200,
      fontSize: 11,
      align: "left",
    };
    updatePage({ ...page, elements: [...page.elements, element] });
    setSelectedId(element.id);
  }

  function patchSelected(patch: Partial<CanvasElement>) {
    if (!page || !selected) return;
    updatePage({
      ...page,
      elements: page.elements.map((el) =>
        el.id === selected.id ? ({ ...el, ...patch } as CanvasElement) : el,
      ),
    });
  }

  function removeSelected() {
    if (!page || !selected) return;
    updatePage({ ...page, elements: page.elements.filter((el) => el.id !== selected.id) });
    setSelectedId(null);
  }

  if (!page) {
    return (
      <p className="text-sm text-slate-500">
        {mode === "PDF_BACKGROUND"
          ? "Upload a PDF background to begin placing fields."
          : "No pages configured."}
      </p>
    );
  }

  const tools = (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {pages.length > 1 ? (
        <div>
          <Label className="text-xs text-slate-500">Page</Label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={pageIndex}
            onChange={(e) => {
              setPageIndex(Number(e.target.value));
              setSelectedId(null);
            }}
          >
            {pages.map((p, index) => (
              <option key={p.pageIndex} value={index}>
                Page {p.pageIndex + 1}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={fullPage ? "default" : "outline"}
          className="flex-1"
          onClick={() => {
            setFullPage((open) => !open);
            setScaleMode("fit");
          }}
        >
          {fullPage ? "Exit full page" : "Full page mode"}
        </Button>
      </div>
      <div>
        <Label className="text-xs text-slate-500">Zoom</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={scaleMode === "fit" ? "default" : "outline"}
            onClick={() => setScaleMode("fit")}
          >
            Fit
          </Button>
          {[0.75, 1, 1.25, 1.5].map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={scaleMode === "manual" && manualScale === value ? "default" : "outline"}
              onClick={() => {
                setScaleMode("manual");
                setManualScale(value);
              }}
            >
              {Math.round(value * 100)}%
            </Button>
          ))}
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" className="w-full" onClick={addStaticText}>
        Add static text
      </Button>
      <p className="text-xs font-semibold uppercase text-slate-500">Fields</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {fields.map((field) => (
          <li key={field.id}>
            <button
              type="button"
              className="w-full rounded px-2 py-1 text-left hover:bg-white"
              onClick={() => addField(field)}
            >
              {field.fieldKey}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const canvas = (
    <div
      className={`relative overflow-auto rounded-lg border border-slate-300 bg-slate-200 p-4 ${
        fullPage ? "h-full min-h-0" : ""
      }`}
      style={fullPage ? undefined : { minHeight: Math.max(520, display.height + 48) }}
    >
      <div
        className="relative mx-auto bg-white shadow-md"
        style={{ width: display.width, height: display.height }}
      >
        {backgroundUrl ? (
          <DocGenPdfPageBackground
            key={backgroundUrl}
            pdfUrl={backgroundUrl}
            widthPx={display.width}
            heightPx={display.height}
          />
        ) : mode === "PDF_BACKGROUND" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 px-6 text-center text-sm text-slate-600">
            Upload a PDF background above to see the form while positioning fields.
          </div>
        ) : null}
        {page.elements.map((element) => {
          const isSelected = element.id === selectedId;
          const isDragging = draggingId === element.id;
          const boxHeight = elementBoxHeight(element) * scale;
          const style: CSSProperties = {
            left: element.x * scale,
            top: element.y * scale,
            width: element.width * scale,
            height: boxHeight,
            fontSize: element.fontSize * scale,
            lineHeight: 1,
            textAlign: element.align,
            touchAction: "none",
            cursor: isDragging ? "grabbing" : "grab",
          };
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              data-element-id={element.id}
              aria-label={
                element.kind === "field"
                  ? `Field ${element.fieldKey}. Drag to reposition.`
                  : `Text ${element.text}. Drag to reposition.`
              }
              onPointerDown={(event) => beginDrag(event, element)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(element.id);
                }
                if (!page || selectedId !== element.id) return;
                const step = event.shiftKey ? 5 : 1;
                let x = element.x;
                let y = element.y;
                if (event.key === "ArrowLeft") x -= step;
                else if (event.key === "ArrowRight") x += step;
                else if (event.key === "ArrowUp") y -= step;
                else if (event.key === "ArrowDown") y += step;
                else return;
                event.preventDefault();
                const maxX = Math.max(0, page.widthPt - element.width);
                const maxY = Math.max(0, page.heightPt - elementBoxHeight(element));
                patchElementPosition(
                  element.id,
                  roundPt(clamp(x, 0, maxX)),
                  roundPt(clamp(y, 0, maxY)),
                );
              }}
              className={`absolute z-[1] select-none overflow-hidden border px-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isSelected
                  ? "border-emerald-500 bg-emerald-50/70"
                  : "border-amber-400/80 bg-amber-50/55"
              } ${isDragging ? "shadow-md" : ""}`}
              style={style}
            >
              <span className="pointer-events-none block whitespace-pre-wrap break-words">
                {element.kind === "field" ? `{${element.fieldKey}}` : element.text}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Drag fields to position them · scale {Math.round(scale * 100)}% · coordinates in PDF points
        (top-left). Arrow keys nudge (Shift = 5 pt). Text wraps with line spacing 1.
      </p>
    </div>
  );

  const selection = (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold text-slate-900">Selection</p>
      {!selected ? (
        <p className="text-sm text-slate-500">
          Drag a field on the PDF, or select one to edit position and size.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">X (pt)</Label>
              <Input
                type="number"
                value={selected.x}
                onChange={(e) => patchSelected({ x: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Y (pt)</Label>
              <Input
                type="number"
                value={selected.y}
                onChange={(e) => patchSelected({ y: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Width</Label>
              <Input
                type="number"
                value={selected.width}
                onChange={(e) => patchSelected({ width: Number(e.target.value) })}
              />
            </div>
            {selected.kind === "field" ? (
              <div>
                <Label className="text-xs">Height</Label>
                <Input
                  type="number"
                  value={selected.height}
                  onChange={(e) => patchSelected({ height: Number(e.target.value) })}
                />
              </div>
            ) : null}
            <div>
              <Label className="text-xs">Font size</Label>
              <Input
                type="number"
                value={selected.fontSize}
                onChange={(e) => patchSelected({ fontSize: Number(e.target.value) })}
              />
            </div>
          </div>
          {selected.kind === "text" ? (
            <div>
              <Label className="text-xs">Text</Label>
              <Input
                value={selected.text}
                onChange={(e) => patchSelected({ text: e.target.value })}
              />
            </div>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={removeSelected}>
            Remove element
          </Button>
        </>
      )}
    </div>
  );

  const layout = (
    <div className="grid gap-4 xl:grid-cols-[220px_1fr_240px]">
      {tools}
      {canvas}
      {selection}
    </div>
  );

  if (fullPage) {
    return (
      <>
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Full page mode is open. Press Esc or use Exit full page to return.
        </div>
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-4 backdrop-blur-[1px]">
          <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-3 rounded-xl bg-white p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <p className="text-sm font-semibold text-slate-900">
                Full page positioning · {Math.round(scale * 100)}%
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => setFullPage(false)}>
                Exit full page
              </Button>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[200px_1fr_220px]">
              {tools}
              {canvas}
              {selection}
            </div>
          </div>
        </div>
      </>
    );
  }

  return layout;
}
