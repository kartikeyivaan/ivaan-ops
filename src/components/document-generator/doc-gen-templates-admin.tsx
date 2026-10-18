"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TemplateRow = {
  id: string;
  name: string;
  editorType: string;
  status: string;
  currentPublishedVersion: { versionNumber: number; publishedAt: string | null } | null;
  versions: Array<{ id: string; versionNumber: number }>;
};

const EDITOR_TYPES = [
  { value: "PDF_BACKGROUND", label: "PDF background + overlays" },
  { value: "CANVAS", label: "Fixed canvas" },
  { value: "RICH_TEXT", label: "Word-like rich text" },
] as const;

export function DocGenTemplatesAdmin({ initialTemplates }: { initialTemplates: TemplateRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editorType, setEditorType] =
    useState<(typeof EDITOR_TYPES)[number]["value"]>("PDF_BACKGROUND");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createTemplate(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/document-generator/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, editorType, layoutMode: "FIXED_PAGE" }),
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

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document templates</h1>
          <p className="text-sm text-slate-600">Design and publish MSEB document templates (ISE).</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/documentation/document-generator">Dashboard</Link>
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
            </tr>
          </thead>
          <tbody>
            {initialTemplates.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
