import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageOfficialLetters } from "@/lib/letter-permissions";
import { getOfficialLetterById, serializeLetterDetail } from "@/lib/letter-service";
import { prisma } from "@/lib/prisma";
import { LetterDetail } from "@/components/letters/letter-detail";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function LetterDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canManageOfficialLetters(session.user.roles)) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const letter = await getOfficialLetterById(prisma, id);
  if (!letter) notFound();

  return <LetterDetail letter={serializeLetterDetail(letter)} />;
}
