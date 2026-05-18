import { Prisma } from "@prisma/client";

function expressErrorHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal Server Error";
      console.error("Unhandled error:", message);

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          return res.status(409).json({
            success: false,
            message: "A record with this value already exists",
            error: { code: err.code, target: err.meta?.target ?? null },
          });
        }

        if (err.code === "P2025") {
          return res.status(404).json({
            success: false,
            message: "Record not found",
            error: { code: err.code },
          });
        }

        return res.status(400).json({
          success: false,
          message: "Database request failed",
          error: { code: err.code },
        });
      }

      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  };
}

export default expressErrorHandler;
