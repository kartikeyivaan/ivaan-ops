"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldRow = {
  id: string;
  fieldKey: string;
  label: string;
  inputType: string;
  status: string;
  isRequiredDefault: boolean;
};

const INPUT_TYPES = [
  "TEXT",
  "NUMBER",
  "DROPDOWN",
  "RADIO",
  "MULTI_SELECT",
  "DATE",
  "TEXTAREA",
] as const;

export function DocGenFieldsAdmin({ initialFields }: { initialFields: FieldRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldKey, setFieldKey] = useState("");
  const [label, setLabel] = useState("");
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]>("TEXT");

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/document-generator/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldKey, label, inputType }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? "Unable to create field.");
        return;
      }
      setFieldKey("");
      setLabel("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global data fields</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reusable placeholders for MSEB document templates (ISE only).
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/documentation/document-generator">Back to dashboard</Link>
        </Button>
      </div>

      <form onSubmit={onCreate} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Create field</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="fieldKey">Field key</Label>
            <Input
              id="fieldKey"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              placeholder="Customer_Name"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="label">Display label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Customer name"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inputType">Input type</Label>
            <select
              id="inputType"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={inputType}
              onChange={(e) => setInputType(e.target.value as (typeof INPUT_TYPES)[number])}
            >
              {INPUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create field"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {initialFields.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No fields yet. Create your first field above.
                </td>
              </tr>
            ) : (
              initialFields.map((field) => (
                <tr key={field.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs">{field.fieldKey}</td>
                  <td className="px-4 py-2">{field.label}</td>
                  <td className="px-4 py-2">{field.inputType}</td>
                  <td className="px-4 py-2">{field.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
