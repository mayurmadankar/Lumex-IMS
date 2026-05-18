import prisma from "../../prisma/client.js";
import { sendError, sendSuccess } from "../../helper/response.js";

export const getAccountTypes = async (req, res) => {
  const accountTypes = await prisma.accountType.findMany({
    orderBy: { createdAt: "desc" }
  });

  return sendSuccess(res, "Account Types retrieved successfully", { accountTypes }, 200);
};
