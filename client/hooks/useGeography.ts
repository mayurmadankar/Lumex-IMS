"use client";

import { useEffect, useState } from "react";

import { useCountries } from "./useCountries";

import { getStates } from "@/api/services/country.service";
import type { StateOption } from "@/api/services/country.service";
import { useAppSelector } from "@/store/hooks";

function useApiScope() {
  const role = useAppSelector((state) => state.auth.user?.role);
  return role === "ORG_ADMIN" ? "admin" : "user";
}

export function useGeography(countryIso2?: string) {
  const scope = useApiScope();
  const { countries, loading: countriesLoading } = useCountries();
  const [states, setStates] = useState<StateOption[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const normalizedCountryIso2 = countryIso2?.trim().toUpperCase();

    if (!normalizedCountryIso2) {
      setStates([]);
      return;
    }

    const loadStates = async () => {
      try {
        setStatesLoading(true);
        const response = await getStates(scope, normalizedCountryIso2);
        if (!cancelled) setStates(response.data.states ?? []);
      } catch {
        if (!cancelled) setStates([]);
      } finally {
        if (!cancelled) setStatesLoading(false);
      }
    };

    loadStates();

    return () => {
      cancelled = true;
    };
  }, [countryIso2, scope]);

  return {
    countries,
    states,
    loading: {
      countries: countriesLoading,
      states: statesLoading,
    },
  };
}
