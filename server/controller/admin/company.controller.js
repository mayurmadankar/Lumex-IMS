import prisma from "../../prisma/client.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import { getCountryIso2 } from "../../helper/validateCountry.js";
import { z } from "zod";

const companyFieldsSchema = z.object({
  name: z.string({ required_error: "name is required" }).trim().min(2, "name must be at least 2 characters"),

  code: z.string().trim().min(2, "code must be at least 2 characters").max(10, "code must be at most 10 characters").toUpperCase().optional(),

  country: z.string({ required_error: "country is required" }).trim().min(2, "country must be at least 2 characters"),

  companyEmail: z.string({ required_error: "companyEmail is required" }).trim().email("companyEmail must be a valid email").toLowerCase(),
});

const createCompanySchema = companyFieldsSchema.extend({
  defaultDepartmentName: z
    .string()
    .trim()
    .min(2, "defaultDepartmentName must be at least 2 characters")
    .default("office"),
});

const updateCompanyWithStatusSchema = companyFieldsSchema
  .extend({
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update",
  });

export const createCompany = async (req, res) => {
  const result = createCompanySchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    return sendError(res, "Validation failed", 400, errors);
  }

  const { name, code, country, companyEmail, defaultDepartmentName } = result.data;
  const countryIso2 = await getCountryIso2(country);

  if (!countryIso2) {
    return sendError(res, "Country is not available in country master", 400, {
      country: ["Select a valid country"],
    });
  }

  const orConditions = [{ companyEmail }];
  if (code) orConditions.push({ code });

  const existing = await prisma.company.findFirst({
    where: { OR: orConditions },
    select: { code: true, companyEmail: true },
  });

  if (existing) {
    const field = existing.code === code ? "code" : "email";
    return sendError(res, `A company with this ${field} already exists`, 409);
  }

  const company = await prisma.$transaction(async (tx) => {
    const createdCompany = await tx.company.create({
      data: { name, code, country: countryIso2, companyEmail },
    });

    const primaryDepartment = await tx.department.create({
      data: {
        name: defaultDepartmentName,
        country: countryIso2,
        description: "Primary department",
        companyId: createdCompany.id,
      },
    });

    await tx.company.update({
      where: { id: createdCompany.id },
      data: { primaryDepartmentId: primaryDepartment.id },
    });

    return tx.company.findUnique({
      where: { id: createdCompany.id },
      select: {
        id: true,
        name: true,
        code: true,
        country: true,
        companyEmail: true,
        status: true,
        createdAt: true,
        primaryDepartment: {
          select: {
            id: true,
            name: true,
            country: true,
            isActive: true,
          },
        },
        _count: {
          select: { departments: true },
        },
        departments: {
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
          },
          orderBy: { name: "asc" },
        },
      },
    });
  });

  return sendSuccess(res, "Company created successfully", { company }, 201);
};

export const getCompanies = async (req, res) => {
  const { status, search } = req.query;

  const where = {};

  if (status) {
    where.status = status.toUpperCase();
  }

  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { companyEmail: { contains: search, mode: "insensitive" } }, { country: { contains: search, mode: "insensitive" } }];
  }

  const companies = await prisma.company.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      code: true,
      country: true,
      companyEmail: true,
      status: true,
      createdAt: true,
      primaryDepartment: {
        select: {
          id: true,
          name: true,
          country: true,
          isActive: true,
        },
      },
      _count: {
        select: { departments: true },
      },
      departments: {
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  return sendSuccess(res, "Companies fetched successfully", { companies });
};

export const updateCompany = async (req, res) => {
  const { id } = req.params;

  const result = updateCompanyWithStatusSchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    return sendError(res, "Validation failed", 400, errors);
  }

  const data = result.data;

  if (data.country) {
    const countryIso2 = await getCountryIso2(data.country);
    if (!countryIso2) {
      return sendError(res, "Country is not available in country master", 400, {
        country: ["Select a valid country"],
      });
    }
    data.country = countryIso2;
  }

  const existing = await prisma.company.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) return sendError(res, "Company not found", 404);

  // Check for duplicate code/email on OTHER companies
  if (data.code || data.companyEmail) {
    const orConditions = [];
    if (data.code) orConditions.push({ code: data.code });
    if (data.companyEmail) orConditions.push({ companyEmail: data.companyEmail });

    const duplicate = await prisma.company.findFirst({
      where: {
        OR: orConditions,
        NOT: { id },
      },
      select: { code: true, companyEmail: true },
    });

    if (duplicate) {
      const field = duplicate.code === data.code ? "code" : "email";
      return sendError(res, `A company with this ${field} already exists`, 409);
    }
  }

  const company = await prisma.company.update({
    where: { id },
    data,
  });

  return sendSuccess(res, "Company updated successfully", { company });
};

export const getCompany = async (req, res) => {
  const { id } = req.params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      primaryDepartment: {
        select: {
          id: true,
          name: true,
          country: true,
          isActive: true,
          description: true,
        },
      },
      departments: {
        select: {
          id: true,
          name: true,
          country: true,
          isActive: true,
          description: true,
          _count: {
            select: { userAccesses: true },
          },
        },
      },
    },
  });

  if (!company) return sendError(res, "Company not found", 404);

  return sendSuccess(res, "Company fetched successfully", { company });
};
