import { cn } from "@/lib/utils";

/**
 * Viewport-filling list layout: toolbar stays put, table body scrolls,
 * pagination footer stays pinned to the bottom of the main pane.
 * Requires AppShell main to have a definite height (flex-1 min-h-0).
 */
export function ListPageShell({
  toolbar,
  children,
  footer,
  className,
}: {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full max-h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden",
        className,
      )}
    >
      {toolbar ? (
        <div className="max-h-[40%] shrink-0 space-y-4 overflow-y-auto">{toolbar}</div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
