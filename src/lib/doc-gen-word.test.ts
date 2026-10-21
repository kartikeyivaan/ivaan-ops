import { describe, expect, it } from "vitest";
import {
  assertDocxUpload,
  extractDocxPlaceholdersFromText,
  fillDocxTemplate,
} from "@/lib/doc-gen-word";
import PizZip from "pizzip";

function minimalDocxWithText(text: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`,
  );
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

describe("doc-gen word helpers", () => {
  it("rejects non-docx uploads", () => {
    expect(() => assertDocxUpload(Buffer.from("%PDF-1.4"))).toThrow("INVALID_DOCX");
    expect(() => assertDocxUpload(Buffer.alloc(0))).toThrow("EMPTY_FILE");
  });

  it("extracts field placeholders from plain text", () => {
    expect(
      extractDocxPlaceholdersFromText("Name: {Customer_Name} Cap: {Plant_Capacity} {Customer_Name}"),
    ).toEqual(["Customer_Name", "Plant_Capacity"]);
  });

  it("fills placeholders in a minimal docx", () => {
    const source = minimalDocxWithText("Hello {Customer_Name}");
    assertDocxUpload(source);
    const filled = fillDocxTemplate(source, { Customer_Name: "Asha Patil" });
    const zip = new PizZip(filled);
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toContain("Asha Patil");
    expect(xml).not.toContain("{Customer_Name}");
  });
});
