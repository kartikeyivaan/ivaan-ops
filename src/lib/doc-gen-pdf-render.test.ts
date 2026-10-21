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
});
