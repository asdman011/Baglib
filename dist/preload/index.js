"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/preload/index.ts
var preload_exports = {};
__export(preload_exports, {
  API: () => API
});
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
var API = {
  getSystemInfo: () => import_electron.ipcRenderer.invoke("system:get-info"),
  openFileDialog: () => import_electron.ipcRenderer.invoke("system:open-file-dialog"),
  readPdfBase64: (filePath) => import_electron.ipcRenderer.invoke("system:read-pdf-base64", filePath),
  extractPdfText: (filePath) => import_electron.ipcRenderer.invoke("system:extract-pdf-text", filePath),
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
