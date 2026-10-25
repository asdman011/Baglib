import { app, BrowserWindow, protocol, net } from "electron";
import path from "path";
import serve from "electron-serve";
import { pathToFileURL } from "url";
import fs from "fs";
import { Readable } from "stream";
import { setupSystemIPC } from "./ipc/system";
import { setupDatabaseIPC } from "./ipc/database";
import { setupMetadataIPC } from "./ipc/metadata";
import { setupDigitalIPC } from "./ipc/digital";
import { setupPhysicalIPC } from "./ipc/physical";
import { setupLibraryViewsIPC } from "./ipc/library-views";
import { setupCategoriesIPC } from "./ipc/categories";
import { setupSearchIPC } from "./ipc/search";
import { setupEnrichmentIPC } from "./ipc/enrichment";
import { registerOcrIpc } from "./ipc/ocr";
import { registerDictionaryIpc } from "./ipc/dictionary";
import { registerAIIpc } from "./ipc/ai";
import { registerAudioIpc, shutdownAudioIpc } from "./ipc/audio";
import { registerCloudSyncIpc } from "./ipc/cloud-sync";
import { registerOpdsIpcHandlers } from "./ipc/opds";
import { registerWebClipperIpcHandlers } from "./ipc/web-clipper";
import { registerReadingStatisticsIpc } from "./ipc/reading-statistics";
import { registerSecurityIpc } from "./ipc/security";
import { registerReaderPluginsIpc } from "./ipc/reader-plugins";
import { registerSunnahIpc } from "./ipc/sunnah";
import { registerQuranIpc } from "./ipc/quran";
import { initializeDatabase, closeDatabase } from "./database";
import { ContentShieldService } from "./services/shield/content-shield.service";
import { installPdfDiagnosticFilter } from "./services/digital/pdf-diagnostics";

// Register privileged custom schemes before app.whenReady()
// Grants standard, secure, fetch, streaming, CORS, and CSP privileges to reader assets.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'baglib-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
  {
    scheme: 'local-pdf',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);

installPdfDiagnosticFilter();

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

// MIME type map for streaming digital book formats and internal asset files
const MIME_BY_EXT: Record<string, string> = {
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw3': 'application/vnd.amazon.mobi8-ebook',
  '.azw': 'application/vnd.amazon.ebook',
  '.fb2': 'application/x-fictionbook+xml',
  '.fbz': 'application/x-zip-compressed-fb2',
  '.cbz': 'application/vnd.comicbook+zip',
  '.cbr': 'application/vnd.comicbook-rar',
  '.cbt': 'application/x-tar',
  '.cb7': 'application/x-7z-compressed',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xhtml': 'application/xhtml+xml; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.m4b': 'audio/mp4',
};

function resolveLocalFilePath(rawUrlPath: string): string | null {
  let decodedPath = rawUrlPath;
  try {
    decodedPath = decodeURIComponent(rawUrlPath);
  } catch {}

  // Strip leading slashes, e.g. "///C:/..." or "/C:/..." -> "C:/..."
  decodedPath = decodedPath.replace(/^\/+/, '');
  // If Windows drive letter followed by slash or colon, e.g. "C:/..." or "c:/..."
  if (/^[a-zA-Z]:[\\/]/.test(decodedPath)) {
    decodedPath = path.normalize(decodedPath);
  } else if (/^[a-zA-Z][\\/]/.test(decodedPath)) {
    decodedPath = path.normalize(`${decodedPath[0]}:${decodedPath.slice(1)}`);
  } else {
    decodedPath = path.normalize(`/${decodedPath}`);
  }

  if (fs.existsSync(decodedPath)) {
    return decodedPath;
  }
  const candidate1 = path.resolve(process.cwd(), '..', decodedPath);
  if (fs.existsSync(candidate1)) return candidate1;
  const candidate2 = path.resolve(process.cwd(), decodedPath);
  if (fs.existsSync(candidate2)) return candidate2;
  return null;
}

async function handleAssetProtocolRequest(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const allowedOrigin = origin === 'http://localhost:3000' || origin === 'app://-';
  if (origin && origin !== 'null' && !allowedOrigin) return new Response(null, { status: 403 });
  const corsHeaders: Record<string, string> = allowedOrigin ? {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Vary': 'Origin',
  } : {};
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    let rawPath = request.url.replace(/^(baglib-asset|local-pdf):\/\//, '');
    const questionIndex = rawPath.indexOf('?');
    if (questionIndex !== -1) rawPath = rawPath.slice(0, questionIndex);
    const hashIndex = rawPath.indexOf('#');
    if (hashIndex !== -1) rawPath = rawPath.slice(0, hashIndex);

    const filePath = resolveLocalFilePath(rawPath);
    if (!filePath) {
      return new Response("File not found on disk", { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new Response('Requested range not satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        });
      }

      const chunksize = end - start + 1;
      const nodeStream = fs.createReadStream(filePath, { start, end });
      const webStream = (Readable as any).toWeb ? (Readable as any).toWeb(nodeStream) : nodeStream;

      return new Response(webStream as any, {
        status: 206,
        headers: {
          ...corsHeaders,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': mimeType,
        },
      });
    }

    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
    headers.set('Content-Type', mimeType);
    return new Response(response.body, { status: response.status, headers });
  } catch (err: any) {
    console.error('[baglib:protocol] Error streaming asset:', err);
    return new Response('Internal asset streaming error', { status: 500 });
  }
}

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

// Single-instance lock and OS file association / protocol routing
app.setAsDefaultProtocolClient('baglib');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const openArg = argv.find(
        (arg) => !arg.startsWith('--') && !arg.endsWith('.exe') && fs.existsSync(arg)
      );
      if (openArg) {
        mainWindow.webContents.send('reader:open-file', openArg);
      }
    }
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('reader:open-file', filePath);
  }
});

// Setup IPC Handlers
setupSystemIPC();
setupDatabaseIPC();
setupMetadataIPC();
setupDigitalIPC();
setupPhysicalIPC();
setupLibraryViewsIPC();
setupCategoriesIPC();
setupSearchIPC();
setupEnrichmentIPC();
registerOcrIpc();
registerDictionaryIpc();
registerAIIpc();
registerAudioIpc();
registerCloudSyncIpc();
registerOpdsIpcHandlers();
registerWebClipperIpcHandlers();
registerReadingStatisticsIpc();
registerSecurityIpc();
registerReaderPluginsIpc();
registerSunnahIpc();
registerQuranIpc();

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

  // Register privileged custom streaming protocols
  try {
    protocol.handle('baglib-asset', handleAssetProtocolRequest);
    protocol.handle('local-pdf', handleAssetProtocolRequest);
  } catch (e) {
    console.error("Protocol registration error:", e);
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on('before-quit', () => {
  void shutdownAudioIpc();
});
