"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Search, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DispatchTodayTile = {
  id: string;
  piNo: string;
  customer: { customerName: string };
  draft?: {
    vehicleNo: string | null;
    receiverName: string | null;
  };
};

export function DispatchTodayPanel({
  tiles,
  canManage,
  embedded = false,
}: {
  tiles: DispatchTodayTile[];
  canManage: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tiles;
    return tiles.filter((tile) => {
      const haystack = [
        tile.customer.customerName,
        tile.piNo,
        tile.draft?.receiverName ?? "",
        tile.draft?.vehicleNo ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [tiles, q]);

  function openTile(tile: DispatchTodayTile) {
    if (!canManage) return;
    router.push(`/inventory/dispatches/new?piId=${tile.id}`);
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dispatch</h1>
            <p className="text-sm text-slate-500">
              Planned dispatches for today. Open a tile to create the delivery challan.
            </p>
          </div>
          <Button variant="outline" asChild className="h-12">
            <Link href="/inventory/dispatches/challans">
              <FileText className="h-4 w-4" />
              Delivery Challans
            </Link>
          </Button>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Retail Dispatch</h2>
          <p className="text-sm text-slate-500">
            Planned dispatches for today. Open a tile to create the delivery challan.
          </p>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search customer, PI, receiver, vehicle…"
          className="h-12 pl-10 text-base"
          aria-label="Search today's dispatches"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 py-16 text-slate-500">
          <Package className="h-10 w-10" />
          <p>
            {tiles.length === 0
              ? "No PIs marked for dispatch today."
              : "No tiles match your search."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((tile) => {
            const href = `/inventory/dispatches/new?piId=${tile.id}`;
            return (
              <div
                key={tile.id}
                onClick={() => openTile(tile)}
                className={`rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition ${
                  canManage
                    ? "cursor-pointer hover:border-emerald-400 hover:shadow-md"
                    : ""
                }`}
              >
                {canManage ? (
                  <Link
                    href={href}
                    onClick={(event) => event.stopPropagation()}
                    className="text-lg font-semibold text-slate-900 underline-offset-2 hover:text-emerald-800 hover:underline"
                  >
                    {tile.customer.customerName}
                  </Link>
                ) : (
                  <p className="text-lg font-semibold text-slate-900">
                    {tile.customer.customerName}
                  </p>
                )}
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">PI Number</dt>
                    <dd className="font-medium text-slate-800">{tile.piNo}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Receiver</dt>
                    <dd className="font-medium text-slate-800">
                      {tile.draft?.receiverName?.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Vehicle</dt>
                    <dd className="font-medium text-slate-800">
                      {tile.draft?.vehicleNo?.trim() || "—"}
                    </dd>
                  </div>
                </dl>
                {canManage ? (
                  <Link
                    href={href}
                    onClick={(event) => event.stopPropagation()}
                    className="mt-4 inline-block text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Open dispatch →
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
