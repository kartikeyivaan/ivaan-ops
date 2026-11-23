import { prisma } from "@/lib/prisma";
import {
  canViewMonthlyAudit,
  mapMonthlyAuditError,
  requireMonthlyAuditUser,
} from "@/lib/monthly-serial-audit-api";

type Params = { params: Promise<{ id: string }> };

/**
 * GET: one row per serialized product that had stock at start, plus a row for
 * new unknown serials. In Stock = serials in the snapshot (all companies and
 * warehouses added together). Scanned = FOUND scans for the product so far,
 * across all auditors.
 */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireMonthlyAuditUser(canViewMonthlyAudit);
  if ("response" in guard) return guard.response;

  const { id } = await params;
  try {
    const audit = await prisma.inventoryMonthlyAudit.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!audit) throw new Error("NOT_FOUND");

    const [inStock, scannedByProduct, additional, products] = await Promise.all([
      prisma.inventoryMonthlyAuditSnapshot.groupBy({
        by: ["productId"],
        where: { auditId: id },
        _count: { _all: true },
      }),
      prisma.$queryRaw<{ product_id: string; scanned: bigint }[]>`
        SELECT s.product_id, COUNT(*)::bigint AS scanned
        FROM inventory_monthly_audit_scans sc
        JOIN inventory_serials s ON s.id = sc.matched_serial_id
        WHERE sc.audit_id = ${id}::uuid AND sc.result = 'FOUND'
        GROUP BY s.product_id
      `,
      prisma.inventoryMonthlyAuditScan.count({
        where: { auditId: id, result: "ADDITIONAL" },
      }),
      prisma.product.findMany({
        where: { serialTracking: true },
        select: { id: true, displayName: true },
      }),
    ]);

    const nameById = new Map(products.map((p) => [p.id, p.displayName]));
    const scannedMap = new Map(scannedByProduct.map((r) => [r.product_id, Number(r.scanned)]));

    const rows = inStock
      .map((row) => ({
        productId: row.productId,
        product: nameById.get(row.productId) ?? "Unknown product",
        inStock: row._count._all,
        scanned: scannedMap.get(row.productId) ?? 0,
        isUnknown: false,
      }))
      .sort((a, b) => a.product.localeCompare(b.product));

    rows.push({
      productId: "",
      product: "New Unknown Serial Numbers",
      inStock: 0,
      scanned: additional,
      isUnknown: true,
    });

    return Response.json({ rows });
  } catch (error) {
    return mapMonthlyAuditError(error, "Failed to load serial summary.");
  }
}
