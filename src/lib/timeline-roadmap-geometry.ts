export type TimelineRoadmapDirection = "ltr" | "rtl";

export type TimelineRoadmapRowInput = {
  direction: TimelineRoadmapDirection;
  milestoneCount: number;
};

export type TimelineRoadmapNodePosition = {
  rowIndex: number;
  milestoneIndex: number;
  x: number;
  y: number;
};

export type TimelineRoadmapArrow = {
  x: number;
  y: number;
  rotation: number;
};

export type TimelineRoadmapLayout = {
  width: number;
  height: number;
  pathD: string;
  nodes: TimelineRoadmapNodePosition[];
  rowConnectorYs: number[];
  arrow?: TimelineRoadmapArrow;
  mode: "snake" | "vertical";
};

export type TimelineRoadmapLayoutOptions = {
  paddingX?: number;
  nodeSize?: number;
  rowGap?: number;
  stemHeight?: number;
  titleAreaHeight?: number;
  badgeAreaHeight?: number;
  bendRadius?: number;
  /** How far the vertical bend extends past end nodes to clear labels. */
  bendOutset?: number;
  rowTopPadding?: number;
  verticalStepGap?: number;
};

const DEFAULT_OPTIONS: Required<TimelineRoadmapLayoutOptions> = {
  paddingX: 28,
  nodeSize: 56,
  rowGap: 44,
  stemHeight: 12,
  titleAreaHeight: 42,
  badgeAreaHeight: 32,
  bendRadius: 40,
  bendOutset: 0,
  rowTopPadding: 0,
  verticalStepGap: 20,
};

/**
 * Evenly spaces milestone centers on a fixed column grid.
 * Rows with fewer milestones are centered so adjacent gaps match the full row.
 */
export function computeMilestoneCenters(
  count: number,
  width: number,
  paddingX: number,
  gridColumns?: number,
): number[] {
  if (count <= 0) return [];
  const columns = gridColumns ?? count;
  const inner = Math.max(width - paddingX * 2, 1);
  const step = inner / columns;
  if (count === 1) {
    return [paddingX + inner / 2];
  }
  const span = step * (count - 1);
  const startCenter = paddingX + (inner - span) / 2;
  return Array.from({ length: count }, (_, index) => startCenter + step * index);
}

function rowBlockHeight(options: Required<TimelineRoadmapLayoutOptions>): number {
  return (
    options.rowTopPadding +
    options.nodeSize +
    options.stemHeight +
    options.titleAreaHeight +
    options.badgeAreaHeight
  );
}

function connectorYForRow(
  rowIndex: number,
  rowCount: number,
  options: Required<TimelineRoadmapLayoutOptions>,
): number {
  let y = 0;
  for (let index = 0; index < rowIndex; index += 1) {
    y += rowBlockHeight(options) + options.rowGap;
  }
  return y + options.rowTopPadding + options.nodeSize / 2;
}

function appendHorizontalSegment(parts: string[], fromX: number, toX: number, y: number): void {
  if (fromX === toX) return;
  parts.push(`L ${toX} ${y}`);
}

