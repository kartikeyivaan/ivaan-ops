import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { canManageProjectEnquiries, canViewProjectEnquiries } from "@/lib/project-enquiry-permissions";
import { assertProjectEnquiryAccess, getProjectEnquiryById } from "@/lib/project-enquiry-service";
import { prisma } from "@/lib/prisma";
import { requireActiveCompany } from "@/lib/session";
import { ProjectEnquiryDetail } from "@/components/project-enquiries/project-enquiry-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectEnquiryDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user || !canViewProjectEnquiries(session.user.roles)) {
    redirect("/dashboard");
  }

  let companyId: string;
  try {
    companyId = requireActiveCompany(session);
  } catch {
    redirect("/select-company");
  }

  const { id } = await params;
  const enquiry = await getProjectEnquiryById(prisma, companyId, id);
  if (!enquiry) {
    notFound();
  }

  try {
    assertProjectEnquiryAccess(session.user.roles, session.user.id, enquiry);
  } catch {
    redirect("/projects/enquiries");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/projects/enquiries"
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to enquiries
      </Link>
      <ProjectEnquiryDetail
        enquiry={JSON.parse(JSON.stringify(enquiry))}
        canManage={canManageProjectEnquiries(session.user.roles)}
      />
    </div>
  );
}
