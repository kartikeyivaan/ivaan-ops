"use client";

import { useCallback, useEffect, useRef, type ClipboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { sanitizeLetterHtml } from "@/lib/letter-content";
import { cn } from "@/lib/utils";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const COMMANDS = [
  { cmd: "bold", label: "B", title: "Bold", className: "font-bold" },
  { cmd: "italic", label: "I", title: "Italic", className: "italic" },
  { cmd: "underline", label: "U", title: "Underline", className: "underline" },
] as const;

const EDITOR_BODY_CLASS =
  "min-h-[240px] bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:min-w-[48px] [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_td]:align-top [&_th]:min-w-[48px] [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:p-2 [&_th]:align-top [&_th]:font-semibold";

function getTableFromSelection(root: HTMLDivElement | null): HTMLTableElement | null {
  const selection = window.getSelection();
  if (!root || !selection?.anchorNode) return null;
  let node: Node | null = selection.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node instanceof HTMLElement) {
    if (node.tagName === "TABLE") return node;
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
    if (node.tagName === "TD" || node.tagName === "TH") return node;
    if (node === table) break;
    node = node.parentElement;
  }
  return table.rows[0]?.cells[0] ?? null;
}

export function LetterRichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
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

  const run = useCallback(
    (command: string, arg?: string) => {
      ref.current?.focus();
      document.execCommand(command, false, arg);
      sync();
    },
    [sync],
  );

  const insertTable = useCallback(() => {
    ref.current?.focus();
    document.execCommand("insertHTML", false, sanitizeLetterHtml(buildEmptyTable(3, 3)));
    sync();
  }, [sync]);

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
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-2">
        {COMMANDS.map((item) => (
          <Button
            key={item.cmd}
            type="button"
            variant="outline"
            size="sm"
            title={item.title}
            className={cn("h-8 w-8 px-0", item.className)}
            onClick={() => run(item.cmd)}
          >
            {item.label}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => run("insertUnorderedList")}>
          Bullets
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => run("insertOrderedList")}>
          Numbers
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => run("justifyLeft")}>
          Left
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => run("justifyCenter")}>
          Center
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => run("justifyRight")}>
          Right
        </Button>
        <span className="mx-1 w-px self-stretch bg-slate-200" aria-hidden />
        <Button type="button" variant="outline" size="sm" onClick={insertTable}>
          Table
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            withTable((table, cell) => {
              const index = cell?.cellIndex ?? table.rows[0]!.cells.length - 1;
              table.rows.forEach((row) => {
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
          onClick={() =>
            withTable((table, cell) => {
              if (table.rows[0]!.cells.length <= 1) return;
              const index = cell?.cellIndex ?? table.rows[0]!.cells.length - 1;
              table.rows.forEach((row) => {
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
          onClick={() =>
            withTable((table, cell) => {
              const index = cell?.parentElement instanceof HTMLTableRowElement ? cell.parentElement.rowIndex : -1;
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
          onClick={() =>
            withTable((table, cell) => {
              if (table.rows.length <= 1) return;
              const index =
                cell?.parentElement instanceof HTMLTableRowElement ? cell.parentElement.rowIndex : table.rows.length - 1;
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
          onClick={() =>
            withTable((table) => {
              table.remove();
            })
          }
        >
          Remove table
        </Button>
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
}
