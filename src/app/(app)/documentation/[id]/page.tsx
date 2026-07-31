import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageDocumentation, canViewDocumentation } from "@/lib/documentation-permissions";
import { getDocumentation } from "@/lib/documentation-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { DocumentationRecordView } from "@/components/documentation/documentation-record";

export default async function DocumentationRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canViewDocumentation(session.user.roles)) redirect("/dashboard");
  const companyId = requireActiveCompany(session);
  const record = await getDocumentation(prisma, companyId, (await params).id);
  if (!record) notFound();
  return (
    <DocumentationRecordView
      record={JSON.parse(JSON.stringify(record))}
      canManage={canManageDocumentation(session.user.roles)}
    />
  );
}
