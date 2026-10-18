import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
  getActiveSessionCompany,
  requireDocGenCompany,
} from "@/lib/company-scope";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import { listDocGenFields } from "@/lib/doc-gen-field-service";
import { prisma } from "@/lib/prisma";
import { DocGenFieldsAdmin } from "@/components/document-generator/doc-gen-fields-admin";

export default async function DocGenFieldsAdminPage() {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
    redirect("/dashboard");
  }

  const activeCompany = getActiveSessionCompany(session);
  try {
    assertDocGenCompany(activeCompany);
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-amber-900">
        {DOC_GEN_ISE_ONLY_MESSAGE}
      </div>
    );
  }

  const companyId = requireDocGenCompany(session);
  const fields = await listDocGenFields(prisma, companyId);

  return (
    <DocGenFieldsAdmin initialFields={JSON.parse(JSON.stringify(fields))} />
  );
}
