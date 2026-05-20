function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function matchesTableSearch(values: unknown[], query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const searchableValues = values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(normalizeSearchValue);

  if (/^\d+$/.test(normalizedQuery)) {
    const exactNumberPattern = new RegExp(
      `(^|\\D)${escapeRegExp(normalizedQuery)}(?=\\D|$)`,
    );

    return searchableValues.some((value) => exactNumberPattern.test(value));
  }

  return searchableValues.some((value) => value.includes(normalizedQuery));
}
