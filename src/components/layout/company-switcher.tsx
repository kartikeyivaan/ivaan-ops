"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALL_COMPANIES_ID,
  formatAllCompaniesLabel,
  isAllCompaniesScope,
} from "@/lib/company-scope";
import { isPracticeCompany, operationalCompanies } from "@/lib/learning/mode";

export function CompanySwitcher({ className }: { className?: string }) {
  const { data: session, update } = useSession();
  const router = useRouter();

  if (!session?.user?.companies?.length) {
    return null;
  }

  const learningMode = Boolean(session.user.learningMode);
  const companies = learningMode
    ? session.user.companies.filter((c) => isPracticeCompany(c))
    : operationalCompanies(session.user.companies);

  const showAllOption = !learningMode && companies.length > 1;
  const allLabel = formatAllCompaniesLabel(companies);
  const activeIsAll = isAllCompaniesScope(session.user.activeCompanyId);
  const activeCompany =
    session.user.companies.find((c) => c.id === session.user.activeCompanyId) ??
    companies[0];

  async function handleChange(companyId: string) {
    if (learningMode) return;
    await update({ activeCompanyId: companyId });
    router.refresh();
  }

  if (learningMode || companies.length <= 1) {
    return (
      <div
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
          learningMode
            ? "bg-amber-50 text-amber-900"
            : "bg-emerald-50 text-emerald-800",
          className,
        )}
      >
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="truncate sm:hidden">
          {activeCompany?.code ?? companies[0]?.code}
        </span>
        <span className="hidden truncate sm:inline">
          {activeCompany?.name ?? companies[0]?.name}
          {learningMode ? " · Learning" : ""}
        </span>
      </div>
    );
  }

  const selectValue = activeIsAll
    ? ALL_COMPANIES_ID
    : (session.user.activeCompanyId ?? "");

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
          value={selectValue}
          onChange={(e) => handleChange(e.target.value)}
        >
          {showAllOption ? (
            <option value={ALL_COMPANIES_ID}>{allLabel}</option>
          ) : null}
          {companies.map((company) => (
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
