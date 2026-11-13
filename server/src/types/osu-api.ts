// error
export type ErrorWithCode = { code: string };
export type ErrorWithRetryAfter = { retryAfterMs: number };
export type AllowedMethods = "GET" | "POST";
export type InternalApiMethod = AllowedMethods | "DELETE";
export interface RequestFailure {
  code: "REQUEST_TIMEOUT" | "INVALID_RESPONSE" | "RATE_LIMIT_QUEUE_FULL" | "RATE_LIMIT_WAIT_TIMEOUT" | "REQUEST_CANCELLED" | "RATE_LIMITED";
  retryAfterMs?: number;
  outcomeUnknown: boolean;
}

export interface OsuApiUserLookupResponse {
  id?: number;
  username?: string;
}

export interface OsuApiBeatmapLookupResponse {
  id?: number;
  artist?: string;
  title?: string;
  mode_int?: number;
  ruleset_id?: number;
}
