"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ALL_COMPANIES_ID,
  formatAllCompaniesLabel,
} from "@/lib/company-scope";
import { isPracticeCompany, operationalCompanies } from "@/lib/learning/mode";

export default function SelectCompanyPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  async function selectCompany(companyId: string) {
    await update({ activeCompanyId: companyId });
    router.push("/dashboard");
    router.refresh();
  }

  const learningMode = Boolean(session?.user?.learningMode);
  const companies = learningMode
    ? (session?.user.companies ?? []).filter((c) => isPracticeCompany(c))
    : operationalCompanies(session?.user.companies ?? []);
  const showAll = !learningMode && companies.length > 1;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Select company</CardTitle>
          <CardDescription>
            Choose which company context you want to work in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAll ? (
            <Button
              variant="outline"
              className="h-auto w-full justify-start py-4"
              onClick={() => selectCompany(ALL_COMPANIES_ID)}
            >
              <div className="text-left">
                <p className="font-semibold">{formatAllCompaniesLabel(companies)}</p>
                <p className="text-xs text-slate-500">Sum of all firms on the dashboard</p>
              </div>
            </Button>
          ) : null}
          {companies.map((company) => (
            <Button
              key={company.id}
              variant="outline"
              className="h-auto w-full justify-start py-4"
              onClick={() => selectCompany(company.id)}
            >
              <div className="text-left">
                <p className="font-semibold">{company.name}</p>
                <p className="text-xs text-slate-500">{company.code}</p>
              </div>
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
