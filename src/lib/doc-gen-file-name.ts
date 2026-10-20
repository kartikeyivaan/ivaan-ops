/** Build download/save name: "Customer Name - Template Name". */
export function buildDocGenFileName(
  customerName: string | null | undefined,
  templateOrDocumentName: string | null | undefined,
): string {
  const customer = (customerName ?? "").trim() || "Customer";
  const template = (templateOrDocumentName ?? "").trim() || "Document";
  const prefix = `${customer} - `;
  if (template.startsWith(prefix)) return template;
  return `${prefix}${template}`;
}

export function customerNameFromSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const name = (snapshot as { displayName?: unknown }).displayName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
