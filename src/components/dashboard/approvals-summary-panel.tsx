import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApprovalSummaryDto } from "@/lib/sales-dashboard/dashboard-types";
import { approvalTypeLabel } from "@/lib/approvals-service";
import type { ApprovalType } from "@/lib/approvals-service";

export function ApprovalsSummaryPanel({ data }: { data: ApprovalSummaryDto }) {
  const typeEntries = Object.entries(data.byType).filter(
    ([, count]) => (count ?? 0) > 0,
  ) as Array<[ApprovalType, number]>;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4 text-amber-700" />
            Pending Approvals
          </CardTitle>
          {data.oldestWaitingDays != null && data.total > 0 ? (
            <p className="text-xs text-slate-500">
              Oldest waiting {data.oldestWaitingDays} day
              {data.oldestWaitingDays === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/approvals">Open approvals</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {data.total === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No sales approvals waiting on you.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-semibold text-slate-900">{data.total}</span>
              <Badge variant="warning">Needs action</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {typeEntries.map(([type, count]) => (
                <Badge key={type} variant="default" className="font-normal">
                  {approvalTypeLabel(type)} · {count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
