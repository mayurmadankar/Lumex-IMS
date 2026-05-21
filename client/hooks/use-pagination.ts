import { useCallback, useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE = 20;

export function usePagination<T>(
  items: T[],
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey: unknown = items,
) {
  const [pageState, setPageState] = useState({
    page: 1,
    pageSize,
    resetKey,
  });
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const shouldResetPage =
    pageState.pageSize !== pageSize || pageState.resetKey !== resetKey;
  const page = shouldResetPage ? 1 : Math.min(pageState.page, totalPages);
  const setPage = useCallback(
    (nextPage: number) => {
      setPageState({
        page: Math.min(Math.max(1, nextPage), totalPages),
        pageSize,
        resetKey,
      });
    },
    [pageSize, resetKey, totalPages],
  );

  const startIndex = (page - 1) * pageSize;
  const paginatedItems = useMemo(
    () => items.slice(startIndex, startIndex + pageSize),
    [items, pageSize, startIndex],
  );

  return {
    page,
    setPage,
    pageSize,
    total: items.length,
    totalPages,
    start: items.length === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + pageSize, items.length),
    paginatedItems,
  };
}
