import express from "express";
import expressErrorHandler from "../helper/expressErrorHandler.js";
import { getAccountTypes } from "../controller/user/accountType.controller.js";
import { getCities, getCountries, getStates } from "../controller/common/country.controller.js";
import { createAccount, getAccount, getAccounts, updateAccount } from "../controller/common/account.controller.js";
import { createInvoice, createInvoiceFromInventory, getInvoice, getInvoices } from "../controller/common/invoice.controller.js";
import { createItem, getItems } from "../controller/common/item.controller.js";
import { createMemo, deleteMemo, getMemo, getMemoInventoryItems, getMemos, purchaseMemoInventoryItems, returnMemoInventoryItems } from "../controller/common/memo.controller.js";
import { createPurchaseNote, getInventoryItemByLot, getInventoryItems, getPurchaseNote, getPurchaseNotes, returnInventoryItems } from "../controller/common/purchase.controller.js";
import { authorizeDepartmentModule } from "../middleware/auth.middleware.js";

const router = express.Router();

const authorizePurchaseDocumentsRead = (req, res, next) => {
  const isReturnList = String(req.query.docType ?? "").trim() === "Purchase Return";
  return authorizeDepartmentModule({
    module: isReturnList ? "NEW_PURCH_NOTE_RTN" : "PURCHASE_NOTE_LIST",
    access: isReturnList ? "READ_WRITE" : "READ_ONLY",
    departmentIdFrom: "query",
  })(req, res, next);
};

const authorizeMemoDocumentsRead = (req, res, next) => {
  const isReturnList = String(req.query.docType ?? "").trim() === "Memo Return";
  return authorizeDepartmentModule({
    module: isReturnList ? "MEMO_IN_RETURN" : "MEMO_IN_LIST",
    access: isReturnList ? "READ_WRITE" : "READ_ONLY",
    departmentIdFrom: "query",
  })(req, res, next);
};

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
  authorizePurchaseDocumentsRead,
  expressErrorHandler(getPurchaseNotes),
);
router.get(
  "/purchase-notes/:id",
  authorizePurchaseDocumentsRead,
  expressErrorHandler(getPurchaseNote),
);
router.get(
  "/inventory-items",
  authorizeDepartmentModule({ module: "INVENTORY_LIST", access: "READ_ONLY", departmentIdFrom: "query" }),
  expressErrorHandler(getInventoryItems),
);
router.get(
  "/inventory-items/lot/:lotId",
  authorizeDepartmentModule({ module: "INVENTORY_LIST", access: "READ_ONLY", departmentIdFrom: "query" }),
  expressErrorHandler(getInventoryItemByLot),
);
router.post(
  "/inventory-items/return",
  authorizeDepartmentModule({ module: "INVENTORY_LIST", access: "READ_ONLY", departmentIdFrom: "body" }),
  authorizeDepartmentModule({ module: "NEW_PURCH_NOTE_RTN", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(returnInventoryItems),
);
router.post(
  "/invoices/from-inventory",
  authorizeDepartmentModule({ module: "INVENTORY_LIST", access: "READ_ONLY", departmentIdFrom: "body" }),
  authorizeDepartmentModule({ module: "NEW_INVOICE", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(createInvoiceFromInventory),
);

// Invoice
router.post(
  "/invoices",
  authorizeDepartmentModule({ module: "NEW_INVOICE", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(createInvoice),
);
router.get(
  "/invoices",
  authorizeDepartmentModule({ module: "INVOICE_LIST", access: "READ_ONLY", departmentIdFrom: "query" }),
  expressErrorHandler(getInvoices),
);
router.get(
  "/invoices/:id",
  authorizeDepartmentModule({ module: "INVOICE_LIST", access: "READ_ONLY", departmentIdFrom: "query" }),
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
  authorizeMemoDocumentsRead,
  expressErrorHandler(getMemos),
);
router.get(
  "/memo-inventory-items",
  authorizeDepartmentModule({ module: "MEMO_IN_INVENTORY", access: "READ_ONLY", departmentIdFrom: "query" }),
  expressErrorHandler(getMemoInventoryItems),
);
router.post(
  "/memo-inventory-items/purchase",
  authorizeDepartmentModule({ module: "MEMO_IN_INVENTORY", access: "READ_ONLY", departmentIdFrom: "body" }),
  authorizeDepartmentModule({ module: "NEW_PURCHASE_NOTE", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(purchaseMemoInventoryItems),
);
router.post(
  "/memo-inventory-items/return",
  authorizeDepartmentModule({ module: "MEMO_IN_INVENTORY", access: "READ_ONLY", departmentIdFrom: "body" }),
  authorizeDepartmentModule({ module: "MEMO_IN_RETURN", access: "READ_WRITE", departmentIdFrom: "body" }),
  expressErrorHandler(returnMemoInventoryItems),
);
router.get(
  "/memos/:id",
  authorizeMemoDocumentsRead,
  expressErrorHandler(getMemo),
);
router.delete(
  "/memos/:id",
  authorizeDepartmentModule({ module: "NEW_MEMO_IN", access: "READ_WRITE", departmentIdFrom: "query" }),
  expressErrorHandler(deleteMemo),
);

export default router;
