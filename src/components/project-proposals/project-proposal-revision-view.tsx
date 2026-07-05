"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRevisionProposalLabel } from "@/lib/project-proposals";
import { formatDocumentDate } from "@/lib/utils";

type RevisionView = {
  revisionNo: number;
  proposalDate: string;
  validityDate: string;
  customerName: string;
  customerMobile: string;
  shortAddress: string;
  finalAmount: number;
  discountAmount: number;
  subsidyEstimate: number;
  effectiveCustomerInvestment: number;
  basePackageAmount: number;
  brandUpgradeAmount: number;
  inverterUpgradeAmount: number;
  threePhaseAmount: number;
  structureAdjustmentAmount: number;
  extraFloorAmount: number;
  futureStructureAmount: number;
  ndcrPanelAmount: number;
  dcrPanelAmount: number;
  additionalCostAmount: number;
  package: { code: string; name: string; panelWp: number; panelCount: number };
  connectionPhase: string;
  structureType: string;
  buildingType: string;
  extraFloors: number;
  futureStructurePanels: number;
  dcrAdditionalPanels: number;
  ndcrAdditionalPanels: number;
  inverterBrands: string[];
  inverterUpgrade?: { label: string } | null;
  notes?: string | null;
};

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export function ProjectProposalRevisionView({
  proposalId,
  proposalNo,
  currentRevisionNo,
  revision,
}: {
  proposalId: string;
  proposalNo: string;
  currentRevisionNo: number;
  revision: RevisionView;
}) {
  const isActive = revision.revisionNo === currentRevisionNo;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{proposalNo}</h1>
          <p className="text-sm text-slate-500">
            {formatRevisionProposalLabel(revision.revisionNo)} · Read-only snapshot
          </p>
        </div>
        <Badge variant={isActive ? "success" : "default"} className="w-fit">
          {isActive ? "Active Revision" : "Previous Revision"}
        </Badge>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Previous revisions are read-only. Pricing and options shown here are frozen at the time this
        revision was saved.
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href={`/projects/proposals/${proposalId}`}>
            {isActive ? "Back to Proposal" : "View Current Proposal"}
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Name:</span> {revision.customerName}
            </p>
            <p>
              <span className="text-slate-500">Mobile:</span> {revision.customerMobile}
            </p>
            <p>
              <span className="text-slate-500">Address:</span> {revision.shortAddress}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Package & Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Package:</span> {revision.package.name}
            </p>
            <p>
              <span className="text-slate-500">Connection:</span>{" "}
              {revision.connectionPhase.replaceAll("_", " ")}
            </p>
            <p>
              <span className="text-slate-500">Structure:</span>{" "}
              {revision.structureType.replaceAll("_", " ")}
            </p>
            <p>
              <span className="text-slate-500">Building:</span> {revision.buildingType}
            </p>
            <p>
              <span className="text-slate-500">Floors above 2:</span> {revision.extraFloors}
            </p>
            <p>
              <span className="text-slate-500">Inverter brands:</span>{" "}
              {revision.inverterBrands.join(", ")}
            </p>
            {revision.inverterUpgrade ? (
              <p>
                <span className="text-slate-500">Inverter upgrade:</span>{" "}
                {revision.inverterUpgrade.label}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Proposal date:</span>{" "}
              {formatDocumentDate(revision.proposalDate)}
            </p>
            <p>
              <span className="text-slate-500">Valid until:</span>{" "}
              {formatDocumentDate(revision.validityDate)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pricing Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Base package:</span>{" "}
              {formatMoney(revision.basePackageAmount)}
            </p>
            <p>
              <span className="text-slate-500">Brand upgrade:</span>{" "}
              {formatMoney(revision.brandUpgradeAmount)}
            </p>
            <p>
              <span className="text-slate-500">Inverter upgrade:</span>{" "}
              {formatMoney(revision.inverterUpgradeAmount)}
            </p>
            <p>
              <span className="text-slate-500">Three phase:</span>{" "}
              {formatMoney(revision.threePhaseAmount)}
            </p>
            <p>
              <span className="text-slate-500">Structure adjustment:</span>{" "}
              {formatMoney(revision.structureAdjustmentAmount)}
            </p>
            <p>
              <span className="text-slate-500">Extra floors:</span>{" "}
              {formatMoney(revision.extraFloorAmount)}
            </p>
            <p>
              <span className="text-slate-500">Future structure:</span>{" "}
              {formatMoney(revision.futureStructureAmount)} ({revision.futureStructurePanels} panels)
            </p>
            <p>
              <span className="text-slate-500">DCR panels:</span>{" "}
              {formatMoney(revision.dcrPanelAmount)} ({revision.dcrAdditionalPanels} additional)
            </p>
            <p>
              <span className="text-slate-500">NDCR panels:</span>{" "}
              {formatMoney(revision.ndcrPanelAmount)} ({revision.ndcrAdditionalPanels} panels)
            </p>
            <p>
              <span className="text-slate-500">Discount:</span>{" "}
              {formatMoney(revision.discountAmount)}
            </p>
            <p>
              <span className="text-slate-500">Additional cost:</span>{" "}
              {formatMoney(revision.additionalCostAmount)}
            </p>
            <p className="border-t border-slate-200 pt-2 font-medium">
              <span className="text-slate-500">Final amount:</span>{" "}
              {formatMoney(revision.finalAmount)}
            </p>
            <p>
              <span className="text-slate-500">Estimated subsidy:</span>{" "}
              {formatMoney(revision.subsidyEstimate)}
            </p>
            <p>
              <span className="text-slate-500">Effective customer investment:</span>{" "}
              {formatMoney(revision.effectiveCustomerInvestment)}
            </p>
          </CardContent>
        </Card>
      </div>

      {revision.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-700">{revision.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
