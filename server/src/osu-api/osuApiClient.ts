import { logger } from "../logger/logger.js";
import { config } from "../config.js";
import { InternalApiMethod, OsuApiMeResponse, OsuUser } from "../types.js";

import { restRateLimiter } from "../rateLimiter.js";
import isRetryableError, { hasRetryAfter } from "./retryableErrors.js";
import OsuApiError from "./osuApiError.js";
import { backoffDelay, sleep } from "../retry.js";

const log = logger.child("core", "osuApi");

const OSU_API_URL = `${config.osuWebUrl}/api/v2/`;

export async function fetchApi(accessToken: string, endpoint: string, method: InternalApiMethod = "GET", body?: Record<string, unknown>): Promise<unknown> {
  const allowedAttempts = method === "GET" ? config.transportRetry.attempts : 1;
  const deadline = performance.now() + config.transportRetry.totalTimeoutMs;
  const totalSignal = AbortSignal.timeout(config.transportRetry.totalTimeoutMs);
  const timeoutError = () => Object.assign(new Error("API request timed out; its outcome may be unknown."), { code: "REQUEST_TIMEOUT", outcomeUnknown: method !== "GET" });

  for (let attempt = 1; ; attempt++) {
    try {
      log.debug("API request attempt", { method, endpoint, attempt, allowedAttempts });
      if (totalSignal.aborted) throw timeoutError();
      return await fetchApiOnce(accessToken, endpoint, method, body, totalSignal);
    } catch (error) {
      if (totalSignal.aborted) throw timeoutError();
      if (attempt >= allowedAttempts || !isRetryableError(error)) throw error;

      // On 429 the rate limiter is already paused for Retry-After, so the next acquire() waits by itself.
      const retryAfter = hasRetryAfter(error) ? error.retryAfterMs : undefined;
      const backoff = backoffDelay(attempt, config.transportRetry.baseDelay, config.transportRetry.maxDelay);
      const delayCap = backoff.delayCap;
      const delay = retryAfter !== undefined ? 0 : backoff.delay;
      if (performance.now() + (retryAfter ?? delay) >= deadline) throw error;

      log.debug("API request failed, retrying", { method, endpoint, attempt, allowedAttempts, delayCap, delay, retryAfter, error });
      try {
        await sleep(delay, totalSignal);
      } catch {
        throw timeoutError();
      }
    }
  }
}

export async function fetchMe(accessToken: string): Promise<OsuUser> {
  const raw = (await fetchApi(accessToken, "me")) as OsuApiMeResponse;

  return { id: raw.id, username: raw.username, avatarUrl: raw.avatar_url };
}

async function fetchApiOnce(accessToken: string, endpoint: string, method: InternalApiMethod, body: Record<string, unknown> | undefined, totalSignal: AbortSignal): Promise<unknown> {
  log.debug("API request queued", { method, endpoint });
  const release = await restRateLimiter.acquire(totalSignal);
  const operation = log.traceStart(`${method} ${endpoint}`, () => ({ body: JSON.stringify(body, (key, value) => (/password|token|secret|authorization/i.test(key) ? "[redacted]" : value)) }));
  const attemptSignal = AbortSignal.timeout(config.apiRequestTimeoutMs);
  const signal = AbortSignal.any([totalSignal, attemptSignal]);
  try {
    const response = await fetch(OSU_API_URL + endpoint.replace(/^\//, ""), {
      signal,
      method: method,
      headers: { Authorization: `Bearer ${accessToken.trim()}`, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
    });

    log.debug("API response received", { method, endpoint, status: response.status });
    checkApiRateLimit(response);
    if (!response.ok) {
      throw await OsuApiError.fromResponse(response);
    }

    if (response.status === 204 || method === "DELETE") {
      operation.end({ status: response.status });
      return undefined;
    }
    const result: unknown = await response.json();
    operation.end(() => ({ status: response.status, result: JSON.stringify(result, (key, value) => (/password|token|secret|authorization/i.test(key) ? "[redacted]" : value)) }));
    return result;
  } catch (error) {
    operation.fail(error);
    if (signal.aborted)
      throw Object.assign(new Error("API request timed out; its outcome may be unknown."), {
        code: "REQUEST_TIMEOUT",
        outcomeUnknown: method !== "GET",
      });
    throw error;
  } finally {
    release();
  }
}

export function checkApiRateLimit(response: Response): void {
  if (response.status === 429) {
    const header = response.headers.get("Retry-After");
    const seconds = header === null ? NaN : Number(header);
    const retryAfterMs = Math.min(2_147_483_647, Math.max(1000, Number.isFinite(seconds) ? seconds * 1000 : (header ? Date.parse(header) - Date.now() : NaN) || 60_000));
    restRateLimiter.pause(retryAfterMs);
    throw Object.assign(new Error("osu! API request limit reached. Please try again later."), { code: "RATE_LIMITED", outcomeUnknown: false, retryAfterMs });
  }
}
