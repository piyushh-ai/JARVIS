import axios from "axios";

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Normalized API error returned by the Axios client interceptor.
 */
export class ApiError extends Error {
  constructor(
    message,
    {
      status = 0,
      errors = undefined,
      isNetworkError = false,
      isTimeout = false,
      isCanceled = false,
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.isNetworkError = isNetworkError;
    this.isTimeout = isTimeout;
    this.isCanceled = isCanceled;
  }
}

export function cleanParams(params = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export function normalizeApiError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
    return new ApiError("Request canceled", {
      status: 0,
      isCanceled: true,
    });
  }

  if (error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "")) {
    return new ApiError("Request timed out. Please try again.", {
      status: 408,
      isTimeout: true,
      isNetworkError: true,
    });
  }

  if (!error?.response) {
    return new ApiError(
      "Network error. Unable to reach the JARVIS backend.",
      {
        status: 0,
        isNetworkError: true,
      }
    );
  }

  const { status, data } = error.response;
  const message =
    (typeof data?.message === "string" && data.message) ||
    `Request failed with status ${status}`;

  return new ApiError(message, {
    status,
    errors: Array.isArray(data?.errors) ? data.errors : undefined,
  });
}

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

apiClient.interceptors.request.use(
  (config) => {
    if (!config.headers?.["Content-Type"]) {
      config.headers = {
        ...config.headers,
        "Content-Type": "application/json",
      };
    }
    return config;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

apiClient.interceptors.response.use(
  (response) => {
    const payload = response.data;
    if (payload && payload.success === false) {
      return Promise.reject(
        new ApiError(payload.message || "Request failed", {
          status: response.status,
          errors: Array.isArray(payload.errors) ? payload.errors : undefined,
        })
      );
    }
    return payload;
  },
  (error) => Promise.reject(normalizeApiError(error))
);

export default apiClient;

