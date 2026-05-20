import express from "express";
import expressErrorHandler from "../helper/expressErrorHandler.js";
import { getAccountTypes } from "../controller/user/accountType.controller.js";
import { getCities, getCountries, getStates } from "../controller/common/country.controller.js";
import { createAccount, getAccount, getAccounts, updateAccount } from "../controller/common/account.controller.js";
import { createInvoice, createInvoiceFromInventory, getInvoice, getInvoiceReturnItemByLot, getInvoices, returnInvoiceItem } from "../controller/common/invoice.controller.js";
import { createItem, getItems } from "../controller/common/item.controller.js";
import { createMemo, deleteMemo, getMemo, getMemoInventoryItemByLot, getMemoInventoryItems, getMemos, purchaseMemoInventoryItems, returnMemoInventoryItems } from "../controller/common/memo.controller.js";
import { createMemoOut, getMemoOut, getMemoOutAccounts, getMemoOutInventoryItemByLot, getMemoOutReturnItemByLot, getMemoOuts, returnMemoOutItem } from "../controller/common/memoOut.controller.js";
import { changeInventoryLocation, getProductionDocuments, getProductionInventoryItemByLot, getProductionReturnItemByLot, returnProductionParts, sendInventoryToProcess } from "../controller/common/production.controller.js";
import { createPurchaseNote, getInventoryItemByLot, getInventoryItems, getPurchaseNote, getPurchaseNotes, returnInventoryItems } from "../controller/common/purchase.controller.js";
import { createTransfer, createTransferReturn, getCompanyDepartments, getDepartmentUsers, getTransferReturnItemByLot, getTransfers } from "../controller/common/transfer.controller.js";
import { authorizeDepartmentModule } from "../middleware/auth.middleware.js";

const router = express.Router();

