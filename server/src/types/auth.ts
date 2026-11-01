// Raw types, basically how osu! api responds
export interface OsuTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export interface OsuOAuthErrorResponse {
  error: string;
  error_description?: string;
  hint?: string;
}

// Normalized type
export interface OsuTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // absolute timestamp
}

// User profile
export interface OsuApiMeResponse {
  id: number;
  username: string;
  avatar_url: string;
  // everything else is irrelevant
}

export interface OsuUser {
  id: number;
  username: string;
  avatarUrl: string;
}

// Authenticating
export interface OsuOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export type AuthState =
  | { status: "unauthenticated" }
  | { status: "authenticating" }
  | { status: "authenticated"; tokens: OsuTokenSet; user: OsuUser; credentials: Pick<OsuOAuthCredentials, "clientId" | "clientSecret"> }
  | { status: "error"; message: string };

export type OsuScope = "public" | "multiplayer.write_manage" | "chat.read" | "chat.write" | "identify";

export type NotAuthenticatedReason = "not_logged_in" | "session_expired";
export interface PersistedSession {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  user: OsuUser;
}
