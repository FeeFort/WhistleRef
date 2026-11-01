import { logger } from "../logger/logger.js";
import { openInBrowser } from "../browser.js";
import { DbusModule, KdeTrayInstance, KdeTrayOptions } from "../types/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const log = logger.child("core", "kdeTray");

function readPixmap(): [number, number, Buffer] {
  const base = path.dirname(fileURLToPath(import.meta.url));
  const file = [path.join(base, "..", "icons", "icon.png"), path.join(base, "..", "..", "icons", "icon.png")].find((p) => fs.existsSync(p)) ?? path.join(base, "..", "icons", "icon.png");
  const png = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  const parts: Buffer[] = [];
  while (offset < png.length) {
    const size = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + size);
    offset += size + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === "IDAT") parts.push(data);
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const ul = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const value = raw[src++];
      const p = left + up - ul;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - ul);
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul) : 0;
      pixels[y * stride + x] = (value + predictor) & 255;
    }
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    pixels[i] = a;
    pixels[i + 1] = r;
    pixels[i + 2] = g;
    pixels[i + 3] = b;
  }
  return [width, height, pixels];
}

export async function createKdeTray(options: KdeTrayOptions): Promise<KdeTrayInstance> {
  const dbus = (await import("dbus-next")) as DbusModule;
  const bus = dbus.sessionBus();
  bus.on("error", (error: Error) => log.error("KDE D-Bus connection failed", { error }));
  const serviceName = `com.whistleref.Tray${process.pid}`;
  const itemPath = "/StatusNotifierItem";
  const menuPath = "/MenuBar";
  const pixmap = readPixmap();
  let killed = false;

  class StatusNotifierItem extends dbus.interface.Interface {
    constructor() {
      super("org.kde.StatusNotifierItem");
    }
    Activate(): void {
      openInBrowser(`http://localhost:${options.port}`);
    }
    SecondaryActivate(): void {
      openInBrowser(`http://localhost:${options.port}`);
    }
    ContextMenu(): void {
      // Plasma opens the exported DBusMenu separately
    }
    get Category() {
      return "ApplicationStatus";
    }
    get Id() {
      return "WhistleRef";
    }
    get Title() {
      return "WhistleRef";
    }
    get Status() {
      return "Active";
    }
    get IconPixmap() {
      return [pixmap];
    }
    get Menu() {
      return menuPath;
    }
    get ToolTip() {
      return "WhistleRef — osu! referee client";
    }
  }
  StatusNotifierItem.configureMembers({
    methods: { Activate: { inSignature: "ii" }, SecondaryActivate: { inSignature: "ii" }, ContextMenu: { inSignature: "ii" } },
    properties: {
      Category: { signature: "s" },
      Id: { signature: "s" },
      Title: { signature: "s" },
      Status: { signature: "s" },
      IconPixmap: { signature: "a(iiay)" },
      Menu: { signature: "o" },
      ToolTip: { signature: "s" },
    },
  });

  class Menu extends dbus.interface.Interface {
    constructor() {
      super("com.canonical.dbusmenu");
    }
    get Version() {
      return 3;
    }
    get TextDirection() {
      return "ltr";
    }
    get Status() {
      return "normal";
    }
    get IconThemePath() {
      return "";
    }
    GetLayout(parent: number, _depth: number, _properties: string[]) {
      void parent;
      void _depth;
      void _properties;
      const item = (id: number, label: string) =>
        new dbus.Variant("(ia{sv}av)", [
          id,
          {
            label: new dbus.Variant("s", label),
            enabled: new dbus.Variant("b", true),
            visible: new dbus.Variant("b", true),
            type: new dbus.Variant("s", "standard"),
          },
          [],
        ]);
      return [0, [1, {}, [item(2, "Open WhistleRef"), item(3, "Quit")]]];
    }
    Event(id: number, event: string, _data: unknown, _timestamp: number): void {
      void _data;
      void _timestamp;
      if (event !== "clicked") return;
      if (id === 2) openInBrowser(`http://localhost:${options.port}`);
      if (id === 3) options.onQuit();
    }
    GetGroupProperties(): Record<string, unknown> {
      return {};
    }
    GetProperty(): Record<string, unknown> {
      return {};
    }
    AboutToShow(): boolean {
      return false;
    }
    AboutToShowGroup(): boolean {
      return false;
    }
  }
  Menu.configureMembers({
    properties: {
      Version: { signature: "u" },
      TextDirection: { signature: "s" },
      Status: { signature: "s" },
      IconThemePath: { signature: "s" },
    },
    methods: {
      GetLayout: { inSignature: "iias", outSignature: "u(ia{sv}av)" },
      Event: { inSignature: "isvu" },
      GetGroupProperties: { inSignature: "auas", outSignature: "a{sv}" },
      GetProperty: { inSignature: "us", outSignature: "v" },
      AboutToShow: { inSignature: "u", outSignature: "b" },
      AboutToShowGroup: { inSignature: "au", outSignature: "au" },
    },
  });

  try {
    bus.export(itemPath, new StatusNotifierItem());
    bus.export(menuPath, new Menu());
    await bus.requestName(serviceName, 0);
    const watcher = await bus.getProxyObject("org.kde.StatusNotifierWatcher", "/StatusNotifierWatcher");
    const watcherInterface = watcher.getInterface("org.kde.StatusNotifierWatcher");
    await watcherInterface.RegisterStatusNotifierItem(serviceName);
  } catch (error) {
    log.debug("KDE registration failed", { error });
    bus.disconnect();
    throw error;
  }
  return {
    ready: async () => {},
    kill: () => {
      if (!killed) {
        killed = true;
        bus.disconnect();
      }
    },
  };
}
