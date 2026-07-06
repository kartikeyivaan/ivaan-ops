export const NDCR_COMPLETE_PACKAGE_CODE = "NDCR_COMPLETE";

export function isNdcrCompletePackage(code: string | null | undefined): boolean {
  return code === NDCR_COMPLETE_PACKAGE_CODE;
}
