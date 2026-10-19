import { redirect } from "next/navigation";
import {
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
  getActiveSessionCompany,
  requireDocGenCompany,
} from "@/lib/company-scope";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import { listDocGenDocumentSets } from "@/lib/doc-gen-set-service";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DocGenSetsAdmin } from "@/components/document-generator/doc-gen-sets-admin";

export default async function DocGenSetsAdminPage() {
  const session = await auth();
  if (!session?.user || !canAdminDocumentGenerator(session.user.roles)) {
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
  const sets = await listDocGenDocumentSets(prisma, companyId);

  return <DocGenSetsAdmin initialSets={JSON.parse(JSON.stringify(sets))} />;
}
