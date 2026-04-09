import { app, dialog, Menu, shell, session, nativeImage, nativeTheme } from "electron";
import { join } from "path";
import { readFileSync } from "fs";
import { loadConfig, DEFAULT_CONFIG, type AppConfig } from "./config";

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8")) as {
  author?: { name?: string; email?: string };
  homepage?: string;
};

function getAppIcon(variant: "dock" | "about" = "dock"): Electron.NativeImage {
  const suffix = variant === "about" ? "-about" : "";
  const theme = nativeTheme.shouldUseDarkColors ? "-dark" : "";
  return nativeImage.createFromPath(
    join(__dirname, "..", "..", "build", `icon${theme}${suffix}.png`),
  );
}
import { createWindow, getMainWindow } from "./window";
import { registerIpcHandlers } from "./ipc";
import { stopSession } from "./session";
import { stopMetricsCollection } from "./metrics";
import { log, LogLevel } from "./logger";

// ── App identity ──
app.setName("ExpressText");
if (process.platform === "darwin") {
  const icon = getAppIcon();
  if (!icon.isEmpty()) app.dock.setIcon(icon);
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
app.whenReady().then(async () => {
  const configResult = await loadConfig();
  appConfig = configResult.config;
  registerIpcHandlers(
    () => appConfig,
    (c) => {
      appConfig = c;
    },
    configResult.warnings,
  );

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  const isMac = process.platform === "darwin";
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
                    icon: getAppIcon("about"),
                    type: "info",
                    title: `About ${app.name}`,
                    message: `${app.name} v${app.getVersion()}`,
                    detail: `Real-time speech transcription and translation.\n\nBy ${pkg.author?.name ?? ""}${pkg.author?.email ? `\n${pkg.author.email}` : ""}${pkg.homepage ? `\n${pkg.homepage}` : ""}`,
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
        { type: "separator" },
        {
          label: "Send Feedback",
          click: () => {
            shell.openExternal(`mailto:${pkg.author?.email ?? ""}?subject=ExpressText%20Feedback`);
          },
        },
        ...(!isMac
          ? [
              { type: "separator" as const },
              {
                label: "About ExpressText",
                click: () => {
                  dialog.showMessageBox({
                    icon: getAppIcon("about"),
                    type: "info",
                    title: "About ExpressText",
                    message: `ExpressText v${app.getVersion()}`,
                    detail: `Real-time speech transcription and translation.\n\nBy ${pkg.author?.name ?? ""}${pkg.author?.email ? `\n${pkg.author.email}` : ""}${pkg.homepage ? `\n${pkg.homepage}` : ""}`,
                  });
                },
              },
            ]
          : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow();
});

let shuttingDown = false;
app.on("before-quit", async (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  try {
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
