/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("CabinetDesktop", {
  runtime: "electron",
  platform: process.platform,
  /**
   * Trigger the in-app macOS uninstall flow. Returns
   * `{ ok: true, dataPath }` on success — the renderer should show a
   * confirmation toast referencing `dataPath` so the user knows their
   * cabinet content is preserved.
   */
  uninstallApp: () => ipcRenderer.invoke("cabinet:uninstall-app"),
});
