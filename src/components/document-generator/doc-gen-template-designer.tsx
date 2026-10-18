"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DocGenCanvasEditor } from "@/components/document-generator/doc-gen-canvas-editor";
import { DocGenRichTextEditor } from "@/components/document-generator/doc-gen-rich-text-editor";
import type { PageConfiguration, TemplateContent } from "@/lib/doc-gen-template-content";
import { templateContentSchema } from "@/lib/doc-gen-template-content";

type TemplateMeta = {
  id: string;
  name: string;
  editorType: "RICH_TEXT" | "CANVAS" | "PDF_BACKGROUND";
  layoutMode: string;
};

type DraftVersion = {
  id: string;
  versionNumber: number;
  templateContentJson: TemplateContent;
  pageConfigurationJson: PageConfiguration;
  backgroundStoredPdfId: string | null;
};

type FieldRow = { id: string; fieldKey: string; label: string; status: string };

export function DocGenTemplateDesigner({
  template,
  draft,
  fields,
}: {
  template: TemplateMeta;
  draft: DraftVersion;
  fields: FieldRow[];
}) {
  const activeFields = useMemo(
    () => fields.filter((field) => field.status === "ACTIVE"),
    [fields],
  );
  const [versionId] = useState(draft.id);
  const [content, setContent] = useState<TemplateContent>(() =>
    templateContentSchema.parse(draft.templateContentJson),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<Array<{ message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [hasBackground, setHasBackground] = useState(Boolean(draft.backgroundStoredPdfId));

  const saveDraft = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/document-generator/templates/${template.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, templateContentJson: content }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Save failed.");
      setMessage("Draft saved.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }, [content, template.id, versionId]);

  async function runValidate() {
    setBusy(true);
    setMessage(null);
    setIssues([]);
    try {
      await saveDraft();
      const response = await fetch(`/api/document-generator/templates/${template.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Validation failed.");
      setIssues(body.issues ?? []);
      setMessage(body.valid ? "Template is valid." : "Validation reported issues.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runPublish() {
    setBusy(true);
    setMessage(null);
    try {
      await saveDraft();
      const response = await fetch(`/api/document-generator/templates/${template.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.issues) setIssues(body.issues);
        throw new Error(body.message ?? "Publish failed.");
      }
      setMessage(`Published version ${body.versionNumber}. A new draft was created for further edits.`);
      window.location.reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setBusy(true);
    setMessage(null);
    try {
      await saveDraft();
      const sampleValues = Object.fromEntries(
        activeFields.map((field) => [field.fieldKey, field.label]),
      );
      const response = await fetch(`/api/document-generator/templates/${template.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, fieldValues: sampleValues }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message ?? "Preview failed.");
      }
      const blob = await response.blob();
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadBackground(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("versionId", versionId);
      form.set("file", file);
      const response = await fetch(`/api/document-generator/templates/${template.id}/background`, {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Upload failed.");
      setHasBackground(true);
      setMessage(`Background uploaded (${body.pageCount} page(s)). Reloading…`);
      window.location.reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Template designer</p>
          <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
          <p className="text-sm text-slate-600">
            {template.editorType.replace("_", " ")} · draft v{draft.versionNumber} ·{" "}
            {template.layoutMode.replace("_", " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/documentation/document-generator/admin/templates">All templates</Link>
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void saveDraft()}>
            Save draft
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void runValidate()}>
            Validate
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void runPreview()}>
            Preview PDF
          </Button>
          <Button type="button" disabled={busy} onClick={() => void runPublish()}>
            Publish
          </Button>
        </div>
      </div>

      {message ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          {message}
        </p>
      ) : null}
      {issues.length ? (
        <ul className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {issues.map((issue, index) => (
            <li key={`${issue.message}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {template.editorType === "PDF_BACKGROUND" ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">PDF background</p>
          <p className="mt-1 text-sm text-slate-600">
            {hasBackground
              ? "Background attached to this draft. Upload again to replace."
              : "Upload the official MSEB PDF form (max 15 MB, 30 pages)."}
          </p>
          <input
            type="file"
            accept="application/pdf"
            className="mt-3 block text-sm"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadBackground(file);
            }}
          />
        </div>
      ) : null}

      {content.editor === "RICH_TEXT" ? (
        <DocGenRichTextEditor
          value={content.html}
          onChange={(html) => setContent({ editor: "RICH_TEXT", html })}
          fields={activeFields}
        />
      ) : (
        <DocGenCanvasEditor
          pages={content.pages}
          onChange={(pages) =>
            setContent({
              editor: template.editorType === "PDF_BACKGROUND" ? "PDF_BACKGROUND" : "CANVAS",
              pages,
            })
          }
          fields={activeFields}
          mode={template.editorType === "PDF_BACKGROUND" ? "PDF_BACKGROUND" : "CANVAS"}
        />
      )}

      <p className="text-xs text-slate-500">
        Preview uses field labels as sample values. Fixed-page layout; overflow is not auto-flowed in
        v1 canvas mode.
      </p>
    </div>
  );
}
