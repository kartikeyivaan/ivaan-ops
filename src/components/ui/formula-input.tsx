"use client";

import { useEffect, useMemo, useRef } from "react";
import { evaluateCellInput, formatResolvedCellValue } from "@/lib/cell-formula";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormulaInputProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
};

export function FormulaInput({
  id,
  label,
  value,
  onChange,
  placeholder = "100 or =20*33",
  required = false,
  className,
}: FormulaInputProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const evaluation = useMemo(() => evaluateCellInput(value), [value]);

  useEffect(() => {
    if (!evaluation.isFormula || evaluation.error || evaluation.value === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      onChangeRef.current(formatResolvedCellValue(evaluation.value!));
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [evaluation.error, evaluation.isFormula, evaluation.value, value]);

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        required={required}
        inputMode="decimal"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {evaluation.error ? (
        <p className="text-xs text-red-600">{evaluation.error}</p>
      ) : evaluation.value !== null && evaluation.isFormula ? (
        <p className="text-xs text-slate-500">= {evaluation.value}</p>
      ) : evaluation.value !== null ? null : value.trim() ? (
        <p className="text-xs text-slate-500">Enter a number or formula like =20*33</p>
      ) : null}
    </div>
  );
}

export function resolveFormulaField(
  input: string,
  label: string,
): { value: number | null; error?: string } {
  const evaluation = evaluateCellInput(input);
  if (evaluation.error) {
    return { value: null, error: `${label}: ${evaluation.error}` };
  }
  if (evaluation.value === null) {
    return { value: null, error: `${label} is required` };
  }
  return { value: evaluation.value };
}
