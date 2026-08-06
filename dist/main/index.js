"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/main/index.ts
var import_electron2 = require("electron");
var import_path = __toESM(require("path"));
var import_electron_serve = __toESM(require("electron-serve"));

// src/main/ipc/system.ts
var import_electron = require("electron");
function setupSystemIPC() {
  import_electron.ipcMain.handle("system:get-info", () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: import_electron.app.getVersion()
    };
  });
}

// src/main/index.ts
var isDev = !import_electron2.app.isPackaged;
var loadApp = (0, import_electron_serve.default)({ directory: import_path.default.join(__dirname, "../../out") });
var mainWindow = null;
async function createWindow() {
  mainWindow = new import_electron2.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: import_path.default.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (isDev) {
    await mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    await loadApp(mainWindow);
  }
}
setupSystemIPC();
import_electron2.app.whenReady().then(createWindow);
import_electron2.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron2.app.quit();
});
