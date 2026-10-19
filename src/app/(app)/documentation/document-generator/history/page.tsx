import { redirect } from "next/navigation";
import { DocGenGenerationStatus } from "@prisma/client";
import {
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
  getActiveSessionCompany,
  requireDocGenCompany,
} from "@/lib/company-scope";
import { canGenerateDocuments } from "@/lib/document-generator-permissions";
import { listDocGenGenerations } from "@/lib/doc-gen-generation-service";
import { listPublishedDocGenDocumentSets } from "@/lib/doc-gen-set-service";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DocGenGenerationHistory } from "@/components/document-generator/doc-gen-generation-history";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DocGenHistoryPage({ searchParams }: PageProps) {
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
  const params = await searchParams;
  const statusParam = first(params.status);
  const status =
    statusParam &&
    Object.values(DocGenGenerationStatus).includes(statusParam as DocGenGenerationStatus)
      ? (statusParam as DocGenGenerationStatus)
      : undefined;

  const page = Number(first(params.page) ?? "1") || 1;
  const pageSize = Number(first(params.pageSize) ?? "25") || 25;

  const [history, sets] = await Promise.all([
    listDocGenGenerations(prisma, companyId, {
      q: first(params.q),
      status,
      documentSetId: first(params.documentSetId),
      fromDate: first(params.fromDate),
      toDate: first(params.toDate),
      page,
      pageSize,
    }),
    listPublishedDocGenDocumentSets(prisma, companyId),
  ]);

  return (
    <DocGenGenerationHistory
      initialItems={history.items}
      initialTotal={history.total}
      initialPage={history.page}
      initialPageSize={history.pageSize}
      publishedSets={sets.map((row) => ({ id: row.id, name: row.name }))}
      initialFilters={{
        q: first(params.q),
        status: statusParam,
        documentSetId: first(params.documentSetId),
        fromDate: first(params.fromDate),
        toDate: first(params.toDate),
      }}
    />
  );
}
