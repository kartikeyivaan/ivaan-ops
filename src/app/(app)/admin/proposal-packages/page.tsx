import { redirect } from "next/navigation";

/** @deprecated Use /projects/quotations (Projects Quotation). */
export default function ProposalPackagesAdminRedirectPage() {
  redirect("/projects/quotations");
}
