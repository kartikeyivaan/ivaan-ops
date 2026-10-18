"use client";

import { useMemo, useState } from "react";
import type { CanvasElement, CanvasPage } from "@/lib/doc-gen-template-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SCALE = 0.55;

function newElementId() {
  return `el_${Math.random().toString(36).slice(2, 10)}`;
}

export function DocGenCanvasEditor({
  pages,
  onChange,
  fields,
  mode,
}: {
  pages: CanvasPage[];
  onChange: (pages: CanvasPage[]) => void;
  fields: Array<{ id: string; fieldKey: string; label: string }>;
  mode: "CANVAS" | "PDF_BACKGROUND";
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const page = pages[pageIndex] ?? pages[0];
  const selected = page?.elements.find((el) => el.id === selectedId) ?? null;

  const display = useMemo(() => {
    if (!page) return { width: 0, height: 0 };
    return { width: page.widthPt * SCALE, height: page.heightPt * SCALE };
  }, [page]);

  function updatePage(next: CanvasPage) {
    onChange(pages.map((p, index) => (index === pageIndex ? next : p)));
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

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_1fr_260px]">
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

      <div
        className="relative overflow-auto rounded-lg border border-slate-300 bg-slate-200 p-4"
        style={{ minHeight: 420 }}
      >
        <div
          className="relative bg-white shadow-md"
          style={{ width: display.width, height: display.height }}
        >
          {page.elements.map((element) => {
            const isSelected = element.id === selectedId;
            const style = {
              left: element.x * SCALE,
              top: element.y * SCALE,
              width: element.width * SCALE,
              height: ("height" in element ? element.height : 24) * SCALE,
              fontSize: Math.max(10, element.fontSize * SCALE * 0.85),
            };
            return (
              <button
                key={element.id}
                type="button"
                onClick={() => setSelectedId(element.id)}
                className={`absolute border px-1 text-left ${
                  isSelected ? "border-emerald-500 bg-emerald-50" : "border-amber-400 bg-amber-50"
                }`}
                style={style}
              >
                {element.kind === "field" ? `{${element.fieldKey}}` : element.text}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Canvas scale {Math.round(SCALE * 100)}% — coordinates saved in PDF points (top-left origin).
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <p className="text-sm font-semibold text-slate-900">Selection</p>
        {!selected ? (
          <p className="text-sm text-slate-500">Select an element to edit position and size.</p>
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
    </div>
  );
}
