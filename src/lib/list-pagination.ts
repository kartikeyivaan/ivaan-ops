export const DEFAULT_LIST_PAGE_SIZE = 50;
export const MAX_LIST_PAGE_SIZE = 200;

export type PaginatedList<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListPaginationInput = {
  page?: number;
  pageSize?: number;
  /** Load all matching rows (pickers / nested customer docs). */
  unpaged?: boolean;
};

export function resolveListPagination(filters: ListPaginationInput): {
  page: number;
  pageSize: number;
  skip: number;
  take: number | undefined;
  unpaged: boolean;
} {
  const unpaged = Boolean(filters.unpaged);
  if (unpaged) {
    return { page: 1, pageSize: 0, skip: 0, take: undefined, unpaged: true };
  }
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    MAX_LIST_PAGE_SIZE,
    Math.max(1, filters.pageSize ?? DEFAULT_LIST_PAGE_SIZE),
  );
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    unpaged: false,
  };
}

export function toPaginatedList<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedList<T> {
  return { items, total, page, pageSize: pageSize || Math.max(total, 1) };
}
