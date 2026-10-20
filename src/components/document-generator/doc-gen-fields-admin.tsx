"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";

type FieldRow = {
  id: string;
  fieldKey: string;
  label: string;
  inputType: string;
  status: string;
  isRequiredDefault: boolean;
  helpText?: string | null;
  placeholder?: string | null;
  defaultValue?: string | null;
  configurationJson?: unknown;
};

const INPUT_TYPES = [
  "TEXT",
  "NUMBER",
  "DROPDOWN",
  "RADIO",
  "MULTI_SELECT",
  "DATE",
  "TEXTAREA",
] as const;

type InputType = (typeof INPUT_TYPES)[number];

function needsOptions(inputType: string): boolean {
  return inputType === "DROPDOWN" || inputType === "RADIO" || inputType === "MULTI_SELECT";
}

function optionsFromConfig(configurationJson: unknown): string[] {
  if (!configurationJson || typeof configurationJson !== "object") return [];
  const options = (configurationJson as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];
  return options.filter((item): item is string => typeof item === "string");
}

function FieldOptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Options</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...options, ""])}
        >
          Add option
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Required for Dropdown, Radio, and Multi Select. These values appear when generating
        documents.
      </p>
      {options.length === 0 ? (
        <p className="text-xs text-amber-800">No options yet. Add at least one.</p>
      ) : (
        <ul className="space-y-2">
          {options.map((option, index) => (
            <li key={`option-${index}`} className="flex gap-2">
              <Input
                value={option}
                placeholder={`Option ${index + 1}`}
                onChange={(e) => {
                  const next = [...options];
                  next[index] = e.target.value;
                  onChange(next);
                }}
                required
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChange(options.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldEditDialog({
  field,
  onClose,
}: {
  field: FieldRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(field.label);
  const [inputType, setInputType] = useState<InputType>(
    INPUT_TYPES.includes(field.inputType as InputType)
      ? (field.inputType as InputType)
      : "TEXT",
  );
  const [isRequiredDefault, setIsRequiredDefault] = useState(field.isRequiredDefault);
  const [helpText, setHelpText] = useState(field.helpText ?? "");
  const [placeholder, setPlaceholder] = useState(field.placeholder ?? "");
  const [defaultValue, setDefaultValue] = useState(field.defaultValue ?? "");
  const [options, setOptions] = useState<string[]>(() => optionsFromConfig(field.configurationJson));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLabel(field.label);
    setInputType(
      INPUT_TYPES.includes(field.inputType as InputType)
        ? (field.inputType as InputType)
        : "TEXT",
    );
    setIsRequiredDefault(field.isRequiredDefault);
    setHelpText(field.helpText ?? "");
    setPlaceholder(field.placeholder ?? "");
    setDefaultValue(field.defaultValue ?? "");
    setOptions(optionsFromConfig(field.configurationJson));
    setMessage(null);
  }, [field]);

  async function patchField(body: Record<string, unknown>, successMessage: string) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/document-generator/fields/${field.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "Unable to update field.");
        return false;
      }
      setMessage(successMessage);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    const cleanedOptions = options.map((item) => item.trim()).filter(Boolean);
    if (needsOptions(inputType) && cleanedOptions.length === 0) {
      setMessage("Add at least one option for this input type.");
      return;
    }
    const ok = await patchField(
      {
        label,
        inputType,
        isRequiredDefault,
        helpText: helpText.trim() || null,
        placeholder: placeholder.trim() || null,
        defaultValue: defaultValue.trim() || null,
        configurationJson: needsOptions(inputType) ? { options: cleanedOptions } : {},
      },
      "Field saved.",
    );
    if (ok) onClose();
  }

  async function onToggleStatus() {
    const nextStatus = field.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const ok = await patchField(
      { status: nextStatus },
      nextStatus === "INACTIVE" ? "Field deactivated." : "Field reactivated.",
    );
    if (ok) onClose();
  }

  async function onRemove() {
    const confirmed = window.confirm(
      `Permanently remove field "${field.fieldKey}"? Templates or document sets that still reference it may break. Prefer Deactivate if unsure.`,
    );
    if (!confirmed) return;

    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/document-generator/fields/${field.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "Unable to remove field.");
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalForm onSubmit={onSave}>
        <ModalHeader
          title="Edit data field"
          description={`Key ${field.fieldKey} cannot be changed.`}
          onClose={onClose}
        />
        <ModalBody className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="edit-fieldKey">Field key</Label>
            <Input id="edit-fieldKey" value={field.fieldKey} disabled className="font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-label">Display label</Label>
            <Input
              id="edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-inputType">Input type</Label>
            <select
              id="edit-inputType"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={inputType}
              onChange={(e) => {
                const next = e.target.value as InputType;
                setInputType(next);
                if (needsOptions(next) && options.length === 0) setOptions([""]);
              }}
            >
              {INPUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          {needsOptions(inputType) ? (
            <FieldOptionsEditor options={options} onChange={setOptions} />
          ) : null}
          {inputType === "DATE" ? (
            <p className="text-xs text-slate-500">
              Dates appear on generated documents as DD/MMM/YYYY (e.g. 21/Oct/2026).
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isRequiredDefault}
              onChange={(e) => setIsRequiredDefault(e.target.checked)}
            />
            Required by default
          </label>
          <div className="space-y-1">
            <Label htmlFor="edit-placeholder">Placeholder</Label>
            <Input
              id="edit-placeholder"
              value={placeholder}
              onChange={(e) => setPlaceholder(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-defaultValue">Default value</Label>
            <Input
              id="edit-defaultValue"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-helpText">Help text</Label>
            <Input
              id="edit-helpText"
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500">
            Status: <span className="font-medium text-slate-700">{field.status}</span>
          </p>
          {message ? <p className="text-sm text-red-600">{message}</p> : null}
        </ModalBody>
        <ModalFooter className="justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void onToggleStatus()}
            >
              {field.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void onRemove()}>
              Remove
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}

export function DocGenFieldsAdmin({ initialFields }: { initialFields: FieldRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fieldKey, setFieldKey] = useState("");
  const [label, setLabel] = useState("");
  const [inputType, setInputType] = useState<InputType>("TEXT");
  const [options, setOptions] = useState<string[]>([]);
  const [editingField, setEditingField] = useState<FieldRow | null>(null);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const cleanedOptions = options.map((item) => item.trim()).filter(Boolean);
    if (needsOptions(inputType) && cleanedOptions.length === 0) {
      setError("Add at least one option for Dropdown, Radio, or Multi Select.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/document-generator/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey,
          label,
          inputType,
          configurationJson: needsOptions(inputType) ? { options: cleanedOptions } : {},
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? "Unable to create field.");
        return;
      }
      setFieldKey("");
      setLabel("");
      setInputType("TEXT");
      setOptions([]);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Global data fields</h1>
          <p className="mt-1 text-sm text-slate-600">
            Reusable placeholders for MSEB document templates (ISE only). Click a field key to edit,
            deactivate, or remove it.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/documentation/document-generator">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <form onSubmit={onCreate} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Create field</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="fieldKey">Field key</Label>
            <Input
              id="fieldKey"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              placeholder="Customer_Name"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="label">Display label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Customer name"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inputType">Input type</Label>
            <select
              id="inputType"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={inputType}
              onChange={(e) => {
                const next = e.target.value as InputType;
                setInputType(next);
                if (needsOptions(next) && options.length === 0) setOptions([""]);
                if (!needsOptions(next)) setOptions([]);
              }}
            >
              {INPUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
        {needsOptions(inputType) ? (
          <FieldOptionsEditor options={options} onChange={setOptions} />
        ) : null}
        {inputType === "DATE" ? (
          <p className="text-xs text-slate-500">
            Dates appear on generated documents as DD/MMM/YYYY (e.g. 21/Oct/2026).
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create field"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Options</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {initialFields.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No fields yet. Create your first field above.
                </td>
              </tr>
            ) : (
              initialFields.map((field) => {
                const fieldOptions = optionsFromConfig(field.configurationJson);
                return (
                  <tr
                    key={field.id}
                    className={`border-t border-slate-100 ${
                      field.status === "INACTIVE" ? "bg-slate-50 text-slate-500" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        title="Edit field"
                        className="rounded px-1.5 py-0.5 font-mono text-xs text-emerald-800 underline-offset-2 hover:bg-emerald-50 hover:underline"
                        onClick={() => setEditingField(field)}
                        onDoubleClick={() => setEditingField(field)}
                      >
                        {field.fieldKey}
                      </button>
                    </td>
                    <td className="px-4 py-2">{field.label}</td>
                    <td className="px-4 py-2">{field.inputType}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {needsOptions(field.inputType)
                        ? fieldOptions.length
                          ? fieldOptions.join(", ")
                          : "—"
                        : "—"}
                    </td>
                    <td className="px-4 py-2">{field.status}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editingField ? (
        <FieldEditDialog field={editingField} onClose={() => setEditingField(null)} />
      ) : null}
    </div>
  );
}
