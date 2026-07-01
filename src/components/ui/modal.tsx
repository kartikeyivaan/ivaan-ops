"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-5xl",
} as const;

export type ModalSize = keyof typeof sizeClasses;

/**
 * Reusable modal shell. Renders a fixed overlay with a full-width (margined)
 * card that is a flex column capped at the viewport height. Compose with
 * ModalHeader, ModalBody (scrollable) and ModalFooter (sticky) so that on
 * narrow screens the body scrolls while the title and actions stay visible.
 */
export function Modal({
  onClose,
  size = "md",
  className,
  children,
}: {
  onClose?: () => void;
  size?: ModalSize;
  className?: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!onClose) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl",
          sizeClasses[size],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  description,
  onClose,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {title ? (
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        ) : null}
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
        {children}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}

export function ModalBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto p-4 sm:p-6", className)}
      {...props}
    />
  );
}

export function ModalFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-4 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Optional form wrapper that lets ModalBody + ModalFooter live inside a single
 * <form> while keeping the body as the only scrolling region.
 */
export function ModalForm({
  className,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className={cn("flex min-h-0 flex-1 flex-col", className)} {...props} />
  );
}
