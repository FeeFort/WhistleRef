export interface RateLimitConfig {
  tokensPerSecond: number;
  capacity: number;
  concurrency: number;
  maxQueue: number;
  maxWaitMs: number;
}

export interface RateLimitEntry {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  expiresAt: number;
  signal?: AbortSignal;
  cancel: () => void;
}
