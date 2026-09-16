"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  describePiRowProducts,
  formatPiLineQty,
  formatPiLineQtyUnit,
  getPiLineDispatch,
  getPiRowProductPresentation,
  type PiRowProductItem,
} from "@/lib/pi-row-products";
import { formatProformaStatus, isReadyForDispatch } from "@/lib/proforma-invoices";
import { formatCurrency } from "@/lib/quotations";
import { cn, formatDocumentDate } from "@/lib/utils";

export type ProformaInvoiceListItem = {
  id: string;
  piNo: string;
  status: string;
  piDate: string;
  totalValue: number;
  customer: { customerName: string; customerCode: string };
  salesUser: { name: string };
  paymentSummary: {
    totalPaid: number;
    outstanding: number;
    readyForDispatch?: boolean;
  };
  canEdit?: boolean;
  canUnbook?: boolean;
  items?: PiRowProductItem[];
};

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "ISSUED") return "success";
  if (status === "BOOKED") return "success";
  if (status === "FULLY_DISPATCHED") return "success";
  if (status === "PENDING_BOOKING" || status === "CANCEL_PENDING") return "warning";
  if (status === "CLOSED_PARTIAL") return "warning";
  if (status === "CANCELLED") return "danger";
  return "default";
}

function useMiddleOverlayWidth(enabled: boolean) {
  const startRef = useRef<HTMLTableCellElement | null>(null);
  const endRef = useRef<HTMLTableCellElement | null>(null);
  const [width, setWidth] = useState(0);

  const assignStart = useCallback((node: HTMLTableCellElement | null) => {
    startRef.current = node;
  }, []);
  const assignEnd = useCallback((node: HTMLTableCellElement | null) => {
    endRef.current = node;
  }, []);

  useLayoutEffect(() => {
    if (!enabled) {
      setWidth(0);
      return;
    }
    const start = startRef.current;
    const end = endRef.current;
    if (!start || !end) return;

    const update = () => {
      const next = Math.max(0, end.offsetLeft - start.offsetLeft);
      setWidth((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    };
    update();

    const table = start.closest("table");
    const observer = new ResizeObserver(update);
    observer.observe(start);
    observer.observe(end);
    if (table) observer.observe(table);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return { width, assignStart, assignEnd };
}

function PiRowProductsView({
  items,
  compact = false,
}: {
  items: PiRowProductItem[];
  compact?: boolean;
}) {
  const presentation = getPiRowProductPresentation(items);
  const showInline = compact || presentation.mode === "inline";

  if (showInline) {
    return (
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] leading-5 text-slate-700">
        {presentation.visible.map((item, index) => (
          <span key={item.id} className="inline-flex min-w-0 max-w-full items-baseline gap-1.5">
            {index > 0 ? <span className="shrink-0 text-slate-300">•</span> : null}
            <span className="truncate font-medium text-slate-800">{item.product.displayName}</span>
            <span className="shrink-0 tabular-nums text-slate-500">
              × {formatPiLineQty(item.qty)}
            </span>
          </span>
        ))}
        {presentation.moreCount > 0 ? (
          <span className="shrink-0 text-slate-500">
            <span className="text-slate-300">•</span> +{presentation.moreCount} more
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col justify-center gap-0.5">
      {presentation.visible.map((item) => {
        const { dispatched, remaining } = getPiLineDispatch(item);
        return (
          <div
            key={item.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 text-[13px] leading-5"
          >
            <span className="truncate font-medium text-slate-800">{item.product.displayName}</span>
            <span className="shrink-0 whitespace-nowrap text-slate-600">
              <span className="tabular-nums">× {formatPiLineQty(item.qty)}</span>
              <span className="ml-1 text-slate-400">
                {formatPiLineQtyUnit(item.product.capacityUnit)}
              </span>
              {dispatched > 0 ? (
                <span className="ml-2 text-slate-500">
                  — {formatPiLineQty(dispatched)} Dispatched
                  {remaining > 0 ? ` — ${formatPiLineQty(remaining)} Remaining` : ""}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PiListRow({
  row,
  canManage,
  loading,
  onUnbook,
}: {
  row: ProformaInvoiceListItem;
  canManage: boolean;
  loading: boolean;
  onUnbook: (id: string) => void;
}) {
  const router = useRouter();
  const items = row.items ?? [];
  const hasProducts = items.length > 0;
  const presentation = getPiRowProductPresentation(items);
  const stackedCount = presentation.mode === "stacked" ? presentation.visible.length : 0;
  const { width: overlayWidth, assignStart, assignEnd } = useMiddleOverlayWidth(hasProducts);
  const productDescription = describePiRowProducts(items);

  return (
    <TableRow
      className={cn(
        "pi-list-row cursor-pointer focus-within:bg-slate-50",
        hasProducts && "pi-list-row--has-products",
        stackedCount === 2 && "pi-list-row--stacked-2",
        stackedCount >= 3 && "pi-list-row--stacked-3",
      )}
      onClick={() => router.push(`/sales/proforma-invoices/${row.id}`)}
    >
      <TableCell data-label="PI No" className="pi-list-row-anchor font-medium">
        {row.piNo}
        {productDescription ? (
          <span className="sr-only max-md:hidden">. Products: {productDescription}</span>
        ) : null}
      </TableCell>
      <TableCell
        ref={assignStart}
        data-label="Customer"
        className="pi-list-row-middle relative"
      >
        <div className="grid">
          <div className="pi-row-summary col-start-1 row-start-1">{row.customer.customerName}</div>
          {stackedCount >= 2 ? (
            <div
              className="col-start-1 row-start-1 hidden md:block"
              style={{ height: stackedCount >= 3 ? "3.25rem" : "2.5rem" }}
              aria-hidden
            />
          ) : null}
        </div>
        {hasProducts && overlayWidth > 0 ? (
          <div
            className="pi-row-products-overlay absolute top-0 left-0 z-[1] hidden h-full items-center overflow-hidden px-4 md:flex"
            style={{ width: overlayWidth }}
            aria-hidden="true"
          >
            <div className="w-full min-w-0">
              <PiRowProductsView items={items} />
            </div>
          </div>
        ) : null}
      </TableCell>
      <TableCell data-label="Executive" className="pi-list-row-middle">
        <div className="pi-row-summary">{row.salesUser.name}</div>
      </TableCell>
      <TableCell data-label="Date" className="pi-list-row-middle">
        <div className="pi-row-summary">{formatDocumentDate(row.piDate)}</div>
      </TableCell>
      <TableCell data-label="Status" className="pi-list-row-middle">
        <div className="pi-row-summary">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={statusVariant(row.status)}>
              {formatProformaStatus(row.status)}
            </Badge>
            {(row.paymentSummary.readyForDispatch ??
              isReadyForDispatch(row.status, row.paymentSummary.outstanding)) ? (
              <Badge variant="success">Ready for Dispatch</Badge>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell data-label="Total" className="pi-list-row-middle text-right">
        <div className="pi-row-summary">{formatCurrency(row.totalValue)}</div>
      </TableCell>
      <TableCell data-label="Outstanding" className="pi-list-row-middle text-right">
        <div className="pi-row-summary">{formatCurrency(row.paymentSummary.outstanding)}</div>
      </TableCell>
      {hasProducts ? (
        <TableCell data-label="Products" className="md:hidden">
          <PiRowProductsView items={items} compact />
        </TableCell>
      ) : null}
      <TableCell ref={assignEnd} className="pi-list-row-anchor">
        <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          {canManage && row.canEdit ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/sales/proforma-invoices/${row.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canManage && row.canUnbook ? (
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => onUnbook(row.id)}
            >
              Unbook
            </Button>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/sales/proforma-invoices/${row.id}`}>View</Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
