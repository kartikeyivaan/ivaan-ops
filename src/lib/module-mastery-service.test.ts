import { describe, expect, it } from "vitest";
import {
  buildDefaultMasteryEngineConfig,
  calculateModuleMasteryLevel,
  getNextLevelPreview,
  godLevelDisplayName,
} from "@/lib/module-mastery-service";

const config = buildDefaultMasteryEngineConfig();

describe("calculateModuleMasteryLevel", () => {
  it("handles 0 modules as Rookie with empty progress", () => {
    const result = calculateModuleMasteryLevel(0, config);
    expect(result.currentLevelNumber).toBe(1);
    expect(result.currentLevelName).toBe("Rookie");
    expect(result.currentSlabProgress).toBe(0);
    expect(result.modulesToNext).toBe(500);
    expect(result.highestCompletedLevel).toBe(0);
    expect(result.completedMilestones).toHaveLength(0);
  });

  it("handles 237 modules mid-Rookie", () => {
    const result = calculateModuleMasteryLevel(237, config);
    expect(result.currentLevelName).toBe("Rookie");
    expect(result.currentSlabProgress).toBe(237);
    expect(result.modulesToNext).toBe(263);
    expect(result.progressPercent).toBe(47.4);
  });

  it("at exact 500 moves active challenge to Level 2", () => {
    const result = calculateModuleMasteryLevel(500, config);
    expect(result.highestCompletedLevel).toBe(1);
    expect(result.currentLevelNumber).toBe(2);
    expect(result.currentLevelName).toBe("Spark");
    expect(result.currentSlabProgress).toBe(0);
    expect(result.completedMilestones.map((m) => m.levelNumber)).toEqual([1]);
  });

  it("handles 999 still on Spark", () => {
    const result = calculateModuleMasteryLevel(999, config);
    expect(result.currentLevelName).toBe("Spark");
    expect(result.currentSlabProgress).toBe(499);
    expect(result.highestCompletedLevel).toBe(1);
  });

  it("at 1000 opens Charged", () => {
    const result = calculateModuleMasteryLevel(1000, config);
    expect(result.currentLevelName).toBe("Charged");
    expect(result.currentSlabProgress).toBe(0);
    expect(result.highestCompletedLevel).toBe(2);
  });

  it("handles 1237 on Charged", () => {
    const result = calculateModuleMasteryLevel(1237, config);
    expect(result.currentLevelName).toBe("Charged");
    expect(result.currentSlabProgress).toBe(237);
    expect(result.modulesToNext).toBe(263);
    expect(result.completedMilestones).toHaveLength(2);
  });

  it("handles 1500 opening Power Player", () => {
    const result = calculateModuleMasteryLevel(1500, config);
    expect(result.currentLevelName).toBe("Power Player");
    expect(result.currentSlabProgress).toBe(0);
    expect(result.highestCompletedLevel).toBe(3);
  });

  it("at 7500 opens God Level I with zero progress", () => {
    const result = calculateModuleMasteryLevel(7500, config);
    expect(result.highestCompletedLevel).toBe(15);
    expect(result.isGodLevel).toBe(true);
    expect(result.godLevelRank).toBe(1);
    expect(result.currentLevelName).toBe("God Level I");
    expect(result.currentSlabProgress).toBe(0);
    expect(result.completedMilestones).toHaveLength(15);
  });

  it("at 8237 is God Level II with 237 progress (consistent slab math)", () => {
    // PRD example labels this God I; engine treats God I as 7500–8000 and God II as 8000–8500.
    const result = calculateModuleMasteryLevel(8237, config);
    expect(result.isGodLevel).toBe(true);
    expect(result.godLevelRank).toBe(2);
    expect(result.currentLevelName).toBe("God Level II");
    expect(result.currentSlabProgress).toBe(237);
    expect(result.modulesToNext).toBe(263);
    expect(result.completedMilestones.filter((m) => m.isGodLevel)).toHaveLength(1);
  });

  it("records multi-level crossings in one total", () => {
    const result = calculateModuleMasteryLevel(1600, config);
    expect(result.completedMilestones.map((m) => m.levelNumber)).toEqual([1, 2, 3]);
    expect(result.currentLevelName).toBe("Power Player");
    expect(result.currentSlabProgress).toBe(100);
  });

  it("supports reversal by recalculating from a lower total", () => {
    const high = calculateModuleMasteryLevel(1237, config);
    const low = calculateModuleMasteryLevel(400, config);
    expect(high.completedMilestones).toHaveLength(2);
    expect(low.completedMilestones).toHaveLength(0);
    expect(low.currentLevelName).toBe("Rookie");
  });
});

describe("getNextLevelPreview", () => {
  it("previews the next named level while on Rookie", () => {
    const result = calculateModuleMasteryLevel(237, config);
    const next = getNextLevelPreview(config, result);
    expect(next.name).toContain("Spark");
    expect(next.badge).toBe("🔥");
  });

  it("previews God Level I after Ultimate Legend completes", () => {
    const result = calculateModuleMasteryLevel(7500, config);
    const next = getNextLevelPreview(config, result);
    expect(next.name).toBe("God Level II");
  });
});

describe("godLevelDisplayName", () => {
  it("formats roman numerals", () => {
    expect(godLevelDisplayName(1)).toBe("God Level I");
    expect(godLevelDisplayName(4)).toBe("God Level IV");
    expect(godLevelDisplayName(14)).toBe("God Level XIV");
  });
});
