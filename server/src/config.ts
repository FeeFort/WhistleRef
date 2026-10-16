export const config = {
  restRateLimit: { tokensPerSecond: 1, capacity: 10, concurrency: 4, maxQueue: 100, maxWaitMs: 30_000 },
  hubRateLimit: { tokensPerSecond: 1, capacity: 10, concurrency: 4, maxQueue: 100, maxWaitMs: 30_000 },
  hubRequestTimeoutMs: 15_000,
  // Only read-only/idempotent hub methods (ListRooms, JoinRoom) are retried.
  hubRetry: { attempts: 4, baseDelay: 500, maxDelay: 2_000 },
  // Automatic reconnect never gives up; the initial start() is retried a bounded number of times.
  hubReconnect: { baseDelay: 1_000, maxDelay: 30_000, initialAttempts: 5 },
  apiRequestTimeoutMs: 15_000,
  transportRetry: { attempts: 4, baseDelay: 500, maxDelay: 2_000, maxRetryAfter: 10_000, totalTimeoutMs: 45_000 },
  osuWebUrl: "https://osu.ppy.sh",
  redirectUri: "http://localhost:3000/",
  httpHost: process.env.HTTP_HOST || "0.0.0.0",
  httpPort: Number(process.env.HTTP_PORT) || 3000,
  allowedApiEndpoints: [/^\/matches\/\d+$/, /^\/beatmaps\/\d+$/, /^\/beatmapsets\/\d+$/, /^\/users\/@?[\d\w]+$/, /^\/beatmaps\/\d+\/attributes$/, /^\/rooms\/\d+.*$/] as RegExp[],
  spectatorServerUrl: "https://spectator.ppy.sh",
  chatWebSocketUrl: "wss://notify.ppy.sh",
  ircHost: "irc.ppy.sh",
  ircPort: 6667,
  authError: "Login or password is incorrect.",
};
