"use client";

import { useCallback, useRef } from "react";
import { LetterRichTextEditor } from "@/components/letters/letter-editor";
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
  const latestHtml = useRef(value);

  const insertField = useCallback(
    (field: { id: string; fieldKey: string; label: string }) => {
      const html = `${latestHtml.current}${docGenFieldSpanHtml(field)}`;
      latestHtml.current = html;
      onChange(html);
    },
    [onChange],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Insert field
        </p>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {fields.map((field) => (
            <li key={field.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left hover:bg-white"
                onClick={() => insertField(field)}
              >
                <span className="font-mono text-xs">{field.fieldKey}</span>
                <span className="block text-slate-600">{field.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <LetterRichTextEditor
        value={value}
        onChange={(html) => {
          latestHtml.current = html;
          onChange(html);
        }}
      />
    </div>
  );
}
