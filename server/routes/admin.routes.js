import express from "express";
import expressErrorHandler from "../helper/expressErrorHandler.js";
import { createAccount, getAccount, getAccounts, updateAccount } from "../controller/common/account.controller.js";
import { createCompany, getCompanies, getCompany, updateCompany } from "../controller/admin/company.controller.js";
import { createUser, getUsers, getUser, updateUser, getDashboardAnalytics } from "../controller/admin/users.controller.js";
import { createDepartment, updateDepartmentPermissions, addUserDepartment, removeUserDepartment } from "../controller/admin/department.controller.js";
import { createAccountType, getAccountTypes, getAccountTypeById, updateAccountType } from "../controller/admin/accountType.controller.js";
import { getCities, getCountries, getStates } from "../controller/common/country.controller.js";

const router = express.Router();

//Dashboard
router.get("/analytics/dashboard", expressErrorHandler(getDashboardAnalytics));

// Master data
router.get("/countries", expressErrorHandler(getCountries));
router.get("/countries/:countryIso2/states", expressErrorHandler(getStates));
router.get("/states/:stateId/cities", expressErrorHandler(getCities));

// Accounts
router.post("/accounts", expressErrorHandler(createAccount));
router.get("/accounts", expressErrorHandler(getAccounts));
router.get("/accounts/:id", expressErrorHandler(getAccount));
router.patch("/accounts/:id", expressErrorHandler(updateAccount));

//Company
router.post("/createCompany", expressErrorHandler(createCompany));
router.get("/companies", expressErrorHandler(getCompanies));
router.get("/company/:id", expressErrorHandler(getCompany));
router.post("/company/:id", expressErrorHandler(updateCompany));

//Department
router.post("/createDepartment/:companyId", expressErrorHandler(createDepartment));
router.patch("/department-access/:accessId/permissions", expressErrorHandler(updateDepartmentPermissions));
router.post("/users/:id/departments", expressErrorHandler(addUserDepartment));
router.delete("/users/:id/departments/:departmentId", expressErrorHandler(removeUserDepartment));

// Users
router.get("/users", expressErrorHandler(getUsers));
router.get("/user/:id", expressErrorHandler(getUser));
router.post("/user", expressErrorHandler(createUser));
router.patch("/users/:id", expressErrorHandler(updateUser));

// Account Type
router.post("/account-type", expressErrorHandler(createAccountType));
router.get("/account-type", expressErrorHandler(getAccountTypes));
router.get("/account-type/:id", expressErrorHandler(getAccountTypeById));
router.put("/account-type/:id", expressErrorHandler(updateAccountType));

export default router;
