import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CurrencyRate = {
  code: string;
  rate: string;
  change: string;
  up: boolean;
};

type FrankfurterRateItem = {
  date: string;
  base: string;
  quote: string;
  rate: number;
};

type UseCurrencyRatesProps = {
  baseCurrency: string;
  symbols: string[];
  refreshInterval?: number;
};

type UseCurrencyRatesReturn = {
  rates: CurrencyRate[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  baseCurrency: string;
  refetch: () => Promise<void>;
};

function getPrevBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);

  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);

  return d.toISOString().split("T")[0];
}

async function fetchRates(
  baseCurrency: string,
  symbols: string[],
  date?: string
): Promise<FrankfurterRateItem[]> {
  const params = new URLSearchParams({
    base: baseCurrency,
    quotes: symbols.join(","),
  });

  if (date) {
    params.set("date", date);
  }

  const res = await fetch(
    `https://api.frankfurter.dev/v2/rates?${params.toString()}`
  );

  if (!res.ok) {
    throw new Error(`Frankfurter ${res.status}`);
  }

  return res.json();
}

function toRateMap(data: FrankfurterRateItem[]): Record<string, number> {
  return data.reduce<Record<string, number>>((acc, item) => {
    acc[item.quote] = item.rate;
    return acc;
  }, {});
}

function getLastUpdated(data: FrankfurterRateItem[]): string | null {
  return data[0]?.date ?? null;
}

function formatRates(
  today: Record<string, number>,
  prev: Record<string, number>,
  symbols: string[]
): CurrencyRate[] {
  return symbols.map((code) => {
    const current = today[code] ?? 0;
    const previous = prev[code] ?? current;
    const percentChange =
      previous !== 0 ? ((current - previous) / previous) * 100 : 0;

    return {
      code,
      rate: current.toFixed(2),
      change: `${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(2)}%`,
      up: percentChange >= 0,
    };
  });
}

export function useCurrencyRates({
  baseCurrency,
  symbols,
  refreshInterval = 60 * 60 * 1000,
}: UseCurrencyRatesProps): UseCurrencyRatesReturn {
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const symbolsKey = symbols.join(",");
  const selectedSymbols = useMemo(
    () => symbolsKey.split(",").filter(Boolean),
    [symbolsKey],
  );

  const load = useCallback(async () => {
    try {
      setError(null);

      const [todayRaw, prevRaw] = await Promise.all([
        fetchRates(baseCurrency, selectedSymbols),
        fetchRates(baseCurrency, selectedSymbols, getPrevBusinessDay()),
      ]);

      const todayMap = toRateMap(todayRaw);
      const prevMap = toRateMap(prevRaw);

      setRates(formatRates(todayMap, prevMap, selectedSymbols));
      setLastUpdated(getLastUpdated(todayRaw));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch currency rates");
    } finally {
      setLoading(false);
    }
  }, [baseCurrency, selectedSymbols]);

  useEffect(() => {
    setLoading(true);
    load();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(load, refreshInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load, refreshInterval]);

  return {
    rates,
    loading,
    error,
    lastUpdated,
    baseCurrency,
    refetch: load,
  };
}
