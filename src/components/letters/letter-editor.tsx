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

  const run = useCallback((command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  }, [onChange]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
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
    onChange(ref.current?.innerHTML ?? "");
  }, [onChange]);

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
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="min-h-[240px] bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        onPaste={handlePaste}
        onBlur={() => onChange(ref.current?.innerHTML ?? "")}
      />
    </div>
  );
}
