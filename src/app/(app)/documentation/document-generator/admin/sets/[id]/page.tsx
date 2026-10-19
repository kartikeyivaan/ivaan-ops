import { redirect, notFound } from "next/navigation";
import {
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
  getActiveSessionCompany,
  requireDocGenCompany,
} from "@/lib/company-scope";
import { canAdminDocumentGenerator } from "@/lib/document-generator-permissions";
import {
  getDocGenDocumentSet,
  getDraftSetVersion,
  listPublishedTemplateVersions,
} from "@/lib/doc-gen-set-service";
import { listDocGenFields } from "@/lib/doc-gen-field-service";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DocGenSetDesigner } from "@/components/document-generator/doc-gen-set-designer";

type PageProps = { params: Promise<{ id: string }> };

export default async function DocGenSetDesignerPage({ params }: PageProps) {
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
  const set = await getDocGenDocumentSet(prisma, companyId, id);
  if (!set) notFound();

  const draft = await getDraftSetVersion(prisma, id);
  if (!draft) notFound();

  const [templateVersions, fields] = await Promise.all([
    listPublishedTemplateVersions(prisma, companyId),
    listDocGenFields(prisma, companyId),
  ]);

  const fieldLabels = Object.fromEntries(
    fields.map((field) => [field.id, { label: field.label, fieldKey: field.fieldKey }]),
  );

  return (
    <DocGenSetDesigner
      setMeta={{
        id: set.id,
        name: set.name,
        description: set.description,
        currentPublishedVersion: set.currentPublishedVersion
          ? { versionNumber: set.currentPublishedVersion.versionNumber }
          : null,
      }}
      draft={JSON.parse(JSON.stringify(draft))}
      templateVersions={JSON.parse(JSON.stringify(templateVersions))}
      fieldLabels={fieldLabels}
    />
  );
}
