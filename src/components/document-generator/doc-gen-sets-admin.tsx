"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SetRow = {
  id: string;
  name: string;
  status: string;
  currentPublishedVersion: { versionNumber: number; publishedAt: string | null } | null;
  versions: Array<{ id: string; versionNumber: number }>;
};

export function DocGenSetsAdmin({ initialSets }: { initialSets: SetRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createSet(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/document-generator/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Unable to create set.");
      router.push(`/documentation/document-generator/admin/sets/${body.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create set.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document sets</h1>
          <p className="text-sm text-slate-600">
            Group published templates, configure shared fields, and publish sets for generation.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/documentation/document-generator">Dashboard</Link>
        </Button>
      </div>

      <form onSubmit={createSet} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="min-w-[240px] flex-1 space-y-1">
          <Label htmlFor="setName">Set name</Label>
          <Input id="setName" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create set"}
        </Button>
        {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Published</th>
              <th className="px-4 py-2 font-medium">Draft</th>
            </tr>
          </thead>
          <tbody>
            {initialSets.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  No document sets yet.
                </td>
              </tr>
            ) : (
              initialSets.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link
                      className="font-medium text-emerald-700 hover:underline"
                      href={`/documentation/document-generator/admin/sets/${row.id}`}
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {row.currentPublishedVersion
                      ? `v${row.currentPublishedVersion.versionNumber}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
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
