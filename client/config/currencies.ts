export const CURRENCY_OPTIONS = ["USD", "INR", "AED"] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number];

export const DEFAULT_CURRENCY: CurrencyCode = "USD";
