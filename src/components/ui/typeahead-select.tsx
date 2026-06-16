"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type TypeaheadOption = {
  value: string;
  label: string;
};

type TypeaheadSelectProps = {
  id?: string;
  label: string;
  options: TypeaheadOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
};

export function TypeaheadSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = "Type to search...",
  required = false,
  allowEmpty = false,
  emptyLabel = "None",
}: TypeaheadSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    setQuery(selectedOption?.label ?? "");
  }, [selectedOption?.label, value]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  function selectOption(option: TypeaheadOption | null) {
    if (!option) {
      onChange("");
      setQuery("");
      setOpen(false);
      return;
    }

    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);

        if (!query.trim()) {
          if (allowEmpty) {
            selectOption(null);
          } else if (selectedOption) {
            setQuery(selectedOption.label);
          }
          return;
        }

        const exactMatch = options.find(
          (option) => option.label.toLowerCase() === query.trim().toLowerCase(),
        );
        if (exactMatch) {
          selectOption(exactMatch);
          return;
        }

        if (filteredOptions.length === 1) {
          selectOption(filteredOptions[0]);
          return;
        }

        if (selectedOption) {
          setQuery(selectedOption.label);
        }
      }
    }, 120);
  }

  return (
    <div ref={containerRef} className="relative space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        value={query}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(true);

          if (!nextQuery.trim()) {
            if (allowEmpty) {
              onChange("");
            } else if (value) {
              onChange("");
            }
            return;
          }

          const exactMatch = options.find(
            (option) => option.label.toLowerCase() === nextQuery.trim().toLowerCase(),
          );
          if (exactMatch) {
            onChange(exactMatch.value);
            return;
          }

          if (value) {
            onChange("");
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            if (selectedOption) {
              setQuery(selectedOption.label);
            }
          }
          if (event.key === "Enter" && open && filteredOptions.length > 0) {
            event.preventDefault();
            selectOption(filteredOptions[0]);
          }
        }}
      />

      {open && (allowEmpty || filteredOptions.length > 0) ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {allowEmpty ? (
            <li>
              <button
                type="button"
                className={cn(
                  "flex w-full px-3 py-2 text-left hover:bg-slate-50",
                  !value && "bg-emerald-50 text-emerald-800",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(null)}
              >
                {emptyLabel}
              </button>
            </li>
          ) : null}
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">No matches found</li>
          ) : (
            filteredOptions.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full px-3 py-2 text-left hover:bg-slate-50",
                    option.value === value && "bg-emerald-50 text-emerald-800",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
