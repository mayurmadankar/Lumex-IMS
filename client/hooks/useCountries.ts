"use client";

import { useEffect, useState } from "react";

import { getCountries } from "@/api/services/country.service";
import type { CountryOption } from "@/api/services/country.service";
import { useAppSelector } from "@/store/hooks";

export function useCountries() {
  const role = useAppSelector((state) => state.auth.user?.role);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCountries = async () => {
      try {
        setLoading(true);
        const scope = role === "ORG_ADMIN" ? "admin" : "user";
        const response = await getCountries(scope);
        setCountries(response.data.countries ?? []);
      } catch {
        setCountries([]);
      } finally {
        setLoading(false);
      }
    };

    loadCountries();
  }, [role]);

  return { countries, loading };
}
