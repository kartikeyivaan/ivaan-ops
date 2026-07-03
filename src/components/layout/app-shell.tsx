"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import * as Dialog from "@radix-ui/react-dialog";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { canAccessNav, NAV_ITEMS } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { IvaanLogo } from "@/components/layout/ivaan-logo";
import { SignOutButton } from "@/components/layout/sign-out-button";

type NavItem = (typeof NAV_ITEMS)[number];

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const roles = session?.user?.roles ?? [];
  const navItems = NAV_ITEMS.filter((item) => canAccessNav(roles, item));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 lg:hidden"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay
                  data-drawer-overlay
                  className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
                />
                <Dialog.Content
                  data-drawer-content
                  aria-describedby={undefined}
                  className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-slate-200 bg-white shadow-xl lg:hidden"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                    <Dialog.Title className="flex items-center gap-3">
                      <IvaanLogo />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">IvaanOps</p>
                        <p className="text-xs text-slate-500">Operational source of truth</p>
                      </div>
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close navigation menu"
                        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </Dialog.Close>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <NavLinks
                      items={navItems}
                      pathname={pathname}
                      onNavigate={() => setDrawerOpen(false)}
                    />
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <div className="flex items-center gap-3">
              <IvaanLogo />
              <div>
                <p className="text-sm font-semibold text-slate-900">IvaanOps</p>
                <p className="text-xs text-slate-500">Operational source of truth</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!pathname.startsWith("/sales/quotations/new") ? <CompanySwitcher /> : null}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{session?.user?.name}</p>
              <p className="text-xs text-slate-500">{roles.join(", ")}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr] sm:px-6">
        <aside className="hidden h-fit rounded-xl border border-slate-200 bg-white p-3 lg:block">
          <NavLinks items={navItems} pathname={pathname} />
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
