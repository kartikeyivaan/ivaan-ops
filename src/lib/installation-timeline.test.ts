import { describe, expect, it } from "vitest";

import {
  INSTALLATION_TIMELINE_CONNECTOR,
  INSTALLATION_TIMELINE_FOOTER_NOTE,
  INSTALLATION_TIMELINE_ROW_1,
  INSTALLATION_TIMELINE_ROW_2,
  INSTALLATION_TIMELINE_ROW_3,
  INSTALLATION_TIMELINE_ROWS,
  INSTALLATION_TIMELINE_STEPS,
} from "@/lib/installation-timeline";



describe("installation timeline", () => {

  it("defines three snake rows with fourteen steps total", () => {

    expect(INSTALLATION_TIMELINE_ROWS).toHaveLength(3);

    expect(INSTALLATION_TIMELINE_ROW_1).toHaveLength(5);

    expect(INSTALLATION_TIMELINE_ROW_2).toHaveLength(5);

    expect(INSTALLATION_TIMELINE_ROW_3).toHaveLength(4);

    expect(

      INSTALLATION_TIMELINE_ROWS.reduce((count, row) => count + row.steps.length, 0),

    ).toBe(14);

  });



  it("uses alternating row directions for the snake layout", () => {

    expect(INSTALLATION_TIMELINE_ROWS.map((row) => row.direction)).toEqual(["ltr", "rtl", "ltr"]);

  });



  it("marks conditional steps as optional", () => {
    const optionalSteps = INSTALLATION_TIMELINE_ROWS.flatMap((row) => row.steps).filter(
      (step) => step.optional,
    );
    expect(optionalSteps.map((step) => step.title)).toEqual(["Name Change*", "Loan Approval*"]);
  });

  it("exports a flat snake-ordered step list and footer note", () => {
    expect(INSTALLATION_TIMELINE_STEPS).toHaveLength(14);
    expect(INSTALLATION_TIMELINE_STEPS[0]?.title).toBe("Order Confirmed");
    expect(INSTALLATION_TIMELINE_STEPS[13]?.title).toBe("Project Completed");
    expect(INSTALLATION_TIMELINE_CONNECTOR).toBe("#F59E0B");
    expect(INSTALLATION_TIMELINE_FOOTER_NOTE).toContain("DISCOM/MSEB");
  });
});


