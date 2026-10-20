const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Display format for document generator dates: DD/MMM/YYYY (e.g. 21/Oct/2026). */
export function formatDocGenDateDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^\d{2}\/[A-Za-z]{3}\/\d{4}$/.test(trimmed)) return trimmed;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return trimmed;
  const year = iso[1]!;
  const monthIndex = Number.parseInt(iso[2]!, 10) - 1;
  const day = iso[3]!;
  if (monthIndex < 0 || monthIndex > 11) return trimmed;
  return `${day}/${MONTHS[monthIndex]}/${year}`;
}

export function formatDocGenFieldValuesForOutput(
  values: Record<string, string>,
  fields: Array<{ fieldKey: string; inputType: string }>,
): Record<string, string> {
  const dateKeys = new Set(
    fields.filter((field) => field.inputType === "DATE").map((field) => field.fieldKey),
  );
  if (!dateKeys.size) return values;

  const next: Record<string, string> = { ...values };
  for (const key of dateKeys) {
    const raw = next[key];
    if (raw) next[key] = formatDocGenDateDisplay(raw);
  }
  return next;
}
