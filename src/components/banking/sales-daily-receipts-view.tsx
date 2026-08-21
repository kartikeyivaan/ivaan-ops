"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { defaultPaymentsDateRange } from "@/lib/proforma-invoices";
import { formatCurrency } from "@/lib/quotations";
import { cn } from "@/lib/utils";

type CompanyTab = { id: string; code: string; name: string };

type ReceiptItem = {
  id: string;
  paymentCode: string;
  transactionDate: string;
  description: string;
  referenceNumber: string | null;
  bankName: string;
  receivedInAccount: string;
  amount: number;
  availableAmount: number;
  availabilityLabel: string;
};

type DayGroup = {
  date: string;
  items: ReceiptItem[];
  dayTotal: number;
};

type ListResponse = {
  company: CompanyTab;
  companies: CompanyTab[];
  banks: string[];
  dateFrom: string;
  dateTo: string;
  groups: DayGroup[];
  totalAmount: number;
  message?: string;
};

/**
 * Copy writes only to the clipboard — no reservation, assignment, status change, or API call.
 */
async function copyPaymentCodeOnly(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

export function SalesDailyReceiptsView() {
  const defaults = useMemo(() => defaultPaymentsDateRange(), []);
  const [companies, setCompanies] = useState<CompanyTab[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [banks, setBanks] = useState<string[]>([]);
  const [groups, setGroups] = useState<DayGroup[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (companyId) params.set("companyId", companyId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }, [companyId, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/banking/daily-receipts?${queryString}`);
      const data = (await response.json()) as ListResponse;
      if (!response.ok) {
        setError(data.message ?? "Failed to load daily receipts.");
        setGroups([]);
        return;
      }
      setCompanies(data.companies ?? []);
      if (!companyId && data.company?.id) {
        setCompanyId(data.company.id);
      }
      setBanks(data.banks ?? []);
      setGroups(data.groups ?? []);
      setTotalAmount(data.totalAmount ?? 0);
    } catch {
      setError("Could not reach the server.");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [queryString, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCopy(item: ReceiptItem) {
    const ok = await copyPaymentCodeOnly(item.paymentCode);
    if (!ok) {
      setError("Could not copy to clipboard.");
      return;
    }
    setCopiedId(item.id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === item.id ? null : current));
    }, 1500);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Daily Receipts</h1>
        <p className="text-sm text-slate-500">
          Credit receipts only for the selected firm. Copy into a PI of the same company — codes from
          another firm will be rejected. Copying does not reserve or assign the payment.
        </p>
      </div>

      {companies.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => setCompanyId(company.id)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                companyId === company.id
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {company.code}
              <span className="ml-1 hidden text-xs font-normal text-slate-500 sm:inline">
                {company.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <CollapsibleFilterCard>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="dateFrom">From</Label>
            <Input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateTo">To</Label>
            <Input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <p className="text-xs text-slate-500">
              Combined banks: {banks.length ? banks.join(" + ") : "—"}
            </p>
          </div>
        </div>
      </CollapsibleFilterCard>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
          <span className="text-slate-600">
            {loading ? "Loading…" : `${groups.reduce((s, g) => s + g.items.length, 0)} credit receipt(s)`}
          </span>
          <span className="font-medium text-slate-900">
            Total received: {formatCurrency(totalAmount)}
          </span>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading receipts…</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            No credit receipts in this date range for the selected company.
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.date}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">{group.date}</CardTitle>
              <span className="text-sm text-slate-600">
                Day total {formatCurrency(group.dayTotal)}
              </span>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference / details</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Copy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="min-w-[16rem] max-w-xl whitespace-normal break-words">
                        <div className="text-sm font-medium text-slate-800">
                          {item.referenceNumber || "—"}
                        </div>
                        <div className="text-xs text-slate-500">{item.description}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{item.receivedInAccount}</div>
                        <div className="text-xs text-slate-500">{item.bankName}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(item.amount)}
                      </TableCell>
                      <TableCell className="text-sm">{item.availabilityLabel}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleCopy(item)}
                          aria-label="Copy payment code"
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check className="mr-1 h-4 w-4" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1 h-4 w-4" />
                              Copy
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
