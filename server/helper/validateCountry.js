import prisma from "../prisma/client.js";

export const getCountryIso2 = async (country) => {
  if (!country) return null;

  const value = String(country).trim();

  const found = await prisma.country.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: value, mode: "insensitive" } },
        { iso2: { equals: value.toUpperCase() } },
      ],
    },
    select: { iso2: true },
  });

  return found?.iso2 ?? null;
};

export const isValidCountry = async (country) => {
  const found = await getCountryIso2(country);
  return Boolean(found);
};

export const isValidStateForCountry = async ({ countryIso2, stateId }) => {
  if (!countryIso2 || !stateId) return false;

  const state = await prisma.state.findFirst({
    where: {
      id: String(stateId).trim(),
      isActive: true,
      country: {
        iso2: String(countryIso2).trim().toUpperCase(),
        isActive: true,
      },
    },
    select: { id: true },
  });

  return Boolean(state);
};

export const isValidCityForState = async ({ stateId, cityId }) => {
  if (!stateId || !cityId) return false;

  const city = await prisma.city.findFirst({
    where: {
      id: String(cityId).trim(),
      stateId: String(stateId).trim(),
      isActive: true,
      state: {
        isActive: true,
        country: { isActive: true },
      },
    },
    select: { id: true },
  });

  return Boolean(city);
};
