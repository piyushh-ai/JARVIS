/**
 * Structured domain error thrown by service and validation layers.
 */
export class ServiceError extends Error {
  constructor(message, statusCode = 400, errors = undefined) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

export function successResponse(message, data = null, status = 200) {
  return Response.json(
    {
      success: true,
      message,
      ...(data !== null ? { data } : {}),
    },
    { status }
  );
}

export function errorResponse(message, status = 400, errors = undefined) {
  return Response.json(
    {
      success: false,
      message,
      ...(errors ? { errors } : {}),
    },
    { status }
  );
}

/**
 * Maps service, Mongoose, JSON parsing, and DB connection errors into safe HTTP responses.
 */
export function handleApiError(error) {
  if (error instanceof ServiceError) {
    const headers = error.retryAfterSeconds
      ? { "Retry-After": String(error.retryAfterSeconds) }
      : undefined;
    return Response.json(
      {
        success: false,
        message: error.message,
        ...(error.errors ? { errors: error.errors } : {}),
      },
      { status: error.statusCode, ...(headers ? { headers } : {}) }
    );
  }

  if (error instanceof SyntaxError) {
    return errorResponse("Invalid JSON request body", 400);
  }

  if (error?.name === "ValidationError") {
    const fieldErrors = Object.values(error.errors || {}).map(
      (entry) => entry.message
    );
    return errorResponse(
      fieldErrors[0] || "Validation failed",
      400,
      fieldErrors.length ? fieldErrors : undefined
    );
  }

  if (error?.name === "CastError") {
    return errorResponse("Invalid identifier format", 400);
  }

  if (error?.code === 11000) {
    const keys = Object.keys(error.keyPattern || error.keyValue || {});
    if (keys.includes("esp32DeviceId") && !keys.includes("relayNumber")) {
      return errorResponse(
        "An ESP32 controller with this esp32DeviceId already exists",
        409
      );
    }
    if (keys.includes("esp32DeviceId") || keys.includes("relayNumber")) {
      return errorResponse(
        "This ESP32 device ID and relay number are already assigned",
        409
      );
    }
    if (keys.includes("name") && keys.includes("ownerId")) {
      return errorResponse("A room with this name already exists", 409);
    }
    return errorResponse("Duplicate record already exists", 409);
  }

  if (typeof error?.code === "string" && error.code.startsWith("DB_")) {
    return errorResponse(
      error.message || "Database service unavailable",
      error.statusCode || 503
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.error("[JARVIS API] Unexpected error:", error?.name || "Error");
  }

  return errorResponse("Internal server error", 500);
}

