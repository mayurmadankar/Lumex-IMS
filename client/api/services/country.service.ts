import axiosInstance from "@/api/axios";

type Scope = "admin" | "user";

export type CountryOption = {
  id: string;
  name: string;
  iso2: string;
  phoneCode?: string | null;
};

export type StateOption = {
  id: string;
  name: string;
  code: string;
  countryIso2: string;
};

export type CityOption = {
  id: string;
  name: string;
  stateId: string;
};

export async function getCountries(scope: Scope) {
  const response = await axiosInstance.get(`/api/${scope}/countries`);
  return response.data;
}

export async function getStates(scope: Scope, countryIso2: string) {
  const response = await axiosInstance.get(
    `/api/${scope}/countries/${countryIso2}/states`
  );
  return response.data;
}

export async function getCities(scope: Scope, stateId: string) {
  const response = await axiosInstance.get(`/api/${scope}/states/${stateId}/cities`);
  return response.data;
}
