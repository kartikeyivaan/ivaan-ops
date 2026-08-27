"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { getActiveSessionCompany, isProjectsCompany } from "@/lib/company-scope";
import { canAccessNav, NAV_GROUPS, NAV_ITEMS } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { CompanySwitcher } from "@/components/layout/company-switcher";
import { IvaanLogo } from "@/components/layout/ivaan-logo";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { LearningBanner } from "@/components/learning/learning-banner";
import { LearningFirstLoginPrompt } from "@/components/learning/learning-first-login-prompt";
import { LearningTourOverlay } from "@/components/learning/learning-tour-overlay";

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
  const grouped = NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="space-y-4">
      {grouped.map((section) => (
        <div key={section.group}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {section.group}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <IvaanLogo />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">IvaanOps</p>
        {!compact ? (
          <p className="hidden text-xs text-slate-500 sm:block">Operational source of truth</p>
        ) : null}
      </div>
    </div>
  );
}

function NavMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Open navigation menu"
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 lg:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const roles = session?.user?.roles ?? [];
  const activeCompany = getActiveSessionCompany(session ?? null);
  const showProjectsNav = !activeCompany || isProjectsCompany(activeCompany);
  const navItems = NAV_ITEMS.filter((item) => canAccessNav(roles, item)).filter((item) => {
    if (showProjectsNav) return true;
    return !item.href.startsWith("/projects");
  });
  const showCompanySwitcher = !pathname.startsWith("/sales/quotations/new");

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <NavMenuButton onClick={() => setDrawerOpen(true)} />
              <BrandBlock compact />
            </div>
            <SignOutButton compact />
          </div>
          {showCompanySwitcher ? (
            <div className="mt-2">
              <CompanySwitcher />
            </div>
          ) : null}
        </div>

        <div className="mx-auto hidden w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:flex sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <NavMenuButton onClick={() => setDrawerOpen(true)} />
            <BrandBlock />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {showCompanySwitcher ? <CompanySwitcher /> : null}
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium text-slate-900">{session?.user?.name}</p>
              <p className="text-xs text-slate-500">{roles.join(", ")}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <LearningBanner />
      <LearningFirstLoginPrompt />
      <LearningTourOverlay />

      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
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
            <div className="flex-1 overflow-y-auto p-3" data-tour="app-nav">
              <NavLinks
                items={navItems}
                pathname={pathname}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:flex-row">
        <aside
          data-tour="app-nav"
          className="hidden h-fit w-full shrink-0 rounded-xl border border-slate-200 bg-white p-3 lg:block lg:w-[220px]"
        >
          <NavLinks items={navItems} pathname={pathname} />
        </aside>
        <main data-tour="page-main" className="min-w-0 w-full flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
