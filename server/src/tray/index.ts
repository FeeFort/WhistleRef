import { logger } from "../logger/logger.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { openInBrowser } from "../browser.js";
import { SysTrayInstance, SysTrayOptions, TrayOptions } from "../types/index.js";
import { createKdeTray } from "./kdeTray.js";

const log = logger.child("core", "tray");

const require = createRequire(import.meta.url);
const systray2Module = require("systray2") as { default?: unknown };
const SysTray = (systray2Module.default ?? systray2Module) as new (options: SysTrayOptions) => SysTrayInstance;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getIconBase64(): string {
  const iconName = process.platform === "win32" ? "icon.ico" : "icon.png";
  const candidates = [path.join(__dirname, "..", "icons", iconName), path.join(__dirname, "..", "..", "icons", iconName)];
  const iconPath = candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
  const icon = fs.readFileSync(iconPath);
  log.debug("Loading icon", { path: iconPath, bytes: icon.length });
  return icon.toString("base64");
}

export function createTray({ port, onQuit }: TrayOptions): SysTrayInstance {
  if (process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland" && /kde|plasma/i.test(`${process.env.XDG_CURRENT_DESKTOP ?? ""}:${process.env.DESKTOP_SESSION ?? ""}`)) {
    const kdeReady = createKdeTray({ port, onQuit }).catch((error) => {
      log.warn("KDE StatusNotifier unavailable, using systray2", { error });
      return createLegacyTray({ port, onQuit });
    });
    return {
      onClick: () => undefined,
      ready: async () => {
        await kdeReady;
      },
      kill: () => {
        void kdeReady.then((tray) => tray.kill());
      },
    };
  }
  return createLegacyTray({ port, onQuit });
}

function createLegacyTray({ port, onQuit }: TrayOptions): SysTrayInstance {
  log.debug("Creating tray", { platform: process.platform, arch: process.arch, port });
  const openItem = {
    title: "Open WhistleRef",
    tooltip: "Open in browser",
    checked: false,
    enabled: true,
    click: () => openInBrowser(`http://localhost:${port}`),
  };

  const quitItem = {
    title: "Quit",
    tooltip: "",
    checked: false,
    enabled: true,
    click: onQuit,
  };

  const systray = new SysTray({
    menu: {
      icon: getIconBase64(),
      title: "WhistleRef",
      tooltip: "WhistleRef — osu! referee client",
      items: [openItem, quitItem],
    },
    debug: false,
    copyDir: true,
  });
  log.debug("SysTray instance created");

  systray.onClick((action) => {
    log.debug("Menu item clicked", { title: action.item.title });
    action.item.click?.();
  });
  log.trace("Click handler registered");

  systray
    .ready()
    .then(() => {
      log.info("Tray ready");
    })
    .catch((error) => {
      log.error("Tray failed to start", { error });
    });

  return systray;
}
