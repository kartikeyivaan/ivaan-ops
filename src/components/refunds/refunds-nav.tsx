"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function RefundsNav({
  canApprove,
  canProcess,
}: {
  canApprove: boolean;
  canProcess: boolean;
}) {
  const pathname = usePathname();

  const links = [
    { label: "All Refunds", href: "/accounts/refunds", visible: true, exact: true },
    {
      label: "Approval Queue",
      href: "/accounts/refunds/approvals",
      visible: canApprove,
    },
    {
      label: "Pending Execution",
      href: "/accounts/refunds/pending-execution",
      visible: canProcess,
    },
  ].filter((link) => link.visible !== false);

  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-emerald-50 text-emerald-800"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
