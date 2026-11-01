import { logger } from "../logger/logger.js";
import { WebSocket } from "ws";
import { config } from "../config.js";
import { ChatNotification, ChatSocketOptions } from "../types/index.js";

const log = logger.child("lazer", "chatSocket");

const RECONNECT_DELAY_MS = 5_000;

export class ChatSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly options: ChatSocketOptions) {}

  async connect(): Promise<void> {
    log.debug("Connecting chat socket", { url: config.chatWebSocketUrl });
    this.closed = false;
    const token = typeof this.options.accessToken === "function" ? await this.options.accessToken() : this.options.accessToken;
    if (this.closed) return;
    const socket = new WebSocket(config.chatWebSocketUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    this.socket = socket;
    socket.on("open", () => {
      log.info("Chat socket connected");
      log.traceOut("chat.start");
      socket.send(JSON.stringify({ event: "chat.start" }));
    });
    socket.on("message", (raw) => {
      if (!this.closed && this.socket === socket) this.handleMessage(raw.toString());
    });
    socket.on("error", (error) => this.options.onError?.(error instanceof Error ? error : new Error(String(error))));
    socket.on("close", (code) => {
      log.debug("Chat socket closed", { code, intentional: this.closed });
      if (this.socket === socket) this.socket = null;
      if (!this.closed && !this.reconnectTimer) {
        log.warn("Scheduling chat socket reconnect", { delayMs: RECONNECT_DELAY_MS });
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          void this.connect().catch((error) => this.options.onError?.(error instanceof Error ? error : new Error(String(error))));
        }, RECONNECT_DELAY_MS);
      }
    });
  }

  close(): void {
    log.debug("Closing chat socket");
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private handleMessage(raw: string): void {
    if (!raw || raw === "{}") return;
    try {
      const parsed = JSON.parse(raw) as Partial<ChatNotification>;
      if (typeof parsed.event !== "string") return;
      log.traceIn(parsed.event, () => ({ data: JSON.stringify(parsed.data, (key, value) => (/password|token|secret|authorization/i.test(key) ? "[redacted]" : value)) }));
      this.options.onNotification({ event: parsed.event, data: parsed.data });
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error("Invalid chat notification"));
    }
  }
}
