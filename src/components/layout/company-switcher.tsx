"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CompanySwitcher({ className }: { className?: string }) {
  const { data: session, update } = useSession();
  const router = useRouter();

  if (!session?.user?.companies?.length) {
    return null;
  }

  const activeCompany = session.user.companies.find(
    (c) => c.id === session.user.activeCompanyId,
  );

  async function handleChange(companyId: string) {
    await update({ activeCompanyId: companyId });
    router.refresh();
  }

  if (session.user.companies.length === 1) {
    return (
      <div
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800",
          className,
        )}
      >
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="truncate sm:hidden">{activeCompany?.code ?? session.user.companies[0].code}</span>
        <span className="hidden truncate sm:inline">
          {activeCompany?.name ?? session.user.companies[0].name}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <label className="sr-only" htmlFor="company-switcher">
        Active company
      </label>
      <div className="relative w-full min-w-0">
        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <select
          id="company-switcher"
          className="h-10 w-full min-w-0 max-w-full appearance-none truncate rounded-md border border-slate-300 bg-white pl-9 pr-8 text-sm font-medium"
          value={session.user.activeCompanyId ?? ""}
          onChange={(e) => handleChange(e.target.value)}
        >
          {session.user.companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name} ({company.code})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
    </div>
  );
}
