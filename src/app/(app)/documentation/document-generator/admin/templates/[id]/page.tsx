import { redirect, notFound } from "next/navigation";
import {
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
  getActiveSessionCompany,
  requireDocGenCompany,
} from "@/lib/company-scope";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import { listDocGenFields } from "@/lib/doc-gen-field-service";
import { getDraftVersion, getDocGenTemplate, parsePageConfiguration, parseTemplateContent } from "@/lib/doc-gen-template-service";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DocGenTemplateDesigner } from "@/components/document-generator/doc-gen-template-designer";

type PageProps = { params: Promise<{ id: string }> };

export default async function DocGenTemplateDesignerPage({ params }: PageProps) {
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
  const { id } = await params;
  const template = await getDocGenTemplate(prisma, companyId, id);
  if (!template) notFound();

  const draft = await getDraftVersion(prisma, id);
  if (!draft) notFound();

  const fields = await listDocGenFields(prisma, companyId, { status: "ACTIVE" });

  return (
    <DocGenTemplateDesigner
      template={{
        id: template.id,
        name: template.name,
        editorType: template.editorType,
        layoutMode: template.layoutMode,
      }}
      draft={{
        id: draft.id,
        versionNumber: draft.versionNumber,
        templateContentJson: parseTemplateContent(draft.templateContentJson),
        pageConfigurationJson: parsePageConfiguration(draft.pageConfigurationJson),
        backgroundStoredPdfId: draft.backgroundStoredPdfId,
      }}
      fields={JSON.parse(JSON.stringify(fields))}
    />
  );
}
