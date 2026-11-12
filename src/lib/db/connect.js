import mongoose from "mongoose";

const globalForMongoose = globalThis;

if (!globalForMongoose._mongooseCache) {
  globalForMongoose._mongooseCache = { conn: null, promise: null };
}

const cached = globalForMongoose._mongooseCache;
const isDev = process.env.NODE_ENV === "development";

/**
 * Normalizes Mongoose/MongoDB connection failures into safe, secret-free error details.
 */
export function classifyConnectionError(error) {
  const rawMessage = typeof error?.message === "string" ? error.message : "";
  const code = error?.code;

  if (
    code === 8000 ||
    code === 18 ||
    /auth|authentication failed|bad auth/i.test(rawMessage)
  ) {
    const authError = new Error(
      "Invalid MongoDB credentials. Check MONGODB_URI in .env.local."
    );
    authError.code = "DB_AUTH_FAILED";
    authError.statusCode = 503;
    return authError;
  }

  if (
    error?.name === "MongooseServerSelectionError" ||
    /enotfound|econnrefused|etimedout|timed out|querysrv|server selection|network/i.test(
      rawMessage
    )
  ) {
    const networkError = new Error(
      "Unable to reach MongoDB Atlas. Check network access and IP allowlist."
    );
    networkError.code = "DB_NETWORK_ERROR";
    networkError.statusCode = 503;
    return networkError;
  }

  if (/invalid scheme|expected connection string/i.test(rawMessage)) {
    const uriError = new Error(
      "Invalid MONGODB_URI format. Expected mongodb:// or mongodb+srv://."
    );
    uriError.code = "DB_INVALID_URI";
    uriError.statusCode = 500;
    return uriError;
  }

  const genericError = new Error("Unable to connect to MongoDB.");
  genericError.code = "DB_CONNECTION_FAILED";
  genericError.statusCode = 503;
  return genericError;
}

export function resetConnectionCache() {
  cached.conn = null;
  cached.promise = null;
}

/**
 * Establishes and caches a reusable Mongoose connection to MongoDB Atlas.
 */
export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI?.trim();

  if (!mongoUri) {
    if (isDev) {
      console.warn("[JARVIS DB] MONGODB_URI is not configured in .env.local.");
    }
    const missingError = new Error(
      "MONGODB_URI environment variable is not set."
    );
    missingError.code = "DB_MISSING_URI";
    missingError.statusCode = 503;
    throw missingError;
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // Clear stale cached state if a thawed serverless instance has a dropped socket
  if (
    mongoose.connection.readyState === 0 ||
    mongoose.connection.readyState === 3
  ) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    if (isDev) {
      console.info("[JARVIS DB] Connecting to MongoDB Atlas...");
    }

    cached.promise = mongoose
      .connect(mongoUri, {
        bufferCommands: false,
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 60000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 10000,
        serverSelectionTimeoutMS: 5000,
      })
      .then((mongooseInstance) => {
        if (isDev) {
          console.info("[JARVIS DB] MongoDB Atlas connected.");
        }
        return mongooseInstance;
      })
      .catch((error) => {
        cached.promise = null;
        cached.conn = null;
        const safeError = classifyConnectionError(error);
        if (isDev) {
          console.error(`[JARVIS DB] Connection failed (${safeError.code}): ${safeError.message}`);
        }
        throw safeError;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
