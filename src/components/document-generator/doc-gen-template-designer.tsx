"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { DocGenCanvasEditor } from "@/components/document-generator/doc-gen-canvas-editor";
import { DocGenRichTextEditor } from "@/components/document-generator/doc-gen-rich-text-editor";
import type { PageConfiguration, TemplateContent } from "@/lib/doc-gen-template-content";
import { templateContentSchema } from "@/lib/doc-gen-template-content";

type TemplateMeta = {
  id: string;
  name: string;
  editorType: "RICH_TEXT" | "CANVAS" | "PDF_BACKGROUND" | "WORD";
  layoutMode: string;
};

type DraftVersion = {
  id: string;
  versionNumber: number;
  templateContentJson: TemplateContent;
  pageConfigurationJson: PageConfiguration;
  backgroundStoredPdfId: string | null;
};

type WordContent = Extract<TemplateContent, { editor: "WORD" }>;

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
  const [templateName, setTemplateName] = useState(template.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(template.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [content, setContent] = useState<TemplateContent>(() =>
    templateContentSchema.parse(draft.templateContentJson),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<Array<{ message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [hasBackground, setHasBackground] = useState(Boolean(draft.backgroundStoredPdfId));
  const [wordMeta, setWordMeta] = useState<{ fileName: string | null; placeholders: string[] }>(
    () => {
      const initial = templateContentSchema.parse(draft.templateContentJson);
      return initial.editor === "WORD"
        ? { fileName: initial.fileName, placeholders: initial.placeholders }
        : { fileName: null, placeholders: [] };
    },
  );

  async function saveTemplateName(event: React.FormEvent) {
    event.preventDefault();
    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError("Template name is required.");
      return;
    }
    setBusy(true);
    setRenameError(null);
    try {
      const response = await fetch(`/api/document-generator/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Unable to rename template.");
      setTemplateName(nextName);
      setRenameOpen(false);
      setMessage("Template name updated.");
    } catch (cause) {
      setRenameError(cause instanceof Error ? cause.message : "Unable to rename template.");
    } finally {
      setBusy(false);
    }
  }

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

  async function uploadWord(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("versionId", versionId);
      form.set("file", file);
      const response = await fetch(`/api/document-generator/templates/${template.id}/word`, {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as {
        message?: string;
        fileName?: string;
        placeholders?: string[];
      };
      if (!response.ok) throw new Error(body.message ?? "Upload failed.");
      const next: WordContent = {
        editor: "WORD",
        fileName: body.fileName ?? file.name,
        placeholders: body.placeholders ?? [],
      };
      setContent(next);
      setWordMeta({ fileName: next.fileName, placeholders: next.placeholders });
      setHasBackground(true);
      setMessage(
        `Word file uploaded (${next.placeholders.length} placeholder(s) found). Preview to check the PDF.`,
      );
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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{templateName}</h1>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRenameValue(templateName);
                setRenameError(null);
                setRenameOpen(true);
              }}
            >
              Edit name
            </Button>
          </div>
          <p className="text-sm text-slate-600">
            {template.editorType.replace("_", " ")} · draft v{draft.versionNumber} ·{" "}
            {template.layoutMode.replace("_", " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/documentation/document-generator/admin/templates">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
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

      {template.editorType === "WORD" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">Word template (.docx)</p>
            <p className="mt-1 text-sm text-slate-600">
              Edit the document in Microsoft Word using placeholders like{" "}
              <code className="rounded bg-slate-100 px-1">{"{Customer_Name}"}</code>, then upload
              here. Generation fills those fields and outputs PDF only.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {wordMeta.fileName
                ? `Current file: ${wordMeta.fileName} · ${wordMeta.placeholders.length} placeholder(s). Upload again to replace.`
                : "No Word file attached yet (max 15 MB)."}
            </p>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="mt-3 block text-sm"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadWord(file);
              }}
            />
            {wordMeta.placeholders.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Detected placeholders
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {wordMeta.placeholders.map((key) => (
                    <li
                      key={key}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-800"
                    >
                      {`{${key}}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Field catalog keys
            </p>
            <p className="mb-2 text-[11px] leading-4 text-slate-500">
              Use these exact keys in Word. Keys are case-sensitive.
            </p>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {activeFields.map((field) => (
                <li key={field.id}>
                  <span className="font-mono text-xs">{`{${field.fieldKey}}`}</span>
                  <span className="block text-slate-600">{field.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {content.editor === "RICH_TEXT" ? (
        <DocGenRichTextEditor
          value={content.html}
          onChange={(html) => setContent({ editor: "RICH_TEXT", html })}
          fields={activeFields}
        />
      ) : null}

      {content.editor === "CANVAS" || content.editor === "PDF_BACKGROUND" ? (
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
      ) : null}

      <p className="text-xs text-slate-500">
        Preview uses field labels as sample values.
        {template.editorType === "WORD"
          ? " Word layout is converted to PDF after field merge; complex Word features (images, text boxes) may be simplified."
          : " Fixed-page layout; overflow is not auto-flowed in v1 canvas mode."}
      </p>

      {renameOpen ? (
        <Modal onClose={() => setRenameOpen(false)} size="sm">
          <ModalForm onSubmit={(event) => void saveTemplateName(event)}>
            <ModalHeader title="Edit template name" onClose={() => setRenameOpen(false)} />
            <ModalBody className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="designer-rename-name">Name</Label>
                <Input
                  id="designer-rename-name"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {renameError ? <p className="text-sm text-red-600">{renameError}</p> : null}
            </ModalBody>
            <ModalFooter className="justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save name"}
              </Button>
            </ModalFooter>
          </ModalForm>
        </Modal>
      ) : null}
    </div>
  );
}
