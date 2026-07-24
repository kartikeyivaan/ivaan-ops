"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SERVICE_IMPORT_TEMPLATE_HEADERS,
  mapServiceImportHeader,
  type ServiceImportField,
  type ServiceImportInput,
} from "@/lib/service-import";

type PreviewRow = {
  rowNumber: number;
  customerName: string;
  workTypeName: string;
  matchedWorkType: boolean;
  status: string;
  totalFees: number;
  amountReceived: number;
  duplicate: boolean;
  isValid: boolean;
  errors: string[];
};

type PreviewSummary = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  matchedWorkType: number;
  customWorkType: number;
};

export function ServiceImportWizard({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [inputs, setInputs] = useState<ServiceImportInput[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importableCount = useMemo(
    () => previewRows.filter((row) => row.isValid && !row.duplicate).length,
    [previewRows],
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);
    setPreviewRows([]);
    setSummary(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      const parsedInputs: ServiceImportInput[] = rawRows.map((raw, index) => {
        const mapped: Partial<Record<ServiceImportField, string>> = {};
        for (const [key, value] of Object.entries(raw)) {
          const field = mapServiceImportHeader(key);
          if (field) mapped[field] = String(value ?? "").trim();
        }
        return { rowNumber: index + 2, ...mapped };
      });

      if (parsedInputs.length === 0) {
        setMessage("No rows found in the uploaded file.");
        setLoading(false);
        return;
      }

      setInputs(parsedInputs);

      const response = await fetch("/api/service/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", rows: parsedInputs }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message ?? "Failed to preview import.");
        setLoading(false);
        return;
      }

      setPreviewRows(data.rows);
      setSummary(data.summary);
      setMessage(
        `Preview ready: ${data.summary.valid} valid, ${data.summary.invalid} invalid, ${data.summary.duplicates} duplicate rows.`,
      );
    } catch {
      setMessage("Could not read the file. Please upload a valid Excel/CSV file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (importableCount === 0) {
      setMessage("No new valid rows to import.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/service/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "import", rows: inputs }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Import failed.");
      return;
    }

    setMessage(
      `Imported ${data.imported} requests. Skipped ${data.skippedInvalid} invalid, ${data.skippedDuplicate} duplicates.`,
    );
    setPreviewRows([]);
    setSummary(null);
    setInputs([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onImported();
  }

  return (
    <Modal onClose={onClose} size="2xl">
      <ModalHeader title="Import Service Requests" onClose={onClose} />
      <ModalBody className="space-y-4">
        <div>
          <p className="mb-2 text-sm text-slate-600">
            Upload an Excel/CSV file. Recognized columns:{" "}
            <span className="font-medium">
              {SERVICE_IMPORT_TEMPLATE_HEADERS.join(", ")}
            </span>
            . Unknown work types are imported as custom labels. Rows with a
            repeated serial number (#) are skipped as duplicates.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={loading}
          />
        </div>

        {message ? <p className="text-sm text-slate-700">{message}</p> : null}

        {summary ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="success">{summary.valid} valid</Badge>
            {summary.invalid > 0 ? (
              <Badge variant="danger">{summary.invalid} invalid</Badge>
            ) : null}
            {summary.duplicates > 0 ? (
              <Badge variant="warning">{summary.duplicates} duplicate</Badge>
            ) : null}
            <Badge>{summary.customWorkType} custom work type</Badge>
          </div>
        ) : null}

        {previewRows.length > 0 ? (
          <div className="max-h-80 overflow-auto">
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Work Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fees</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell data-label="Row">{row.rowNumber}</TableCell>
                    <TableCell data-label="Customer">{row.customerName}</TableCell>
                    <TableCell data-label="Work Type">
                      {row.workTypeName}
                      {!row.matchedWorkType ? (
                        <span className="ml-1 text-xs text-amber-600">(custom)</span>
                      ) : null}
                    </TableCell>
                    <TableCell data-label="Status">{row.status}</TableCell>
                    <TableCell data-label="Fees">{row.totalFees}</TableCell>
                    <TableCell data-label="Received">{row.amountReceived}</TableCell>
                    <TableCell data-label="State">
                      {row.duplicate ? (
                        <Badge variant="warning">Duplicate</Badge>
                      ) : row.isValid ? (
                        <Badge variant="success">Valid</Badge>
                      ) : (
                        <Badge variant="danger">Invalid</Badge>
                      )}
                    </TableCell>
                    <TableCell data-label="Errors" className="text-xs text-red-600">
                      {row.errors.join(" ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </ModalBody>
      {previewRows.length > 0 ? (
        <ModalFooter>
          <Button onClick={handleImport} disabled={loading || importableCount === 0}>
            {loading ? "Importing..." : `Import ${importableCount} rows`}
          </Button>
        </ModalFooter>
      ) : null}
    </Modal>
  );
}
