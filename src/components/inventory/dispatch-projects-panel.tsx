"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatProjectStatus } from "@/lib/projects";
import type { DispatchableProject } from "@/lib/project-dispatch-service";

export function DispatchProjectsPanel({
  projects,
  canManage,
}: {
  projects: DispatchableProject[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => {
      const haystack = [
        project.customerName,
        project.projectNo,
        project.proposalNo,
        project.siteAddress,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [projects, q]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Projects Dispatch</h2>
        <p className="text-sm text-slate-500">
          Dispatch material from Jalgaon Projects to the customer site. Search by customer, proposal,
          site, or project number.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search customer, proposal no., site, project no.…"
          className="h-12 pl-10 text-base"
          aria-label="Search projects dispatch queue"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 py-16 text-slate-500">
          <Package className="h-10 w-10 text-slate-300" />
          <p>No projects ready to dispatch.</p>
          <p className="text-sm">Ensure material is assigned and stock is in Jalgaon Projects.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Project No</TableHead>
                <TableHead>Proposal No</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Ready Lines</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="w-28" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.customerName}</TableCell>
                  <TableCell>{project.projectNo}</TableCell>
                  <TableCell>{project.proposalNo}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{project.siteAddress}</TableCell>
                  <TableCell className="text-right">{project.readyLineCount}</TableCell>
                  <TableCell>
                    <Badge variant="default">{formatProjectStatus(project.status)}</Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          router.push(
                            `/inventory/dispatches/projects/new?projectId=${project.id}`,
                          )
                        }
                      >
                        Dispatch
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-sm text-slate-500">
        View confirmed project challans from{" "}
        <Link href="/inventory/dispatches/challans?type=projects" className="font-medium underline">
          Delivery Challans
        </Link>
        .
      </p>
    </div>
  );
}
