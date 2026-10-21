"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";

type TemplateRow = {
  id: string;
  name: string;
  editorType: string;
  status: string;
  currentPublishedVersion: { versionNumber: number; publishedAt: string | null } | null;
  versions: Array<{ id: string; versionNumber: number }>;
};

type TemplateVersionRow = {
  id: string;
  versionNumber: number;
  status: string;
  publishedAt: string | null;
  createdAt: string;
};

const EDITOR_TYPES = [
  { value: "PDF_BACKGROUND", label: "PDF background + overlays" },
  { value: "CANVAS", label: "Fixed canvas" },
  { value: "RICH_TEXT", label: "Word-like rich text" },
  { value: "WORD", label: "Upload Word (.docx)" },
] as const;

function RenameTemplateDialog({
  template,
  onClose,
}: {
  template: TemplateRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setName(template.name);
    setMessage(null);
  }, [template]);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setMessage("Template name is required.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/document-generator/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "Unable to rename template.");
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal onClose={onClose} size="sm">
      <ModalForm onSubmit={onSave}>
        <ModalHeader title="Edit template name" onClose={onClose} />
        <ModalBody className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rename-template-name">Name</Label>
            <Input
              id="rename-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          {message ? <p className="text-sm text-red-600">{message}</p> : null}
        </ModalBody>
        <ModalFooter className="justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save name"}
          </Button>
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}

function TemplateVersionsDialog({
  template,
  onClose,
}: {
  template: TemplateRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [versions, setVersions] = useState<TemplateVersionRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function loadVersions() {
    setMessage(null);
    try {
      const response = await fetch(`/api/document-generator/templates/${template.id}`);
      const body = (await response.json()) as {
        message?: string;
        versions?: TemplateVersionRow[];
      };
      if (!response.ok) {
        setMessage(body.message ?? "Unable to load versions.");
        setVersions([]);
        return;
      }
      setVersions(body.versions ?? []);
    } catch {
      setMessage("Unable to load versions.");
      setVersions([]);
    }
  }

  useEffect(() => {
    setVersions(null);
    void loadVersions();
    // Intentionally re-fetch when switching templates in the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  async function onDeleteVersion(version: TemplateVersionRow) {
    const confirmed = window.confirm(
      `Permanently delete ${template.name} version v${version.versionNumber} (${version.status.toLowerCase()})? This cannot be undone.`,
    );
    if (!confirmed) return;

    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/document-generator/templates/${template.id}/versions/${version.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "Unable to delete version.");
        return;
      }
      await loadVersions();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader
        title="Template versions"
        description={template.name}
        onClose={onClose}
      />
      <ModalBody className="space-y-3">
        {versions === null ? (
          <p className="text-sm text-slate-500">Loading versions…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-slate-500">No versions found.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Version</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      v{version.versionNumber}
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-600">
                      {version.status.toLowerCase()}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending || versions.length <= 1}
                        onClick={() => void onDeleteVersion(version)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {versions && versions.length <= 1 ? (
          <p className="text-xs text-slate-500">
            The only remaining version cannot be deleted. Delete the template instead.
          </p>
        ) : null}
        {message ? <p className="text-sm text-red-600">{message}</p> : null}
      </ModalBody>
      <ModalFooter className="justify-end">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function DocGenTemplatesAdmin({ initialTemplates }: { initialTemplates: TemplateRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editorType, setEditorType] =
    useState<(typeof EDITOR_TYPES)[number]["value"]>("PDF_BACKGROUND");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [renaming, setRenaming] = useState<TemplateRow | null>(null);
  const [managingVersions, setManagingVersions] = useState<TemplateRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createTemplate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/document-generator/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          editorType,
          layoutMode: editorType === "WORD" || editorType === "RICH_TEXT" ? "FLOWING" : "FIXED_PAGE",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Unable to create template.");
      router.push(`/documentation/document-generator/admin/templates/${body.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create template.");
    } finally {
      setPending(false);
    }
  }

  async function deleteTemplate(template: TemplateRow) {
    const confirmed = window.confirm(
      `Permanently delete template "${template.name}" and all of its versions? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(template.id);
    setError(null);
    try {
      const response = await fetch(`/api/document-generator/templates/${template.id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? "Unable to delete template.");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document templates</h1>
          <p className="text-sm text-slate-600">Design and publish MSEB document templates (ISE).</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/documentation/document-generator">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <form onSubmit={createTemplate} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-1">
          <Label htmlFor="templateName">Template name</Label>
          <Input id="templateName" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1 sm:col-span-1">
          <Label htmlFor="editorType">Designer type</Label>
          <select
            id="editorType"
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={editorType}
            onChange={(e) => setEditorType(e.target.value as (typeof EDITOR_TYPES)[number]["value"])}
          >
            {EDITOR_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end sm:col-span-1">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Creating…" : "Create template"}
          </Button>
        </div>
        {error ? <p className="text-sm text-red-600 sm:col-span-3">{error}</p> : null}
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Published</th>
              <th className="px-4 py-2 font-medium">Draft</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialTemplates.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No templates yet.
                </td>
              </tr>
            ) : (
              initialTemplates.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link
                      className="font-medium text-emerald-700 hover:underline"
                      href={`/documentation/document-generator/admin/templates/${row.id}`}
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{row.editorType.replace("_", " ")}</td>
                  <td className="px-4 py-2">
                    {row.currentPublishedVersion
                      ? `v${row.currentPublishedVersion.versionNumber}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {row.versions[0] ? `v${row.versions[0].versionNumber}` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setRenaming(row)}
                      >
                        Edit name
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setManagingVersions(row)}
                      >
                        Versions
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={deletingId === row.id}
                        onClick={() => void deleteTemplate(row)}
                      >
                        {deletingId === row.id ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {renaming ? <RenameTemplateDialog template={renaming} onClose={() => setRenaming(null)} /> : null}
      {managingVersions ? (
        <TemplateVersionsDialog
          template={managingVersions}
          onClose={() => setManagingVersions(null)}
        />
      ) : null}
    </div>
  );
}
