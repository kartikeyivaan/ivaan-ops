export const PCM_NON_MODULE_WARNING =
  "PCM primarily handles module sales. This quotation includes non-module items. Please verify the selected company, pricing and stock before saving.";
export const CROSS_COMPANY_STOCK_WARNING =
  "Higher available stock for one or more selected items exists in another company. Review company-wise availability before finalising the quotation.";

export type QuotationWarningType =
  | "PCM_NON_MODULE"
  | "CROSS_COMPANY_STOCK";

export type QuotationWarningItem = {
  productId: string;
  sku?: string | null;
  categoryName: string;
};

export type WarningCompany = {
  id: string;
  name: string;
  code?: string | null;
};

export type CompanyStockAvailability = {
  productId: string;
  companyId: string;
  companyName: string;
  availableQuantity: number;
};

export type CrossCompanyStockWarningDetail = {
  productId: string;
  sku: string | null;
  selectedCompanyAvailability: number;
  otherCompanyId: string;
  otherCompanyName: string;
  otherCompanyAvailability: number;
};

export type QuotationWarning = {
  type: QuotationWarningType;
  message: string;
  blocking: false;
  productIds: string[];
  details: CrossCompanyStockWarningDetail[];
};

export type EvaluateQuotationWarningsInput = {
  selectedCompany: WarningCompany;
  items: readonly QuotationWarningItem[];
  stockAvailability?: readonly CompanyStockAvailability[];
  permittedCompanyIds?: readonly string[];
};

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

export function isPcmCompany(company: WarningCompany): boolean {
  const code = normalized(company.code ?? "");
  const name = normalized(company.name);
  return code.includes("PCM") || name.includes("PCM");
}

export function isModuleCategory(categoryName: string): boolean {
  return normalized(categoryName).includes("MODULE");
}

export function evaluatePcmNonModuleWarning(
  selectedCompany: WarningCompany,
  items: readonly QuotationWarningItem[],
): QuotationWarning | null {
  if (!isPcmCompany(selectedCompany)) {
    return null;
  }

  const productIds = [
    ...new Set(
      items
        .filter((item) => !isModuleCategory(item.categoryName))
        .map((item) => item.productId),
    ),
  ];

  if (productIds.length === 0) {
    return null;
  }

  return {
    type: "PCM_NON_MODULE",
    message: PCM_NON_MODULE_WARNING,
    blocking: false,
    productIds,
    details: [],
  };
}

export function evaluateCrossCompanyStockWarning(
  selectedCompanyId: string,
  items: readonly QuotationWarningItem[],
  stockAvailability: readonly CompanyStockAvailability[],
  permittedCompanyIds?: readonly string[],
): QuotationWarning | null {
  const permitted = permittedCompanyIds
    ? new Set(permittedCompanyIds)
    : null;
  const itemByProductId = new Map(items.map((item) => [item.productId, item]));
  const selectedAvailability = new Map<string, number>();
  const otherAvailability = new Map<string, CompanyStockAvailability>();

  for (const stock of stockAvailability) {
    if (stock.companyId === selectedCompanyId) {
      selectedAvailability.set(
        stock.productId,
        (selectedAvailability.get(stock.productId) ?? 0) + stock.availableQuantity,
      );
    } else if (!permitted || permitted.has(stock.companyId)) {
      const key = `${stock.productId}\u0000${stock.companyId}`;
      const current = otherAvailability.get(key);
      otherAvailability.set(key, {
        ...stock,
        availableQuantity:
          (current?.availableQuantity ?? 0) + stock.availableQuantity,
      });
    }
  }

  const details: CrossCompanyStockWarningDetail[] = [];
  for (const stock of otherAvailability.values()) {
    const item = itemByProductId.get(stock.productId);
    if (!item) {
      continue;
    }

    const selected = selectedAvailability.get(stock.productId) ?? 0;
    if (stock.availableQuantity > selected) {
      details.push({
        productId: stock.productId,
        sku: item.sku ?? null,
        selectedCompanyAvailability: selected,
        otherCompanyId: stock.companyId,
        otherCompanyName: stock.companyName,
        otherCompanyAvailability: stock.availableQuantity,
      });
    }
  }

  if (details.length === 0) {
    return null;
  }

  return {
    type: "CROSS_COMPANY_STOCK",
    message: CROSS_COMPANY_STOCK_WARNING,
    blocking: false,
    productIds: [...new Set(details.map((detail) => detail.productId))],
    details,
  };
}

export function evaluateQuotationWarnings(
  input: EvaluateQuotationWarningsInput,
): QuotationWarning[] {
  const warnings: QuotationWarning[] = [];
  const pcmWarning = evaluatePcmNonModuleWarning(
    input.selectedCompany,
    input.items,
  );
  if (pcmWarning) warnings.push(pcmWarning);

  const stockWarning = evaluateCrossCompanyStockWarning(
    input.selectedCompany.id,
    input.items,
    input.stockAvailability ?? [],
    input.permittedCompanyIds,
  );
  if (stockWarning) warnings.push(stockWarning);

  return warnings;
}
