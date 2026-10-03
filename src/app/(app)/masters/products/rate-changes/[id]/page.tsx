import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canApproveProductRateChange,
  canCreateProductRateChange,
  canViewProductRateChange,
} from "@/lib/product-rate-change-permissions";
import { getProductRateChangeBatch } from "@/lib/product-rate-change-service";
import { ProductRateChangeDetail } from "@/components/products/product-rate-change-detail";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProductRateChangeDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const batch = await getProductRateChangeBatch(prisma, id);
  if (!batch) {
    notFound();
  }

  if (!canViewProductRateChange(session.user.roles, batch.createdById, session.user.id)) {
    redirect("/dashboard");
  }

  const canEdit =
    canCreateProductRateChange(session.user.roles) && batch.createdById === session.user.id;

  return (
    <ProductRateChangeDetail
      initialBatch={JSON.parse(JSON.stringify(batch))}
      canEdit={canEdit}
      canApprove={canApproveProductRateChange(session.user.roles)}
      currentUserId={session.user.id}
    />
  );
}
