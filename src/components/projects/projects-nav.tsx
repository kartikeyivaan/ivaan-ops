"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ROLES } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const PROJECT_LINKS = [
  { label: "Proposals", href: "/projects/proposals" },
  { label: "Projects Quotation", href: "/projects/quotations", superAdminOnly: true },
  { label: "Projects", href: "/projects/execution" },
  { label: "Enquiries", href: "/projects/enquiries" },
] as const;

export function ProjectsNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.roles?.includes(ROLES.SUPER_ADMIN) ?? false;

  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {PROJECT_LINKS.filter((link) => !("superAdminOnly" in link && link.superAdminOnly) || isSuperAdmin).map(
        (link) => {
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
        },
      )}
    </nav>
  );
}
