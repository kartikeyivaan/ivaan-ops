"use client";

import { useMemo, useState } from "react";
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
import { CustomerType } from "@prisma/client";
import type { CustomerImportPreviewRow } from "@/lib/customers";

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCustomerType(value: string): CustomerType | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "dealer") return CustomerType.DEALER;
  if (normalized === "project") return CustomerType.PROJECT;
  return null;
}

export function CustomerImportWizard({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [previewRows, setPreviewRows] = useState<CustomerImportPreviewRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validCount = useMemo(
    () => previewRows.filter((row) => row.isValid).length,
    [previewRows],
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });

    const rows = rawRows.map((raw, index) => {
      const normalized = Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [normalizeHeader(key), String(value)]),
      );
      const customerType = parseCustomerType(normalized.customer_type ?? "");
      return {
        rowNumber: index + 2,
        customerName: normalized.customer_name ?? "",
        customerType: customerType ?? CustomerType.DEALER,
        gstNumber: normalized.gst_number ?? "",
        address: normalized.address || undefined,
        city: normalized.city || undefined,
        state: normalized.state || undefined,
        mobile: normalized.mobile || undefined,
        email: normalized.email || undefined,
        assignedSalesEmail: normalized.assigned_sales_email ?? "",
        contactName: normalized.contact_name || undefined,
        contactDesignation: normalized.contact_designation || undefined,
        contactMobile: normalized.contact_mobile || undefined,
        contactEmail: normalized.contact_email || undefined,
      };
    });

    const response = await fetch("/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "preview", rows }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to preview import.");
      return;
    }

    setPreviewRows(data.rows);
    setMessage(`Preview ready: ${data.validCount} valid, ${data.invalidCount} invalid rows.`);
  }

  async function handleImport() {
    const validRows = previewRows.filter((row) => row.isValid);
    if (validRows.length === 0) {
      setMessage("No valid rows to import.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "import",
        rows: validRows.map(({ errors: _errors, isValid: _isValid, ...row }) => row),
      }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Import failed.");
      return;
    }

    setMessage(`Imported ${data.importedCount} customers. Skipped ${data.skippedCount}.`);
    onImported();
  }

  return (
    <Modal onClose={onClose} size="2xl">
      <ModalHeader title="Import Customers" onClose={onClose} />
      <ModalBody className="space-y-4">
        <div>
          <p className="mb-2 text-sm text-slate-600">
            Upload Excel/CSV with columns: customer_name, customer_type, gst_number, address,
            city, state, mobile, email, assigned_sales_email, contact_name, contact_designation,
            contact_mobile, contact_email
          </p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
        </div>

        {message ? <p className="text-sm text-slate-700">{message}</p> : null}

        {previewRows.length > 0 ? (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Executive Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell data-label="Row">{row.rowNumber}</TableCell>
                  <TableCell data-label="Customer">{row.customerName}</TableCell>
                  <TableCell data-label="GST">{row.gstNumber}</TableCell>
                  <TableCell data-label="Executive Email">{row.assignedSalesEmail}</TableCell>
                  <TableCell data-label="Status">
                    <Badge variant={row.isValid ? "success" : "danger"}>
                      {row.isValid ? "Valid" : "Invalid"}
                    </Badge>
                  </TableCell>
                  <TableCell data-label="Errors" className="text-xs text-red-600">
                    {row.errors.join(" ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </ModalBody>
      {previewRows.length > 0 ? (
        <ModalFooter>
          <Button onClick={handleImport} disabled={loading || validCount === 0}>
            {loading ? "Importing..." : `Import ${validCount} valid rows`}
          </Button>
        </ModalFooter>
      ) : null}
    </Modal>
  );
}
