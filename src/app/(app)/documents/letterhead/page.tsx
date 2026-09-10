import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOperationalLetterCompany } from "@/lib/letter-content";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { getOfficialLetterById, serializeLetterDetail } from "@/lib/letter-service";
import { prisma } from "@/lib/prisma";
import { companyLogoDataUrl, companyStampDataUrl } from "@/lib/pdf-theme";
import { LetterCreateForm } from "@/components/letters/letter-create-form";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LetterheadGeneratorPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageOfficialLetters(session.user.roles)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const draftId = first(params.id);
  const draftLetter = draftId ? await getOfficialLetterById(prisma, draftId) : null;
  if (draftId && !draftLetter) notFound();
  if (draftLetter?.status === "ISSUED") {
    redirect(`/documents/letters/${draftLetter.id}`);
  }

  const companies = await prisma.company.findMany({
    where: { isPractice: false, isActive: true, code: { in: ["ISE", "PCMV"] } },
    select: {
      id: true,
      name: true,
      code: true,
      isPractice: true,
      isActive: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      email: true,
      gstNumber: true,
      tagline: true,
      defaultSignatoryName: true,
      defaultSignatoryDesignation: true,
      printContentTopOffsetMm: true,
      signatureImageData: true,
      stampImageData: true,
    },
    orderBy: { code: "asc" },
  });

  return (
    <LetterCreateForm
      companies={companies.filter(isOperationalLetterCompany).map((company) => ({
        ...company,
        logoImageData: companyLogoDataUrl(company.code),
        stampImageData: company.stampImageData || companyStampDataUrl(company.code),
      }))}
      draft={draftLetter ? serializeLetterDetail(draftLetter) : null}
    />
  );
}
