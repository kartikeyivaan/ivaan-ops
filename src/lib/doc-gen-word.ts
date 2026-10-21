import Docxtemplater from "docxtemplater";
import mammoth from "mammoth";
import PizZip from "pizzip";

export const DOC_GEN_WORD_MAX_BYTES = 15 * 1024 * 1024;

const PLACEHOLDER_PATTERN = /\{([A-Z][A-Za-z0-9_]*)\}/g;

export function assertDocxUpload(bytes: Buffer): void {
  if (bytes.length === 0) throw new Error("EMPTY_FILE");
  if (bytes.length > DOC_GEN_WORD_MAX_BYTES) throw new Error("FILE_TOO_LARGE");
  // DOCX is a ZIP archive (PK header).
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("INVALID_DOCX");
}

export function extractDocxPlaceholdersFromText(text: string): string[] {
  const keys = new Set<string>();
  PLACEHOLDER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
    keys.add(match[1]!);
  }
  return [...keys].sort();
}

export async function extractDocxPlaceholders(bytes: Buffer): Promise<string[]> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return extractDocxPlaceholdersFromText(result.value ?? "");
}

/**
 * Fill `{Field_Key}` placeholders in a Word template.
 * Missing keys render as empty strings.
 */
export function fillDocxTemplate(bytes: Buffer, values: Record<string, string>): Buffer {
  const zip = new PizZip(bytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
  });

  const safeValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    safeValues[key] = value ?? "";
  }

  try {
    doc.render(safeValues);
  } catch (cause) {
    const detail =
      cause && typeof cause === "object" && "properties" in cause
        ? JSON.stringify((cause as { properties?: unknown }).properties)
        : cause instanceof Error
          ? cause.message
          : "Unknown Word merge error";
    throw new Error(`WORD_MERGE_FAILED:${detail}`);
  }

  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

export async function docxToHtml(bytes: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer: bytes });
  return result.value || "<p></p>";
}
