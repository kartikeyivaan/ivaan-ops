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
import type { StockConflictDto } from "@/lib/sales-dashboard/dashboard-types";
import { formatCompactNumber } from "@/components/dashboard/dashboard-formatters";
import {
  shortByHintLines,
  StockQtyHint,
} from "@/components/dashboard/stock-qty-hint";

export function StockConflictsPanel({ data }: { data: StockConflictDto[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Stock Conflicts</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No stock conflicts blocking dispatches.
          </p>
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Required</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">
                  <StockQtyHint
                    label="Short by"
                    className="justify-end"
                    lines={[
                      "Short by = Required − Free qty",
                      "Free qty = Available − Booked + Upcoming",
                      "Upcoming = pending qty on incoming lots",
                    ]}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell>
                    <Link
                      href={`/sales/inventory-timeline?productId=${item.productId}`}
                      className="font-medium text-slate-800 hover:text-emerald-800 hover:underline"
                    >
                      {item.productName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCompactNumber(item.required)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCompactNumber(item.available)}
                  </TableCell>
                  <TableCell className="text-right">
                    <StockQtyHint
                      label="Short by"
                      className="justify-end"
                      lines={shortByHintLines(item)}
                    >
                      <Badge variant="danger">{formatCompactNumber(item.shortBy)}</Badge>
                    </StockQtyHint>
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
