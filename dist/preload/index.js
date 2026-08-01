"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/electron/index.js
var require_electron = __commonJS({
  "node_modules/electron/index.js"(exports2, module2) {
    "use strict";
    var { spawnSync } = require("child_process");
    var fs = require("fs");
    var path = require("path");
    var pathFile = path.join(__dirname, "path.txt");
    function downloadElectron() {
      console.log("Downloading Electron binary...");
      const result = spawnSync(process.execPath, [path.join(__dirname, "install.js")], {
        stdio: "inherit"
      });
      if (result.status !== 0) {
        throw new Error(
          'Electron failed to install correctly. Please delete `node_modules/electron` and run "npx install-electron --no" manually.'
        );
      }
    }
    function getElectronPath() {
      let executablePath;
      if (fs.existsSync(pathFile)) {
        executablePath = fs.readFileSync(pathFile, "utf-8");
      }
      if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
        return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || "electron");
      }
      if (executablePath) {
        const fullPath = path.join(__dirname, "dist", executablePath);
        if (!fs.existsSync(fullPath)) {
          downloadElectron();
        }
        return fullPath;
      } else {
        try {
          downloadElectron();
        } catch {
          throw new Error(
            'Electron failed to install correctly. Please delete `node_modules/electron` and run "npx install-electron --no" manually.'
          );
        }
        executablePath = fs.readFileSync(pathFile, "utf-8");
        return path.join(__dirname, "dist", executablePath);
      }
    }
    module2.exports = getElectronPath();
  }
});

// src/preload/index.ts
var preload_exports = {};
__export(preload_exports, {
  API: () => API
});
module.exports = __toCommonJS(preload_exports);
var import_electron = __toESM(require_electron());
var API = {
  getSystemInfo: () => import_electron.ipcRenderer.invoke("system:get-info"),
  onNotification: (callback) => {
    const subscription = (_, value) => callback(value);
    import_electron.ipcRenderer.on("system:notification", subscription);
    return () => import_electron.ipcRenderer.removeListener("system:notification", subscription);
  }
};
import_electron.contextBridge.exposeInMainWorld("electronAPI", API);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  API
});
