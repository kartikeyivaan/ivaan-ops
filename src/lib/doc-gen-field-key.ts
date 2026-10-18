const FIELD_KEY_PATTERN = /^[A-Z][A-Za-z0-9_]*$/;

export function normalizeDocGenFieldKey(raw: string): string {
  return raw.trim();
}

export function isValidDocGenFieldKey(fieldKey: string): boolean {
  return FIELD_KEY_PATTERN.test(fieldKey);
}

export function fieldKeyValidationMessage(): string {
  return "Field key must start with a capital letter and use letters, numbers, and underscores only (e.g. Customer_Name).";
}
