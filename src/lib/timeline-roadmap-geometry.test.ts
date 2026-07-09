import { describe, expect, it } from "vitest";
import {
  buildTimelineRoadmapPath,
  computeBendOutset,
  computeMilestoneCenters,
  computeSnakeTimelineLayout,
  computeVerticalTimelineLayout,
  type TimelineRoadmapDirection,
} from "@/lib/timeline-roadmap-geometry";

describe("timeline roadmap geometry", () => {
  it("builds a single continuous path for three snake rows", () => {
    const rowConnectorYs = [28, 172, 316];
    const rowMilestoneXs = [
      [100, 250, 400, 550, 700],
      [100, 250, 400, 550, 700],
      [125, 325, 525, 725],
    ];
    const rowDirections: TimelineRoadmapDirection[] = ["ltr", "rtl", "ltr"];

    const { pathD } = buildTimelineRoadmapPath(
      rowConnectorYs,
      rowMilestoneXs,
      rowDirections,
      32,
    );

    expect(pathD.startsWith("M 100 28")).toBe(true);
    expect(pathD).toContain("L 700 28");
    expect(pathD).toContain("L 100 172");
    expect(pathD.match(/M /g)?.length ?? 0).toBe(1);
  });

  it("positions milestones on the connector for alternating directions", () => {
    const layout = computeSnakeTimelineLayout(
      [
        { direction: "ltr", milestoneCount: 5 },
        { direction: "rtl", milestoneCount: 5 },
        { direction: "ltr", milestoneCount: 4 },
      ],
      900,
    );

    expect(layout).not.toBeNull();
    expect(layout?.nodes).toHaveLength(14);
    expect(layout?.pathD).toMatch(/^M /);
    expect(layout?.rowConnectorYs).toHaveLength(3);
    expect(layout?.arrow).toBeDefined();

    const rowOne = layout?.nodes.filter((node) => node.rowIndex === 0) ?? [];
    const rowTwo = layout?.nodes.filter((node) => node.rowIndex === 1) ?? [];

    expect(rowOne[0]?.x).toBeLessThan(rowOne[4]?.x ?? 0);
    expect(rowTwo[0]?.x).toBe(rowOne[4]?.x);
    expect(rowTwo[4]?.x).toBe(rowOne[0]?.x);
  });

  it("builds a vertical layout for mobile", () => {
    const layout = computeVerticalTimelineLayout(14, 360);

    expect(layout).not.toBeNull();
    expect(layout?.mode).toBe("vertical");
    expect(layout?.nodes).toHaveLength(14);
    expect(layout?.pathD).toMatch(/^M /);
    expect(layout?.nodes[0]?.y).toBeLessThan(layout?.nodes[13]?.y ?? 0);
  });

  it("pushes row bends outward to clear end-node labels", () => {
    const bendOutset = computeBendOutset(900, 5, { paddingX: 28, bendRadius: 40 });
    expect(bendOutset).toBeGreaterThan(80);

    const layout = computeSnakeTimelineLayout(
      [
        { direction: "ltr", milestoneCount: 5 },
        { direction: "rtl", milestoneCount: 5 },
        { direction: "ltr", milestoneCount: 4 },
      ],
      900,
    );

    const rowOneEnd = layout?.nodes.find(
      (node) => node.rowIndex === 0 && node.milestoneIndex === 4,
    );
    expect(layout?.pathD).toContain(`C ${(rowOneEnd?.x ?? 0) + bendOutset}`);
  });

  it("uses the same horizontal spacing for rows with fewer milestones", () => {
    const layout = computeSnakeTimelineLayout(
      [
        { direction: "ltr", milestoneCount: 5 },
        { direction: "rtl", milestoneCount: 5 },
        { direction: "ltr", milestoneCount: 4 },
      ],
      900,
    );

    const rowOne = layout?.nodes.filter((node) => node.rowIndex === 0) ?? [];
    const rowThree = layout?.nodes.filter((node) => node.rowIndex === 2) ?? [];

    const rowOneGap = (rowOne[1]?.x ?? 0) - (rowOne[0]?.x ?? 0);
    const rowThreeGap = (rowThree[1]?.x ?? 0) - (rowThree[0]?.x ?? 0);

    expect(rowOneGap).toBeCloseTo(rowThreeGap, 5);
  });

  it("centers milestone centers on a shared grid", () => {
    const centers = computeMilestoneCenters(4, 500, 0, 5);
    expect(centers).toHaveLength(4);
    expect(centers[1]! - centers[0]!).toBeCloseTo(centers[2]! - centers[1]!, 5);
    expect(centers[0]!).toBeGreaterThan(50);
    expect(centers[3]!).toBeLessThan(450);
  });
});
