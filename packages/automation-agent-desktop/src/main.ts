import path from "path";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from "electron";
import { loadConfigResolved } from "@ivaan/automation-agent/dist/config.js";
import { pairDevice } from "@ivaan/automation-agent/dist/pairing.js";
import { applyBundledPlaywrightEnv } from "@ivaan/automation-agent/dist/playwright-env.js";
import { runAgentLoop } from "@ivaan/automation-agent/dist/runner.js";
import { AGENT_VERSION, DEFAULT_IVAAN_OPS_BASE_URL } from "@ivaan/automation-agent/dist/constants.js";
import type { PortalCode } from "@ivaan/automation-agent/dist/constants.js";

let tray: Tray | null = null;
let pairingWindow: BrowserWindow | null = null;
let agentStopping = false;
let agentRunning = false;
let heartbeatOk = false;
let pairedCloudUrl = "";

function resourcesPath(): string {
  return process.resourcesPath;
}

function setPlaywrightPaths(): void {
  process.env.IVAAN_AGENT_RESOURCES_PATH = resourcesPath();
  applyBundledPlaywrightEnv();
}

function rendererPath(name: string): string {
  return path.join(app.getAppPath(), "renderer", name);
}

function trayTooltip(): string {
  if (!pairedCloudUrl) return "Ivaan Ops DCR Agent — not paired";
  if (heartbeatOk) return `Ivaan Ops DCR Agent — connected (${pairedCloudUrl})`;
  return `Ivaan Ops DCR Agent — connection issue (${pairedCloudUrl})`;
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setToolTip(trayTooltip());

  const statusLine = !pairedCloudUrl
    ? "Not paired"
    : heartbeatOk
      ? `Connected · ${pairedCloudUrl}`
      : `Offline · ${pairedCloudUrl}`;

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Ivaan Ops DCR Agent v${AGENT_VERSION}`, enabled: false },
      { label: statusLine, enabled: false },
      { type: "separator" },
      {
        label: pairedCloudUrl ? "Pair again…" : "Pair with Ivaan Ops…",
        click: () => openPairingWindow(),
      },
      { type: "separator" },
      { label: "Quit", click: () => void quitApp() },
    ]),
  );
}

function openPairingWindow(): void {
  if (pairingWindow) {
    pairingWindow.focus();
    return;
  }

  pairingWindow = new BrowserWindow({
    width: 440,
    height: 420,
    resizable: false,
    autoHideMenuBar: true,
    title: "Pair Ivaan Ops DCR Agent",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pairingWindow.on("closed", () => {
    pairingWindow = null;
  });

  void pairingWindow.loadFile(rendererPath("pairing.html"));
}

async function startAgentLoopIfPaired(): Promise<void> {
  if (agentRunning) return;

  const config = await loadConfigResolved();
  if (!config?.deviceId || !config.deviceSecret) {
    pairedCloudUrl = "";
    refreshTrayMenu();
    openPairingWindow();
    return;
  }

  pairedCloudUrl = config.baseUrl;
  agentRunning = true;
  agentStopping = false;
  refreshTrayMenu();

  void runAgentLoop(config, {
    hooks: {
      shouldStop: () => agentStopping,
      onHeartbeat: (ok) => {
        heartbeatOk = ok;
        refreshTrayMenu();
      },
    },
    browser: {
      waitForLogin: (portal: PortalCode) => promptPortalLogin(portal),
    },
  })
    .catch((error) => {
      console.error(error);
      void dialog.showErrorBox(
        "Agent error",
        error instanceof Error ? error.message : "The automation agent stopped unexpectedly.",
      );
    })
    .finally(() => {
      agentRunning = false;
      heartbeatOk = false;
      refreshTrayMenu();
    });
}

async function promptPortalLogin(portal: PortalCode): Promise<void> {
  const result = await dialog.showMessageBox({
    type: "info",
    buttons: ["Login complete", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: `${portal} portal login`,
    message: `Log in to the ${portal} company on the DCR portal`,
    detail: "Complete OTP/CAPTCHA in the browser window, then click Login complete.",
  });
  if (result.response !== 0) {
    throw new Error(`${portal} login was not confirmed.`);
  }
}

async function quitApp(): Promise<void> {
  agentStopping = true;
  tray?.destroy();
  tray = null;
  app.quit();
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVR42mNk+M9QzwAEYBxVSF+FABJADtwf6QAAAABJRU5ErkJggg==",
  );
  tray = new Tray(icon);
  refreshTrayMenu();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    openPairingWindow();
  });

  app.on("window-all-closed", () => {
    /* Tray app — keep running when pairing window closes. */
  });

  app.on("before-quit", () => {
    agentStopping = true;
  });

  app.whenReady().then(() => {
    setPlaywrightPaths();
    createTray();

    ipcMain.handle("agent:get-defaults", () => ({
      defaultBaseUrl: DEFAULT_IVAAN_OPS_BASE_URL,
      agentVersion: AGENT_VERSION,
    }));

    ipcMain.handle(
      "agent:pair",
      async (_event, input: { pairingCode: string; baseUrl: string; label?: string }) => {
        await pairDevice(input);
        pairedCloudUrl = input.baseUrl.replace(/\/$/, "");
        heartbeatOk = false;
        refreshTrayMenu();
        pairingWindow?.close();
        await startAgentLoopIfPaired();
        return { ok: true };
      },
    );

    void startAgentLoopIfPaired();
  });
}
