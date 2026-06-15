"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SelectCompanyPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  async function selectCompany(companyId: string) {
    await update({ activeCompanyId: companyId });
    router.push("/dashboard");
    router.refresh();
  }

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
          {session?.user.companies.map((company) => (
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
