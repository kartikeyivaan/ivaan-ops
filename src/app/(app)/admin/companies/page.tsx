import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/rbac";
import { isOperationalLetterCompany } from "@/lib/letter-content";
import { companyStampDataUrl } from "@/lib/pdf-theme";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompanyLetterheadSettings } from "@/components/admin/company-letterhead-settings";

export default async function CompaniesAdminPage() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.roles)) {
    redirect("/dashboard");
  }

  const companies = await prisma.company.findMany({
    include: { warehouses: true },
    orderBy: { name: "asc" },
  });
  const letterheadCompanies = companies
    .filter((company) => isOperationalLetterCompany(company))
    .map((company) => ({
      id: company.id,
      name: company.name,
      code: company.code,
      defaultSignatoryName: company.defaultSignatoryName,
      defaultSignatoryDesignation: company.defaultSignatoryDesignation,
      printContentTopOffsetMm: company.printContentTopOffsetMm,
      signatureImageData: company.signatureImageData,
      stampImageData: company.stampImageData || companyStampDataUrl(company.code),
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
        <p className="text-sm text-slate-500">ISE and PCMV company master data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Master</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Warehouses</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">{company.code}</TableCell>
                  <TableCell>{company.name}</TableCell>
                  <TableCell>{company.warehouses.length}</TableCell>
                  <TableCell>
                    <Badge variant={company.isActive ? "success" : "danger"}>
                      {company.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CompanyLetterheadSettings companies={letterheadCompanies} />
    </div>
  );
}
