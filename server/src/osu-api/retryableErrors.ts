import { config } from "../config.js";
import { ErrorWithCode, ErrorWithRetryAfter } from "../types.js";
import OsuApiError from "./osuApiError.js";

export const RETRYABLE_NETWORK_ERRORS = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

export const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function hasErrorCode(error: unknown): error is ErrorWithCode {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string";
}

export function hasRetryAfter(error: unknown): error is ErrorWithRetryAfter {
  return typeof error === "object" && error !== null && "retryAfterMs" in error && typeof error.retryAfterMs === "number";
}

// undici throws TypeError("fetch failed") on connect errors and TypeError("terminated") when the body stream breaks.
function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && hasErrorCode(error.cause) && RETRYABLE_NETWORK_ERRORS.has(error.cause.code);
}

export default function isRetryableError(error: unknown): boolean {
  if (error instanceof OsuApiError) return RETRYABLE_STATUSES.has(error.status);
  if (hasErrorCode(error) && error.code === "REQUEST_TIMEOUT") return true;
  if (hasErrorCode(error) && error.code === "RATE_LIMITED" && hasRetryAfter(error) && error.retryAfterMs <= config.transportRetry.maxRetryAfter) return true;
  return isNetworkError(error);
}
