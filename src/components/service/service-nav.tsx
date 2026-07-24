"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { canManageServiceWorkTypes } from "@/lib/service-permissions";

const BASE_LINKS = [
  { label: "Dashboard", href: "/service", exact: true },
  { label: "Requests", href: "/service/requests", exact: false },
];

const SETTINGS_LINK = { label: "Work Types", href: "/service/work-types", exact: false };

export function ServiceNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const roles = session?.user?.roles ?? [];

  const links = canManageServiceWorkTypes(roles)
    ? [...BASE_LINKS, SETTINGS_LINK]
    : BASE_LINKS;

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
