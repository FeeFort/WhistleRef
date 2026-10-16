import { logger } from "./logger/logger.js";
import { config } from "./config.js";
import type { RateLimitConfig, RateLimitEntry, RequestFailure } from "./types.js";

const log = logger.child("core", "rateLimit");

export function rateLimitError(code: RequestFailure["code"], message: string): Error & RequestFailure {
  return Object.assign(new Error(message), { code, outcomeUnknown: false });
}

export class TokenBucket {
  private tokens: number;
  private updatedAt = performance.now();
  private pausedUntil = 0;
  private active = 0;
  private queue: RateLimitEntry[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly settings: RateLimitConfig,
    private readonly label: string,
  ) {
    if (Object.values(settings).some((value) => !Number.isFinite(value) || value <= 0) || settings.capacity < 1) throw new Error("Invalid rate limiter configuration.");
    this.tokens = settings.capacity;
  }

  pause(milliseconds: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, performance.now() + milliseconds);
    log.warn("Requests paused", { queue: this.label, durationMs: milliseconds });
    this.drain();
  }

  acquire(signal?: AbortSignal): Promise<() => void> {
    log.trace("Acquire requested", { queue: this.label, pending: this.queue.length, active: this.active });
    this.drain();
    if (signal?.aborted) return Promise.reject(rateLimitError("REQUEST_CANCELLED", "Request cancelled before it was sent."));
    if (this.queue.length >= this.settings.maxQueue) return Promise.reject(rateLimitError("RATE_LIMIT_QUEUE_FULL", "Too many pending requests. Please try again later."));
    return new Promise((resolve, reject) => {
      const entry: RateLimitEntry = {
        resolve,
        reject,
        signal,
        expiresAt: performance.now() + this.settings.maxWaitMs,
        cancel: () => {
          log.trace("Queued request cancelled", { queue: this.label });
          this.remove(entry);
          reject(rateLimitError("REQUEST_CANCELLED", "Request cancelled before it was sent."));
          this.drain();
        },
      };
      signal?.addEventListener("abort", entry.cancel, { once: true });
      this.queue.push(entry);
      log.trace("Request queued", { queue: this.label, pending: this.queue.length });
      this.drain();
    });
  }

  private remove(entry: RateLimitEntry): void {
    const index = this.queue.indexOf(entry);
    if (index >= 0) this.queue.splice(index, 1);
    entry.signal?.removeEventListener("abort", entry.cancel);
  }

  private drain(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const now = performance.now();
    this.tokens = Math.min(this.settings.capacity, this.tokens + ((now - this.updatedAt) * this.settings.tokensPerSecond) / 1000);
    this.updatedAt = now;
    for (const entry of [...this.queue]) {
      if (entry.expiresAt <= now) {
        this.remove(entry);
        log.warn("Queue wait expired", { queue: this.label, maxWaitMs: this.settings.maxWaitMs });
        entry.reject(rateLimitError("RATE_LIMIT_WAIT_TIMEOUT", "Request waited too long for the API limit. Please try again later."));
      }
    }
    while (this.queue.length && this.tokens >= 1 && this.active < this.settings.concurrency && now >= this.pausedUntil) {
      const entry = this.queue[0];
      this.remove(entry);
      this.tokens -= 1;
      this.active++;
      log.trace("Request dispatched", { queue: this.label, active: this.active, pending: this.queue.length });
      let released = false;
      entry.resolve(() => {
        if (released) return;
        released = true;
        this.active--;
        log.trace("Request released", { queue: this.label, active: this.active });
        this.drain();
      });
    }
    if (this.queue.length) {
      const expiry = Math.min(...this.queue.map((entry) => entry.expiresAt)) - now;
      const available = this.active < this.settings.concurrency ? Math.max(this.pausedUntil - now, ((1 - this.tokens) * 1000) / this.settings.tokensPerSecond, 1) : expiry;
      log.trace("Queue wakeup scheduled", { queue: this.label, delayMs: Math.max(1, Math.ceil(Math.min(expiry, available))) });
      this.timer = setTimeout(() => this.drain(), Math.max(1, Math.ceil(Math.min(expiry, available))));
    }
  }
}

export const restRateLimiter = new TokenBucket(config.restRateLimit, "REST");
export const hubRateLimiter = new TokenBucket(config.hubRateLimit, "SignalR");
