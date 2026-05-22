import express from "express";
import expressErrorHandler from "../helper/expressErrorHandler.js";
import { forgotPassword, getCurrentSession, login, resetPassword } from "../controller/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/login", expressErrorHandler(login));
router.get("/me", authenticate, expressErrorHandler(getCurrentSession));
router.post("/forgot-password", expressErrorHandler(forgotPassword));
router.post("/reset-password", expressErrorHandler(resetPassword));

export default router;
