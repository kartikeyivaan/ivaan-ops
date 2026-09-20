import { describe, expect, it } from "vitest";
import { formatDashboardUpdatedAt } from "@/components/dashboard/dashboard-formatters";

describe("formatDashboardUpdatedAt", () => {
  it("shows just now within a minute of generation", () => {
    const now = new Date("2026-09-20T10:45:00.000Z");
    expect(formatDashboardUpdatedAt("2026-09-20T10:44:30.000Z", now)).toBe("just now");
  });

  it("formats older timestamps in Asia/Kolkata", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    const label = formatDashboardUpdatedAt("2026-09-20T06:45:00.000Z", now);
    expect(label).toMatch(/20 Sept?/);
    expect(label.toLowerCase()).toMatch(/am|pm/);
  });
});
