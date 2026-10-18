import { redirect } from "next/navigation";
import Link from "next/link";
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">MSEB Document Generator</h1>
        <p className="mt-1 text-sm text-slate-600">
          Generate customer-specific MSEB Solar Rooftop documents from published templates.
          Available for Ivaan Solar Energy only.
        </p>
      </div>

      {iseScopeError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {iseScopeError}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Button asChild disabled>
              <Link href="/documentation/document-generator/generate">Generate documents</Link>
            </Button>
            {isAdmin ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/documentation/document-generator/admin/templates">Manage templates</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/documentation/document-generator/admin/fields">Manage data fields</Link>
                </Button>
              </>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">
            Super Admin can configure fields and templates (PDF background, canvas, or rich text),
            validate, preview, and publish versions. Document sets and customer generation arrive in
            Phase 3.
          </p>
        </>
      )}
    </div>
  );
}
