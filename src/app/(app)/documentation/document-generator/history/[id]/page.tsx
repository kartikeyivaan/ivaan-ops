import { notFound, redirect } from "next/navigation";
import {
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
  getActiveSessionCompany,
  requireDocGenCompany,
} from "@/lib/company-scope";
import { canGenerateDocuments } from "@/lib/document-generator-permissions";
import { getDocGenGeneration } from "@/lib/doc-gen-generation-service";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DocGenGenerationDetail } from "@/components/document-generator/doc-gen-generation-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function DocGenHistoryDetailPage({ params }: PageProps) {
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
  const { id } = await params;
  const generation = await getDocGenGeneration(prisma, companyId, id);
  if (!generation) notFound();

  return (
    <DocGenGenerationDetail
      generation={JSON.parse(
        JSON.stringify({
          ...generation,
          customerSnapshotJson:
            generation.customerSnapshotJson &&
            typeof generation.customerSnapshotJson === "object"
              ? generation.customerSnapshotJson
              : {},
        }),
      )}
    />
  );
}
