export interface DatabasePaths {
  dataDirectory: string;
  databaseFile: string;
}

export type ChatPlatform = "stable" | "lazer";
export type ChatStatus = "active" | "closed" | "archived";

export interface Chat {
  id: number;
  platform: ChatPlatform;
  external_id: number;
  title: string;
  status: ChatStatus;
  created_at: string;
  closed_at: string | null;
  archived_at: string | null;
  lobby_state: string | null;
}

export interface CreateChat {
  platform: ChatPlatform;
  external_id: number;
  title: string;
  status?: ChatStatus;
  created_at: string;
}

export type MessageKind = "message" | "action" | "system" | "roll" | "service";

export interface Message {
  id: number;
  chat_id: number;
  external_id: number | null;
  author: string | null;
  sender_id: number | null;
  text: string;
  created_at: string;
  kind: MessageKind;
}

export type NewMessage = Omit<Message, "id">;
