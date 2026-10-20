import { describe, expect, it } from "vitest";
import { formatDocGenDateDisplay, formatDocGenFieldValuesForOutput } from "@/lib/doc-gen-date";

describe("doc-gen date formatting", () => {
  it("formats ISO dates as DD/MMM/YYYY", () => {
    expect(formatDocGenDateDisplay("2026-10-21")).toBe("21/Oct/2026");
    expect(formatDocGenDateDisplay("2026-01-05")).toBe("05/Jan/2026");
  });

  it("formats only DATE fields in output maps", () => {
    const values = formatDocGenFieldValuesForOutput(
      { Start_Date: "2026-10-21", Customer_Name: "Asha" },
      [
        { fieldKey: "Start_Date", inputType: "DATE" },
        { fieldKey: "Customer_Name", inputType: "TEXT" },
      ],
    );
    expect(values).toEqual({
      Start_Date: "21/Oct/2026",
      Customer_Name: "Asha",
    });
  });
});
