"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type PurchaseNavLink = {
  label: string;
  href: string;
  visible?: boolean;
};

export function PurchaseNav({
  canManagePurchase,
}: {
  canManagePurchase: boolean;
}) {
  const pathname = usePathname();

  const links: PurchaseNavLink[] = [
    { label: "Requests", href: "/purchase/requests", visible: true },
    {
      label: "Incoming Material",
      href: "/purchase/incoming",
      visible: canManagePurchase,
    },
    {
      label: "Vendors",
      href: "/purchase/vendors",
      visible: canManagePurchase,
    },
  ].filter((link) => link.visible !== false);

  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
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
