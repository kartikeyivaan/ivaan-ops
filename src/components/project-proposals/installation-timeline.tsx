"use client";

import {
  INSTALLATION_TIMELINE_CONNECTOR,
  INSTALLATION_TIMELINE_FOOTER_NOTE,
  INSTALLATION_TIMELINE_ROWS,
  INSTALLATION_TIMELINE_THEME,
  INSTALLATION_TIMELINE_TITLE_EMPHASIS,
  INSTALLATION_TIMELINE_TITLE_LEAD,
  type InstallationTimelineStep,
} from "@/lib/installation-timeline";
import { TimelineRoadmap, type TimelineRoadmapRow } from "@/components/ui/timeline-roadmap";
import { InstallationTimelineStepIcon } from "@/components/project-proposals/installation-timeline-icons";
import { cn } from "@/lib/utils";

type InstallationTimelineProps = {
  className?: string;
  /** Disable connector animation (e.g. print preview). */
  static?: boolean;
};

function toRoadmapRows(): TimelineRoadmapRow[] {
  return INSTALLATION_TIMELINE_ROWS.map((row) => ({
    direction: row.direction,
    milestones: row.steps.map((step: InstallationTimelineStep) => ({
      title: step.title,
      badge: step.duration,
      icon: <InstallationTimelineStepIcon icon={step.icon} />,
    })),
  }));
}

const timelineRows = toRoadmapRows();

export function InstallationTimeline({ className, static: isStatic = false }: InstallationTimelineProps) {
  const theme = INSTALLATION_TIMELINE_THEME;

  return (
    <section className={cn("w-full", className)} aria-labelledby="installation-timeline-title">
      <header className="mb-8 text-center sm:text-left">
        <h2
          id="installation-timeline-title"
          className="text-lg font-bold uppercase tracking-tight sm:text-xl"
          style={{ color: theme.heading }}
        >
          {INSTALLATION_TIMELINE_TITLE_LEAD}{" "}
          <span style={{ color: theme.accent }}>{INSTALLATION_TIMELINE_TITLE_EMPHASIS}</span>
        </h2>
      </header>

      <TimelineRoadmap
        rows={timelineRows}
        connectorColor={INSTALLATION_TIMELINE_CONNECTOR}
        static={isStatic}
        aria-label="Installation timeline roadmap"
      />

      <p
        className="mt-8 text-center text-[13px] leading-relaxed sm:text-left"
        style={{ color: theme.muted }}
      >
        {INSTALLATION_TIMELINE_FOOTER_NOTE}
      </p>
    </section>
  );
}
