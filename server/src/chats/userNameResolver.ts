import { getAccessToken } from "../auth/auth.js";
import { fetchApi } from "../osu-api/osuApiClient.js";

export const USER_NAME_TIMEOUT_MS = 3_000;
export const USER_NAME_CACHE_LIMIT = 500;

export class UserNameResolver {
  private readonly names = new Map<number, string>();

  constructor(
    private readonly fetchUser: (id: number) => Promise<unknown> = async (id) => fetchApi(await getAccessToken(), `users/${id}`),
    private readonly timeoutMs = USER_NAME_TIMEOUT_MS,
    private readonly limit = USER_NAME_CACHE_LIMIT,
  ) {}

  remember(userId: number, username: string): void {
    if (!Number.isSafeInteger(userId) || !username.trim()) return;
    this.names.delete(userId);
    this.names.set(userId, username);
    while (this.names.size > this.limit) this.names.delete(this.names.keys().next().value!);
  }

  async resolve(userId: number): Promise<string> {
    const cached = this.names.get(userId);
    if (cached) return cached;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const user = (await Promise.race([
        this.fetchUser(userId),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("User lookup timed out")), this.timeoutMs);
        }),
      ])) as { username?: unknown };
      if (typeof user?.username === "string" && user.username.trim()) {
        this.remember(userId, user.username);
        return user.username;
      }
    } catch {
      /* User lookup is best effort. */
    } finally {
      if (timer) clearTimeout(timer);
    }
    return `user ${userId}`;
  }
}
