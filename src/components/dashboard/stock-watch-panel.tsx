import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SalesStockWatchDto } from "@/lib/sales-dashboard/dashboard-types";
import { formatCompactNumber } from "@/components/dashboard/dashboard-formatters";
import {
  freeQtyHintLines,
  StockQtyHint,
} from "@/components/dashboard/stock-qty-hint";

export function StockWatchPanel({ data }: { data: SalesStockWatchDto }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Sales Stock Watch</CardTitle>
      </CardHeader>
      <CardContent>
        {data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No open-sales stock pressure right now.
          </p>
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Required</TableHead>
                <TableHead className="text-right">
                  <StockQtyHint
                    label="Available"
                    className="justify-end"
                    lines={[
                      "Status uses Free qty, not physical available alone.",
                      "Free qty = Available − Booked + Upcoming",
                      "Upcoming = pending qty on incoming lots",
                    ]}
                  />
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell>
                    <Link
                      href={`/sales/inventory-timeline?productId=${item.productId}`}
                      className="font-medium text-slate-800 hover:text-emerald-800 hover:underline"
                    >
                      {item.productName}
                    </Link>
                    <p className="text-xs text-slate-500">{item.brandName}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCompactNumber(item.openRequirement)}
                  </TableCell>
                  <TableCell className="text-right">
                    <StockQtyHint
                      label="Available"
                      className="justify-end"
                      lines={freeQtyHintLines(item)}
                    >
                      <span>{formatCompactNumber(item.available)}</span>
                    </StockQtyHint>
                  </TableCell>
                  <TableCell>
                    <StockStatusBadge status={item.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function StockStatusBadge({
  status,
}: {
  status: "AVAILABLE" | "LOW" | "SHORT" | "CONFLICT";
}) {
  switch (status) {
    case "AVAILABLE":
      return <Badge variant="success">Available</Badge>;
    case "LOW":
      return <Badge variant="warning">Low</Badge>;
    case "SHORT":
      return <Badge variant="danger">Short</Badge>;
    case "CONFLICT":
      return <Badge variant="danger">Conflict</Badge>;
  }
}
