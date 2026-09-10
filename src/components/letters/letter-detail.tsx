"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatApiErrorMessage, parseApiJson } from "@/lib/api-response";
import { formatLetterDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LettersNav } from "@/components/letters/letters-nav";

export type LetterDetailRecord = {
  id: string;
  status: "DRAFT" | "ISSUED";
  letterSerialNumber: string | null;
  letterDate: string;
  signatoryName: string;
  signatoryDesignation: string;
  company: { id: string; name: string; code: string };
  createdBy: { id: string; name: string; email: string };
  stampEnabled: boolean;
  printSignatureEnabled: boolean;
  generatedAt: string | null;
};

export function LetterDetail({ letter }: { letter: LetterDetailRecord }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  async function duplicate() {
    setDuplicating(true);
    setError("");
    const response = await fetch(`/api/letters/${letter.id}/duplicate`, { method: "POST" });
    const payload = await parseApiJson<{ id?: string; message?: string }>(response);
    setDuplicating(false);
    if (!response.ok || !payload.id) {
      setError(formatApiErrorMessage(payload, "Could not duplicate the letter."));
      return;
    }
    router.push(`/documents/letterhead?id=${payload.id}`);
  }

  return (
    <div className="space-y-6">
      <LettersNav />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Letter</h1>
          <p className="text-sm text-slate-500">
            {letter.status === "DRAFT"
              ? `Draft · ${letter.company.code} · ${formatLetterDate(letter.letterDate)}`
              : `Internal serial ${letter.letterSerialNumber} · ${letter.company.code} · ${formatLetterDate(letter.letterDate)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/documents/letters">History</Link>
          </Button>
          {letter.status === "DRAFT" ? (
            <Button asChild>
              <Link href={`/documents/letterhead?id=${letter.id}`}>Edit draft</Link>
            </Button>
          ) : (
            <Button asChild>
              <a href={`/api/letters/${letter.id}/pdf?download=1`}>Download PDF</a>
            </Button>
          )}
          <Button asChild variant="secondary">
            <a href={`/api/letters/${letter.id}/print`} target="_blank" rel="noreferrer">
              Print
            </a>
          </Button>
          <Button type="button" variant="outline" onClick={duplicate} disabled={duplicating}>
            Duplicate
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Record</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="text-slate-500">Signed by</span>
            <br />
            {letter.signatoryName}, {letter.signatoryDesignation}
          </p>
          <p>
            <span className="text-slate-500">Created by</span>
            <br />
            {letter.createdBy.name}
          </p>
          <p>
            <span className="text-slate-500">Stamp on official PDF</span>
            <br />
            {letter.stampEnabled ? "Yes" : "No"}
          </p>
          <p>
            <span className="text-slate-500">Print signature</span>
            <br />
            {letter.printSignatureEnabled ? "Yes" : "No"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stored official PDF</CardTitle>
        </CardHeader>
        <CardContent>
          {letter.generatedAt ? (
            <iframe
              title="Official letter PDF"
              src={`/api/letters/${letter.id}/pdf`}
              className="h-[80vh] w-full rounded-md border border-slate-200"
            />
          ) : (
            <p className="text-sm text-slate-500">No stored PDF is available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
