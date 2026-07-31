"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  approvalTypeLabel,
  type ApprovalHistoryItem,
} from "@/lib/approvals-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export function ApprovalsHistoryList({ items }: { items: ApprovalHistoryItem[] }) {
  const router = useRouter();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approval History</h1>
          <p className="text-sm text-slate-500">
            Approved and rejected decisions for workflows you can approve.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/approvals">
            <ArrowLeft className="h-4 w-4" />
            Pending Approvals
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Customer / subject</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Decided by</TableHead>
                  <TableHead>Decided</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(item.href)}
                  >
                    <TableCell>
                      <Badge>{approvalTypeLabel(item.type)}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{item.documentNo}</TableCell>
                    <TableCell>{item.subjectName}</TableCell>
                    <TableCell>
                      <Badge variant={item.decision === "APPROVED" ? "success" : "danger"}>
                        {item.decision === "APPROVED" ? "Approved" : "Rejected"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs text-slate-600">{item.reason}</TableCell>
                    <TableCell>{item.requestedByName ?? "—"}</TableCell>
                    <TableCell>{item.decidedByName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-slate-600">
                      {formatDate(item.decidedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-slate-500">No approval history yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
