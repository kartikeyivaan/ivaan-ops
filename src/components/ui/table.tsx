import { cn } from "@/lib/utils";

export function Table({
  className,
  responsive = false,
  containerClassName,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  responsive?: boolean;
  /** Extra classes on the scroll wrapper (e.g. when parent already scrolls). */
  containerClassName?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto", containerClassName)}>
      <table
        className={cn("w-full caption-bottom text-sm", responsive && "responsive-table", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-slate-100 transition-colors hover:bg-slate-50", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 h-11 bg-white px-4 text-left align-middle font-medium text-slate-500",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ref,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>;
}) {
  return <td ref={ref} className={cn("p-4 align-middle", className)} {...props} />;
}