// Account Type
router.get("/account-type", expressErrorHandler(getAccountTypes));
router.get("/countries", expressErrorHandler(getCountries));
router.get("/countries/:countryIso2/states", expressErrorHandler(getStates));
router.get("/states/:stateId/cities", expressErrorHandler(getCities));
router.post(
  "/accounts",
  authorizeDepartmentModule({ module: "NEW_ACCOUNT", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(createAccount),
);
router.get(
  "/accounts",
  authorizeDepartmentModule({ module: "ACCOUNT_LIST", access: "READ_ONLY", departmentIdFrom: "query" }),
  expressErrorHandler(getAccounts),
);
router.get(
  "/accounts/:id",
  authorizeDepartmentModule({ module: "ACCOUNT_LIST", access: "READ_ONLY", departmentIdFrom: "query" }),
  expressErrorHandler(getAccount),
);
router.patch(
  "/accounts/:id",
  authorizeDepartmentModule({ module: "ACCOUNT_LIST", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(updateAccount),
);

// Item master
router.post(
  "/items",
  authorizeDepartmentModule({ module: "ITEM_LIST", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(createItem),
);
router.get(
  "/items",
  authorizeDepartmentModule({ module: "ITEM_LIST", access: "READ_ONLY", departmentIdFrom: "query" }),
  expressErrorHandler(getItems),
);

// Purchase and inventory
router.post(
  "/purchase-notes",
  authorizeDepartmentModule({ module: "NEW_PURCHASE_NOTE", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(createPurchaseNote),
);
router.get(
  "/purchase-notes",
  expressErrorHandler(getPurchaseNotes),
);
router.get(
  "/purchase-notes/:id",
  expressErrorHandler(getPurchaseNote),
);
router.get(
  "/inventory-items",
  expressErrorHandler(getInventoryItems),
);
router.get(
  "/inventory-items/lot/:lotId",
  expressErrorHandler(getInventoryItemByLot),
);
router.post(
  "/inventory-items/return",
  authorizeDepartmentModule({ module: "NEW_PURCH_NOTE_RTN", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(returnInventoryItems),
);
router.post(
  "/invoices/from-inventory",
  authorizeDepartmentModule({ module: "INVENTORY_LIST", access: "READ_ONLY", departmentIdFrom: "body" }),
  authorizeDepartmentModule({ module: "NEW_INVOICE", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(createInvoiceFromInventory),
);
router.get(
  "/invoice-return-items/lot/:lotId",
  expressErrorHandler(getInvoiceReturnItemByLot),
);

// Invoice
router.post(
  "/invoices",
  authorizeDepartmentModule({ module: "NEW_INVOICE", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(createInvoice),
);
router.post(
  "/invoices/return",
  expressErrorHandler(returnInvoiceItem),
);
router.get(
  "/invoices",
  expressErrorHandler(getInvoices),
);
router.get(
  "/invoices/:id",
  expressErrorHandler(getInvoice),
);

// Memo In
router.post(
  "/memos",
  authorizeDepartmentModule({ module: "NEW_MEMO_IN", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(createMemo),
);
router.get(
  "/memos",
  expressErrorHandler(getMemos),
);
router.get(
  "/memo-inventory-items",
  authorizeDepartmentModule({ module: "MEMO_IN_INVENTORY", access: "READ_ONLY", departmentIdFrom: "query" }),
  expressErrorHandler(getMemoInventoryItems),
);
router.get(
  "/memo-inventory-items/lot/:lotId",
  expressErrorHandler(getMemoInventoryItemByLot),
);
router.post(
  "/memo-inventory-items/purchase",
  authorizeDepartmentModule({ module: "MEMO_IN_INVENTORY", access: "READ_ONLY", departmentIdFrom: "body" }),
  authorizeDepartmentModule({ module: "NEW_PURCHASE_NOTE", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(purchaseMemoInventoryItems),
);
router.post(
  "/memo-inventory-items/return",
  authorizeDepartmentModule({ module: "MEMO_IN_RETURN", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(returnMemoInventoryItems),
);
router.get(
  "/memos/:id",
  expressErrorHandler(getMemo),
);
router.delete(
  "/memos/:id",
  authorizeDepartmentModule({ module: "NEW_MEMO_IN", access: "READ_WRITE", departmentIdFrom: "query" }),
  expressErrorHandler(deleteMemo),
);

// Memo Out
router.get("/memo-out-accounts", expressErrorHandler(getMemoOutAccounts));
router.get("/memo-out-inventory-items/lot/:lotId", expressErrorHandler(getMemoOutInventoryItemByLot));
router.post("/memo-outs", expressErrorHandler(createMemoOut));
router.get("/memo-out-return-items/lot/:lotId", expressErrorHandler(getMemoOutReturnItemByLot));
router.post("/memo-outs/return", expressErrorHandler(returnMemoOutItem));
router.get("/memo-outs", expressErrorHandler(getMemoOuts));
router.get("/memo-outs/:id", expressErrorHandler(getMemoOut));

// Transfer
router.get("/transfer-departments", expressErrorHandler(getCompanyDepartments));
router.get("/transfer-departments/:departmentId/users", expressErrorHandler(getDepartmentUsers));
router.post("/transfers", expressErrorHandler(createTransfer));
router.get("/transfer-return-items/lot/:lotId", expressErrorHandler(getTransferReturnItemByLot));
router.post("/transfers/return", expressErrorHandler(createTransferReturn));
router.get("/transfers", expressErrorHandler(getTransfers));

// Production
router.get("/production-inventory-items/lot/:lotId", expressErrorHandler(getProductionInventoryItemByLot));
router.post("/production/change-location", expressErrorHandler(changeInventoryLocation));
router.post("/production/send-to-process", expressErrorHandler(sendInventoryToProcess));
router.get("/production-return-items/lot/:lotId", expressErrorHandler(getProductionReturnItemByLot));
router.post("/production/return-parts", expressErrorHandler(returnProductionParts));
router.get("/production-documents", expressErrorHandler(getProductionDocuments));

export default router;
