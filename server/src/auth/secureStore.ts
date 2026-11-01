import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { PersistedSession } from "../types/index.js";

const execFileAsync = promisify(execFile);

const SERVICE_NAME = "whistleref";
const ACCOUNT_NAME = "osu-session";

function getWindowsSecretFilePath(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "WhistleRef", "session.dpapi");
}

// --- macOS: security CLI ---

async function saveMacOS(json: string): Promise<void> {
  const encoded = Buffer.from(json, "utf8").toString("base64");
  await execFileAsync("security", ["add-generic-password", "-a", ACCOUNT_NAME, "-s", SERVICE_NAME, "-w", encoded, "-U"]);
}

async function loadMacOS(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("security", ["find-generic-password", "-a", ACCOUNT_NAME, "-s", SERVICE_NAME, "-w"]);
    return Buffer.from(stdout.trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
}

async function clearMacOS(): Promise<void> {
  try {
    await execFileAsync("security", ["delete-generic-password", "-a", ACCOUNT_NAME, "-s", SERVICE_NAME]);
  } catch {
    // Ignore errors if the item doesn't exist
  }
}

// --- Linux: secret-tool CLI ---

function execFileWithStdin(command: string, args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

async function saveLinux(json: string): Promise<void> {
  await execFileWithStdin("secret-tool", ["store", "--label=WhistleRef osu! session", "service", SERVICE_NAME, "account", ACCOUNT_NAME], json);
}

async function loadLinux(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("secret-tool", ["lookup", "service", SERVICE_NAME, "account", ACCOUNT_NAME]);
    return stdout || null;
  } catch {
    return null;
  }
}

async function clearLinux(): Promise<void> {
  try {
    await execFileAsync("secret-tool", ["clear", "service", SERVICE_NAME, "account", ACCOUNT_NAME]);
  } catch {
    // Ignore errors if the item doesn't exist
  }
}

// --- Windows: PowerShell + DPAPI ---

function runPowerShell(script: string): Promise<string> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]).then((r) => r.stdout);
}

async function saveWindows(json: string): Promise<void> {
  const filePath = getWindowsSecretFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const base64Json = Buffer.from(json, "utf8").toString("base64");

  await runPowerShell(`
    Add-Type -AssemblyName System.Security
    $bytes = [System.Convert]::FromBase64String("${base64Json}")
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
      $bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [System.IO.File]::WriteAllBytes("${filePath}", $protected)
  `);
}

async function loadWindows(): Promise<string | null> {
  const filePath = getWindowsSecretFilePath();
  if (!fs.existsSync(filePath)) return null;

  try {
    const output = await runPowerShell(`
      Add-Type -AssemblyName System.Security
      $protected = [System.IO.File]::ReadAllBytes("${filePath}")
      $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $protected, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
      )
      [System.Convert]::ToBase64String($bytes)
    `);
    return Buffer.from(output.trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
}

async function clearWindows(): Promise<void> {
  const filePath = getWindowsSecretFilePath();
  fs.rmSync(filePath, { force: true });
}

// --- Entry functions, switch by process.platform ---

async function saveRaw(json: string): Promise<void> {
  if (process.platform === "darwin") return saveMacOS(json);
  if (process.platform === "linux") return saveLinux(json);
  if (process.platform === "win32") return saveWindows(json);
  throw new Error(`Unsupported platform: ${process.platform}`);
}

async function loadRaw(): Promise<string | null> {
  if (process.platform === "darwin") return loadMacOS();
  if (process.platform === "linux") return loadLinux();
  if (process.platform === "win32") return loadWindows();
  return null;
}

async function clearRaw(): Promise<void> {
  if (process.platform === "darwin") return clearMacOS();
  if (process.platform === "linux") return clearLinux();
  if (process.platform === "win32") return clearWindows();
}

export async function saveSession(session: PersistedSession): Promise<void> {
  await saveRaw(JSON.stringify(session));
}

export async function loadSession(): Promise<PersistedSession | null> {
  const raw = await loadRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await clearRaw();
}
