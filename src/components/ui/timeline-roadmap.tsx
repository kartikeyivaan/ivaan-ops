"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  computeSnakeTimelineLayout,
  computeVerticalTimelineLayout,
  resolveTimelineLayoutOptions,
  type TimelineRoadmapDirection,
  type TimelineRoadmapLayoutOptions,
} from "@/lib/timeline-roadmap-geometry";
import { cn } from "@/lib/utils";

export const TIMELINE_ROADMAP_CONNECTOR_ORANGE = "#F59E0B";

export type TimelineRoadmapMilestone = {
  title: string;
  icon: ReactNode;
  badge?: string;
};

export type TimelineRoadmapRow = {
  direction: TimelineRoadmapDirection;
  milestones: TimelineRoadmapMilestone[];
};

export type TimelineRoadmapProps = {
  rows: TimelineRoadmapRow[];
  className?: string;
  connectorColor?: string;
  layoutOptions?: TimelineRoadmapLayoutOptions;
  /** Disable connector draw animation and hover effects (e.g. print / PDF preview). */
  static?: boolean;
  /** Force vertical layout regardless of viewport width. */
  forceVertical?: boolean;
  "aria-label"?: string;
};

const NODE_SIZE = 56;
const STEM_HEIGHT = 12;
const MOBILE_BREAKPOINT = 768;

function TimelineRoadmapArrow({
  x,
  y,
  rotation,
  color,
}: {
  x: number;
  y: number;
  rotation: number;
  color: string;
}) {
  return (
    <polygon
      points="-6,-4 8,0 -6,4"
      fill={color}
      transform={`translate(${x} ${y}) rotate(${rotation})`}
    />
  );
}

function TimelineRoadmapMilestoneNode({
  milestone,
  static: isStatic,
  connectorColor,
  maxWidth,
}: {
  milestone: TimelineRoadmapMilestone;
  static?: boolean;
  connectorColor: string;
  maxWidth: number;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center",
        !isStatic && "transition-transform duration-200 hover:-translate-y-0.5",
      )}
      style={{ maxWidth }}
    >
      <div
        className="relative z-20 flex shrink-0 items-center justify-center rounded-full border-[2.5px] bg-white"
        style={{
          width: NODE_SIZE,
          height: NODE_SIZE,
          borderColor: connectorColor,
        }}
      >
        <div className="flex h-7 w-7 items-center justify-center [&_img]:h-7 [&_img]:w-7 [&_svg]:h-7 [&_svg]:w-7">
          {milestone.icon}
        </div>
      </div>

      <div
        className="shrink-0"
        style={{
          width: 2,
          height: STEM_HEIGHT,
          backgroundColor: connectorColor,
          borderRadius: 1,
        }}
        aria-hidden
      />

      <p
        className="text-center text-[15px] font-semibold leading-snug"
        style={{ color: "#374151", maxWidth }}
      >
        {milestone.title}
      </p>

      {milestone.badge ? (
        <span
          className="mt-2 inline-flex h-7 min-w-[5.75rem] items-center justify-center rounded-full px-3 text-center text-xs font-medium leading-none"
          style={{
            backgroundColor: "#F3F4F6",
            color: "#6B7280",
          }}
        >
          {milestone.badge}
        </span>
      ) : null}
    </div>
  );
}

export function TimelineRoadmap({
  rows,
  className,
  connectorColor = TIMELINE_ROADMAP_CONNECTOR_ORANGE,
  layoutOptions,
  static: isStatic = false,
  forceVertical = false,
  "aria-label": ariaLabel = "Timeline roadmap",
}: TimelineRoadmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [width, setWidth] = useState(0);
  const [pathLength, setPathLength] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      setWidth(element.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const isVertical = forceVertical || width < MOBILE_BREAKPOINT;

  const resolvedLayoutOptions = useMemo(
    () => resolveTimelineLayoutOptions(width, { nodeSize: NODE_SIZE, stemHeight: STEM_HEIGHT, ...layoutOptions }),
    [layoutOptions, width],
  );

  const layout = useMemo(() => {
    if (width <= 0 || rows.length === 0) return null;

    if (isVertical) {
      const stepCount = rows.reduce((count, row) => count + row.milestones.length, 0);
      return computeVerticalTimelineLayout(stepCount, width, resolvedLayoutOptions);
    }

    const rowInputs = rows.map((row) => ({
      direction: row.direction,
      milestoneCount: row.milestones.length,
    }));

    return computeSnakeTimelineLayout(rowInputs, width, resolvedLayoutOptions);
  }, [isVertical, resolvedLayoutOptions, rows, width]);

  const flatMilestones = useMemo(() => rows.flatMap((row) => row.milestones), [rows]);

  const columnWidth = useMemo(() => {
    if (!layout || rows.length === 0) return 108;
    const maxCount = Math.max(...rows.map((row) => row.milestones.length), 1);
    const paddingX = resolvedLayoutOptions.paddingX ?? 28;
    return Math.max(84, (width - paddingX * 2) / maxCount);
  }, [layout, resolvedLayoutOptions.paddingX, rows, width]);

  useEffect(() => {
    if (!pathRef.current || isStatic) {
      setPathLength(0);
      return;
    }

    setPathLength(pathRef.current.getTotalLength());
  }, [isStatic, layout?.pathD]);

  if (rows.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      role="img"
      aria-label={ariaLabel}
    >
      {layout ? (
        <>
          <svg
            className="pointer-events-none absolute inset-0"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden
          >
            <path
              ref={pathRef}
              d={layout.pathD}
              fill="none"
              stroke={connectorColor}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(!isStatic && pathLength > 0 && "timeline-roadmap-path")}
              style={
                !isStatic && pathLength > 0
                  ? ({ ["--path-length" as string]: `${pathLength}` } as React.CSSProperties)
                  : undefined
              }
            />
            {layout.arrow ? (
              <TimelineRoadmapArrow
                x={layout.arrow.x}
                y={layout.arrow.y}
                rotation={layout.arrow.rotation}
                color={connectorColor}
              />
            ) : null}
          </svg>

          {isVertical
            ? layout.nodes.map((node) => {
                const milestone = flatMilestones[node.milestoneIndex];
                if (!milestone) return null;

                return (
                  <div
                    key={`vertical-${node.milestoneIndex}`}
                    className="absolute z-10 -translate-x-1/2"
                    style={{
                      left: node.x,
                      top: node.y - NODE_SIZE / 2,
                    }}
                  >
                    <TimelineRoadmapMilestoneNode
                      milestone={milestone}
                      static={isStatic}
                      connectorColor={connectorColor}
                      maxWidth={Math.min(220, width - 48)}
                    />
                  </div>
                );
              })
            : layout.nodes.map((node) => {
                const milestone = rows[node.rowIndex]?.milestones[node.milestoneIndex];
                if (!milestone) return null;

                return (
                  <div
                    key={`${node.rowIndex}-${node.milestoneIndex}`}
                    className="absolute z-10 -translate-x-1/2"
                    style={{
                      left: node.x,
                      top: node.y - NODE_SIZE / 2,
                    }}
                  >
                    <TimelineRoadmapMilestoneNode
                      milestone={milestone}
                      static={isStatic}
                      connectorColor={connectorColor}
                      maxWidth={columnWidth - 8}
                    />
                  </div>
                );
              })}
        </>
      ) : null}

      <div aria-hidden style={{ height: layout?.height ?? 0 }} />
    </div>
  );
}
