export const DOC_GEN_BACKGROUND_MAX_BYTES = 15 * 1024 * 1024;
export const DOC_GEN_BACKGROUND_MAX_PAGES = 30;

export function assertPdfUpload(bytes: Buffer): void {
  if (bytes.length === 0) throw new Error("EMPTY_FILE");
  if (bytes.length > DOC_GEN_BACKGROUND_MAX_BYTES) throw new Error("FILE_TOO_LARGE");
  const header = bytes.subarray(0, 5).toString("ascii");
  if (!header.startsWith("%PDF-")) throw new Error("INVALID_PDF");
}
