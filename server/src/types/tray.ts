export interface MenuItem {
  title: string;
  tooltip: string;
  checked: boolean;
  enabled: boolean;
  click?: () => void;
}

export interface SysTrayOptions {
  menu: { icon: string; title: string; tooltip: string; items: MenuItem[] };
  debug?: boolean;
  copyDir?: boolean;
}

export interface ClickAction {
  item: MenuItem;
}

export interface SysTrayInstance {
  onClick(callback: (action: ClickAction) => void): void;
  ready(): Promise<void>;
  kill(exitNode?: boolean): void;
}

export type DbusModule = typeof import("dbus-next");
export interface TrayOptions {
  port: number;
  onQuit: () => void;
}
export interface KdeTrayOptions {
  port: number;
  onQuit: () => void;
}
export interface KdeTrayInstance {
  ready(): Promise<void>;
  kill(): void;
}

// stats fetcher types
