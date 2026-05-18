import prisma from "../../prisma/client.js";
import { sendError, sendSuccess } from "../../helper/response.js";

export const getCountries = async (_req, res) => {
  const countries = await prisma.country.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      iso2: true,
      phoneCode: true,
    },
  });

  return sendSuccess(res, "Countries retrieved successfully", { countries });
};

export const getStates = async (req, res) => {
  const countryIso2 = String(req.params.countryIso2 ?? "").trim().toUpperCase();

  if (!countryIso2) {
    return sendError(res, "countryIso2 is required", 400, {
      countryIso2: ["Select a valid country"],
    });
  }

  const country = await prisma.country.findFirst({
    where: { iso2: countryIso2, isActive: true },
    select: { id: true, iso2: true },
  });

  if (!country) {
    return sendError(res, "Country not found", 404, {
      countryIso2: ["Select a valid country"],
    });
  }

  const states = await prisma.state.findMany({
    where: {
      countryId: country.id,
      isActive: true,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
    },
  });

  return sendSuccess(res, "States retrieved successfully", {
    states: states.map((state) => ({
      ...state,
      countryIso2: country.iso2,
    })),
  });
};

export const getCities = async (req, res) => {
  const stateId = String(req.params.stateId ?? "").trim();

  if (!stateId) {
    return sendError(res, "stateId is required", 400, {
      stateId: ["Select a valid state"],
    });
  }

  const state = await prisma.state.findFirst({
    where: {
      id: stateId,
      isActive: true,
      country: { isActive: true },
    },
    select: { id: true },
  });

  if (!state) {
    return sendError(res, "State not found", 404, {
      stateId: ["Select a valid state"],
    });
  }

  const cities = await prisma.city.findMany({
    where: {
      stateId: state.id,
      isActive: true,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      stateId: true,
    },
  });

  return sendSuccess(res, "Cities retrieved successfully", { cities });
};
