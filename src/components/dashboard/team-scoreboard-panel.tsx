import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TeamScoreboardDto } from "@/lib/sales-dashboard/dashboard-types";
import {
  formatCompactNumber,
  formatCurrency,
  PERIOD_LABELS,
} from "@/components/dashboard/dashboard-formatters";

export function TeamScoreboardPanel({ data }: { data: TeamScoreboardDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team Scoreboard</CardTitle>
        <p className="text-xs text-slate-500">
          {PERIOD_LABELS[data.period]} · sorted by module units
        </p>
      </CardHeader>
      <CardContent>
        {data.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No sales executives found for this company.
          </p>
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Executive</TableHead>
                <TableHead className="text-right">Quotation</TableHead>
                <TableHead className="text-right">PI</TableHead>
                <TableHead className="text-right">Collection</TableHead>
                <TableHead className="text-right">Dispatch</TableHead>
                <TableHead className="text-right">Modules</TableHead>
                <TableHead className="text-right">New customers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.executiveId}>
                  <TableCell>
                    <Link
                      href={`/dashboard/executive/${row.executiveId}`}
                      className="font-medium text-slate-800 hover:text-emerald-800 hover:underline"
                    >
                      {row.executiveName}
                    </Link>
                    <p className="text-xs text-slate-500">{row.executiveEmail}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.quotationValue)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(row.piValue)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.collectionValue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.dispatchedValue)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCompactNumber(row.moduleUnits)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCompactNumber(row.newCustomers)}
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
