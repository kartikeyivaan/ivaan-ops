"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CollapsibleFilterCard({
  title = "Filters",
  contentClassName,
  children,
}: {
  title?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left md:pointer-events-none"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <CardTitle className="text-base">{title}</CardTitle>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-slate-500 transition-transform md:hidden",
              open && "rotate-180",
            )}
          />
        </button>
      </CardHeader>
      <CardContent className={cn(contentClassName, !open && "max-md:hidden")}>
        {children}
      </CardContent>
    </Card>
  );
}
