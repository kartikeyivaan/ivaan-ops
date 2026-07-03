import { PROJECT_PROPOSAL_VALIDITY_DAYS } from "@/lib/project-proposal-pricing";
import { signProjectProposalShareToken } from "@/lib/share-token";
import {
  buildProjectProposalWhatsappMessage,
  normalizeMobileForWhatsapp,
  PROJECT_PROPOSAL_PDF_LINK_PLACEHOLDER,
} from "@/lib/whatsapp";

const SHARE_LINK_TTL_DAYS = PROJECT_PROPOSAL_VALIDITY_DAYS;

type ProjectProposalRevisionShare = {
  revisionNo: number;
  customerName: string;
  customerMobile: string;
  finalAmount: number;
  subsidyEstimate: number;
  effectiveCustomerInvestment: number;
};

type ProjectProposalShareInput = {
  id: string;
  proposalNo: string;
  currentRevisionNo: number;
  revisions: ProjectProposalRevisionShare[];
};

function appBaseUrl(): string {
  return (process.env.APP_URL ?? "").replace(/\/$/, "");
}

function currentRevision(input: ProjectProposalShareInput) {
  return (
    input.revisions.find((revision) => revision.revisionNo === input.currentRevisionNo) ??
    input.revisions[input.revisions.length - 1]
  );
}

export function buildProjectProposalPublicPdfUrl(proposalId: string): string | null {
  const base = appBaseUrl();
  if (!base) return null;

  const token = signProjectProposalShareToken(proposalId, SHARE_LINK_TTL_DAYS);
  return `${base}/api/share/project-proposal?token=${encodeURIComponent(token)}`;
}

function buildMessageForRevision(
  proposal: ProjectProposalShareInput,
  revision: ProjectProposalRevisionShare,
) {
  const pdfUrl = buildProjectProposalPublicPdfUrl(proposal.id);
  return buildProjectProposalWhatsappMessage({
    customerName: revision.customerName,
    proposalNo: proposal.proposalNo,
    finalAmount: revision.finalAmount,
    subsidyAmount: revision.subsidyEstimate,
    effectivePrice: revision.effectiveCustomerInvestment,
    pdfUrl: pdfUrl ?? PROJECT_PROPOSAL_PDF_LINK_PLACEHOLDER,
  });
}

export function buildProjectProposalWhatsappUrl(
  proposal: ProjectProposalShareInput,
): string | null {
  const revision = currentRevision(proposal);
  if (!revision) return null;

  const number = normalizeMobileForWhatsapp(revision.customerMobile);
  if (!number) return null;

  const message = buildMessageForRevision(proposal, revision);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function buildProjectProposalSharePayload(proposal: ProjectProposalShareInput) {
  const revision = currentRevision(proposal);
  const pdfUrl = buildProjectProposalPublicPdfUrl(proposal.id);
  const whatsappUrl = buildProjectProposalWhatsappUrl(proposal);
  const message = revision ? buildMessageForRevision(proposal, revision) : null;

  return {
    pdfUrl: pdfUrl ?? PROJECT_PROPOSAL_PDF_LINK_PLACEHOLDER,
    whatsappUrl,
    message,
  };
}
