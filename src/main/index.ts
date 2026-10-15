import { app, BrowserWindow, protocol, net } from "electron";
import path from "path";
import serve from "electron-serve";
import { pathToFileURL } from "url";
import fs from "fs";
import { setupSystemIPC } from "./ipc/system";
import { setupDatabaseIPC } from "./ipc/database";
import { setupMetadataIPC } from "./ipc/metadata";
import { setupDigitalIPC } from "./ipc/digital";
import { setupPhysicalIPC } from "./ipc/physical";
import { setupLibraryViewsIPC } from "./ipc/library-views";
import { setupCategoriesIPC } from "./ipc/categories";
import { setupSearchIPC } from "./ipc/search";
import { initializeDatabase, closeDatabase } from "./database";
import { ContentShieldService } from "./services/shield/content-shield.service";

// Global process error boundary to intercept uncaught exceptions and unhandled promise rejections,
// preventing abrupt Node process exits or terminal crash artifacts during transient network failures.
process.on('unhandledRejection', (reason: any) => {
  const message = reason?.message || String(reason);
  console.warn('[baglib:process] Intercepted unhandled async rejection:', message);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[baglib:process] Intercepted uncaught exception:', error?.message || error);
});

const isDev = !app.isPackaged;
const loadApp = serve({ directory: path.join(__dirname, "../../out") });

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      plugins: true,
    },
  });

  if (isDev) {
    try {
      await mainWindow.loadURL("http://localhost:3000");
    } catch (err) {
      console.warn("[baglib] Failed to connect to dev server on first attempt, retrying in 1s...", err);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL("http://localhost:3000").catch((retryErr) => {
            console.error("[baglib] Secondary dev server loadURL error:", retryErr);
          });
        }
      }, 1000);
    }
  } else {
    await loadApp(mainWindow);
  }
}

// Setup IPC Handlers
setupSystemIPC();
setupDatabaseIPC();
setupMetadataIPC();
setupDigitalIPC();
setupPhysicalIPC();
setupLibraryViewsIPC();
setupCategoriesIPC();
setupSearchIPC();


app.whenReady().then(async () => {
  // Initialize Content Shield for ad & redirect protection
  ContentShieldService.getInstance().initialize();

  // Initialize SQLite database and run pending migrations
  try {
    await initializeDatabase();
    console.log("[baglib] Database initialized successfully.");
  } catch (e) {
    console.error("[baglib] Database initialization failed:", e);
  }

  // Register custom protocol for local PDFs
  try {
    protocol.handle('local-pdf', (request) => {
      const rawPath = request.url.replace('local-pdf://', '');
      let decodedPath = decodeURIComponent(rawPath);

      if (!fs.existsSync(decodedPath)) {
        // Try searching parent workspace or app directory if path is relative
        const candidate1 = path.resolve(process.cwd(), '..', decodedPath);
        const candidate2 = path.resolve(process.cwd(), decodedPath);
        if (fs.existsSync(candidate1)) decodedPath = candidate1;
        else if (fs.existsSync(candidate2)) decodedPath = candidate2;
      }

      if (fs.existsSync(decodedPath)) {
        return net.fetch(pathToFileURL(decodedPath).toString());
      }
      return new Response("File not found on disk", { status: 404 });
    });
  } catch (e) {
    console.error("Protocol registration error:", e);
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
