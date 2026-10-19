import { redirect } from "next/navigation";
import {
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
  getActiveSessionCompany,
  requireDocGenCompany,
} from "@/lib/company-scope";
import { canGenerateDocuments } from "@/lib/document-generator-permissions";
import { listPublishedDocGenDocumentSets } from "@/lib/doc-gen-set-service";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DocGenGenerateWizard } from "@/components/document-generator/doc-gen-generate-wizard";

export default async function DocGenGeneratePage() {
  const session = await auth();
  if (!session?.user || !canGenerateDocuments(session.user.roles)) {
    redirect("/dashboard");
  }

  try {
    assertDocGenCompany(getActiveSessionCompany(session));
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-amber-900">{DOC_GEN_ISE_ONLY_MESSAGE}</div>
    );
  }

  const companyId = requireDocGenCompany(session);
  const sets = await listPublishedDocGenDocumentSets(prisma, companyId);

  return (
    <DocGenGenerateWizard
      publishedSets={sets.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
      }))}
    />
  );
}
