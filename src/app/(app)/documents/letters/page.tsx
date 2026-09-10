import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { listOfficialLetters } from "@/lib/letter-service";
import { prisma } from "@/lib/prisma";
import { officialLetterSearchSchema } from "@/lib/validations";
import { LetterHistoryList } from "@/components/letters/letter-history-list";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LetterHistoryPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageOfficialLetters(session.user.roles)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const parsed = officialLetterSearchSchema.safeParse({
    q: first(params.q),
    companyId: first(params.companyId),
    status: first(params.status),
    fromDate: first(params.fromDate),
    toDate: first(params.toDate),
    page: first(params.page),
    pageSize: first(params.pageSize),
  });
  const filters = parsed.success ? parsed.data : officialLetterSearchSchema.parse({});
  const [lettersPage, companies] = await Promise.all([
    listOfficialLetters(prisma, filters),
    prisma.company.findMany({
      where: { isPractice: false, code: { in: ["ISE", "PCMV"] } },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
  ]);

  return (
    <LetterHistoryList
      initialLetters={lettersPage.items}
      initialTotal={lettersPage.total}
      initialPage={lettersPage.page}
      initialPageSize={lettersPage.pageSize}
      companies={companies}
      initialFilters={{
        q: filters.q ?? "",
        companyId: filters.companyId ?? "",
        status: filters.status ?? "",
        fromDate: filters.fromDate ?? "",
        toDate: filters.toDate ?? "",
        page: lettersPage.page,
      }}
    />
  );
}
