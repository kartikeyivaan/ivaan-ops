import { describe, expect, it } from "vitest";
import { letterHtmlToBlocks, sanitizeLetterHtml } from "@/lib/letter-content";
import { applyFieldValuesToRichHtml } from "@/lib/doc-gen-pdf-render";

describe("doc-gen rich text to PDF helpers", () => {
  it("does not turn HTML whitespace into hard line breaks", () => {
    const html = sanitizeLetterHtml(
      `<p>\n  Hello\n  <strong>Customer</strong>\n  world\n</p>`,
    );
    const blocks = letterHtmlToBlocks(html);
    expect(blocks[0]).toMatchObject({ type: "p" });
    if (blocks[0]?.type !== "p") return;
    const text = blocks[0].children.map((part) => part.text).join("");
    expect(text).toBe("Hello Customer world");
    expect(text).not.toContain("\n");
  });

  it("keeps blank paragraphs as vertical spacers without inflated margins", () => {
    const html = sanitizeLetterHtml(`<p>First</p><p><br></p><p></p><p>Second</p>`);
    const blocks = letterHtmlToBlocks(html);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks.filter((block) => block.type === "p")).toHaveLength(4);
    const blanks = blocks.filter(
      (block) =>
        block.type === "p" &&
        !block.children.map((part) => part.text).join("").replace(/\s/g, ""),
    );
    for (const blank of blanks) {
      if (blank.type !== "p") continue;
      expect(blank.marginBottomPt).toBeUndefined();
    }
  });

  it("converts modest leading spaces into first-line indent", () => {
    const html = sanitizeLetterHtml(`<p>&nbsp;&nbsp;&nbsp;&nbsp;Indented body</p>`);
    const blocks = letterHtmlToBlocks(html);
    expect(blocks[0]).toMatchObject({
      type: "p",
      paddingLeftPt: expect.any(Number),
    });
    if (blocks[0]?.type !== "p") return;
    expect(blocks[0].paddingLeftPt).toBeGreaterThan(0);
    expect(blocks[0].children.map((part) => part.text).join("")).toBe("Indented body");
  });

  it("adds spacing around substituted field values so labels do not glue", () => {
    const html =
      `Name:<span data-doc-gen-field="11111111-1111-1111-1111-111111111111" data-doc-gen-key="Customer_Name">Customer_Name</span>Address`;
    const result = applyFieldValuesToRichHtml(html, { Customer_Name: "Kartikey" });
    expect(result).toContain("Name: Kartikey");
    expect(result).toContain("Kartikey Address");
  });

  it("preserves alignment styles through sanitize", () => {
    const html = sanitizeLetterHtml(`<p style="text-align:center;margin-bottom:14px">Title</p>`);
    expect(html).toContain("text-align:center");
    expect(html).toContain("margin-bottom:10.5pt");
    const blocks = letterHtmlToBlocks(html);
    expect(blocks[0]).toMatchObject({
      type: "p",
      align: "center",
      marginBottomPt: 10.5,
    });
  });

  it("keeps surrounding formatting when substituting field values", () => {
    const html =
      `<p><strong><span data-doc-gen-field="11111111-1111-1111-1111-111111111111" data-doc-gen-key="Customer_Name">Customer_Name</span></strong> signed</p>`;
    const result = applyFieldValuesToRichHtml(html, { Customer_Name: "Asha Patil" });
    expect(result).toContain("<strong>Asha Patil</strong>");
    expect(result).toContain(" signed");
  });

  it("parses editor tables into table blocks with cell text", () => {
    const html = sanitizeLetterHtml(
      `<p>Intro</p><table><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody><tr><td>Panel</td><td>10</td></tr><tr><td></td><td>20</td></tr></tbody></table><p>Outro</p>`,
    );
    const blocks = letterHtmlToBlocks(html);
    expect(blocks.map((block) => block.type)).toEqual(["p", "table", "p"]);
    const table = blocks[1];
    expect(table?.type).toBe("table");
    if (table?.type !== "table") return;
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]).toHaveLength(2);
    expect(table.rows[1]![0]!.children.map((part) => part.text).join("")).toBe("Panel");
    expect(table.rows[1]![1]!.children.map((part) => part.text).join("")).toBe("10");
    // Empty cells are kept so columns stay aligned.
    expect(table.rows[2]).toHaveLength(2);
    expect(table.rows[2]![0]!.children.map((part) => part.text).join("").trim()).toBe("");
    expect(table.rows[2]![1]!.children.map((part) => part.text).join("")).toBe("20");
  });

  it("preserves column width percent and row height through sanitize and parse", () => {
    const html = sanitizeLetterHtml(
      `<table><tr style="height:40pt"><th style="width:30%">Item</th><th style="width:70%;height:40pt">Qty</th></tr><tr><td style="width:30%">Panel</td><td style="width:70%">10</td></tr></table>`,
    );
    expect(html).toContain('width:30%');
    expect(html).toContain('width:70%');
    expect(html).toContain('height:40pt');
    const blocks = letterHtmlToBlocks(html);
    expect(blocks[0]?.type).toBe("table");
    if (blocks[0]?.type !== "table") return;
    expect(blocks[0].rows[0]![0]).toMatchObject({ widthPercent: 30, heightPt: 40 });
    expect(blocks[0].rows[0]![1]).toMatchObject({ widthPercent: 70, heightPt: 40 });
    expect(blocks[0].rows[1]![0]).toMatchObject({ widthPercent: 30 });
  });
});