function appendBend(
  parts: string[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  side: "left" | "right",
  bendRadius: number,
  bendOutset: number,
): void {
  const outward = side === "right" ? 1 : -1;
  const outerX = fromX + bendOutset * outward;
  const midY = (fromY + toY) / 2;

  parts.push(
    `C ${outerX} ${fromY}, ${outerX} ${fromY + bendRadius * 0.4}, ${outerX} ${fromY + bendRadius}`,
    `C ${outerX} ${midY}, ${outerX} ${toY - bendRadius * 0.4}, ${outerX} ${toY - bendRadius * 0.1}`,
    `C ${outerX} ${toY}, ${toX + bendOutset * outward * 0.22} ${toY}, ${toX} ${toY}`,
  );
}

export function computeBendOutset(
  width: number,
  maxMilestoneCount: number,
  options: Pick<TimelineRoadmapLayoutOptions, "paddingX" | "bendRadius" | "bendOutset"> = {},
): number {
  const paddingX = options.paddingX ?? DEFAULT_OPTIONS.paddingX;
  const bendRadius = options.bendRadius ?? DEFAULT_OPTIONS.bendRadius;
  if (options.bendOutset && options.bendOutset > 0) return options.bendOutset;
  if (maxMilestoneCount <= 0) return bendRadius;

  const columnHalfWidth = Math.max(width - paddingX * 2, 1) / maxMilestoneCount / 2;
  const safetyMargin = 20;
  return Math.max(bendRadius, columnHalfWidth + safetyMargin);
}

export function buildTimelineRoadmapPath(
  rowConnectorYs: number[],
  rowMilestoneXs: number[][],
  rowDirections: TimelineRoadmapDirection[],
  bendRadius: number,
  options?: { arrowExtension?: number; bendOutset?: number },
): { pathD: string; arrow?: TimelineRoadmapArrow } {
  if (rowConnectorYs.length === 0) return { pathD: "" };

  const arrowExtension = options?.arrowExtension ?? 14;
  const bendOutset = options?.bendOutset ?? bendRadius;
  const parts: string[] = [];
  let arrow: TimelineRoadmapArrow | undefined;

  for (let rowIndex = 0; rowIndex < rowConnectorYs.length; rowIndex += 1) {
    const y = rowConnectorYs[rowIndex] ?? 0;
    const xs = rowMilestoneXs[rowIndex] ?? [];
    const direction = rowDirections[rowIndex] ?? "ltr";
    if (xs.length === 0) continue;

    const startX = direction === "ltr" ? xs[0]! : xs[xs.length - 1]!;
    const endX = direction === "ltr" ? xs[xs.length - 1]! : xs[0]!;

    if (parts.length === 0) {
      parts.push(`M ${startX} ${y}`);
    } else {
      parts.push(`L ${startX} ${y}`);
    }

    appendHorizontalSegment(parts, startX, endX, y);

    const nextRowIndex = rowIndex + 1;
    const isLastRow = nextRowIndex >= rowConnectorYs.length;

    if (isLastRow) {
      const arrowX = direction === "ltr" ? endX + arrowExtension : endX - arrowExtension;
      appendHorizontalSegment(parts, endX, arrowX, y);
      arrow = { x: arrowX, y, rotation: direction === "ltr" ? 0 : 180 };
      continue;
    }

    const nextY = rowConnectorYs[nextRowIndex] ?? 0;
    const nextXs = rowMilestoneXs[nextRowIndex] ?? [];
    const nextDirection = rowDirections[nextRowIndex] ?? "ltr";
    if (nextXs.length === 0) continue;

    const nextEntryX =
      nextDirection === "ltr" ? nextXs[0]! : nextXs[nextXs.length - 1]!;
    const bendSide: "left" | "right" = direction === "ltr" ? "right" : "left";

    appendBend(parts, endX, y, nextEntryX, nextY, bendSide, bendRadius, bendOutset);
  }

  return { pathD: parts.join(" "), arrow };
}

export function buildVerticalTimelinePath(
  nodes: TimelineRoadmapNodePosition[],
  options: Required<TimelineRoadmapLayoutOptions>,
): { pathD: string; arrow?: TimelineRoadmapArrow } {
  if (nodes.length === 0) return { pathD: "" };

  const parts = [`M ${nodes[0]!.x} ${nodes[0]!.y}`];
  for (let index = 1; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    parts.push(`L ${node.x} ${node.y}`);
  }

  const last = nodes[nodes.length - 1]!;
  const arrowY = last.y + options.verticalStepGap * 0.6;
  parts.push(`L ${last.x} ${arrowY}`);

  return {
    pathD: parts.join(" "),
    arrow: { x: last.x, y: arrowY, rotation: 90 },
  };
}

export function computeSnakeTimelineLayout(
  rows: TimelineRoadmapRowInput[],
  width: number,
  options: TimelineRoadmapLayoutOptions = {},
): TimelineRoadmapLayout | null {
  if (rows.length === 0 || width <= 0) return null;

  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const rowBlock = rowBlockHeight(resolved);
  const maxMilestoneCount = Math.max(...rows.map((row) => row.milestoneCount), 1);
  const bendOutset = computeBendOutset(width, maxMilestoneCount, resolved);

  const rowMilestoneXs = rows.map((row) =>
    computeMilestoneCenters(row.milestoneCount, width, resolved.paddingX, maxMilestoneCount),
  );
  const rowConnectorYs = rows.map((_, rowIndex) =>
    connectorYForRow(rowIndex, rows.length, resolved),
  );
  const rowDirections = rows.map((row) => row.direction);

  const { pathD, arrow } = buildTimelineRoadmapPath(
    rowConnectorYs,
    rowMilestoneXs,
    rowDirections,
    resolved.bendRadius,
    { bendOutset },
  );

  const nodes: TimelineRoadmapNodePosition[] = [];
  rows.forEach((row, rowIndex) => {
    const xs = rowMilestoneXs[rowIndex] ?? [];
    const y = rowConnectorYs[rowIndex] ?? 0;

    for (let milestoneIndex = 0; milestoneIndex < row.milestoneCount; milestoneIndex += 1) {
      const displayIndex =
        row.direction === "ltr" ? milestoneIndex : row.milestoneCount - 1 - milestoneIndex;
      nodes.push({
        rowIndex,
        milestoneIndex,
        x: xs[displayIndex] ?? 0,
        y,
      });
    }
  });

  const height = rows.length * rowBlock + Math.max(0, rows.length - 1) * resolved.rowGap;

  return {
    width,
    height,
    pathD,
    nodes,
    rowConnectorYs,
    arrow,
    mode: "snake",
  };
}

export function computeVerticalTimelineLayout(
  stepCount: number,
  width: number,
  options: TimelineRoadmapLayoutOptions = {},
): TimelineRoadmapLayout | null {
  if (stepCount <= 0 || width <= 0) return null;

  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const x = width / 2;
  const stepHeight =
    resolved.nodeSize +
    resolved.stemHeight +
    resolved.titleAreaHeight +
    resolved.badgeAreaHeight +
    resolved.verticalStepGap;
  const paddingY = resolved.paddingX;

  const nodes: TimelineRoadmapNodePosition[] = Array.from({ length: stepCount }, (_, index) => ({
    rowIndex: 0,
    milestoneIndex: index,
    x,
    y: paddingY + stepHeight * index + resolved.nodeSize / 2,
  }));

  const { pathD, arrow } = buildVerticalTimelinePath(nodes, resolved);
  const height =
    paddingY * 2 + stepHeight * (stepCount - 1) + rowBlockHeight(resolved) + resolved.verticalStepGap;

  return {
    width,
    height,
    pathD,
    nodes,
    rowConnectorYs: nodes.map((node) => node.y),
    arrow,
    mode: "vertical",
  };
}

/** @deprecated Use computeSnakeTimelineLayout */
export function computeTimelineRoadmapLayout(
  rows: TimelineRoadmapRowInput[],
  width: number,
  options: TimelineRoadmapLayoutOptions = {},
): TimelineRoadmapLayout | null {
  return computeSnakeTimelineLayout(rows, width, options);
}

export function resolveTimelineLayoutOptions(
  width: number,
  base: TimelineRoadmapLayoutOptions = {},
): TimelineRoadmapLayoutOptions {
  if (width < 768) {
    return {
      ...base,
      paddingX: 20,
      verticalStepGap: 16,
    };
  }

  if (width < 1024) {
    return {
      ...base,
      paddingX: 20,
      rowGap: 36,
      bendRadius: 36,
    };
  }

  return base;
}
