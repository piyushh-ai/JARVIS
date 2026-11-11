import { connection } from "next/server";
import mongoose from "mongoose";
import {
  classifyConnectionError,
  connectDB,
  resetConnectionCache,
} from "@/lib/db/connect";

const ERROR_MESSAGES = {
  DB_MISSING_URI: "Database configuration is missing",
  DB_INVALID_URI: "Database configuration is invalid",
  DB_AUTH_FAILED: "Database authentication failed",
  DB_NETWORK_ERROR: "Database network connection failed",
  DB_CONNECTION_FAILED: "Database connection unavailable",
};

/**
 * GET /api/health
 * Verifies live MongoDB Atlas connectivity (including ping) and returns service health status.
 */
export async function GET() {
  await connection();

  try {
    await connectDB();

    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      resetConnectionCache();
      return Response.json(
        {
          success: false,
          message: "Database is not connected",
          database: "disconnected",
        },
        { status: 503 }
      );
    }

    await mongoose.connection.db.admin().ping();

    return Response.json(
      {
        success: true,
        message: "JARVIS backend is healthy",
        database: "connected",
      },
      { status: 200 }
    );
  } catch (error) {
    const safeError =
      typeof error?.code === "string" && error.code.startsWith("DB_")
        ? error
        : classifyConnectionError(error);

    if (safeError.code !== "DB_MISSING_URI") {
      resetConnectionCache();
    }

    const statusCode = safeError.statusCode || 503;
    const message =
      ERROR_MESSAGES[safeError.code] || "Database connection unavailable";

    return Response.json(
      {
        success: false,
        message,
        database: "disconnected",
        error: safeError.message || "Unable to connect to MongoDB.",
      },
      { status: statusCode }
    );
  }
}
