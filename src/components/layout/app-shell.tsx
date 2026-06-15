"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { LayoutDashboard, Shield } from "lucide-react";
import { canAccessNav, NAV_ITEMS } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { SignOutButton } from "@/components/layout/sign-out-button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const roles = session?.user?.roles ?? [];
  const navItems = NAV_ITEMS.filter((item) => canAccessNav(roles, item));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">IvaanOps</p>
              <p className="text-xs text-slate-500">Operational source of truth</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CompanySwitcher />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{session?.user?.name}</p>
              <p className="text-xs text-slate-500">{roles.join(", ")}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr] sm:px-6">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
