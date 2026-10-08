import { app, BrowserWindow, protocol, net } from "electron";
import path from "path";
import serve from "electron-serve";
import { pathToFileURL } from "url";
import fs from "fs";
import { setupSystemIPC } from "./ipc/system";
import { setupDatabaseIPC } from "./ipc/database";
import { initializeDatabase, closeDatabase } from "./database";

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
    await mainWindow.loadURL("http://localhost:3000");
  } else {
    await loadApp(mainWindow);
  }
}

// Setup IPC Handlers
setupSystemIPC();
setupDatabaseIPC();

app.whenReady().then(async () => {
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
