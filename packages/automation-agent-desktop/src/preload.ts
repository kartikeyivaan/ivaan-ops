import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentApi", {
  getDefaults: () => ipcRenderer.invoke("agent:get-defaults") as Promise<{
    defaultBaseUrl: string;
    agentVersion: string;
  }>,
  pair: (input: { pairingCode: string; baseUrl: string; label?: string }) =>
    ipcRenderer.invoke("agent:pair", input) as Promise<{ ok: true }>,
});
