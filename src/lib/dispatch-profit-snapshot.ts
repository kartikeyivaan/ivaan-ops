import type { Prisma, PrismaClient } from "@prisma/client";
import {
  calculateDispatchLineProfitBundle,
  resolveLineCogsExGst,
  type ProductPriceRow,
} from "@/lib/dispatch-profit";
import {
  commercialSubtotalsExGstByDispatchLine,
  loadKitBomMapForDispatches,
} from "@/lib/dispatch-value";

type DispatchForProfitSnapshot = {
  id: string;
  dispatchDate: Date;
  lines: Array<{
    id: string;
    productId: string;
    qty: Prisma.Decimal;
    product: {
      serialTracking: boolean;
      pricingType: import("@prisma/client").PricingType;
      capacity: Prisma.Decimal;
    };
    proformaInvoiceItem: {
      id: string;
      rate: Prisma.Decimal;
      gstRate: Prisma.Decimal;
      product: {
        id: string;
        pricingType: import("@prisma/client").PricingType;
        capacity: Prisma.Decimal;
        category: { name: string };
      };
    };
    serials: Array<{
      serial: {
        lot: {
          unitPurchaseRate: Prisma.Decimal;
          totalPurchaseCost: Prisma.Decimal;
          quantity: Prisma.Decimal;
        };
      };
    }>;
  }>;
};

export async function persistDispatchLineProfitSnapshots(
  tx: Prisma.TransactionClient,
  dispatch: DispatchForProfitSnapshot,
) {
  const productIds = [...new Set(dispatch.lines.map((line) => line.productId))];
  const prices = productIds.length
    ? await tx.productPrice.findMany({
        where: { productId: { in: productIds } },
        select: {
          productId: true,
          landingCost: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      })
    : [];

  const priceRows: ProductPriceRow[] = prices.map((price) => ({
    productId: price.productId,
    landingCost: price.landingCost,
    effectiveFrom: price.effectiveFrom,
    effectiveTo: price.effectiveTo,
  }));

  const kitBomMap = await loadKitBomMapForDispatches(tx, [dispatch]);
  const revenueByLine = commercialSubtotalsExGstByDispatchLine(
    dispatch.lines.map((line) => ({
      productId: line.productId,
      qty: line.qty,
      product: line.product,
      proformaInvoiceItem: line.proformaInvoiceItem,
    })),
    kitBomMap,
  );

  const snapshottedAt = new Date();

  for (let index = 0; index < dispatch.lines.length; index += 1) {
    const line = dispatch.lines[index]!;
    const revenueExGst = revenueByLine[index] ?? 0;
    const { cogsExGst, costSource } = resolveLineCogsExGst(
      {
        productId: line.productId,
        qty: line.qty,
        serialTracking: line.product.serialTracking,
        serialLots: line.serials.map((entry) => entry.serial.lot),
      },
      dispatch.dispatchDate,
      priceRows,
    );
    const bundle = calculateDispatchLineProfitBundle(revenueExGst, cogsExGst);

    await tx.dispatchLine.update({
      where: { id: line.id },
      data: {
        revenueExGst: bundle.revenueExGst,
        cogsExGst: bundle.cogsExGst,
        profitExGst: bundle.profitExGst,
        marginPercent: bundle.marginPercent,
        costSource,
        profitSnapshottedAt: snapshottedAt,
      },
    });
  }
}

export async function backfillDispatchProfitSnapshots(
  prisma: PrismaClient,
  companyId: string,
  dispatchId: string,
) {
  const dispatch = await prisma.dispatch.findFirst({
    where: { id: dispatchId, companyId, status: "DISPATCHED" },
    include: {
      lines: {
        include: {
          product: true,
          proformaInvoiceItem: {
            include: { product: { include: { category: true } } },
          },
          serials: {
            include: {
              serial: {
                select: {
                  lot: {
                    select: {
                      unitPurchaseRate: true,
                      totalPurchaseCost: true,
                      quantity: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!dispatch) return false;

  await prisma.$transaction((tx) => persistDispatchLineProfitSnapshots(tx, dispatch));
  return true;
}
