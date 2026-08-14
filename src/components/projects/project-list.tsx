"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatProjectStatus } from "@/lib/projects";
import type { SerializedProject } from "@/lib/project-service";

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "FULLY_DISPATCHED" || status === "READY_FOR_DISPATCH") return "success";
  if (
    status === "MATERIAL_PENDING_APPROVAL" ||
    status === "PARTIALLY_DISPATCHED" ||
    status === "MATERIAL_ASSIGNED"
  ) {
    return "warning";
  }
  if (status === "CLOSED") return "danger";
  return "default";
}

export function ProjectList({
  initialProjects,
}: {
  initialProjects: SerializedProject[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    const response = await fetch(`/api/projects?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      setProjects(data);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Projects</h1>
        <p className="text-sm text-slate-500">
          B2C project execution — material assignment and dispatch
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="project-search">Search</Label>
            <Input
              id="project-search"
              placeholder="Project no., proposal no., customer, site…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void applyFilters();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-status">Status</Label>
            <select
              id="project-status"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="OPEN">Project Open</option>
              <option value="MATERIAL_DRAFT">Material Assignment (Draft)</option>
              <option value="MATERIAL_PENDING_APPROVAL">Pending Material Approval</option>
              <option value="MATERIAL_ASSIGNED">Material Assigned</option>
              <option value="READY_FOR_DISPATCH">Ready for Dispatch</option>
              <option value="PARTIALLY_DISPATCHED">Partially Dispatched</option>
              <option value="FULLY_DISPATCHED">Fully Dispatched</option>
              <option value="CLOSED">Project Closed</option>
            </select>
          </div>
          <div className="flex items-end sm:col-span-3">
            <button
              type="button"
              onClick={() => void applyFilters()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project No.</TableHead>
                <TableHead>Proposal No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                    No projects found. Convert an approved proposal to get started.
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        href={`/projects/execution/${project.id}`}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        {project.projectNo}
                      </Link>
                    </TableCell>
                    <TableCell>{project.proposalNo}</TableCell>
                    <TableCell>{project.customerName}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{project.siteAddress}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(project.status)}>
                        {formatProjectStatus(project.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
