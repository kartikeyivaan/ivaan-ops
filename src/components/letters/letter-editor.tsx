"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { sanitizeLetterHtml } from "@/lib/letter-content";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const FONT_SIZES = [
  { label: "10", value: "10pt" },
  { label: "11", value: "11pt" },
  { label: "12", value: "12pt" },
  { label: "14", value: "14pt" },
  { label: "16", value: "16pt" },
  { label: "18", value: "18pt" },
] as const;

const LINE_SPACINGS = [
  { label: "1.0", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "2.0", value: "2" },
] as const;

const EDITOR_BODY_CLASS =
  "min-h-[320px] bg-white px-4 py-4 text-sm leading-6 text-slate-800 outline-none [&_p]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:min-w-[48px] [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_td]:align-top [&_th]:min-w-[48px] [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:p-2 [&_th]:align-top [&_th]:font-semibold";

function getTableFromSelection(root: HTMLDivElement | null): HTMLTableElement | null {
  const selection = window.getSelection();
  if (!root || !selection?.anchorNode) return null;
  let node: Node | null = selection.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node instanceof HTMLElement) {
    if (node instanceof HTMLTableElement) return node;
    if (node === root) break;
    node = node.parentElement;
  }
  return null;
}

function buildEmptyTable(rows: number, cols: number): string {
  const head = Array.from({ length: cols }, (_, index) => `<th>Column ${index + 1}</th>`).join("");
  const bodyRows = Array.from({ length: rows - 1 }, () => {
    const cells = Array.from({ length: cols }, () => "<td>&nbsp;</td>").join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table><p><br></p>`;
}

function selectedTableCell(table: HTMLTableElement): HTMLTableCellElement | null {
  const selection = window.getSelection();
  if (!selection?.anchorNode) return null;
  let node: Node | null = selection.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node instanceof HTMLElement) {
    if (node instanceof HTMLTableCellElement) return node;
    if (node === table) break;
    node = node.parentElement;
  }
  return table.rows[0]?.cells[0] ?? null;
}

function placeCaretInEditor(el: HTMLDivElement) {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && el.contains(selection.anchorNode)) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function findFieldSpanNearSelection(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const nodes: Node[] = [];
  if (range.collapsed) {
    nodes.push(range.startContainer);
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let current = walker.nextNode();
    while (current) {
      if (range.intersectsNode(current)) nodes.push(current);
      current = walker.nextNode();
    }
  }
  for (const node of nodes) {
    const el =
      node instanceof HTMLElement
        ? node
        : node.parentElement instanceof HTMLElement
          ? node.parentElement
          : null;
    const field =
      el?.closest?.("[data-doc-gen-field]") ??
      (el?.hasAttribute?.("data-doc-gen-field") ? el : null);
    if (field instanceof HTMLElement && root.contains(field)) return field;
  }
  return null;
}

function toggleWrapAround(node: HTMLElement, tagName: "strong" | "em" | "u") {
  const parent = node.parentElement;
  if (parent && parent.tagName.toLowerCase() === tagName && parent.childNodes.length === 1) {
    while (parent.firstChild) parent.parentNode?.insertBefore(parent.firstChild, parent);
    parent.remove();
    return;
  }
  const wrapper = document.createElement(tagName);
  node.parentNode?.insertBefore(wrapper, node);
  wrapper.appendChild(node);
}

function closestBlock(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection?.anchorNode) return null;
  let node: Node | null = selection.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node instanceof HTMLElement) {
    if (node === root) {
      const paragraph = document.createElement("p");
      while (root.firstChild) paragraph.appendChild(root.firstChild);
      root.appendChild(paragraph);
      return paragraph;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === "p" || tag === "div" || tag === "li") return node;
    node = node.parentElement;
  }
  return null;
}

function keepToolbarSelection(event: ReactMouseEvent) {
  event.preventDefault();
}

export type LetterRichTextEditorHandle = {
  insertHtml: (html: string) => void;
};

export const LetterRichTextEditor = forwardRef<
  LetterRichTextEditorHandle,
  {
    value: string;
    onChange: (html: string) => void;
  }
>(function LetterRichTextEditor({ value, onChange }, forwardedRef) {
  const ref = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seeded.current) return;
    el.innerHTML = value || "";
    seeded.current = true;
  }, [value]);

  const sync = useCallback(() => {
    onChange(ref.current?.innerHTML ?? "");
  }, [onChange]);

  const insertHtml = useCallback(
    (html: string) => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      placeCaretInEditor(el);
      document.execCommand("insertHTML", false, html);
      sync();
    },
    [sync],
  );

  useImperativeHandle(forwardedRef, () => ({ insertHtml }), [insertHtml]);

  const run = useCallback(
    (command: string, arg?: string) => {
      ref.current?.focus();
      document.execCommand(command, false, arg);
      sync();
    },
    [sync],
  );

  const toggleInline = useCallback(
    (command: "bold" | "italic" | "underline", tag: "strong" | "em" | "u") => {
      const root = ref.current;
      if (!root) return;
      root.focus();
      const field = findFieldSpanNearSelection(root);
      if (field) {
        toggleWrapAround(field, tag);
        sync();
        return;
      }
      document.execCommand(command, false);
      sync();
    },
    [sync],
  );

  const applyBlockStyle = useCallback(
    (patch: Partial<CSSStyleDeclaration> | Record<string, string>) => {
      const root = ref.current;
      if (!root) return;
      root.focus();
      const block = closestBlock(root);
      if (!block) return;
      Object.assign(block.style, patch);
      sync();
    },
    [sync],
  );

  const bumpParagraphSpacing = useCallback(
    (delta: number) => {
      const root = ref.current;
      if (!root) return;
      root.focus();
      const block = closestBlock(root);
      if (!block) return;
      const current = Number.parseFloat(block.style.marginBottom || "6");
      const next = Math.max(0, Math.min(48, (Number.isFinite(current) ? current : 6) + delta));
      block.style.marginBottom = `${next}pt`;
      sync();
    },
    [sync],
  );

  const insertTable = useCallback(() => {
    insertHtml(sanitizeLetterHtml(buildEmptyTable(3, 3)));
  }, [insertHtml]);

  const withTable = useCallback(
    (mutate: (table: HTMLTableElement, cell: HTMLTableCellElement | null) => void) => {
      const root = ref.current;
      const table = getTableFromSelection(root);
      if (!table) return;
      mutate(table, selectedTableCell(table));
      sync();
    },
    [sync],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const html = event.clipboardData.getData("text/html");
      const text = event.clipboardData.getData("text/plain");
      const cleaned = html
        ? sanitizeLetterHtml(html)
        : sanitizeLetterHtml(
            text
              .split(/\r?\n/)
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join(""),
          );
      document.execCommand("insertHTML", false, cleaned || escapeHtml(text));
      sync();
    },
    [sync],
  );

  return (
    <div className="overflow-hidden rounded-md border border-slate-300">
      <div className="space-y-1.5 border-b border-slate-200 bg-slate-50 p-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Bold"
            className="h-8 w-8 px-0 font-bold"
            onMouseDown={keepToolbarSelection}
            onClick={() => toggleInline("bold", "strong")}
          >
            B
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Italic"
            className="h-8 w-8 px-0 italic"
            onMouseDown={keepToolbarSelection}
            onClick={() => toggleInline("italic", "em")}
          >
            I
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Underline"
            className="h-8 w-8 px-0 underline"
            onMouseDown={keepToolbarSelection}
            onClick={() => toggleInline("underline", "u")}
          >
            U
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Clear formatting"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("removeFormat")}
          >
            Clear
          </Button>

          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />

          <label className="flex items-center gap-1 text-xs text-slate-600">
            Size
            <select
              className="h-8 rounded-md border border-slate-300 bg-white px-1 text-xs"
              defaultValue="11pt"
              onMouseDown={keepToolbarSelection}
              onChange={(event) => applyBlockStyle({ fontSize: event.target.value })}
            >
              {FONT_SIZES.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1 text-xs text-slate-600">
            Line
            <select
              className="h-8 rounded-md border border-slate-300 bg-white px-1 text-xs"
              defaultValue="1.15"
              onMouseDown={keepToolbarSelection}
              onChange={(event) => applyBlockStyle({ lineHeight: event.target.value })}
            >
              {LINE_SPACINGS.map((space) => (
                <option key={space.value} value={space.value}>
                  {space.label}
                </option>
              ))}
            </select>
          </label>

          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Increase paragraph spacing"
            onMouseDown={keepToolbarSelection}
            onClick={() => bumpParagraphSpacing(4)}
          >
            Space +
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Decrease paragraph spacing"
            onMouseDown={keepToolbarSelection}
            onClick={() => bumpParagraphSpacing(-4)}
          >
            Space −
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Align left"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("justifyLeft")}
          >
            Left
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Align center"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("justifyCenter")}
          >
            Center
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Align right"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("justifyRight")}
          >
            Right
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Justify"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("justifyFull")}
          >
            Justify
          </Button>

          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />

          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Increase indent"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("indent")}
          >
            Indent
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Decrease indent"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("outdent")}
          >
            Outdent
          </Button>

          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("insertUnorderedList")}
          >
            Bullets
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={keepToolbarSelection}
            onClick={() => run("insertOrderedList")}
          >
            Numbers
          </Button>

          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />

          <Button type="button" variant="outline" size="sm" onMouseDown={keepToolbarSelection} onClick={insertTable}>
            Table
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={keepToolbarSelection}
            onClick={() =>
              withTable((table, cell) => {
                const index = cell?.cellIndex ?? table.rows[0]!.cells.length - 1;
                Array.from(table.rows).forEach((row) => {
                  const clone = row.cells[index] ?? row.cells[row.cells.length - 1];
                  const next = row.insertCell(index + 1);
                  next.innerHTML = clone?.innerHTML || "&nbsp;";
                });
              })
            }
          >
            + Col
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={keepToolbarSelection}
            onClick={() =>
              withTable((table, cell) => {
                if (table.rows[0]!.cells.length <= 1) return;
                const index = cell?.cellIndex ?? table.rows[0]!.cells.length - 1;
                Array.from(table.rows).forEach((row) => {
                  if (row.cells.length > index) row.deleteCell(index);
                });
              })
            }
          >
            − Col
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={keepToolbarSelection}
            onClick={() =>
              withTable((table, cell) => {
                const index =
                  cell?.parentElement instanceof HTMLTableRowElement ? cell.parentElement.rowIndex : -1;
                const source = index >= 0 ? table.rows[index] : table.rows[table.rows.length - 1];
                if (!source) return;
                const row = table.insertRow(index + 1);
                Array.from(source.cells).forEach((sourceCell) => {
                  const next = row.insertCell();
                  next.innerHTML = sourceCell.innerHTML || "&nbsp;";
                });
              })
            }
          >
            + Row
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={keepToolbarSelection}
            onClick={() =>
              withTable((table, cell) => {
                if (table.rows.length <= 1) return;
                const index =
                  cell?.parentElement instanceof HTMLTableRowElement
                    ? cell.parentElement.rowIndex
                    : table.rows.length - 1;
                if (index >= 0) table.deleteRow(index);
              })
            }
          >
            − Row
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={keepToolbarSelection}
            onClick={() =>
              withTable((table) => {
                table.remove();
              })
            }
          >
            Remove table
          </Button>
        </div>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className={EDITOR_BODY_CLASS}
        onInput={sync}
        onPaste={handlePaste}
        onBlur={sync}
      />
    </div>
  );
});
