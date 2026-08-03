"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/quotations";
import { formatDate } from "@/lib/utils";

type TransferRow = {
  id: string;
  transferNumber: string;
  origin: string;
  status: string;
  fromCompany: { code: string; name: string };
  toCompany: { code: string; name: string };
  piNo: string | null;
  dcNo: string | null;
  approvedBy: { name: string } | null;
  createdBy: { name: string };
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  lines: Array<{
    productName: string;
    qty: number;
    unitPurchaseCost: number | null;
    serials: string[];
  }>;
};

export function AccountsStockTransfersList({ rows }: { rows: TransferRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Stock Transfers</h1>
        <p className="text-sm text-slate-600">
          All stock transfers for this company, including auto shortfall transfers booked on DC
          confirm (purchase-cost valuation; no inter-company GST invoice).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfers ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">No stock transfers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead>PI / DC</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Approver</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.transferNumber}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="default">{row.status}</Badge>
                        {row.origin === "DISPATCH_SHORTFALL" ? (
                          <Badge variant="warning">Auto (dispatch)</Badge>
                        ) : (
                          <Badge variant="default">Manual</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.fromCompany.code} → {row.toCompany.code}
                    </TableCell>
                    <TableCell>
                      <div>{row.piNo ?? "—"}</div>
                      <div className="text-xs text-slate-500">{row.dcNo ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <ul className="space-y-1 text-sm">
                        {row.lines.map((line, index) => (
                          <li key={`${row.id}-${index}`}>
                            {line.productName} × {line.qty}
                            {line.unitPurchaseCost != null && line.unitPurchaseCost > 0
                              ? ` @ ${formatCurrency(line.unitPurchaseCost)}`
                              : ""}
                            {line.serials.length > 0 ? (
                              <div className="text-xs text-slate-500">
                                QR/Serials: {line.serials.join(", ")}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell>{row.approvedBy?.name ?? "—"}</TableCell>
                    <TableCell>{formatDate(row.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
