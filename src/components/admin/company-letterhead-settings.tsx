"use client";

import { useState } from "react";
import { formatApiErrorMessage, parseApiJson } from "@/lib/api-response";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CompanyLetterheadRecord = {
  id: string;
  name: string;
  code: string;
  defaultSignatoryName: string | null;
  defaultSignatoryDesignation: string | null;
  printContentTopOffsetMm: number;
  signatureImageData: string | null;
  stampImageData: string | null;
};

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function CompanyLetterheadCard({ company }: { company: CompanyLetterheadRecord }) {
  const [name, setName] = useState(company.defaultSignatoryName ?? "");
  const [designation, setDesignation] = useState(company.defaultSignatoryDesignation ?? "");
  const [offset, setOffset] = useState(String(company.printContentTopOffsetMm));
  const [signature, setSignature] = useState(company.signatureImageData);
  const [stamp, setStamp] = useState(company.stampImageData);
  const [clearSignature, setClearSignature] = useState(false);
  const [clearStamp, setClearStamp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/companies/${company.id}/letterhead`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultSignatoryName: name,
        defaultSignatoryDesignation: designation,
        printContentTopOffsetMm: Number(offset),
        signatureImageData: clearSignature ? "" : signature && signature !== company.signatureImageData ? signature : undefined,
        stampImageData: clearStamp ? "" : stamp && stamp !== company.stampImageData ? stamp : undefined,
        clearSignature,
        clearStamp,
      }),
    });
    const payload = await parseApiJson<{ message?: string }>(response);
    setSaving(false);
    if (!response.ok) {
      setError(formatApiErrorMessage(payload, "Could not save letterhead settings."));
      return;
    }
    setClearSignature(false);
    setClearStamp(false);
    setMessage("Saved. Existing letters and stored PDFs are unchanged.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {company.code} · {company.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default signatory</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Default designation</Label>
            <Input value={designation} onChange={(event) => setDesignation(event.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Print content top offset (mm)</Label>
          <Input type="number" min={20} max={120} value={offset} onChange={(event) => setOffset(event.target.value)} />
          <p className="text-xs text-slate-500">
            Blank space reserved at the top when printing on physical letterhead.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Default signature</Label>
            {signature && !clearSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signature} alt="" className="h-16 object-contain" />
            ) : (
              <p className="text-xs text-slate-500">No signature uploaded.</p>
            )}
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setSignature(await readImageFile(file));
                setClearSignature(false);
              }}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={clearSignature}
                onChange={(event) => setClearSignature(event.target.checked)}
              />
              Remove signature
            </label>
          </div>
          <div className="space-y-2">
            <Label>Company stamp</Label>
            {stamp && !clearStamp ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stamp} alt="" className="h-16 object-contain" />
            ) : (
              <p className="text-xs text-slate-500">No stamp uploaded yet.</p>
            )}
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setStamp(await readImageFile(file));
                setClearStamp(false);
              }}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={clearStamp} onChange={(event) => setClearStamp(event.target.checked)} />
              Remove stamp
            </label>
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        <Button type="button" onClick={save} disabled={saving}>
          Save letterhead settings
        </Button>
      </CardContent>
    </Card>
  );
}

export function CompanyLetterheadSettings({ companies }: { companies: CompanyLetterheadRecord[] }) {
  if (companies.length === 0) return null;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Letterhead settings</h2>
        <p className="text-sm text-slate-500">
          Defaults for new letters only. Historical PDFs stay as they were generated.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {companies.map((company) => (
          <CompanyLetterheadCard key={company.id} company={company} />
        ))}
      </div>
    </div>
  );
}
