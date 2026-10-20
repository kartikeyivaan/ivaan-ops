import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  getActiveSessionCompany,
  assertDocGenCompany,
  DOC_GEN_ISE_ONLY_MESSAGE,
} from "@/lib/company-scope";
import {
  canAdminDocumentGenerator,
  canViewDocumentGenerator,
} from "@/lib/document-generator-permissions";
import { Button } from "@/components/ui/button";

export default async function DocumentGeneratorPage() {
  const session = await auth();
  if (!session?.user || !canViewDocumentGenerator(session.user.roles)) {
    redirect("/dashboard");
  }

  const activeCompany = getActiveSessionCompany(session);
  let iseScopeError: string | null = null;
  try {
    assertDocGenCompany(activeCompany);
  } catch {
    iseScopeError = DOC_GEN_ISE_ONLY_MESSAGE;
  }

  const isAdmin = canAdminDocumentGenerator(session.user.roles);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">MSEB Document Generator</h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate customer-specific MSEB Solar Rooftop documents from published templates.
            Available for Ivaan Solar Energy only.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/documentation">
            <ArrowLeft className="h-4 w-4" />
            Back to Documentation
          </Link>
        </Button>
      </div>

      {iseScopeError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {iseScopeError}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/documentation/document-generator/generate">Generate documents</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/documentation/document-generator/history">Generation history</Link>
            </Button>
            {isAdmin ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/documentation/document-generator/admin/templates">Manage templates</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/documentation/document-generator/admin/sets">Manage document sets</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/documentation/document-generator/admin/fields">Manage data fields</Link>
                </Button>
              </>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">
            Super Admin publishes templates and document sets. Documentation and Accounts users can
            search customers, fill the shared form once, download PDFs, and re-open past generations
            with the exact template/set versions that were used.
          </p>
        </>
      )}
    </div>
  );
}
