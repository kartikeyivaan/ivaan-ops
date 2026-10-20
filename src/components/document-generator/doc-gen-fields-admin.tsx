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

function FieldEditDialog({
  field,
  onClose,
}: {
  field: FieldRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(field.label);
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]>(
    INPUT_TYPES.includes(field.inputType as (typeof INPUT_TYPES)[number])
      ? (field.inputType as (typeof INPUT_TYPES)[number])
      : "TEXT",
  );
  const [isRequiredDefault, setIsRequiredDefault] = useState(field.isRequiredDefault);
  const [helpText, setHelpText] = useState(field.helpText ?? "");
  const [placeholder, setPlaceholder] = useState(field.placeholder ?? "");
  const [defaultValue, setDefaultValue] = useState(field.defaultValue ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLabel(field.label);
    setInputType(
      INPUT_TYPES.includes(field.inputType as (typeof INPUT_TYPES)[number])
        ? (field.inputType as (typeof INPUT_TYPES)[number])
        : "TEXT",
    );
    setIsRequiredDefault(field.isRequiredDefault);
    setHelpText(field.helpText ?? "");
    setPlaceholder(field.placeholder ?? "");
    setDefaultValue(field.defaultValue ?? "");
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
    const ok = await patchField(
      {
        label,
        inputType,
        isRequiredDefault,
        helpText: helpText.trim() || null,
        placeholder: placeholder.trim() || null,
        defaultValue: defaultValue.trim() || null,
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
              onChange={(e) => setInputType(e.target.value as (typeof INPUT_TYPES)[number])}
            >
              {INPUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
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
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]>("TEXT");
  const [editingField, setEditingField] = useState<FieldRow | null>(null);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/document-generator/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldKey, label, inputType }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? "Unable to create field.");
        return;
      }
      setFieldKey("");
      setLabel("");
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
              onChange={(e) => setInputType(e.target.value as (typeof INPUT_TYPES)[number])}
            >
              {INPUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
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
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {initialFields.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No fields yet. Create your first field above.
                </td>
              </tr>
            ) : (
              initialFields.map((field) => (
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
                  <td className="px-4 py-2">{field.status}</td>
                </tr>
              ))
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
