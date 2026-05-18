import prisma from "../../prisma/client.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import { z } from "zod";

const createAccountTypeSchema = z.object({
  name: z.string({ required_error: "name is required" }).trim().min(2, "name must be at least 2 characters"),
});

const updateAccountTypeSchema = z.object({
  name: z.string({ required_error: "name is required" }).trim().min(2, "name must be at least 2 characters"),
});

export const createAccountType = async (req, res) => {
  const result = createAccountTypeSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.formErrors.fieldErrors);
  }

  const { name } = result.data;

  const existing = await prisma.accountType.findFirst({
    where: { name }
  });

  if (existing) {
    return sendError(res, "Account Type with this name already exists", 409);
  }

  const accountType = await prisma.accountType.create({
    data: { name },
  });

  return sendSuccess(res, "Account Type created successfully", { accountType }, 201);
};

export const getAccountTypes = async (req, res) => {
  const accountTypes = await prisma.accountType.findMany({
    orderBy: { createdAt: "desc" }
  });

  return sendSuccess(res, "Account Types retrieved successfully", { accountTypes }, 200);
};

export const getAccountTypeById = async (req, res) => {
  const { id } = req.params;

  const accountType = await prisma.accountType.findUnique({
    where: { id }
  });

  if (!accountType) return sendError(res, "Account Type not found", 404);

  return sendSuccess(res, "Account Type retrieved successfully", { accountType }, 200);
};

export const updateAccountType = async (req, res) => {
  const { id } = req.params;
  const result = updateAccountTypeSchema.safeParse(req.body);
  
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.formErrors.fieldErrors);
  }

  const { name } = result.data;

  const existing = await prisma.accountType.findUnique({
    where: { id }
  });

  if (!existing) return sendError(res, "Account Type not found", 404);

  const nameConflict = await prisma.accountType.findFirst({
    where: { 
      name,
      id: { not: id }
    }
  });

  if (nameConflict) return sendError(res, "Another Account Type with this name already exists", 409);

  const updatedAccountType = await prisma.accountType.update({
    where: { id },
    data: { name }
  });

  return sendSuccess(res, "Account Type updated successfully", { accountType: updatedAccountType }, 200);
};
