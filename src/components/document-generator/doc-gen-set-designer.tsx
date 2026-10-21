"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TemplateVersionOption = {
  id: string;
  versionNumber: number;
  template: { id: string; name: string; editorType: string };
};

type SetItemRow = {
  templateVersionId: string;
  displayName: string;
  sortOrder: number;
};

type FieldConfigRow = {
  fieldId: string;
  sortOrder: number;
  isRequired?: boolean;
  label?: string;
  fieldKey?: string;
};

type SetMeta = {
  id: string;
  name: string;
  description: string | null;
  currentPublishedVersion: { versionNumber: number } | null;
};

type DraftVersion = {
  id: string;
  versionNumber: number;
  fieldConfigJson: { fields: FieldConfigRow[] };
  items: Array<{
    templateVersionId: string;
    displayName: string;
    sortOrder: number;
    templateVersion: TemplateVersionOption;
  }>;
};

export function DocGenSetDesigner({
  setMeta,
  draft,
  templateVersions,
  fieldLabels,
}: {
  setMeta: SetMeta;
  draft: DraftVersion;
  templateVersions: TemplateVersionOption[];
  fieldLabels: Record<string, { label: string; fieldKey: string }>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<SetItemRow[]>(
    draft.items.map((item) => ({
      templateVersionId: item.templateVersionId,
      displayName: item.displayName,
      sortOrder: item.sortOrder,
    })),
  );
  const [fieldConfig, setFieldConfig] = useState<FieldConfigRow[]>(draft.fieldConfigJson.fields ?? []);
  const [addVersionId, setAddVersionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [validationIssues, setValidationIssues] = useState<Array<{ message: string }>>([]);

  const versionById = useMemo(
    () => new Map(templateVersions.map((row) => [row.id, row])),
    [templateVersions],
  );

  const latestByTemplateId = useMemo(() => {
    const map = new Map<string, TemplateVersionOption>();
    for (const row of templateVersions) {
      const existing = map.get(row.template.id);
      if (!existing || row.versionNumber > existing.versionNumber) {
        map.set(row.template.id, row);
      }
    }
    return map;
  }, [templateVersions]);

  const versionLabel = useCallback(
    (id: string) => {
      const row = versionById.get(id);
      return row ? `${row.template.name} (v${row.versionNumber})` : id;
    },
    [versionById],
  );

  function useLatestTemplateVersion(index: number) {
    const item = items[index];
    if (!item) return;
    const current = versionById.get(item.templateVersionId);
    if (!current) return;
    const latest = latestByTemplateId.get(current.template.id);
    if (!latest || latest.id === item.templateVersionId) return;
    setItems((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              templateVersionId: latest.id,
              displayName: row.displayName.trim() || latest.template.name,
            }
          : row,
      ),
    );
    setMessage(
      `Updated “${latest.template.name}” to latest published v${latest.versionNumber}. Save & publish the set to apply.`,
    );
  }

  const saveItems = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/document-generator/sets/${setMeta.id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: draft.id,
          items: items.map((item, index) => ({ ...item, sortOrder: index })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Unable to save documents.");
      setFieldConfig(body.fieldConfigJson?.fields ?? []);
      setMessage("Documents saved. Shared fields updated.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save.");
    } finally {
      setPending(false);
    }
  }, [draft.id, items, router, setMeta.id]);

  function addDocument() {
    if (!addVersionId) return;
    const option = templateVersions.find((row) => row.id === addVersionId);
    if (!option) return;
    setItems((prev) => [
      ...prev,
      {
        templateVersionId: addVersionId,
        displayName: option.template.name,
        sortOrder: prev.length,
      },
    ]);
    setAddVersionId("");
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const temp = next[index]!;
      next[index] = next[target]!;
      next[target] = temp;
      return next;
    });
  }

  function moveField(index: number, direction: -1 | 1) {
    setFieldConfig((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const temp = next[index]!;
      next[index] = next[target]!;
      next[target] = temp;
      return next;
    });
  }

  async function refreshFields() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/document-generator/sets/${setMeta.id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refreshFields", versionId: draft.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Unable to refresh fields.");
      setFieldConfig(body.fieldConfigJson?.fields ?? []);
      setMessage("Shared field list refreshed from templates.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh fields.");
    } finally {
      setPending(false);
    }
  }

  async function saveFieldConfig() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/document-generator/sets/${setMeta.id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fieldConfig",
          versionId: draft.id,
          fieldConfig: {
            fields: fieldConfig.map((row, index) => ({
              fieldId: row.fieldId,
              sortOrder: index,
              ...(row.isRequired !== undefined ? { isRequired: row.isRequired } : {}),
            })),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Unable to save field list.");
      setFieldConfig(body.fieldConfigJson?.fields ?? []);
      setMessage("Shared field settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save field list.");
    } finally {
      setPending(false);
    }
  }

  async function validateSet() {
    setPending(true);
    setError(null);
    setValidationIssues([]);
    try {
      const response = await fetch(`/api/document-generator/sets/${setMeta.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: draft.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Validation failed.");
      setValidationIssues(body.issues ?? []);
      setMessage(body.valid ? "Set is valid and ready to publish." : "Validation reported issues.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Validation failed.");
    } finally {
      setPending(false);
    }
  }

  async function publishSet() {
    setPending(true);
    setError(null);
    setValidationIssues([]);
    try {
      const itemsResponse = await fetch(`/api/document-generator/sets/${setMeta.id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: draft.id,
          items: items.map((item, index) => ({ ...item, sortOrder: index })),
        }),
      });
      const itemsBody = await itemsResponse.json();
      if (!itemsResponse.ok) throw new Error(itemsBody.message ?? "Unable to save documents.");

      const recompiled =
        (itemsBody.fieldConfigJson?.fields as FieldConfigRow[] | undefined) ?? [];
      const recompiledIds = new Set(recompiled.map((row) => row.fieldId));
      const localOrdered = fieldConfig.filter((row) => recompiledIds.has(row.fieldId));
      const localIds = new Set(localOrdered.map((row) => row.fieldId));
      const newlyAdded = recompiled.filter((row) => !localIds.has(row.fieldId));
      const mergedFields = [...localOrdered, ...newlyAdded].map((row, index) => ({
        fieldId: row.fieldId,
        sortOrder: index,
        ...(row.isRequired !== undefined ? { isRequired: row.isRequired } : {}),
      }));

      const fieldsResponse = await fetch(`/api/document-generator/sets/${setMeta.id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fieldConfig",
          versionId: draft.id,
          fieldConfig: { fields: mergedFields },
        }),
      });
      const fieldsBody = await fieldsResponse.json();
      if (!fieldsResponse.ok) throw new Error(fieldsBody.message ?? "Unable to save field list.");
      setFieldConfig(fieldsBody.fieldConfigJson?.fields ?? []);

      const response = await fetch(`/api/document-generator/sets/${setMeta.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: draft.id }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.issues) setValidationIssues(body.issues);
        throw new Error(body.message ?? "Publish failed.");
      }
      setMessage(`Published set version v${body.versionNumber}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publish failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{setMeta.name}</h1>
          <p className="text-sm text-slate-600">
            Draft v{draft.versionNumber}
            {setMeta.currentPublishedVersion
              ? ` · Published v${setMeta.currentPublishedVersion.versionNumber}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/documentation/document-generator/admin/sets">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button onClick={validateSet} variant="outline" disabled={pending}>
            Validate
          </Button>
          <Button onClick={publishSet} disabled={pending}>
            Publish set
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      ) : null}
      {validationIssues.length ? (
        <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-950">
          {validationIssues.map((issue, index) => (
            <li key={index}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Documents in set</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[280px] flex-1 space-y-1">
            <Label htmlFor="addTemplate">Add published template</Label>
            <select
              id="addTemplate"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={addVersionId}
              onChange={(e) => setAddVersionId(e.target.value)}
            >
              <option value="">Select template version…</option>
              {templateVersions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.template.name} — v{row.versionNumber} ({row.template.editorType})
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" onClick={addDocument}>
            Add
          </Button>
          <Button type="button" onClick={saveItems} disabled={pending}>
            Save documents
          </Button>
        </div>

        <ol className="space-y-2">
          {items.length === 0 ? (
            <li className="text-sm text-slate-500">No documents in this draft yet.</li>
          ) : (
            items.map((item, index) => {
              const pinned = versionById.get(item.templateVersionId);
              const latest = pinned ? latestByTemplateId.get(pinned.template.id) : undefined;
              const isStale = Boolean(pinned && latest && latest.id !== pinned.id);
              return (
                <li
                  key={`${item.templateVersionId}-${index}`}
                  className="flex flex-wrap items-center gap-2 rounded border border-slate-100 px-3 py-2"
                >
                  <span className="w-6 text-slate-400">{index + 1}.</span>
                  <span className="min-w-[180px] flex-1 text-sm text-slate-700">
                    {versionLabel(item.templateVersionId)}
                    {isStale ? (
                      <span className="mt-0.5 block text-xs text-amber-800">
                        Outdated — template designer is on v{latest!.versionNumber} (no longer matches
                        this pin).
                      </span>
                    ) : null}
                  </span>
                  <Input
                    className="max-w-xs"
                    value={item.displayName}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, displayName: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  {isStale ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => useLatestTemplateVersion(index)}
                    >
                      Use latest
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" onClick={() => moveItem(index, -1)}>
                    Up
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => moveItem(index, 1)}>
                    Down
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </li>
              );
            })
          )}
        </ol>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Shared data fields</h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={refreshFields} disabled={pending}>
              Refresh from templates
            </Button>
            <Button type="button" onClick={saveFieldConfig} disabled={pending}>
              Save field list
            </Button>
          </div>
        </div>
        <ul className="space-y-2">
          {fieldConfig.length === 0 ? (
            <li className="text-sm text-slate-500">Add documents and refresh to compile fields.</li>
          ) : (
            fieldConfig.map((row, index) => {
              const meta = fieldLabels[row.fieldId];
              return (
                <li
                  key={row.fieldId}
                  className="flex flex-wrap items-center gap-3 rounded border border-slate-100 px-3 py-2 text-sm"
                >
                  <span className="text-slate-400">{index + 1}.</span>
                  <span className="min-w-[160px] font-medium">{meta?.label ?? row.fieldId}</span>
                  <code className="text-xs text-slate-500">{meta?.fieldKey}</code>
                  <label className="ml-auto flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.isRequired ?? false}
                      onChange={(e) =>
                        setFieldConfig((prev) =>
                          prev.map((entry, i) =>
                            i === index ? { ...entry, isRequired: e.target.checked } : entry,
                          ),
                        )
                      }
                    />
                    Required
                  </label>
                  <Button type="button" size="sm" variant="outline" onClick={() => moveField(index, -1)}>
                    Up
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => moveField(index, 1)}>
                    Down
                  </Button>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
