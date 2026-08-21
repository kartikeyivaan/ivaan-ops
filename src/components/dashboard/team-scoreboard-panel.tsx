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
  formatActualCounted,
  formatCompactNumber,
  formatCurrency,
  PERIOD_LABELS,
} from "@/components/dashboard/dashboard-formatters";

function DualCell({
  actual,
  counted,
  format,
}: {
  actual: number;
  counted: number;
  format: (value: number) => string;
}) {
  return (
    <div className="text-right">
      <p className="font-medium text-slate-800">{formatActualCounted(actual, counted, format)}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">Actual / Counted</p>
    </div>
  );
}

export function TeamScoreboardPanel({ data }: { data: TeamScoreboardDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team Scoreboard</CardTitle>
        <p className="text-xs text-slate-500">
          {PERIOD_LABELS[data.period]} · sorted by counted module units · values show Actual /
          Counted (incentive credit)
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
                  <TableCell>
                    <DualCell
                      actual={row.quotationValue.actual}
                      counted={row.quotationValue.counted}
                      format={formatCurrency}
                    />
                  </TableCell>
                  <TableCell>
                    <DualCell
                      actual={row.piValue.actual}
                      counted={row.piValue.counted}
                      format={formatCurrency}
                    />
                  </TableCell>
                  <TableCell>
                    <DualCell
                      actual={row.collectionValue.actual}
                      counted={row.collectionValue.counted}
                      format={formatCurrency}
                    />
                  </TableCell>
                  <TableCell>
                    <DualCell
                      actual={row.dispatchedValue.actual}
                      counted={row.dispatchedValue.counted}
                      format={formatCurrency}
                    />
                  </TableCell>
                  <TableCell>
                    <DualCell
                      actual={row.moduleUnits.actual}
                      counted={row.moduleUnits.counted}
                      format={(v) => formatCompactNumber(v, 3)}
                    />
                  </TableCell>
                  <TableCell>
                    <DualCell
                      actual={row.newCustomers.actual}
                      counted={row.newCustomers.counted}
                      format={formatCompactNumber}
                    />
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
