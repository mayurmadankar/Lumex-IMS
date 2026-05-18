import express from "express";
import expressErrorHandler from "../helper/expressErrorHandler.js";
import { login } from "../controller/auth.controller.js";

const router = express.Router();

router.post("/login", expressErrorHandler(login));

export default router;