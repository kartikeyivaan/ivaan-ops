"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DispatchTodayPanel, type DispatchTodayTile } from "@/components/dispatches/dispatch-today-panel";
import { DispatchProjectsPanel } from "@/components/inventory/dispatch-projects-panel";
import type { DispatchableProject } from "@/lib/project-dispatch-service";
import { cn } from "@/lib/utils";

type TabId = "retail" | "projects";

export function DispatchesHub({
  retailTiles,
  projectQueue,
  canManageRetail,
  canManageProjects,
  canViewProjects,
  initialTab = "retail",
}: {
  retailTiles: DispatchTodayTile[];
  projectQueue: DispatchableProject[];
  canManageRetail: boolean;
  canManageProjects: boolean;
  canViewProjects: boolean;
  initialTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispatch</h1>
          <p className="text-sm text-slate-500">
            Retail delivery challans and B2C project dispatches from Jalgaon Projects.
          </p>
        </div>
        <Button variant="outline" asChild className="h-12">
          <Link href="/inventory/dispatches/challans">
            <FileText className="h-4 w-4" />
            Delivery Challans
          </Link>
        </Button>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("retail")}
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            tab === "retail"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          Retail Dispatch
        </button>
        {canViewProjects ? (
          <button
            type="button"
            onClick={() => setTab("projects")}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === "projects"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            Projects Dispatch
          </button>
        ) : null}
      </div>

      {tab === "retail" ? (
        <DispatchTodayPanel tiles={retailTiles} canManage={canManageRetail} embedded />
      ) : (
        <DispatchProjectsPanel projects={projectQueue} canManage={canManageProjects} />
      )}
    </div>
  );
}
