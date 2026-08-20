import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { KpiStripDto } from "@/lib/report-builders";
import {
  buildKpiHref,
  formatChangePercent,
  formatCompactNumber,
  formatCurrency,
} from "@/components/dashboard/dashboard-formatters";

type KpiStripProps = {
  data: KpiStripDto;
  salesUserId?: string;
};

export function KpiStrip({ data, salesUserId }: KpiStripProps) {
  const cards = [
    {
      label: "Quotation Value",
      metric: data.quotationValue,
      href: buildKpiHref("quotation", data.fromDate, data.toDate, salesUserId),
      format: formatCurrency,
    },
    {
      label: "PI Value",
      metric: data.piValue,
      href: buildKpiHref("pi", data.fromDate, data.toDate, salesUserId),
      format: formatCurrency,
    },
    {
      label: "Collection Value",
      metric: data.collectionValue,
      href: buildKpiHref("collection", data.fromDate, data.toDate, salesUserId),
      format: formatCurrency,
    },
    {
      label: "Dispatched Value",
      metric: data.dispatchedValue,
      href: buildKpiHref("dispatch", data.fromDate, data.toDate, salesUserId),
      format: formatCurrency,
    },
    {
      label: "Module Units",
      metric: data.moduleUnits,
      href: buildKpiHref("modules", data.fromDate, data.toDate, salesUserId),
      format: (value: number) => `${formatCompactNumber(value)} units`,
    },
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <Link key={card.label} href={card.href} className="block">
          <Card className="h-full transition-colors hover:border-emerald-300">
            <CardContent className="p-4">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {card.format(card.metric.current)}
              </p>
              <ChangeLine changePercent={card.metric.changePercent} />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function ChangeLine({ changePercent }: { changePercent: number | null }) {
  const text = formatChangePercent(changePercent);
  if (!text) {
    return <p className="mt-1 text-xs text-slate-400">No prior period data</p>;
  }
  const positive = (changePercent ?? 0) >= 0;
  return (
    <p className={`mt-1 text-xs font-medium ${positive ? "text-emerald-700" : "text-red-700"}`}>
      {text}
    </p>
  );
}
