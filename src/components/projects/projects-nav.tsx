"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  canPrepareSimpleProjectDispatch,
  canViewProjectDispatches,
} from "@/lib/project-permissions";
import { ROLES } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const PROJECT_LINKS = [
  { label: "Proposals", href: "/projects/proposals" },
  { label: "Projects Quotation", href: "/projects/quotations", superAdminOnly: true },
  { label: "Projects", href: "/projects/execution", executionOnly: true },
  { label: "Project Dispatch", href: "/projects/dispatch", dispatchOnly: true },
  { label: "Enquiries", href: "/projects/enquiries" },
] as const;

export function ProjectsNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const roles = session?.user?.roles ?? [];
  const isSuperAdmin = roles.includes(ROLES.SUPER_ADMIN);
  const canDispatch =
    canViewProjectDispatches(roles) || canPrepareSimpleProjectDispatch(roles);
  const canExecution =
    roles.includes(ROLES.SUPER_ADMIN) || roles.includes(ROLES.PROJECTS_MANAGER);

  return (
    <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {PROJECT_LINKS.filter((link) => {
        if ("superAdminOnly" in link && link.superAdminOnly) return isSuperAdmin;
        if ("dispatchOnly" in link && link.dispatchOnly) return canDispatch;
        if ("executionOnly" in link && link.executionOnly) return canExecution;
        // Warehouse lands on Project Dispatch only — hide proposal/enquiry tabs.
        if (roles.includes(ROLES.WAREHOUSE) && !isSuperAdmin && !roles.includes(ROLES.PROJECTS_MANAGER)) {
          return false;
        }
        return true;
      }).map((link) => {
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
