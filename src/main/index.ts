import { app, dialog, ipcMain, Menu, shell, session, nativeImage, nativeTheme } from "electron";
import { join } from "path";
import { readFile } from "fs/promises";
import { loadConfig, DEFAULT_CONFIG, type AppConfig } from "./config";

function getAppIcon(): Electron.NativeImage {
  const theme = nativeTheme.shouldUseDarkColors ? "-dark" : "";
  return nativeImage.createFromPath(join(__dirname, "..", "..", "build", `icon${theme}.png`));
}
import { createWindow, getMainWindow } from "./window";
import { registerIpcHandlers } from "./ipc";
import { stopSession } from "./session";
import { stopMetricsCollection } from "./metrics";
import { log, LogLevel } from "./logger";
import { initAutoUpdater, checkForUpdatesManual, quitAndInstall } from "./updater";
import { vizInit, vizCleanup, vizUpdateConfig } from "./viz-engine";

// ── App identity ──
app.setName("ExpressText");
if (process.platform === "darwin") {
  const icon = getAppIcon();
  if (!icon.isEmpty()) app.dock?.setIcon(icon);
}

// ── Single instance lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ── Process error handlers ──
process.on("uncaughtException", (err) => {
  log(LogLevel.Error, "uncaughtException", { message: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  log(LogLevel.Error, "unhandledRejection", {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// ── App state ──
let appConfig: AppConfig = DEFAULT_CONFIG;

// ── App lifecycle ──
app.whenReady().then(() => {
  const configResult = loadConfig();
  appConfig = configResult.config;
  registerIpcHandlers(
    () => appConfig,
    (c) => {
      appConfig = c;
      vizUpdateConfig(c.viz);
    },
    configResult.warnings,
  );

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  createWindow();
  vizInit(appConfig.viz, getMainWindow()!);
  initAutoUpdater();
  ipcMain.on("restart-for-update", () => quitAndInstall());

  // Defer menu building so it doesn't block window creation
  setImmediate(async () => {
    const pkg = JSON.parse(
      await readFile(join(__dirname, "..", "..", "package.json"), "utf-8"),
    ) as { author?: { name?: string; email?: string }; homepage?: string };
    const isMac = process.platform === "darwin";
    const aboutDetail = `AI-powered real-time speech transcription and translation.\n\nBy ${pkg.author?.name ?? ""}${pkg.author?.email ? `\n${pkg.author.email}` : ""}${pkg.homepage ? `\n${pkg.homepage}` : ""}`;
    const template: Electron.MenuItemConstructorOptions[] = [
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                {
                  label: `About ${app.name}`,
                  click: () => {
                    dialog.showMessageBox({
                      icon: getAppIcon(),
                      type: "info",
                      title: `About ${app.name}`,
                      message: `${app.name} v${app.getVersion()}`,
                      detail: aboutDetail,
                    });
                  },
                },
                { type: "separator" as const },
                {
                  label: "Settings\u2026",
                  accelerator: "CmdOrCtrl+,",
                  click: () => {
                    getMainWindow()?.webContents.send("open-settings");
                  },
                },
                {
                  label: "Check for Updates\u2026",
                  click: () => checkForUpdatesManual(),
                },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : []),
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "Settings\u2026",
            accelerator: "CmdOrCtrl+,",
            click: () => {
              getMainWindow()?.webContents.send("open-settings");
            },
          },
          {
            label: "Check for Updates\u2026",
            click: () => checkForUpdatesManual(),
          },
          { type: "separator" },
          {
            label: "Send Feedback",
            click: () => {
              shell.openExternal(
                `mailto:${pkg.author?.email ?? ""}?subject=ExpressText%20Feedback`,
              );
            },
          },
          ...(!isMac
            ? [
                { type: "separator" as const },
                {
                  label: "About ExpressText",
                  click: () => {
                    dialog.showMessageBox({
                      icon: getAppIcon(),
                      type: "info",
                      title: "About ExpressText",
                      message: `ExpressText v${app.getVersion()}`,
                      detail: aboutDetail,
                    });
                  },
                },
              ]
            : []),
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  });
});

let shuttingDown = false;
app.on("before-quit", async (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  try {
    vizCleanup();
    stopMetricsCollection();
    await stopSession();
    log(LogLevel.Info, "app:shutdown", { reason: "before-quit" });
  } catch (err) {
    log(LogLevel.Error, "app:shutdown-error", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  app.exit(0);
});

app.on("window-all-closed", () => app.quit());

app.on("second-instance", () => {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("render-process-gone", (_event, _webContents, details) => {
  log(LogLevel.Error, "render-process-gone", {
    reason: details.reason,
    exitCode: details.exitCode,
  });
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  createWindow();
});
