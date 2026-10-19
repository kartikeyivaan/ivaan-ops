/** Map ERP / profile identity fields onto published set field keys by normalized alias. */

const PREFILL_ALIASES: Array<{ valueKey: string; aliases: string[] }> = [
  { valueKey: "displayName", aliases: ["customer_name", "applicant_name", "name"] },
  { valueKey: "mobileNumber", aliases: ["mobile_number", "mobile", "contact_number", "phone"] },
  {
    valueKey: "consumerNumber",
    aliases: ["consumer_number", "consumer_no", "consumer"],
  },
  {
    valueKey: "address",
    aliases: ["installation_address", "address", "site_address"],
  },
  {
    valueKey: "city",
    aliases: ["city_or_village", "city", "village"],
  },
];

function normalizeKey(fieldKey: string): string {
  return fieldKey.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
}

export type DocGenPrefillSource = {
  displayName?: string | null;
  mobileNumber?: string | null;
  consumerNumber?: string | null;
  address?: string | null;
  city?: string | null;
};

/**
 * Returns values only for keys present in `availableFieldKeys`.
 * Does not overwrite existing non-empty values in `existing` when `preferExisting` is true.
 */
export function prefillFieldValuesFromCustomerSource(input: {
  availableFieldKeys: string[];
  source: DocGenPrefillSource;
  existing?: Record<string, string>;
  preferExisting?: boolean;
}): Record<string, string> {
  const sourceValues: Record<string, string> = {};
  if (input.source.displayName?.trim()) sourceValues.displayName = input.source.displayName.trim();
  if (input.source.mobileNumber?.trim()) sourceValues.mobileNumber = input.source.mobileNumber.trim();
  if (input.source.consumerNumber?.trim()) {
    sourceValues.consumerNumber = input.source.consumerNumber.trim();
  }
  if (input.source.address?.trim()) sourceValues.address = input.source.address.trim();
  if (input.source.city?.trim()) sourceValues.city = input.source.city.trim();

  const next: Record<string, string> = { ...(input.existing ?? {}) };
  const preferExisting = input.preferExisting !== false;

  for (const fieldKey of input.availableFieldKeys) {
    const normalized = normalizeKey(fieldKey);
    const match = PREFILL_ALIASES.find((row) => row.aliases.includes(normalized));
    if (!match) continue;
    const value = sourceValues[match.valueKey];
    if (!value) continue;
    if (preferExisting && (next[fieldKey] ?? "").trim()) continue;
    next[fieldKey] = value;
  }

  return next;
}
