export type IrcCredentials = { login: string; password: string };

export type IrcLine = {
  prefix: string | null;
  command: string;
  params: string[];
};

export type ConnectionState = "disconnected" | "connecting" | "authenticating" | "ready" | "error";
