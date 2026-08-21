import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type StockQtyHintProps = {
  label: string;
  className?: string;
  children?: ReactNode;
  lines: string[];
};

/** Hover hint explaining stock free-qty / shortage math. */
export function StockQtyHint({ label, className, children, lines }: StockQtyHintProps) {
  return (
    <span
      className={cn(
        "group relative inline-flex cursor-help items-center gap-1",
        className,
      )}
    >
      {children ?? <span>{label}</span>}
      <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-2 text-left text-xs font-normal normal-case tracking-normal text-slate-700 shadow-md group-hover:block"
      >
        {lines.map((line) => (
          <span key={line} className="block leading-relaxed">
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}

export function freeQtyHintLines(input: {
  available: number;
  booked: number;
  upcoming: number;
  freeQty: number;
}): string[] {
  return [
    "Free qty = Available − Booked + Upcoming",
    `Available: ${input.available}`,
    `Booked: ${input.booked}`,
    `Upcoming (incoming lots): ${input.upcoming}`,
    `Free qty: ${input.freeQty}`,
  ];
}

export function shortByHintLines(input: {
  available: number;
  booked: number;
  upcoming: number;
  freeQty: number;
  required: number;
  shortBy: number;
}): string[] {
  return [
    "Short by = Required − Free qty",
    "Free qty = Available − Booked + Upcoming",
    `Required: ${input.required}`,
    `Available: ${input.available}`,
    `Booked: ${input.booked}`,
    `Upcoming (incoming lots): ${input.upcoming}`,
    `Free qty: ${input.freeQty}`,
    `Short by: ${input.shortBy}`,
  ];
}
