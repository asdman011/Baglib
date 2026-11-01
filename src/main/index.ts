import { errorMessage } from '../shared/errors';
import { app, BrowserWindow, protocol } from "electron";
import path from "path";
import serve from "electron-serve";
import fs from "fs";
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
import { registerPdfExportIpcHandlers } from "./ipc/pdf-export";
import { registerReadingStatisticsIpc } from "./ipc/reading-statistics";
import { registerSecurityIpc } from "./ipc/security";
import { registerReaderPluginsIpc } from "./ipc/reader-plugins";
import { registerSunnahIpc } from "./ipc/sunnah";
import { registerQuranIpc } from "./ipc/quran";
import { registerAthanIpc, startAthanScheduler } from "./ipc/athan";
import { registerStudyNotesIpc } from "./ipc/study-notes";
import { registerPdfEditorIpc, shutdownPdfViewCaches } from "./ipc/pdf-editor";
import { registerPoetryIpc } from './ipc/poetry';
import { registerKnowledgeCardIpc } from './ipc/knowledge-cards';
import { registerStudyPlannerIpc } from './ipc/study-planner';
import { defaultStirlingSidecar } from './services/pdf-editor/stirling';
import { pdfEngineTools } from './services/pdf-editor/tools';
import { stirlingProcessor } from './services/pdf-editor/processor';
import { ocrService } from './services/ocr/ocr.service';
import { startKhatmahReminders } from './services/quran/khatmah-reminders';
import { initializeDatabase, closeDatabase } from "./database";
import { ContentShieldService } from "./services/shield/content-shield.service";
import { installPdfDiagnosticFilter } from "./services/digital/pdf-diagnostics";
import { streamAssetResponse } from './services/digital/asset-range';

installPdfDiagnosticFilter();

// Global process error boundary to intercept uncaught exceptions and unhandled promise rejections,
// preventing abrupt Node process exits or terminal crash artifacts during transient network failures.
process.on('unhandledRejection', (reason: unknown) => {
  const message = errorMessage(reason);
  console.warn('[baglib:process] Intercepted unhandled async rejection:', message);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[baglib:process] Intercepted uncaught exception:', error?.message || error);
});

const isDev = !app.isPackaged;
const loadApp = serve({ directory: path.join(__dirname, "../../out") });

// Register privileged custom schemes before app.whenReady()
// Grants standard, secure, fetch, streaming, CORS, and CSP privileges to reader assets.
// Each registration replaces the last one in renderer processes, and electron-serve registers `app`
// in a microtask, so this one runs after it and repeats that scheme with the same privileges.
queueMicrotask(() => protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
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
]));

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
  '.wav': 'audio/wav',
  '.m4b': 'audio/mp4',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
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
  const allowedOrigin = origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000' || origin === 'app://-';
  if (origin && origin !== 'null' && !allowedOrigin) return new Response(null, { status: 403 });
  const corsHeaders: Record<string, string> = allowedOrigin ? {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Vary': 'Origin',
  } : {};
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { ...corsHeaders, Allow: 'GET, HEAD, OPTIONS' } });
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
    return await streamAssetResponse(request, filePath, mimeType, corsHeaders);
  } catch (err: unknown) {
    console.error('[baglib:protocol] Error streaming asset:', err);
    return new Response('Internal asset streaming error', { status: 500 });
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    backgroundColor: '#0e161b',
    webPreferences: {
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      plugins: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      console.warn(`[baglib:renderer] Navigation failed (${errorCode}: ${errorDescription}) on ${validatedURL}`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[baglib:renderer] Render process crashed/gone:', details.reason, details.exitCode);
  });

  if (isDev) {
    const devUrl = "http://localhost:3000";
    let loaded = false;
    const maxRetries = 60;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (!mainWindow || mainWindow.isDestroyed()) break;
      try {
        await mainWindow.loadURL(devUrl);
        loaded = true;
        console.log(`[baglib] Successfully connected to dev server on attempt ${attempt}.`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
        break;
      } catch {
        if (attempt === 1 || attempt % 5 === 0) {
          console.log(`[baglib] Dev server not ready yet (attempt ${attempt}/${maxRetries}), retrying in 500ms...`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!loaded && mainWindow && !mainWindow.isDestroyed()) {
      console.error(`[baglib] Could not connect to dev server at ${devUrl} after ${maxRetries} attempts.`);
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
  process.exit(0);
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
registerPdfExportIpcHandlers();
registerReadingStatisticsIpc();
registerSecurityIpc();
registerReaderPluginsIpc();
registerSunnahIpc();
registerQuranIpc();
registerAthanIpc();
registerStudyNotesIpc();
registerPdfEditorIpc();
registerPoetryIpc();
registerKnowledgeCardIpc();
registerStudyPlannerIpc();

app.whenReady().then(async () => {
  // Initialize Content Shield for ad & redirect protection
  ContentShieldService.getInstance().initialize();

  // Initialize SQLite database and run pending migrations
  try {
    await initializeDatabase();
    startKhatmahReminders();
    startAthanScheduler();
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
  setImmediate(() => {
    if (shutdownStarted || !mainWindow || mainWindow.isDestroyed()) return;
    try {
      const tools = pdfEngineTools();
      stirlingProcessor.startWatchedFoldersDaemon(tools);
    } catch (error) {
      console.warn('[baglib:pdf] Background engine configuration unavailable:', errorMessage(error));
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let shutdownComplete = false;
let shutdownStarted = false;
app.on('before-quit', event => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  ocrService.shutdown();
  void Promise.allSettled([shutdownAudioIpc(), shutdownPdfViewCaches(), stirlingProcessor.stopWatchedFoldersDaemon(), defaultStirlingSidecar.stop()]).finally(() => {
    closeDatabase();
    shutdownComplete = true;
    app.quit();
  });
});
