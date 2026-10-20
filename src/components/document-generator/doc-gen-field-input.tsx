"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DocGenFormField = {
  fieldId: string;
  fieldKey: string;
  label: string;
  inputType: string;
  configurationJson: unknown;
  isRequiredDefault: boolean;
  isRequired?: boolean;
  defaultValue: string | null;
  helpText: string | null;
  placeholder: string | null;
};

function fieldOptions(field: DocGenFormField): string[] {
  const config = field.configurationJson;
  if (!config || typeof config !== "object") return [];
  const options = (config as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];
  return options.filter((item): item is string => typeof item === "string");
}

function isRequired(field: DocGenFormField): boolean {
  return field.isRequired ?? field.isRequiredDefault;
}

export function DocGenFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: DocGenFormField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = `doc-gen-${field.fieldKey}`;
  const options = fieldOptions(field);
  const required = isRequired(field);

  let control: React.ReactNode;
  switch (field.inputType) {
    case "TEXTAREA":
      control = (
        <textarea
          id={id}
          className="min-h-[88px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={value}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "NUMBER":
      control = (
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "DATE":
      control = (
        <div className="space-y-1">
          <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
          <p className="text-[11px] text-slate-500">Printed on documents as DD/MMM/YYYY (e.g. 21/Oct/2026).</p>
        </div>
      );
      break;
    case "DROPDOWN":
      control = (
        <select
          id={id}
          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
      break;
    case "RADIO":
      control = (
        <div className="flex flex-wrap gap-3">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={id}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}
        </div>
      );
      break;
    case "MULTI_SELECT":
      control = (
        <div className="space-y-1">
          {options.map((option) => {
            const selected = value
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean);
            const checked = selected.includes(option);
            return (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((part) => part !== option)
                      : [...selected, option];
                    onChange(next.join(", "));
                  }}
                />
                {option}
              </label>
            );
          })}
        </div>
      );
      break;
    default:
      control = (
        <Input
          id={id}
          value={value}
          placeholder={field.placeholder ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {field.label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      {control}
      {field.helpText ? <p className="text-xs text-slate-500">{field.helpText}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
