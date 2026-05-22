import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import prisma from "./prisma/client.js";

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import userRoutes from "./routes/user.routes.js";
import { authenticate, authorizeRoles } from "./middleware/auth.middleware.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

app.use(cors());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "IMS backend is running",
    env: NODE_ENV,
  });
});

app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, message: "Database connected" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database not connected",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.use("/api/auth",  authRoutes);
app.use("/api/admin", authenticate, authorizeRoles("ORG_ADMIN"), adminRoutes);
app.use("/api/user",  authenticate, authorizeRoles("USER"), userRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal Server Error" });
});

async function startServer() {
  try {
    await prisma.$connect();
    console.log("✓ Database connected");

    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT} [${NODE_ENV}]`);
    });
  } catch (error) {
    console.error("✗ Failed to connect to database:", error);
    process.exit(1);
  }
}

startServer();

export default app;