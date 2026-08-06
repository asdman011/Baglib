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
var import_path2 = __toESM(require("path"));
var import_electron_serve = __toESM(require("electron-serve"));
var import_url = require("url");
var import_fs2 = __toESM(require("fs"));

// src/main/ipc/system.ts
var import_electron = require("electron");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var pdfParse = require("pdf-parse");
function renderPageText(pageData) {
  return pageData.getTextContent().then(function(textContent) {
    let lastY;
    let text = "";
    for (const item of textContent.items) {
      if (lastY === item.transform[5] || lastY === void 0) {
        text += item.str;
      } else {
        text += "\n" + item.str;
      }
      lastY = item.transform[5];
    }
    return "\n---PAGE_SPLIT_MARKER---\n" + text;
  });
}
function setupSystemIPC() {
  import_electron.ipcMain.handle("system:get-info", () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: import_electron.app.getVersion()
    };
  });
  import_electron.ipcMain.handle("system:open-file-dialog", async () => {
    try {
      const result = await import_electron.dialog.showOpenDialog({
        properties: ["openFile"],
        title: "\u0627\u062E\u062A\u0631 \u0643\u062A\u0627\u0628\u0627\u064B \u0623\u0648 \u0645\u0644\u0641\u0627\u064B \u0631\u0642\u0645\u064A\u0627\u064B \u0645\u0646 \u062D\u0627\u0633\u0648\u0628\u0643",
        filters: [
          { name: "\u062C\u0645\u064A\u0639 \u0643\u062A\u0628 \u0648\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0627\u0644\u0631\u0642\u0645\u064A\u0629", extensions: ["pdf", "epub", "mobi", "azw3", "txt", "html", "djvu", "docx"] },
          { name: "\u0645\u0644\u0641\u0627\u062A PDF", extensions: ["pdf"] },
          { name: "\u0643\u062A\u0628 EPUB \u0648 MOBI", extensions: ["epub", "mobi", "azw3"] },
          { name: "\u0645\u0644\u0641\u0627\u062A \u0646\u0635\u0648\u0635 HTML / TXT", extensions: ["txt", "html", "docx"] },
          { name: "\u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0644\u0641\u0627\u062A (*.*)", extensions: ["*"] }
        ]
      });
      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (err) {
      console.error("Error in open-file-dialog:", err);
      return null;
    }
  });
  import_electron.ipcMain.handle("system:read-pdf-base64", async (_, filePath) => {
    try {
      let resolvedPath = filePath;
      if (!import_fs.default.existsSync(resolvedPath)) {
        const candidate1 = import_path.default.resolve(process.cwd(), "..", filePath);
        const candidate2 = import_path.default.resolve(process.cwd(), filePath);
        if (import_fs.default.existsSync(candidate1)) resolvedPath = candidate1;
        else if (import_fs.default.existsSync(candidate2)) resolvedPath = candidate2;
      }
      if (resolvedPath && import_fs.default.existsSync(resolvedPath)) {
        const buffer = import_fs.default.readFileSync(resolvedPath);
        return buffer.toString("base64");
      }
      return null;
    } catch (err) {
      console.error("Error reading file in IPC:", err);
      return null;
    }
  });
  import_electron.ipcMain.handle("system:extract-pdf-text", async (_, filePath) => {
    try {
      let resolvedPath = filePath;
      if (!import_fs.default.existsSync(resolvedPath)) {
        const candidate1 = import_path.default.resolve(process.cwd(), "..", filePath);
        const candidate2 = import_path.default.resolve(process.cwd(), filePath);
        if (import_fs.default.existsSync(candidate1)) resolvedPath = candidate1;
        else if (import_fs.default.existsSync(candidate2)) resolvedPath = candidate2;
      }
      if (resolvedPath && import_fs.default.existsSync(resolvedPath)) {
        const dataBuffer = import_fs.default.readFileSync(resolvedPath);
        const pdfFn = typeof pdfParse === "function" ? pdfParse : pdfParse.default || pdfParse.PDF;
        if (typeof pdfFn === "function") {
          const pdfData = await pdfFn(dataBuffer, { pagerender: renderPageText });
          const rawText = pdfData.text || "";
          const cleanText = rawText.replace(/---PAGE_SPLIT_MARKER---/g, "").trim();
          const numPages = pdfData.numpages || 1;
          const avgCharsPerPage = cleanText.length / numPages;
          const isScannedImagePdf = avgCharsPerPage < 50;
          return {
            text: isScannedImagePdf ? "" : rawText,
            numpages: numPages,
            info: pdfData.info || {},
            isScannedImagePdf,
            avgCharsPerPage,
            totalChars: cleanText.length
          };
        }
      }
      return null;
    } catch (err) {
      console.error("Error extracting PDF text:", err);
      return null;
    }
  });
}

// src/main/index.ts
var isDev = !import_electron2.app.isPackaged;
var loadApp = (0, import_electron_serve.default)({ directory: import_path2.default.join(__dirname, "../../out") });
var mainWindow = null;
async function createWindow() {
  mainWindow = new import_electron2.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: import_path2.default.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      plugins: true
    }
  });
  if (isDev) {
    await mainWindow.loadURL("http://localhost:3000");
  } else {
    await loadApp(mainWindow);
  }
}
setupSystemIPC();
import_electron2.app.whenReady().then(() => {
  try {
    import_electron2.protocol.handle("local-pdf", (request) => {
      const rawPath = request.url.replace("local-pdf://", "");
      let decodedPath = decodeURIComponent(rawPath);
      if (!import_fs2.default.existsSync(decodedPath)) {
        const candidate1 = import_path2.default.resolve(process.cwd(), "..", decodedPath);
        const candidate2 = import_path2.default.resolve(process.cwd(), decodedPath);
        if (import_fs2.default.existsSync(candidate1)) decodedPath = candidate1;
        else if (import_fs2.default.existsSync(candidate2)) decodedPath = candidate2;
      }
      if (import_fs2.default.existsSync(decodedPath)) {
        return import_electron2.net.fetch((0, import_url.pathToFileURL)(decodedPath).toString());
      }
      return new Response("File not found on disk", { status: 404 });
    });
  } catch (e) {
    console.error("Protocol registration error:", e);
  }
  createWindow();
});
import_electron2.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron2.app.quit();
});
