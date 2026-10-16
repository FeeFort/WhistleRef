import { logger } from "../logger/logger.js";
import { fetchApi, fetchMe } from "../osu-api/osuApiClient.js";
import OsuApiError from "../osu-api/osuApiError.js";
import { AuthState, NotAuthenticatedReason, OsuOAuthCredentials, OsuUser } from "../types.js";
import { exchangeCode, OsuOAuthError, refreshToken as refreshOsuToken } from "./osuOAuthClient.js";
import { saveSession, loadSession, clearSession } from "./secureStore.js";

const log = logger.child("core", "auth");

const REFRESH_BUFFER_MS = 60_000;
export let authState: AuthState = { status: "unauthenticated" };

class NotAuthenticatedError extends Error {
  constructor(public readonly reason: NotAuthenticatedReason) {
    super(reason === "session_expired" ? "Session expired, re-authorization required" : "User not found");
    this.name = "NotAuthenticatedError";
  }
}

export async function login(creds: OsuOAuthCredentials, code: string): Promise<OsuUser> {
  log.info("OAuth login started");
  authState = { status: "authenticating" };

  try {
    const tokens = await exchangeCode(creds, code);
    const user = await fetchMe(tokens.accessToken);

    authState = { status: "authenticated", tokens, user, credentials: creds };

    await saveSession({ clientId: creds.clientId, clientSecret: creds.clientSecret, refreshToken: tokens.refreshToken, user });

    log.info("OAuth login completed", { userId: user.id });
    return user;
  } catch (error) {
    const message = error instanceof OsuOAuthError || error instanceof OsuApiError ? error.message : "Unable to reach osu! api — check internet connection";

    authState = { status: "error", message };
    throw error;
  }
}

export async function logout(): Promise<{ revokedRemotely: boolean }> {
  log.info("Logging out");
  if (authState.status !== "authenticated") {
    authState = { status: "unauthenticated" };
    return { revokedRemotely: true };
  }

  const accessToken = authState.tokens.accessToken;

  try {
    await fetchApi(accessToken, "oauth/tokens/current", "DELETE");
    return { revokedRemotely: true };
  } catch (error) {
    return { revokedRemotely: error instanceof OsuApiError && error.isUnauthorized };
  } finally {
    authState = { status: "unauthenticated" };
    await clearSession();
    log.debug("Saved session cleared");
  }
}

export async function getAccessToken(): Promise<string> {
  if (authState.status !== "authenticated") {
    log.trace("Access token requested without authenticated session");
    throw new NotAuthenticatedError("not_logged_in");
  }

  const { tokens, credentials } = authState;
  const { user } = authState;

  log.trace("Checking access token expiry", { remainingMs: tokens.expiresAt - Date.now(), refreshBufferMs: REFRESH_BUFFER_MS });
  if (tokens.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    log.trace("Using current access token");
    return tokens.accessToken;
  }

  try {
    log.debug("Refreshing access token", { userId: user.id });
    const newTokens = await refreshOsuToken(credentials, tokens.refreshToken);
    authState = { ...authState, tokens: newTokens };
    await saveSession({ clientId: credentials.clientId, clientSecret: credentials.clientSecret, refreshToken: newTokens.refreshToken, user });
    log.debug("Access token refreshed", { userId: user.id });
    return newTokens.accessToken;
  } catch (error) {
    if (error instanceof OsuOAuthError) {
      log.trace("Refresh rejected, authorization required");
      authState = { status: "unauthenticated" };
      throw new NotAuthenticatedError("session_expired");
    }
    throw error;
  }
}

export function getState(): AuthState {
  return authState;
}

export async function restoreSession(): Promise<void> {
  log.debug("Restoring saved session");
  const persisted = await loadSession();
  if (!persisted) {
    log.debug("No saved session found");
    return;
  }

  try {
    const tokens = await refreshOsuToken({ clientId: persisted.clientId, clientSecret: persisted.clientSecret }, persisted.refreshToken);

    authState = {
      status: "authenticated",
      tokens,
      user: persisted.user,
      credentials: { clientId: persisted.clientId, clientSecret: persisted.clientSecret },
    };

    await saveSession({
      clientId: persisted.clientId,
      clientSecret: persisted.clientSecret,
      refreshToken: tokens.refreshToken,
      user: persisted.user,
    });
    log.info("Saved session restored", { userId: persisted.user.id });
  } catch (error) {
    log.warn("Saved session restoration failed", { error });
    if (error instanceof OsuOAuthError) {
      await clearSession();
    }
    authState = { status: "unauthenticated" };
  }
}
