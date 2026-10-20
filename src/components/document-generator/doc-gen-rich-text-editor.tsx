"use client";

import { useRef } from "react";
import {
  LetterRichTextEditor,
  type LetterRichTextEditorHandle,
} from "@/components/letters/letter-editor";
import { docGenFieldSpanHtml } from "@/lib/doc-gen-rich-text-fields";

export function DocGenRichTextEditor({
  value,
  onChange,
  fields,
}: {
  value: string;
  onChange: (html: string) => void;
  fields: Array<{ id: string; fieldKey: string; label: string }>;
}) {
  const editorRef = useRef<LetterRichTextEditorHandle>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Insert field
        </p>
        <p className="mb-2 text-[11px] leading-4 text-slate-500">
          Click a field to insert. Select the amber chip, then use Bold / Italic / Underline in the
          toolbar.
        </p>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {fields.map((field) => (
            <li key={field.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left hover:bg-white"
                // Keep the editor selection when clicking the field list.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editorRef.current?.insertHtml(docGenFieldSpanHtml(field))}
              >
                <span className="font-mono text-xs">{field.fieldKey}</span>
                <span className="block text-slate-600">{field.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <LetterRichTextEditor ref={editorRef} value={value} onChange={onChange} />
    </div>
  );
}
