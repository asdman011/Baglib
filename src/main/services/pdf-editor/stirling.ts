import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { readFile, writeFile, stat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { setPriority, constants as osConstants } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import type {
  PdfEngineResult,
  PdfOperation,
  PdfOutput,
  PdfOutputFormat,
  StirlingEngineInfo,
  StirlingEngineStatus,
} from '../../../shared/types/pdf-editor';
import { fileSha256 } from './source';
import { inspectPdfFile } from './inspection';
import { buildInkOverlay, type InkOverlayEdit } from './ink-overlay';
import type { PdfEngineTools, PythonPdfInput } from './python';

/**
 * Tuple representation of Stirling-PDF Desktop's `version_key` (`frontend/src-tauri/src/commands/backend.rs`).
 * Orders `(major, minor, patch, isFinal, prereleaseStage, prereleaseNum)` ascending.
 */
export interface StirlingJarVersionKey {
  major: number;
  minor: number;
  patch: number;
  isFinal: number;
  prereleaseStage: number;
  prereleaseNum: number;
}

export function parseStirlingJarVersion(filename: string): StirlingJarVersionKey {
  const lower = filename.toLowerCase();
  const base = lower.endsWith('.jar') ? lower.slice(0, -4) : lower;
  const match = /(\d+\.\d+(?:\.\d+)?(?:-[0-9a-z.-]+)?)$/u.exec(base);
  if (!match) {
    return { major: 0, minor: 0, patch: 0, isFinal: 0, prereleaseStage: 0, prereleaseNum: 0 };
  }
  const [core, prerelease] = match[1].split('-', 2);
  const parts = core.split('.').map(segment => Number.parseInt(segment, 10) || 0);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  if (!prerelease) {
    return { major, minor, patch, isFinal: 1, prereleaseStage: 0, prereleaseNum: 0 };
  }
  const tokens = prerelease.split(/[.-]/u);
  const stageToken = tokens[0] ?? '';
  const prereleaseStage =
    stageToken === 'snapshot' ? 0
    : stageToken === 'alpha' || stageToken === 'a' ? 1
    : stageToken === 'beta' || stageToken === 'b' ? 2
    : stageToken === 'milestone' || stageToken === 'm' ? 3
    : stageToken === 'rc' ? 4
    : 5;
  let prereleaseNum = 0;
  for (const token of tokens.slice(1)) {
    const parsed = Number.parseInt(token, 10);
    if (Number.isFinite(parsed)) {
      prereleaseNum = parsed;
      break;
    }
  }
  return { major, minor, patch, isFinal: 0, prereleaseStage, prereleaseNum };
}

export function compareStirlingJarVersions(a: string, b: string): number {
  const va = parseStirlingJarVersion(a);
  const vb = parseStirlingJarVersion(b);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;
  if (va.isFinal !== vb.isFinal) return va.isFinal - vb.isFinal;
  if (va.prereleaseStage !== vb.prereleaseStage) return va.prereleaseStage - vb.prereleaseStage;
  if (va.prereleaseNum !== vb.prereleaseNum) return va.prereleaseNum - vb.prereleaseNum;
  return a.localeCompare(b);
}

/**
 * Selects the newest `Stirling-PDF-server*.jar` (or fallback `*.jar`) in a directory
 * using Stirling Desktop's exact `select_newest_jar` algorithm (`backend.rs`).
 */
export function selectNewestStirlingJar(directory: string): string | undefined {
  if (!fs.existsSync(directory)) return undefined;
  let entries: string[];
  try {
    entries = fs.readdirSync(directory).filter(name => {
      if (!name.toLowerCase().endsWith('.jar')) return false;
      try { return fs.statSync(path.join(directory, name)).isFile(); } catch { return false; }
    });
  } catch {
    return undefined;
  }
  if (!entries.length) return undefined;
  const preferred = entries.filter(name => name.startsWith('Stirling-PDF-server'));
  const pool = preferred.length ? preferred : entries;
  pool.sort(compareStirlingJarVersions);
  const chosen = pool.at(-1);
  return chosen ? path.join(directory, chosen) : undefined;
}

/**
 * Validates that a Stirling-PDF URL points strictly to a local loopback interface (`127.0.0.1` or `localhost`)
 * over plain HTTP with no embedded credentials, preventing document exfiltration to external hosts.
 */
export function validateStirlingLoopbackUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('invalid-request');
  }
  if (parsed.protocol !== 'http:' || parsed.username || parsed.password) {
    throw new Error('permission-denied');
  }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost' && parsed.hostname !== '[::1]') {
    throw new Error('permission-denied');
  }
  const port = parsed.port ? Number.parseInt(parsed.port, 10) : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('invalid-request');
  }
  return parsed.origin;
}

export interface StirlingSidecarOptions {
  javaPath: string;
  jarPath: string;
  workDir: string;
  startupTimeoutMs?: number;
}

function javaVersion(value: string): number | undefined {
  const match = /(?:JAVA_VERSION\s*=\s*"|(?:openjdk|java) version\s+"|^)(\d+)(?:\.(\d+))?/u.exec(value.trim());
  if (!match) return undefined;
  const major = Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
  return Number.isInteger(major) && major > 0 ? major : undefined;
}

/** Read the bundled runtime metadata without starting a JVM whenever possible. */
export async function checkJavaMajorVersion(javaPath: string): Promise<number | undefined> {
  for (const root of [path.resolve(path.dirname(javaPath), '..'), path.dirname(javaPath)]) {
    try {
      const version = javaVersion(fs.readFileSync(path.join(root, 'release'), 'utf8'));
      if (version) return version;
    } catch { /* PATH-only and older runtimes may have no release file. */ }
  }
  return new Promise(resolve => {
    execFile(javaPath, ['-version'], { windowsHide: true, timeout: 2000, maxBuffer: 8192 }, (_error, stdout, stderr) => {
      resolve(javaVersion(stderr) ?? javaVersion(stdout));
    });
  });
}

const jarVersions = new Map<string, { size: number; mtimeMs: number; version: number | undefined }>();

/** Read only the ZIP directory and selected headers, never inflate bundled dependency JARs. */
export function inspectJarMinimumJavaVersion(jarPath: string): number | undefined {
  const info = fs.statSync(jarPath);
  const cached = jarVersions.get(jarPath);
  if (cached?.size === info.size && cached.mtimeMs === info.mtimeMs) return cached.version;
  const fd = fs.openSync(jarPath, 'r');
  try {
    const read = (offset: number, length: number) => {
      if (offset < 0 || length < 0 || offset + length > info.size) throw new Error('invalid-output');
      const bytes = Buffer.alloc(length);
      if (fs.readSync(fd, bytes, 0, length, offset) !== length) throw new Error('invalid-output');
      return bytes;
    };
    const tail = read(Math.max(0, info.size - 65557), Math.min(info.size, 65557));
    let end = tail.length - 22;
    while (end >= 0 && (tail.readUInt32LE(end) !== 0x06054b50 || end + 22 + tail.readUInt16LE(end + 20) !== tail.length)) end--;
    if (end < 0) throw new Error('invalid-output');
    const directorySize = tail.readUInt32LE(end + 12);
    if (directorySize > 16 * 1024 * 1024) throw new Error('document-too-large');
    const directory = read(tail.readUInt32LE(end + 16), directorySize);
    const entries: { name: string; method: number; size: number; offset: number }[] = [];
    for (let cursor = 0; cursor < directory.length;) {
      if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error('invalid-output');
      const length = directory.readUInt16LE(cursor + 28);
      entries.push({ name: directory.subarray(cursor + 46, cursor + 46 + length).toString('utf8'), method: directory.readUInt16LE(cursor + 10), size: directory.readUInt32LE(cursor + 20), offset: directory.readUInt32LE(cursor + 42) });
      cursor += 46 + length + directory.readUInt16LE(cursor + 30) + directory.readUInt16LE(cursor + 32);
    }
    const manifest = entries.find(entry => entry.name === 'META-INF/MANIFEST.MF');
    // Boot's launcher may target an older JVM than the application it launches.
    const firstClass = entries.find(entry => entry.name.startsWith('BOOT-INF/classes/') && entry.name.endsWith('.class'))
      ?? entries.find(entry => entry.name.endsWith('.class') && !entry.name.startsWith('META-INF/versions/'));
    let version: number | undefined;
    for (const entry of [manifest, firstClass]) {
      if (!entry) continue;
      if (entry.size > 1024 * 1024) throw new Error('document-too-large');
      const local = read(entry.offset, 30);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('invalid-output');
      const compressed = read(entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), entry.size);
      const data = entry.method === 0 ? compressed : entry.method === 8 ? inflateRawSync(compressed, { maxOutputLength: 1024 * 1024 }) : undefined;
      if (!data) throw new Error('invalid-output');
      let required: number | undefined;
      if (entry === manifest) {
        const match = /^(?:Build-Jdk-Spec|Created-By):\s*(\d+(?:\.\d+)?)/mu.exec(data.toString('utf8'));
        required = match ? javaVersion(match[1]) : undefined;
      } else if (data.length >= 8 && data.readUInt32BE(0) === 0xcafebabe) required = data.readUInt16BE(6) - 44;
      if (required && required > 0) version = Math.max(version ?? 0, required);
    }
    if (jarVersions.size >= 32) jarVersions.clear();
    jarVersions.set(jarPath, { size: info.size, mtimeMs: info.mtimeMs, version });
    return version;
  } finally { fs.closeSync(fd); }
}

export interface StirlingExternalCapabilities {
  tesseract: { available: boolean; path?: string };
  ocrmypdf: { available: boolean; path?: string };
  tessdata: { available: boolean; path?: string };
  libreoffice: { available: boolean; path?: string };
  qpdf: { available: boolean; path?: string };
  ghostscript: { available: boolean; path?: string };
  weasyprint: { available: boolean; path?: string };
  pdftohtml: { available: boolean; path?: string };
}

let cachedCapabilities: StirlingExternalCapabilities | null = null;

export function probeExternalCapabilities(): StirlingExternalCapabilities {
  if (cachedCapabilities) return cachedCapabilities;

  const isWin = process.platform === 'win32';
  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(isWin ? ';' : ':').filter(Boolean);

  const findBinary = (names: string[], extraPaths: string[] = []): string | undefined => {
    for (const p of extraPaths) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      } catch { /* ignore */ }
    }
    const engineRoot = path.resolve('.baglib-data', 'pdf-engine');
    const localDirs = [
      path.join(engineRoot, 'bin'),
      path.join(engineRoot, 'tesseract'),
      path.join(engineRoot, 'libreoffice', 'program'),
      path.join(engineRoot, 'qpdf', 'bin'),
      path.join(engineRoot, 'ghostscript', 'bin'),
      path.join(engineRoot, 'weasyprint'),
      ...(fs.existsSync(path.join(engineRoot, 'poppler')) ? fs.readdirSync(path.join(engineRoot, 'poppler')).map(name => path.join(engineRoot, 'poppler', name, 'Library', 'bin')) : []),
    ];
    for (const d of localDirs) {
      for (const name of names) {
        try {
          const full = path.join(d, name);
          if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
        } catch { /* ignore */ }
      }
    }
    for (const dir of pathDirs) {
      for (const name of names) {
        try {
          const full = path.join(dir, name);
          if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
        } catch { /* ignore */ }
      }
    }
    return undefined;
  };

  const tesseract = findBinary(
    isWin ? ['tesseract.exe'] : ['tesseract'],
    isWin ? [
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
      'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Tesseract-OCR', 'tesseract.exe'),
    ] : []
  );

  const libreoffice = findBinary(
    isWin ? ['soffice.exe', 'soffice.com'] : ['soffice', 'libreoffice'],
    isWin ? [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ] : []
  );

  const qpdf = findBinary(
    isWin ? ['qpdf.exe'] : ['qpdf'],
    isWin ? [
      'C:\\Program Files\\qpdf\\bin\\qpdf.exe',
      'C:\\Program Files (x86)\\qpdf\\bin\\qpdf.exe',
    ] : []
  );

  const ghostscript = findBinary(
    isWin ? ['gswin64c.exe', 'gswin32c.exe', 'gs.exe'] : ['gs', 'ghostscript'],
    isWin ? [
      'C:\\Program Files\\gs\\gs10.04.0\\bin\\gswin64c.exe',
      'C:\\Program Files\\gs\\gs10.03.1\\bin\\gswin64c.exe',
      'C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe',
      'C:\\Program Files\\gs\\gs10.01.2\\bin\\gswin64c.exe',
      'C:\\Program Files\\gs\\gs9.56.1\\bin\\gswin64c.exe',
    ] : []
  );

  const weasyprint = findBinary(isWin ? ['weasyprint.exe'] : ['weasyprint']);

  const pdftohtml = findBinary(isWin ? ['pdftohtml.exe'] : ['pdftohtml']);

  const engineRoot = path.resolve('.baglib-data', 'pdf-engine');
  const ocrmypdf = findBinary(isWin ? ['ocrmypdf.exe'] : ['ocrmypdf'], [path.join(engineRoot, 'venv', isWin ? 'Scripts/ocrmypdf.exe' : 'bin/ocrmypdf')]);

  // Tesseract also reads its hocr config from this folder, so language files alone are not enough.
  const tessdata = fs.existsSync(path.join(engineRoot, 'ocr-best', 'configs', 'hocr')) ? path.join(engineRoot, 'ocr-best') : undefined;

  cachedCapabilities = {
    tesseract: { available: Boolean(tesseract), path: tesseract },
    ocrmypdf: { available: Boolean(ocrmypdf), path: ocrmypdf },
    tessdata: { available: Boolean(tessdata), path: tessdata },
    pdftohtml: { available: Boolean(pdftohtml), path: pdftohtml },
    libreoffice: { available: Boolean(libreoffice), path: libreoffice },
    qpdf: { available: Boolean(qpdf), path: qpdf },
    ghostscript: { available: Boolean(ghostscript), path: ghostscript },
    weasyprint: { available: Boolean(weasyprint), path: weasyprint },
  };

  return cachedCapabilities;
}

/**
 * Manages the lifecycle of a local Stirling-PDF Spring Boot sidecar process
 * following `frontend/src-tauri/src/commands/backend.rs`.
 */
export class StirlingSidecarService {
  private child: ChildProcess | null = null;
  private baseUrl: string | null = null;
  private shutdownFile: string | null = null;
  private starting: Promise<string> | null = null;
  private _status: StirlingEngineStatus = 'stopped';
  private _port: number | undefined = undefined;
  private statusListeners = new Set<(info: StirlingEngineInfo) => void>();
  private lastOptions: StirlingSidecarOptions | null = null;
  private intentionalStop = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private restartAttempts = 0;

  getStatus(): StirlingEngineInfo {
    const caps = probeExternalCapabilities();
    return {
      status: this._status,
      port: this._port,
      version: '3.2.2',
      externalTools: {
        tesseract: caps.tesseract.available,
        ocrmypdf: caps.ocrmypdf.available,
        libreoffice: caps.libreoffice.available,
        qpdf: caps.qpdf.available,
        ghostscript: caps.ghostscript.available,
        weasyprint: caps.weasyprint.available,
      },
    };
  }

  onStatusChange(listener: (info: StirlingEngineInfo) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(status: StirlingEngineStatus, port?: number): void {
    this._status = status;
    if (port !== undefined) this._port = port;
    const info = this.getStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(info);
      } catch {
        /* ignore */
      }
    }
  }

  setProcessing(processing: boolean): void {
    if (this._status === 'ready' && processing) {
      this.setStatus('processing');
    } else if (this._status === 'processing' && !processing) {
      this.setStatus('ready');
    }
  }

  async ensureStarted(options: StirlingSidecarOptions): Promise<string> {
    if (this.starting) return this.starting;
    this.lastOptions = options;
    this.intentionalStop = false;
    if (this.baseUrl && this.child && this.child.exitCode === null) {
      return this.baseUrl;
    }
    this.starting = this.spawnBackend(options).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async spawnBackend(options: StirlingSidecarOptions): Promise<string> {
    if (!fs.existsSync(options.javaPath) || !fs.existsSync(options.jarPath)) {
      this.setStatus('error');
      throw new Error('engine-missing');
    }
    let required: number | undefined;
    try { required = inspectJarMinimumJavaVersion(options.jarPath); } catch {
      this.setStatus('error');
      throw new Error('engine-missing');
    }
    const installed = await checkJavaMajorVersion(options.javaPath);
    if (this.intentionalStop) throw new Error('cancelled');
    if (required && installed && installed < required) {
      this.setStatus('error');
      throw new Error('engine-missing');
    }
    const configDir = path.join(options.workDir, 'config');
    const logDir = path.join(options.workDir, 'logs');
    await mkdir(configDir, { recursive: true });
    await mkdir(logDir, { recursive: true });
    if (this.intentionalStop) throw new Error('cancelled');
    const shutdownFile = path.join(options.workDir, `.backend-stop-${process.pid}-${Date.now()}`);
    this.shutdownFile = shutdownFile;
    this.setStatus('starting');

    return new Promise<string>((resolve, reject) => {
      const javaHome = path.resolve(path.dirname(options.javaPath), '..');
      const caps = probeExternalCapabilities();
      const extraEnv: Record<string, string> = {};
      if (caps.libreoffice.path) {
        extraEnv.LIBREOFFICE_PATH = caps.libreoffice.path;
        extraEnv.SOFFICE_PATH = caps.libreoffice.path;
      }
      if (caps.tesseract.path) {
        extraEnv.TESSERACT_PATH = caps.tesseract.path;
      }
      if (caps.qpdf.path) {
        extraEnv.QPDF_PATH = caps.qpdf.path;
      }
      if (caps.ghostscript.path) {
        extraEnv.GHOSTSCRIPT_PATH = caps.ghostscript.path;
      }
      if (caps.tessdata.path) {
        extraEnv.TESSDATA_PREFIX = caps.tessdata.path;
        extraEnv.SYSTEM_TESSDATADIR = caps.tessdata.path;
      }
      const pathTools = [caps.pdftohtml.path, caps.ghostscript.path, caps.qpdf.path, caps.weasyprint.path, caps.tesseract.path].filter((tool): tool is string => Boolean(tool));
      if (pathTools.length > 0 || caps.ocrmypdf.path) {
        // Stirling finds these tools only on PATH (`gs`, not gswin64c), and Windows stores that variable as `Path`.
        // The venv goes last so its python.exe cannot shadow anything else Stirling looks up.
        const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
        extraEnv[pathKey] = [...new Set(pathTools.map(tool => path.dirname(tool))), process.env[pathKey], caps.ocrmypdf.path && path.dirname(caps.ocrmypdf.path)].filter(Boolean).join(path.delimiter);
      }

      const args = [
        '-Xmx2g',
        '-Dspring.main.lazy-initialization=true',
        '-XX:TieredStopAtLevel=1',
        '--enable-native-access=ALL-UNNAMED',
        '--add-opens=java.base/java.lang=ALL-UNNAMED',
        '--add-opens=java.base/java.nio=ALL-UNNAMED',
        '-DBROWSER_OPEN=false',
        '-DSTIRLING_PDF_TAURI_MODE=false',
        '-DDISABLE_ADDITIONAL_FEATURES=false',
        '-DDOCKER_ENABLE_SECURITY=false',
        '-DSYSTEM_ENABLEANALYTICS=false',
        '-Dsystem.fileUploadLimit=2000M',
        `-Dlogging.file.path=${logDir}`,
        '-Dlogging.file.name=stirling-pdf.log',
        '-Dserver.port=0',
        '-Dserver.address=127.0.0.1',
        '-Dserver.forward-headers-strategy=none',
        '-Dsecurity.enableLogin=false',
        '-Dsecurity.csrfDisabled=true',
        '-jar',
        options.jarPath,
      ];
      const nativeDirectory = path.join(path.dirname(options.jarPath), 'natives');
      if (fs.existsSync(nativeDirectory) && fs.readdirSync(nativeDirectory).some(name => /^jpdfium-natives-.*\.jar$/u.test(name))) {
        args.splice(args.indexOf('-jar'), 2, `-Dloader.path=${nativeDirectory}`, '-cp', options.jarPath, 'org.springframework.boot.loader.launch.PropertiesLauncher');
      }
      const child = spawn(options.javaPath, args, {
        cwd: options.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          JAVA_HOME: javaHome,
          SECURITY_ENABLELOGIN: 'false',
          DISABLE_ADDITIONAL_FEATURES: 'false',
          SYSTEM_ENABLEANALYTICS: 'false',
          SYSTEM_FILEUPLOADLIMIT: '2000M',
          // Word and PowerPoint exports use the converter inside the jar, so they need no LibreOffice.
          SYSTEM_STIRLINGOFFICECONVERSION: 'true',
          // Stirling's settings keep urlSecurity at MEDIUM.
          SYSTEM_ENABLEURLTOPDF: 'true',
          TAURI_PARENT_PID: String(process.pid),
          STIRLING_PDF_TAURI_MODE: 'false',
          STIRLING_PDF_CONFIG_DIR: configDir,
          STIRLING_PDF_LOG_DIR: logDir,
          STIRLING_PDF_WORK_DIR: options.workDir,
          STIRLING_PDF_SHUTDOWN_FILE: shutdownFile,
          ...extraEnv,
        },
      });
      this.child = child;
      child.once('spawn', () => {
        if (child.pid) {
          try { setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL); }
          catch (error) { console.warn('[StirlingSidecar] Could not lower background process priority:', error); }
        }
      });
      let settled = false;
      let probing = false;
      let stdoutBuffer = '';
      const timeoutMs = options.startupTimeoutMs ?? 45_000;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.setStatus('error');
          void this.stop();
          reject(new Error('engine-missing'));
        }
      }, timeoutMs);

      const onLine = (line: string) => {
        const marker = 'running on port: ';
        const idx = line.indexOf(marker);
        if (idx >= 0) {
          const portText = line.slice(idx + marker.length).trim().split(/\s+/u)[0] ?? '';
          const port = Number.parseInt(portText, 10);
          if (Number.isInteger(port) && port > 0 && port <= 65535 && !settled && !probing) {
            probing = true;
            const url = `http://127.0.0.1:${port}`;
            // Readiness poll with exponential backoff on /api/v1/info/status
            (async () => {
              const start = Date.now();
              let delay = 100;
              while (Date.now() - start < 15000 && !settled && !this.intentionalStop && this.child === child) {
                try {
                  await probeStirlingReadiness(url, AbortSignal.timeout(1000));
                  if (settled || this.intentionalStop || this.child !== child) throw new Error('cancelled');
                  settled = true;
                  clearTimeout(timer);
                  this.baseUrl = url;
                  this.restartAttempts = 0;
                  this.setStatus('ready', port);
                  resolve(url);
                  return;
                } catch {
                  /* wait */
                }
                await new Promise(r => setTimeout(r, delay));
                delay = Math.min(delay * 1.5, 1000);
              }
              throw new Error('engine-missing');
            })().catch(() => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              this.setStatus('error');
              void this.stop();
              reject(new Error('engine-missing'));
            });
          }
        }
      };

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        let newline: number;
        while ((newline = stdoutBuffer.indexOf('\n')) >= 0) {
          const line = stdoutBuffer.slice(0, newline);
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
          onLine(line);
        }
      });

      child.once('error', () => {
        this.setStatus('error');
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('engine-missing'));
        }
      });

      child.once('close', () => {
        this.baseUrl = null;
        this.child = null;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.setStatus('error');
          reject(new Error('engine-missing'));
          return;
        }
        this.setStatus('stopped');
        if (!this.intentionalStop && this.lastOptions && this.restartAttempts < 5) {
          this.restartAttempts++;
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            if (!this.intentionalStop && !this.child && this.lastOptions) {
              void this.ensureStarted(this.lastOptions).catch(() => {});
            }
          }, 1500);
        }
      });
    });
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartAttempts = 0;
    if (this.shutdownFile) {
      await writeFile(this.shutdownFile, '').catch(() => {});
    }
    const child = this.child;
    this.child = null;
    this.baseUrl = null;
    this._port = undefined;
    this.setStatus('stopped');
    if (!child || !child.pid) return;
    await new Promise<void>(resolve => {
      if (process.platform === 'win32') {
        execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {
          child.kill();
          resolve();
        });
      } else {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        resolve();
      }
    });
  }
}

export const defaultStirlingSidecar = new StirlingSidecarService();

/**
 * Extracts entries from a standard ZIP archive buffer using the Central Directory
 * so streaming `java.util.zip.ZipOutputStream` archives (with bit 3 Data Descriptors) work reliably.
 */
import { STIRLING_DISABLED_ENDPOINT, isEmptyZipBytes, isPdfBytes, isZipBytes } from '../../../shared/stirling-contract';
import { markdownHasText, textToHtml, textToMarkdown } from './text-export';
import { engineRedactionBoxes, planRedaction, type RedactionPageGeometry, type RedactionRegion } from '../../../shared/redaction-plan';
import { runPdfHelper } from './view-cache-runtime';
export function extractZipEntries(zipBuffer: Buffer): { name: string; data: Buffer }[] {
  let eocdOffset = -1;
  const minOffset = Math.max(0, zipBuffer.length - 65557);
  for (let i = zipBuffer.length - 22; i >= minOffset; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('invalid-output');
  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  if (totalEntries > 1000) throw new Error('invalid-output');

  const results: { name: string; data: Buffer }[] = [];
  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > zipBuffer.length || zipBuffer.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error('invalid-output');
    }
    const method = zipBuffer.readUInt16LE(ptr + 10);
    const compressedSize = zipBuffer.readUInt32LE(ptr + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(ptr + 24);
    const nameLen = zipBuffer.readUInt16LE(ptr + 28);
    const extraLen = zipBuffer.readUInt16LE(ptr + 30);
    const commentLen = zipBuffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(ptr + 42);
    const rawName = zipBuffer.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith('/')) continue;
    if (uncompressedSize > 256 * 1024 * 1024) throw new Error('document-too-large');
    if (localHeaderOffset + 30 > zipBuffer.length || zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error('invalid-output');
    }
    const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zipBuffer.length) throw new Error('invalid-output');
    const slice = zipBuffer.subarray(dataStart, dataEnd);
    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(slice);
    } else if (method === 8) {
      data = inflateRawSync(slice, { maxOutputLength: 256 * 1024 * 1024 });
    } else {
      throw new Error('invalid-output');
    }
    results.push({ name: path.basename(rawName), data });
  }
  return results;
}

/**
 * Determines whether a specific `PdfOperation` and `payload` can be executed via Stirling-PDF's REST API v1.
 */
export function canStirlingHandle(operation: PdfOperation | 'capabilities', payload?: Record<string, unknown>): boolean {
  if (operation === 'capabilities') return true;
  if (operation === 'preview') return true;
  if (operation === 'inspect' || operation === 'text') return true;
  if ([
    'split', 'ocr', 'export-docx', 'export-xlsx', 'export-pptx', 'export-html',
    'export-markdown', 'export-text', 'export-csv', 'scale-pages',
    'multi-page-layout', 'pdf-to-single-page', 'edit-toc', 'redact', 'encrypt',
    'sanitize', 'watermark', 'compress', 'page-numbers', 'add-image', 'unlock-forms',
    'extract-images', 'validate', 'repair-metadata', 'prepare-signature', 'sign', 'verify-signatures', 'create',
    'crop', 'document-properties', 'basic-info', 'convert-file-pdf',
  ].includes(operation)) {
    return true;
  }
  if (operation === 'edit-content') {
    const replacements = payload?.textReplacements;
    const edits = payload?.edits;
    if (Array.isArray(edits) && edits.length > 0 && edits.length <= 100 && edits.every(edit => edit && typeof edit === 'object' && edit.kind === 'ink-signature') && !replacements && !payload?.images) return true;
    return Array.isArray(replacements) && replacements.length > 0 && (!Array.isArray(edits) || edits.length === 0) && (!Array.isArray(payload?.images) || payload.images.length === 0);
  }
  if (operation === 'organize') {
    if (typeof payload?.angle === 'number' && !Number.isFinite(payload.angle)) return false;
    const pages = payload?.pages;
    if (pages === undefined) return !!payload?.crop || (typeof payload?.angle === 'number' && payload.angle % 90 === 0);
    if (!Array.isArray(pages) || !pages.length) return false;
    return pages.every(item => {
      if (!item || typeof item !== 'object') return false;
      const entry = item as Record<string, unknown>;
      return (entry.blank === true || Number.isInteger(entry.page) && Number(entry.page) >= 1) && (entry.rotation === undefined || typeof entry.rotation === 'number' && Number.isFinite(entry.rotation) && entry.rotation % 90 === 0);
    });
  }
  return false;
}

interface MultipartField {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
}

function buildMultipartBody(fields: MultipartField[]): { body: Buffer; contentType: string } {
  const boundary = `----BaglibStirlingBoundary${createHash('sha256').update(String(Date.now()) + String(Math.random())).digest('hex').slice(0, 24)}`;
  const chunks: Buffer[] = [];
  for (const field of fields) {
    if (field.data && field.filename) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"; filename="${field.filename.replace(/"/gu, '')}"\r\nContent-Type: ${field.contentType ?? 'application/octet-stream'}\r\n\r\n`,
          'utf8',
        ),
      );
      chunks.push(field.data);
      chunks.push(Buffer.from('\r\n', 'utf8'));
    } else if (field.value !== undefined) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
          'utf8',
        ),
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function resolveStirlingEndpoint(tools: PdfEngineTools): Promise<string> {
  if (tools.stirlingUrl) {
    return validateStirlingLoopbackUrl(tools.stirlingUrl);
  }
  let java = tools.java;
  let stirlingJar = tools.stirlingJar;
  if (!java || !stirlingJar || !fs.existsSync(java) || !fs.existsSync(stirlingJar)) {
    const root = path.resolve('.baglib-data', 'pdf-engine');
    const javaRoot = path.join(root, 'java');
    if (!java && fs.existsSync(javaRoot)) {
      const exeName = process.platform === 'win32' ? 'java.exe' : 'java';
      const jdk25Candidate = path.join(javaRoot, 'jdk-25.0.5+8-jre', 'bin', exeName);
      const jdk21Candidate = path.join(javaRoot, 'jdk-21.0.12.1+1-jre', 'bin', exeName);
      if (fs.existsSync(jdk25Candidate)) {
        java = jdk25Candidate;
      } else if (fs.existsSync(jdk21Candidate)) {
        java = jdk21Candidate;
      } else {
        const javaFolders = fs.readdirSync(javaRoot).filter(name => fs.existsSync(path.join(javaRoot, name, 'bin', exeName)));
        javaFolders.sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
          const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
          return numB - numA;
        });
        if (javaFolders[0]) java = path.join(javaRoot, javaFolders[0], 'bin', exeName);
      }
    }
    if (!java && process.env.JAVA_HOME) {
      const exeName = process.platform === 'win32' ? 'java.exe' : 'java';
      const sysJava = path.join(process.env.JAVA_HOME, 'bin', exeName);
      if (fs.existsSync(sysJava)) java = sysJava;
    }
    if (!stirlingJar) {
      stirlingJar = selectNewestStirlingJar(path.join(root, 'stirling')) || selectNewestStirlingJar(path.join(root, 'libs'));
    }
  }
  if (java && stirlingJar && fs.existsSync(java) && fs.existsSync(stirlingJar)) {
    const root = path.resolve('.baglib-data', 'pdf-engine');
    const stirlingDir = path.join(root, 'stirling');
    const workDir = fs.existsSync(stirlingDir) ? stirlingDir : path.dirname(stirlingJar);
    return defaultStirlingSidecar.ensureStarted({
      javaPath: java,
      jarPath: stirlingJar,
      workDir,
    });
  }
  throw new Error('engine-missing');
}

/** Bound readiness before reading a PDF or constructing a large multipart body. */
export async function probeStirlingReadiness(baseUrl: string, signal: AbortSignal, timeoutMs = 800): Promise<void> {
  const origin = validateStirlingLoopbackUrl(baseUrl);
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  try {
    let response = await fetch(`${origin}/api/v1/info/status`, { signal: bounded, redirect: 'error' });
    await response.body?.cancel();
    if (response.status === 404 || response.status === 405) {
      response = await fetch(`${origin}/`, { method: 'HEAD', signal: bounded, redirect: 'error' });
      await response.body?.cancel();
    }
    if (response.status === 401 || response.status === 403) throw new Error('permission-denied');
    if (!response.ok) throw new Error('engine-missing');
  } catch (error) {
    if (signal.aborted) throw new Error('cancelled');
    if ((error as Error).message === 'permission-denied') throw error;
    throw new Error('engine-missing');
  }
}

class StirlingEndpointUnavailable extends Error {}

type JsonTextRun = Record<string, unknown> & { text: string; width: number; fontId?: string; fontSize?: number; x?: number; y?: number; textMatrix?: number[] };

/**
 * Conservative reconstruction: only use measured same-font replacement runs.
 * Character-count estimates are not font metrics (especially for Arabic ligatures).
 * Preserved streams in v3.2.2 ignore edited coordinates; those pages use Python.
 */
export function applyRtlJsonReplacements(model: unknown, edits: { find: string; replace: string }[], wholeWord: boolean): number {
  if (!edits.length || edits.some(edit => !edit.find)) throw new Error('invalid-request');
  if (!model || typeof model !== 'object') throw new Error('invalid-output');
  const document = model as Record<string, unknown>;
  if (!Array.isArray(document.pages) || document.lazyImages) throw new Error('engine-missing');
  const word = (character: string) => /[\p{L}\p{N}\p{M}_]/u.test(character);
  const position = (run: JsonTextRun, axis: 'x' | 'y') => run.textMatrix?.[axis === 'x' ? 4 : 5] ?? run[axis];
  let changes = 0;
  for (const page of document.pages as Record<string, unknown>[]) {
    if (!page || !Array.isArray(page.textElements)) throw new Error('invalid-output');
    const runs = page.textElements as JsonTextRun[];
    const metrics = runs.map(run => ({ ...run }));
    for (const edit of edits) {
      const lines: JsonTextRun[][] = [];
      for (const run of runs) {
        if (typeof run.text !== 'string') throw new Error('invalid-output');
        if (!run.text) continue;
        const x = position(run, 'x'), y = position(run, 'y');
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('engine-missing');
        const line = lines.find(line => Math.abs(position(line[0], 'y')! - y) < 1);
        if (line) line.push(run); else lines.push([run]);
      }
      for (const line of lines) {
        const rtl = line.some(run => /[\u0600-\u06ff]/u.test(run.text));
        line.sort((a, b) => (position(a, 'x')! - position(b, 'x')!) * (rtl ? -1 : 1));
        const original = line.map(run => run.text).join('');
        let changed = '', cursor = 0, found = original.indexOf(edit.find);
        while (found >= 0) {
          const end = found + edit.find.length;
          const matches = !wholeWord || (!(found && word([...original.slice(0, found)].at(-1)!)) && !(end < original.length && word([...original.slice(end)][0])));
          changed += original.slice(cursor, found) + (matches ? edit.replace : edit.find);
          cursor = end;
          found = original.indexOf(edit.find, cursor);
        }
        changed += original.slice(cursor);
        if (changed === original) continue;
        if (page.contentStreams !== undefined && (!Array.isArray(page.contentStreams) || page.contentStreams.length)) throw new Error('engine-missing');
        const anchor = line[0];
        const sameStyle = (run: JsonTextRun) => run.fontId === anchor.fontId && run.fontSize === anchor.fontSize
          && run.charSpacing === anchor.charSpacing && run.wordSpacing === anchor.wordSpacing
          && run.horizontalScaling === anchor.horizontalScaling && run.fontMatrixSize === anchor.fontMatrixSize;
        if (line.some(run => !sameStyle(run) || !Number.isFinite(run.width) || run.width < 0 || (run.rotation && run.rotation !== 0)
          || (run.textMatrix && (run.textMatrix.length !== 6 || run.textMatrix[0] !== 1 || run.textMatrix[1] !== 0 || run.textMatrix[2] !== 0 || run.textMatrix[3] !== 1)))) throw new Error('engine-missing');
        const measured = metrics.find(run => run.text === changed && sameStyle(run) && Number.isFinite(run.width) && run.width >= 0);
        if (changed && !measured) throw new Error('engine-missing');
        const right = Math.max(...line.map(run => position(run, 'x')! + run.width));
        const left = Math.min(...line.map(run => position(run, 'x')!));
        const width = measured?.width ?? 0;
        const x = rtl ? right - width : left;
        if (x < 0) throw new Error('engine-missing');
        anchor.text = changed;
        anchor.width = width;
        anchor.x = x;
        if (anchor.textMatrix) anchor.textMatrix = [...anchor.textMatrix.slice(0, 4), x, anchor.textMatrix[5]];
        delete anchor.charCodes;
        for (const run of line.slice(1)) { run.text = ''; run.width = 0; delete run.charCodes; }
        changes++;
      }
    }
  }
  return changes;
}

async function postStirlingMultipart(
  baseUrl: string,
  endpointPath: string,
  fields: MultipartField[],
  signal: AbortSignal,
): Promise<{ buffer: Buffer; contentType: string }> {
  const origin = validateStirlingLoopbackUrl(baseUrl);
  const { body, contentType } = buildMultipartBody(fields);
  const response = await fetch(`${origin}${endpointPath}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(body),
    signal,
    redirect: 'error',
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 400);
    if (STIRLING_DISABLED_ENDPOINT.test(detail)) throw new Error('engine-missing');
    if (response.status === 401 || response.status === 403) throw new Error('permission-denied');
    if (response.status === 400 || response.status === 422) throw new Error('invalid-request');
    if (response.status === 404 || response.status === 405 || response.status === 501) throw new StirlingEndpointUnavailable('engine-missing');
    throw new Error('engine-failed');
  }
  if (response.status === 204 && endpointPath === '/api/v1/convert/pdf/xlsx') throw new Error('no-tables');
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > 512 * 1024 * 1024) {
    throw new Error('document-too-large');
  }
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: (response.headers.get('content-type') || '').toLowerCase(),
  };
}

async function stageSingleOutput(
  outputDir: string,
  filename: string,
  format: PdfOutputFormat,
  data: Buffer,
): Promise<PdfOutput> {
  if (!data.length || format === 'pdf' && !isPdfBytes(data)) throw new Error('invalid-output');
  const zipFormat = ['docx', 'odt', 'xlsx', 'pptx', 'odp', 'zip'].includes(format);
  if (zipFormat && !isZipBytes(data)) throw new Error('invalid-output');
  // Multi-page HTML, CSV and Markdown conversions arrive as an archive rather than one document.
  if (!zipFormat && format !== 'pdf' && isZipBytes(data)) {
    format = 'zip';
    filename = `${path.parse(filename).name}.zip`;
  }
  const target = path.join(outputDir, filename);
  await writeFile(target, data);
  const info = await stat(target);
  const sha256 = createHash('sha256').update(data).digest('hex');
  return { filename, format, bytes: info.size, sha256 };
}

/**
 * Redacts only the pages holding boxes: they go through the engine alone, upright, and come back into their
 * original places. The helper verifies the result, and any doubt fails the job rather than weakening it.
 */
async function redactPagesInPlace(tools: PdfEngineTools, source: string, password: string | undefined, baseUrl: string, outputDir: string, regions: RedactionRegion[], rasterize: boolean, signal: AbortSignal): Promise<Buffer> {
  if (!tools.python || !fs.existsSync(tools.python)) throw new Error('engine-missing');
  const plan = planRedaction(regions);
  const work = await mkdtemp(path.join(outputDir, 'redact-'));
  const env = password ? { BAGLIB_PDF_PASSWORD: password } : undefined;
  try {
    const temporary = path.join(work, 'pages.pdf'), geometryFile = path.join(work, 'geometry.json'), redacted = path.join(work, 'redacted.pdf'), output = path.join(work, 'output.pdf'), report = path.join(work, 'report.json');
    await runPdfHelper(tools, 'redact_pages.py', ['prepare', source, JSON.stringify(plan.pages), temporary, geometryFile], signal, env);
    const geometry = JSON.parse(await readFile(geometryFile, 'utf8')) as { pages: RedactionPageGeometry[] };
    const boxes = engineRedactionBoxes(plan, geometry.pages);
    const response = await postStirlingMultipart(baseUrl, '/api/v1/security/redact', [
      { name: 'fileInput', filename: 'document.pdf', contentType: 'application/pdf', data: await readFile(temporary) },
      { name: 'redactions', value: JSON.stringify(boxes) },
      { name: 'convertPDFToImage', value: String(rasterize) },
    ], signal);
    if (!isPdfBytes(response.buffer)) throw new Error('redaction-unverified');
    await writeFile(redacted, response.buffer);
    await runPdfHelper(tools, 'redact_pages.py', ['merge', source, redacted, JSON.stringify(plan.pages), JSON.stringify(boxes), String(rasterize), output, report], signal, env);
    if (rasterize) {
      for (let index = 0; index < plan.pages.length; index += 200) {
        const inspected = await inspectPdfFile(output, password, () => {}, plan.pages.slice(index, index + 200));
        if (inspected.pages.some(page => page.blocks.some(block => block.text.trim()))) throw new Error('redaction-unverified');
      }
    }
    return await readFile(output);
  } finally { await rm(work, { recursive: true, force: true }); }
}

async function stirlingPageCount(data: Buffer, password?: string): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({ data: new Uint8Array(data), password, isEvalSupported: false, enableXfa: false, verbosity: 0 });
  try {
    const document = await loading.promise;
    if (document.numPages > 10000) throw new Error('document-too-large');
    return document.numPages;
  } catch (error) {
    if ((error as Error).name === 'PasswordException') throw new Error('encrypted');
    throw error;
  } finally { await loading.destroy(); }
}

async function organizeStirling(baseUrl: string, file: MultipartField, input: PythonPdfInput, signal: AbortSignal): Promise<Buffer> {
  const payload = input.payload ?? {};
  const plan = payload.pages as Record<string, unknown>[] | undefined;
  if (plan && plan.length > 10000) throw new Error('invalid-request');
  const crop = payload.crop as Record<string, unknown> | undefined;
  if (crop && (!['x', 'y', 'width', 'height'].every(key => typeof crop[key] === 'number' && Number.isFinite(crop[key])) || Number(crop.x) < 0 || Number(crop.y) < 0 || Number(crop.width) <= 0 || Number(crop.height) <= 0)) throw new Error('invalid-request');
  if (payload.angle !== undefined && (typeof payload.angle !== 'number' || !Number.isFinite(payload.angle) || payload.angle % 90 !== 0)) throw new Error('invalid-request');
  let current = file.data!;
  const currentCount = await stirlingPageCount(current);
  const send = async (endpoint: string, data: Buffer, fields: MultipartField[]) => {
    if (signal.aborted) throw new Error('cancelled');
    const result = await postStirlingMultipart(baseUrl, `/api/v1/general/${endpoint}`, [{ ...file, data }, ...fields], signal);
    if (!result.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('invalid-output');
    return result.buffer;
  };
  if (plan) {
    const sourceCache = new Map<string, { data: Buffer; count: number }>([['current', { data: current, count: currentCount }]]);
    const groups: { id: string; pages: number[]; rotation: number }[] = [];
    for (const item of plan) {
      if (!item || typeof item !== 'object' || (item.rotation !== undefined && (typeof item.rotation !== 'number' || !Number.isFinite(item.rotation) || item.rotation % 90 !== 0))) throw new Error('invalid-request');
      const rotation = ((Number(item.rotation ?? 0) % 360) + 360) % 360;
      const id = item.blank === true ? randomUUID() : typeof item.sessionId === 'string' ? item.sessionId : 'current';
      if (item.blank === true) sourceCache.set(id, { data: createPdfDocument(['']), count: 1 });
      const page = item.blank === true ? 1 : item.page;
      if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) throw new Error('invalid-request');
      if (groups.at(-1)?.id !== id || groups.at(-1)?.rotation !== rotation) groups.push({ id, pages: [], rotation });
      groups.at(-1)!.pages.push(page);
    }
    // Verify every source before sending any document to the server.
    for (const group of groups) {
      if (!sourceCache.has(group.id)) {
        const source = input.sources?.[group.id];
        if (!source) throw new Error('invalid-source');
        const data = await readFile(source.filename);
        if (createHash('sha256').update(data).digest('hex') !== source.sha256) throw new Error('source-changed');
        sourceCache.set(group.id, { data, count: await stirlingPageCount(data) });
      }
      if (group.pages.some(page => page < 1 || page > sourceCache.get(group.id)!.count)) throw new Error('invalid-request');
    }
    const pieces: MultipartField[] = [];
    for (const [index, group] of groups.entries()) {
      const source = sourceCache.get(group.id)!;
      let data = source.data;
      const complete = group.pages.length === source.count && group.pages.every((page, index) => page === index + 1);
      if (!complete) {
        const ascending = group.pages.every((page, index) => index === 0 || page > group.pages[index - 1]);
        const keep = new Set(group.pages);
        const removed = Array.from({ length: source.count }, (_, index) => index + 1).filter(page => !keep.has(page));
        data = ascending && removed.length
          ? await send('remove-pages', data, [{ name: 'pageNumbers', value: removed.join(',') }])
          : await send('rearrange-pages', data, [{ name: 'pageNumbers', value: group.pages.join(',') }, { name: 'customMode', value: 'CUSTOM' }]);
      }
      if (group.rotation) data = await send('rotate-pdf', data, [{ name: 'angle', value: String(group.rotation) }]);
      pieces.push({ ...file, filename: `part-${index + 1}.pdf`, data });
    }
    if (pieces.length === 1) current = pieces[0].data!;
    else {
      const merged = await postStirlingMultipart(baseUrl, '/api/v1/general/merge-pdfs', [...pieces, { name: 'sortType', value: 'orderProvided' }, { name: 'removeCertSign', value: 'true' }], signal);
      current = merged.buffer;
      if (!current.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('invalid-output');
    }
  }
  if (payload.angle) current = await send('rotate-pdf', current, [{ name: 'angle', value: String(payload.angle) }]);
  if (crop) current = await send('crop', current, ['x', 'y', 'width', 'height'].map(name => ({ name, value: String(crop[name]) })));
  return current;
}

/**
 * Generates a compliant PDF document with embedded ToUnicode CMap for arbitrary multilingual text.
 */
export function createPdfDocument(pagesText: string[]): Buffer {
  if (!pagesText.length) pagesText = [''];
  const allText = pagesText.join('');
  const chars = Array.from(new Set(Array.from(allText)));
  if (!chars.length) chars.push(' ');
  const charToCid = new Map<string, string>();
  const mapping: string[] = [];
  chars.forEach((c, i) => {
    const cid = (i + 1).toString(16).padStart(2, '0');
    const uCode = c.codePointAt(0)!.toString(16).padStart(4, '0');
    charToCid.set(c, cid);
    mapping.push(`<${cid}> <${uCode}>`);
  });

  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /CustomToUnicode def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
${mapping.length} beginbfchar
${mapping.join('\n')}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

  const totalPages = pagesText.length;
  const fontIdx = 3 + totalPages * 2;
  const cidFontIdx = fontIdx + 1;
  const cmapIdx = fontIdx + 2;

  const pageObjects: string[] = [];
  pagesText.forEach((text, i) => {
    const pageNum = 3 + i * 2;
    const contentNum = pageNum + 1;
    let streamContent = '';
    if (text) {
      const processedText = text.replace(/[\u0600-\u06FF\s]+/gu, match => {
        const words = match.split(' ');
        return words.reverse().map(w => Array.from(w).reverse().join('')).join(' ');
      });
      const hex = Array.from(processedText).map(c => charToCid.get(c) || '0001').join('');
      streamContent = `BT /F1 16 Tf 50 750 Td <${hex}> Tj ET`;
    }
    pageObjects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontIdx} 0 R >> >> /Contents ${contentNum} 0 R >>`);
    pageObjects.push(`<< /Length ${Buffer.byteLength(streamContent)} >>\nstream\n${streamContent}\nendstream`);
  });

  const fontObjects = [
    `<< /Type /Font /Subtype /Type0 /BaseFont /CustomFont /Encoding /Identity-H /DescendantFonts [${cidFontIdx} 0 R] /ToUnicode ${cmapIdx} 0 R >>`,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /CustomFont /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> /CIDToGIDMap /Identity /DW 300 >>`,
    `<< /Length ${Buffer.byteLength(cmap)} >>\nstream\n${cmap}\nendstream`,
  ];

  const allObjs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pagesText.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pagesText.length} >>`,
    ...pageObjects,
    ...fontObjects,
  ];

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [0];
  let len = parts[0].length;
  allObjs.forEach((obj, idx) => {
    offsets.push(len);
    const p = Buffer.from(`${idx + 1} 0 obj\n${obj}\nendobj\n`);
    parts.push(p);
    len += p.length;
  });

  const xref = `xref\n0 ${allObjs.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${allObjs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

/**
 * Executes a PDF workstation operation against Stirling-PDF's REST API v1 (`/api/v1/...`).
 */
async function stageSplitOutputs(outputDir: string, buffer: Buffer): Promise<PdfOutput[]> {
  if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) return [await stageSingleOutput(outputDir, 'part-0001.pdf', 'pdf', buffer)];
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('invalid-output');
  const entries = extractZipEntries(buffer).filter(entry => entry.name.toLowerCase().endsWith('.pdf'));
  if (!entries.length) throw new Error('invalid-output');
  const outputs: PdfOutput[] = [];
  for (let index = 0; index < entries.length; index++) outputs.push(await stageSingleOutput(outputDir, `part-${String(index + 1).padStart(4, '0')}.pdf`, 'pdf', entries[index].data));
  return outputs;
}

async function stageSplitRanges(baseUrl: string, file: MultipartField, buffer: Buffer, boundaries: number[], outputDir: string, signal: AbortSignal): Promise<PdfOutput[]> {
  const count = await stirlingPageCount(buffer);
  if (boundaries.some(page => !Number.isInteger(page) || page < 1 || page >= count)) throw new Error('invalid-request');
  const ends = [...new Set(boundaries)].sort((first, second) => first - second);
  ends.push(count);
  const outputs: PdfOutput[] = [];
  let start = 1;
  for (const end of ends) {
    if (signal.aborted) throw new Error('cancelled');
    const removed = Array.from({ length: count }, (_, index) => index + 1).filter(page => page < start || page > end);
    const part = removed.length ? (await postStirlingMultipart(baseUrl, '/api/v1/general/remove-pages', [{ ...file, data: buffer }, { name: 'pageNumbers', value: removed.join(',') }], signal)).buffer : buffer;
    outputs.push(await stageSingleOutput(outputDir, `part-${String(outputs.length + 1).padStart(4, '0')}.pdf`, 'pdf', part));
    start = end + 1;
  }
  return outputs;
}

export async function runStirlingPdf(
  tools: PdfEngineTools,
  input: PythonPdfInput,
  signal: AbortSignal,
  progress: (current: number, total: number) => void,
): Promise<PdfEngineResult> {
  if (signal.aborted) throw new Error('cancelled');
  defaultStirlingSidecar.setProcessing(true);
  try {
    if (input.operation === 'capabilities') {
      return {
        engine: 'Stirling-PDF 3.2.2',
        features: [
          'inspect',
          'preview',
          'create',
          'edit-content',
          'organize',
          'split',
          'ocr',
          'export-docx',
          'export-xlsx',
          'export-pptx',
          'export-html',
          'export-markdown',
          'export-text',
          'export-csv',
          'redact',
          'encrypt',
          'sanitize',
          'watermark',
          'compress',
          'page-numbers',
          'add-image',
          'unlock-forms',
          'extract-images',
          'scale-pages',
          'multi-page-layout',
          'pdf-to-single-page',
          'edit-toc',
          'validate',
          'repair-metadata',
          'sign',
          'verify-signatures',
          'crop',
          'document-properties',
          'basic-info',
          'convert-file-pdf',
          'review',
          'summarize',
          'cloud',
        ],
      };
    }

    const outputDir = path.dirname(input.output);
    await mkdir(outputDir, { recursive: true });

    if (input.operation === 'create') {
      const payload = input.payload ?? {};
      const pages = Array.isArray(payload.pages) ? payload.pages : [{ text: '' }];
      const pagesText = pages.map((p: unknown) => (typeof p === 'object' && p !== null && 'text' in p && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''));
      const createdPdf = createPdfDocument(pagesText);
      const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', createdPdf);
      progress(1, 1);
      return { outputs: [out] };
    }

    const baseUrl = await resolveStirlingEndpoint(tools);
    // A JVM that has only just started answers its first requests slowly, without being unhealthy.
    await probeStirlingReadiness(baseUrl, signal, 20_000);

    if (!input.filename || !fs.existsSync(input.filename)) {
      throw new Error('invalid-source');
    }
    if (input.expectedHash && (await fileSha256(input.filename)) !== input.expectedHash) {
      throw new Error('source-changed');
    }

    const sourceBytes = await readFile(input.filename);
    const payload = input.payload ?? {};
    const fileField: MultipartField = {
      name: 'fileInput',
      filename: path.basename(input.filename) || 'document.pdf',
      contentType: 'application/pdf',
      data: sourceBytes,
    };

  progress(0, 1);

  const plainText = async (): Promise<string> => {
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/convert/pdf/text', [fileField, { name: 'outputFormat', value: 'txt' }], signal);
    const extracted = buffer.toString('utf8');
    if (!extracted.trim()) throw new Error('no-text');
    return extracted;
  };
  // HTML and Markdown need the engine's pdftohtml; without it they are reflowed from the extracted text.
  const reflowFallback = (build: (text: string) => string) => async (error: unknown): Promise<Buffer> => {
    if ((error as Error).message !== 'engine-missing') throw error;
    return Buffer.from(build(await plainText()));
  };

  if (input.operation === 'inspect' || input.operation === 'text') {
    let selectedPages: number[] | undefined;
    if (payload.pages !== undefined) {
      if (!Array.isArray(payload.pages)) throw new Error('invalid-request');
      selectedPages = payload.pages;
    }
    if (payload.fromPage !== undefined || payload.toPage !== undefined) {
      const from = Number(payload.fromPage ?? 1), to = Number(payload.toPage ?? from);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from >= 200) throw new Error('invalid-request');
      selectedPages = Array.from({ length: to - from + 1 }, (_, index) => from + index);
    }
    const geometry = await inspectPdfFile(input.filename, input.password, progress, selectedPages);
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/convert/pdf/text-editor', [fileField, { name: 'lightweight', value: 'true' }], signal);
    let model: { pages?: { pageNumber?: number; textElements?: { text?: string }[] }[] };
    try { model = JSON.parse(buffer.toString('utf8')); } catch { throw new Error('invalid-output'); }
    if (!Array.isArray(model.pages) || model.pages.length !== geometry.totalPages) throw new Error('invalid-output');
    const pages = geometry.pages.map(page => {
      const extracted = model.pages!.find(item => item.pageNumber === page.page);
      if (!extracted || !Array.isArray(extracted.textElements)) throw new Error('invalid-output');
      const text = extracted.textElements.map(element => {
        if (typeof element.text !== 'string') throw new Error('invalid-output');
        return element.text;
      }).join('\n');
      return { ...page, text, blocks: page.blocks.map(block => ({ ...block, rect: [block.x, block.y, block.x + block.width, block.y + block.height] })) };
    });
    if (input.expectedHash && await fileSha256(input.filename) !== input.expectedHash) throw new Error('source-changed');
    progress(1, 1);
    return { totalPages: geometry.totalPages, pages, extraction: geometry.extraction, outline: geometry.outline, signedSource: geometry.signatureFields > 0 };
  }

  if (input.operation === 'preview') {
    if (payload.items !== undefined || payload.pages !== undefined) {
      const items = payload.items ?? (Array.isArray(payload.pages) ? payload.pages.map(page => ({ page, sessionId: 'current' })) : null);
      if (!Array.isArray(items) || items.length > 36) throw new Error('invalid-request');
      const thumbnails: { key: string; page: number; image: string }[] = [];
      let bytes = 0;
      for (const item of items) {
        if (!item || typeof item !== 'object' || !Number.isInteger(item.page) || item.page < 1) throw new Error('invalid-request');
        const key = item.sessionId ?? 'current';
        if (typeof key !== 'string') throw new Error('invalid-request');
        const source = key === 'current' ? { filename: input.filename, sha256: input.expectedHash, password: input.password } : input.sources?.[key];
        if (!source) throw new Error('invalid-request');
        const rendered = await runStirlingPdf(tools, { ...input, filename: source.filename, expectedHash: source.sha256, password: source.password, payload: { page: item.page, thumbnail: true } }, signal, () => {});
        bytes += Buffer.byteLength(rendered.image || '');
        if (bytes > 32 * 1024 * 1024) throw new Error('document-too-large');
        thumbnails.push({ key: `${key}:${item.page}`, page: item.page, image: rendered.image! });
        progress(thumbnails.length, items.length);
      }
      return { thumbnails };
    }
    const pageNumber = Number(payload.page ?? 1);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 10000) throw new Error('invalid-request');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdfjs.getDocument({ data: new Uint8Array(sourceBytes), password: input.password, isEvalSupported: false, enableXfa: false, verbosity: 0 });
    let width: number, height: number;
    try {
      const document = await loading.promise;
      if (pageNumber > document.numPages) throw new Error('invalid-request');
      const permissions = await document.getPermissions();
      if (permissions && !permissions.includes(pdfjs.PermissionFlag.COPY)) throw new Error('permission-denied');
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      width = viewport.width; height = viewport.height;
      if (width * height > 16_000_000) throw new Error('document-too-large');
    } finally { await loading.destroy(); }
    const dpi = payload.thumbnail ? Math.max(1, Math.floor(Math.min(180 / width, 240 / height, 96 / 72) * 72)) : 96;
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/convert/pdf/img', [fileField,
      { name: 'imageFormat', value: 'png' }, { name: 'singleOrMultiple', value: 'single' },
      { name: 'colorType', value: 'color' }, { name: 'dpi', value: String(dpi) },
      { name: 'pageNumbers', value: String(pageNumber) }, { name: 'includeAnnotations', value: 'true' },
    ], signal);
    if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('invalid-output');
    const pixelWidth = buffer.readUInt32BE(16), pixelHeight = buffer.readUInt32BE(20);
    if (buffer.subarray(12, 16).toString() !== 'IHDR' || !pixelWidth || !pixelHeight || pixelWidth * pixelHeight > 32_000_000) throw new Error('invalid-output');
    if (input.expectedHash && await fileSha256(input.filename) !== input.expectedHash) throw new Error('source-changed');
    progress(1, 1);
    return { page: pageNumber, width, height, image: `data:image/png;base64,${buffer.toString('base64')}` };
  }

  if (input.operation === 'validate') {
    const profile = typeof payload.profile === 'string' ? payload.profile : '2b';
    if (!['1b', '2b', 'ua1'].includes(profile)) throw new Error('invalid-request');
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/security/verify-pdf', [fileField], signal);
    let parsed: unknown;
    try { parsed = JSON.parse(buffer.toString('utf8')); } catch { throw new Error('invalid-output'); }
    const reports = Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [];
    if (!reports.length) throw new Error('engine-failed');
    const failures: { specification: string; clause: string; testNumber: string; description: string }[] = [];
    for (const report of reports) {
      const checks = Array.isArray(report.failedChecks) ? report.failedChecks as Record<string, unknown>[] : [];
      for (const check of checks) {
        if (failures.length >= 100) break;
        failures.push({
          specification: String(check.specification ?? report.standard ?? ''),
          clause: String(check.clause ?? ''),
          testNumber: String(check.testNumber ?? ''),
          description: String(check.message ?? check.description ?? ''),
        });
      }
    }
    progress(1, 1);
    return {
      profile,
      compliant: reports.every(report => report.compliant === true),
      failures,
      manualAccessibilityReviewRequired: profile === 'ua1',
      validator: 'Stirling-PDF/veraPDF',
    };
  }

  if (input.operation === 'verify-signatures') {
    const fields: MultipartField[] = [fileField];
    const trustRootKey = typeof payload.trustRoot === 'string' ? payload.trustRoot : undefined;
    const trustRootPath = trustRootKey && input.assets ? input.assets[trustRootKey] : undefined;
    if (trustRootPath && fs.existsSync(trustRootPath)) {
      fields.push({
        name: 'certFile',
        filename: path.basename(trustRootPath),
        contentType: 'application/x-x509-ca-cert',
        data: await readFile(trustRootPath),
      });
    }
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/security/validate-signature', fields, signal);
    let parsed: unknown;
    try { parsed = JSON.parse(buffer.toString('utf8')); } catch { throw new Error('invalid-output'); }
    const items = Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [];
    const signatures = items.map((item, idx) => {
      const valid = item.valid === true;
      const chainValid = item.chainValid === true;
      const trustAnchor = item.trustAnchor === true || item.selfSigned === false && chainValid;
      const coversWhole = item.coversWholeDocument !== false;
      const intact = valid && coversWhole;
      const status = !intact ? 'Tampered' : trustAnchor ? 'Verified' : 'Signed';
      return {
        field: String(item.signatureId ?? `Signature-${idx + 1}`),
        subject: String(item.signerName ?? ''),
        fingerprint: String(item.serialNumber ?? ''),
        intact,
        trusted: Boolean(trustAnchor),
        coverage: coversWhole ? 'ENTIRE_FILE' : 'PARTIAL',
        status,
      };
    });
    const overallStatus =
      signatures.some(sig => sig.status === 'Tampered') ? 'Tampered'
      : signatures.length === 0 ? 'Draft'
      : signatures.every(sig => sig.status === 'Verified') ? 'Verified'
      : 'Signed';
    progress(1, 1);
    return {
      status: overallStatus,
      pendingFields: [],
      signatures,
      revocation: 'not-checked-offline',
    };
  }

  if (input.operation === 'edit-content') {
    if (!canStirlingHandle('edit-content', payload)) throw new Error('engine-missing');
    if (Array.isArray(payload.edits) && payload.edits.length) {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loading = pdfjs.getDocument({ data: new Uint8Array(sourceBytes), password: input.password, isEvalSupported: false, enableXfa: false, verbosity: 0 });
      try {
        const document = await loading.promise;
        if (document.numPages > 2000) throw new Error('document-too-large');
        const pages = [];
        for (let number = 1; number <= document.numPages; number++) {
          if (signal.aborted) throw new Error('cancelled');
          const page = await document.getPage(number);
          if (page.rotate || page.view[0] !== 0 || page.view[1] !== 0) throw new Error('unsupported');
          const viewport = page.getViewport({ scale: 1 });
          pages.push({ width: viewport.width, height: viewport.height });
        }
        const overlay = buildInkOverlay(pages, payload.edits as InkOverlayEdit[]);
        const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/general/overlay-pdfs', [fileField, { name: 'overlayFiles', filename: 'ink.pdf', contentType: 'application/pdf', data: overlay }, { name: 'overlayMode', value: 'SequentialOverlay' }, { name: 'overlayPosition', value: '0' }], signal);
        const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
        progress(1, 1);
        return { outputs: [out] };
      } finally { await loading.destroy(); }
    }
    const replacements = Array.isArray(payload.textReplacements) ? payload.textReplacements as Record<string, unknown>[] : [];
    if (!replacements.length || replacements.length > 100 || replacements.some(item => !item || typeof item.find !== 'string' || !item.find || typeof item.replace !== 'string' || item.find.length > 10000 || item.replace.length > 10000)) throw new Error('invalid-request');
    const edits = replacements.map(item => ({ find: item.find as string, replace: item.replace as string }));
    await stirlingPageCount(sourceBytes);
    if (payload.rtlAwareJsonRoundTrip !== false && edits.some(item => /[\u0600-\u06ff]/u.test(item.find + item.replace))) {
      try {
        const exported = await postStirlingMultipart(baseUrl, '/api/v1/convert/pdf/text-editor', [fileField, { name: 'lightweight', value: 'true' }], signal);
        let model: unknown;
        try { model = JSON.parse(exported.buffer.toString('utf8')); } catch { throw new Error('invalid-output'); }
        const changed = applyRtlJsonReplacements(model, edits, Boolean(payload.wholeWordSearch));
        if (!changed) {
          const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', sourceBytes);
          progress(1, 1);
          return { outputs: [out], visualSignatureOnly: false };
        }
        const imported = await postStirlingMultipart(baseUrl, '/api/v1/convert/text-editor/pdf', [{ name: 'fileInput', filename: 'document.json', contentType: 'application/json', data: Buffer.from(JSON.stringify(model), 'utf8') }], signal);
        const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', imported.buffer);
        progress(1, 1);
        return { outputs: [out], visualSignatureOnly: false };
      } catch (error) {
        // Only absent endpoints use the legacy API; unsafe reconstruction uses Python.
        if (!(error instanceof StirlingEndpointUnavailable)) throw error;
      }
    }
    const { buffer } = await postStirlingMultipart(
      baseUrl,
      '/api/v1/general/edit-text',
      [
        fileField,
        { name: 'edits', value: JSON.stringify(edits) },
        { name: 'wholeWordSearch', value: String(Boolean(payload.wholeWordSearch)) },
      ],
      signal,
    );
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out], visualSignatureOnly: false };
  }

  if (input.operation === 'organize') {
    const buffer = await organizeStirling(baseUrl, fileField, input, signal);
    const plan = Array.isArray(payload.pages) ? payload.pages as Record<string, unknown>[] : [];
    const boundaries = plan.slice(0, -1).flatMap((item, index) => item.splitAfter === true ? [index + 1] : []);
    if (boundaries.length) {
      const outputs = await stageSplitRanges(baseUrl, fileField, buffer, boundaries, outputDir, signal);
      progress(1, 1);
      return { outputs };
    }
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'split') {
    const splitType = String(payload.splitType ?? payload.splitBy ?? payload.method ?? '');
    if (splitType === 'chapters') {
      const fields: MultipartField[] = [
        fileField,
        { name: 'bookmarkLevel', value: String(payload.bookmarkLevel ?? payload.level ?? 0) },
        { name: 'includeMetadata', value: String(Boolean(payload.includeMetadata ?? true)) },
      ];
      const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/general/split-pdf-by-chapters', fields, signal);
      const outputs: PdfOutput[] = [];
      if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        outputs.push(await stageSingleOutput(outputDir, 'chapter-0001.pdf', 'pdf', buffer));
      } else if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        const entries = extractZipEntries(buffer).filter(entry => entry.name.toLowerCase().endsWith('.pdf'));
        for (let i = 0; i < entries.length; i++) {
          outputs.push(await stageSingleOutput(outputDir, entries[i].name || `chapter-${String(i + 1).padStart(4, '0')}.pdf`, 'pdf', entries[i].data));
        }
      } else {
        throw new Error('invalid-output');
      }
      progress(1, 1);
      return { outputs };
    }

    if (splitType === 'size' || splitType === 'count' || splitType === 'size-or-count' || payload.splitBySizeOrCount) {
      const typeCode = splitType === 'count' || payload.splitCount ? '1' : splitType === 'doc-count' ? '2' : '0';
      const splitValue = String(payload.splitValue ?? (typeCode === '1' ? (payload.pagesPerDocument ?? '5') : '10MB'));
      const fields: MultipartField[] = [
        fileField,
        { name: 'splitType', value: typeCode },
        { name: 'splitValue', value: splitValue },
      ];
      const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/general/split-by-size-or-count', fields, signal);
      const outputs: PdfOutput[] = [];
      if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        outputs.push(await stageSingleOutput(outputDir, 'part-0001.pdf', 'pdf', buffer));
      } else if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        const entries = extractZipEntries(buffer).filter(entry => entry.name.toLowerCase().endsWith('.pdf'));
        for (let i = 0; i < entries.length; i++) {
          outputs.push(await stageSingleOutput(outputDir, entries[i].name || `part-${String(i + 1).padStart(4, '0')}.pdf`, 'pdf', entries[i].data));
        }
      } else {
        throw new Error('invalid-output');
      }
      progress(1, 1);
      return { outputs };
    }

    const pageNumbers = typeof payload.pageNumbers === 'string' && payload.pageNumbers.trim()
      ? payload.pageNumbers.trim()
      : 'all';
    const { buffer } = await postStirlingMultipart(
      baseUrl,
      '/api/v1/general/split-pages',
      [fileField, { name: 'pageNumbers', value: pageNumbers }],
      signal,
    );
    const outputs = await stageSplitOutputs(outputDir, buffer);
    progress(1, 1);
    return { outputs };
  }

  if (input.operation === 'redact') {
    const regions = Array.isArray(payload.regions) ? payload.regions as Record<string, unknown>[] : [];
    const pattern = typeof payload.pattern === 'string' ? payload.pattern.trim() : '';
    if (!regions.length && !pattern) throw new Error('no-redactions');
    let currentBuffer: Buffer = sourceBytes;
    let totalCount = 0;

    if (regions.length > 0) {
      currentBuffer = await redactPagesInPlace(tools, input.filename, input.password, baseUrl, outputDir, regions.map(region => ({ page: Number(region.page), rect: Array.isArray(region.rect) ? region.rect.map(Number) : [] })), payload.convertPdfToImage !== false, signal);
      totalCount += regions.length;
    }

    if (pattern) {
      const isPreset = ['email', 'phone', 'id'].includes(pattern);
      const expression =
        pattern === 'email' ? '[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}'
        : pattern === 'phone' ? '\\+?\\d[\\d ()-]{6,}\\d'
        : pattern === 'id' ? '\\b\\d{8,18}\\b'
        : pattern;
      const response = await postStirlingMultipart(
        baseUrl,
        '/api/v1/security/auto-redact',
        [
          { name: 'fileInput', filename: 'document.pdf', contentType: 'application/pdf', data: currentBuffer },
          { name: 'listOfText', value: expression },
          { name: 'useRegex', value: String(isPreset || Boolean(payload.useRegex)) },
          { name: 'wholeWordSearch', value: 'false' },
          { name: 'redactColor', value: '#000000' },
          { name: 'convertPDFToImage', value: 'true' },
        ],
        signal,
      );
      currentBuffer = response.buffer;
      totalCount += 1;
    }

    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', currentBuffer);
    progress(1, 1);
    return { outputs: [out], redactionsApplied: totalCount };
  }

  if (input.operation === 'encrypt') {
    const mode = payload.mode === 'decrypt' ? 'decrypt' : 'encrypt';
    if (mode === 'decrypt') {
      const { buffer } = await postStirlingMultipart(
        baseUrl,
        '/api/v1/security/remove-password',
        [fileField, { name: 'password', value: String(input.password ?? '') }],
        signal,
      );
      const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
      progress(1, 1);
      return { outputs: [out] };
    }
    const ownerPassword = String(payload.ownerPassword ?? '');
    const userPassword = String(payload.userPassword ?? '');
    const bits = Number(payload.bits ?? 256);
    if (ownerPassword.length < 8 || !userPassword || ownerPassword === userPassword || ![128, 256].includes(bits)) {
      throw new Error('invalid-request');
    }
    const permissions = (payload.permissions && typeof payload.permissions === 'object' ? payload.permissions : {}) as Record<string, unknown>;
    const allowPrint = permissions.print !== false;
    const allowCopy = permissions.copy !== false;
    const allowModify = permissions.modify !== false;
    const allowAnnotate = permissions.annotate !== false;
    const allowForms = permissions.forms !== false;
    const { buffer } = await postStirlingMultipart(
      baseUrl,
      '/api/v1/security/add-password',
      [
        fileField,
        { name: 'password', value: userPassword },
        { name: 'ownerPassword', value: ownerPassword },
        { name: 'keyLength', value: String(bits) },
        { name: 'canPrint', value: String(allowPrint) },
        { name: 'canPrintFaithful', value: String(allowPrint) },
        { name: 'canExtractContent', value: String(allowCopy) },
        { name: 'canExtractForAccessibility', value: String(allowCopy) },
        { name: 'canModify', value: String(allowModify) },
        { name: 'canAssembleDocument', value: String(allowModify) },
        { name: 'canModifyAnnotations', value: String(allowAnnotate) },
        { name: 'canFillInForm', value: String(allowForms) },
      ],
      signal,
    );
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'ocr') {
    const caps = probeExternalCapabilities();
    if (!caps.tesseract.available) {
      throw new Error('engine-missing');
    }
    const rawLangs = typeof payload.languages === 'string' ? payload.languages : 'ara+eng';
    const languages = rawLangs.split(/[+,]/u).map(item => item.trim()).filter(Boolean);
    const fields: MultipartField[] = [
      fileField,
      ...languages.map(lang => ({ name: 'languages', value: lang })),
      { name: 'sidecar', value: 'false' },
      { name: 'deskew', value: String(Boolean(payload.deskew ?? true)) },
      { name: 'clean', value: String(Boolean(payload.clean ?? false)) },
      { name: 'cleanFinal', value: String(Boolean(payload.cleanFinal ?? false)) },
      { name: 'ocrType', value: 'skip-text' },
      { name: 'ocrRenderType', value: 'hocr' },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/misc/ocr-pdf', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'export-docx' || input.operation === 'export-xlsx' || input.operation === 'export-pptx' || input.operation === 'export-html') {
    const endpoint =
      input.operation === 'export-docx' ? '/api/v1/convert/pdf/word'
      : input.operation === 'export-xlsx' ? '/api/v1/convert/pdf/xlsx'
      : input.operation === 'export-pptx' ? '/api/v1/convert/pdf/presentation'
      : '/api/v1/convert/pdf/html';
    const format: PdfOutputFormat =
      input.operation === 'export-docx' ? 'docx'
      : input.operation === 'export-xlsx' ? 'xlsx'
      : input.operation === 'export-pptx' ? 'pptx'
      : 'html';
    const fields: MultipartField[] = [fileField];
    if (format === 'xlsx') {
      fields.push({ name: 'pageNumbers', value: typeof payload.pageNumbers === 'string' ? payload.pageNumbers : 'all' }, { name: 'useStirlingOfficeConvert', value: 'false' });
    } else if (format !== 'html') {
      fields.push({ name: 'outputFormat', value: format });
    }
    const converted = postStirlingMultipart(baseUrl, endpoint, fields, signal).then(response => response.buffer);
    const buffer = await (format === 'html' ? converted.catch(reflowFallback(text => textToHtml(text, input.language))) : converted);
    const out = await stageSingleOutput(outputDir, `document.${format}`, format, buffer);
    progress(1, 1);
    return {
      outputs: [out],
      fidelity: format === 'html' ? 'semantic-reflow' : 'editable-reconstruction',
    };
  }

  if (input.operation === 'sign') {
    const certKey = typeof payload.certificate === 'string' ? payload.certificate : '';
    const certPath = certKey && input.assets ? input.assets[certKey] : undefined;
    if (!certPath || !fs.existsSync(certPath)) throw new Error('certificate-invalid');
    const certBytes = await readFile(certPath);
    const fields: MultipartField[] = [
      fileField,
      { name: 'certType', value: 'PKCS12' },
      { name: 'p12File', filename: path.basename(certPath), contentType: 'application/x-pkcs12', data: certBytes },
      { name: 'password', value: String(payload.certificatePassword ?? '') },
      { name: 'showSignature', value: 'true' },
      { name: 'pageNumber', value: String(Number(payload.page ?? 1)) },
      { name: 'reason', value: String(payload.reason ?? '') },
      { name: 'location', value: String(payload.location ?? '') },
      { name: 'name', value: String(payload.fieldName ?? 'BaglibSignature') },
      { name: 'showLogo', value: 'false' },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/security/cert-sign', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return {
      outputs: [out],
      signature: {
        status: 'Signed',
        pendingFields: [],
        signatures: [{ field: String(payload.fieldName ?? 'BaglibSignature'), subject: 'PKCS12', fingerprint: out.sha256.slice(0, 32), intact: true, trusted: false, coverage: 'ENTIRE_FILE', status: 'Signed' }],
        revocation: 'not-checked-offline',
      },
    };
  }

  if (input.operation === 'prepare-signature') {
    return {
      status: 'Draft',
      pendingFields: [{ name: String(payload.fieldName ?? 'BaglibSignature'), page: Number(payload.page ?? 1), rect: [100, 100, 300, 160] }],
      signatures: [],
      revocation: 'not-checked-offline',
    };
  }

  if (input.operation === 'sanitize') {
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/security/sanitize-pdf', [fileField], signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'watermark') {
    const watermarkText = String(payload.watermarkText ?? payload.text ?? 'CONFIDENTIAL');
    const fields: MultipartField[] = [
      fileField,
      { name: 'watermarkType', value: String(payload.watermarkType ?? 'TEXT') },
      { name: 'watermarkText', value: watermarkText },
      { name: 'fontSize', value: String(payload.fontSize ?? 30) },
      { name: 'rotation', value: String(payload.rotation ?? 45) },
      { name: 'opacity', value: String(payload.opacity ?? 0.3) },
      { name: 'widthSpacer', value: String(payload.widthSpacer ?? 50) },
      { name: 'heightSpacer', value: String(payload.heightSpacer ?? 50) },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/security/add-watermark', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'compress') {
    const fields: MultipartField[] = [
      fileField,
      { name: 'optimizeLevel', value: String(payload.optimizeLevel ?? 2) },
    ];
    if (payload.expectedOutputSize) {
      fields.push({ name: 'expectedOutputSize', value: String(payload.expectedOutputSize) });
    }
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/misc/compress-pdf', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'page-numbers') {
    const fields: MultipartField[] = [
      fileField,
      { name: 'pageNumberStyle', value: String(payload.pageNumberStyle ?? payload.style ?? 'PAGE_NUMBER_ONLY') },
      { name: 'position', value: String(payload.position ?? 'BOTTOM_CENTER') },
      { name: 'startingNumber', value: String(payload.startingNumber ?? payload.startNumber ?? 1) },
      { name: 'pagesToNumber', value: String(payload.pagesToNumber ?? payload.pages ?? 'all') },
      { name: 'customMargin', value: String(payload.customMargin ?? payload.margin ?? 'medium') },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/misc/add-page-numbers', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'add-image') {
    const fields: MultipartField[] = [
      fileField,
      { name: 'x', value: String(payload.x ?? 0) },
      { name: 'y', value: String(payload.y ?? 0) },
      { name: 'pageNumber', value: String(payload.page ?? 1) },
    ];
    const imageAssetKey = typeof payload.image === 'string' ? payload.image : undefined;
    const imagePath = imageAssetKey && input.assets ? input.assets[imageAssetKey] : undefined;
    if (imagePath && fs.existsSync(imagePath)) {
      fields.push({
        name: 'imageFile',
        filename: path.basename(imagePath),
        contentType: 'image/png',
        data: await readFile(imagePath),
      });
    }
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/misc/add-image', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'unlock-forms') {
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/misc/unlock-pdf-forms', [fileField], signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'extract-images') {
    const fields: MultipartField[] = [
      fileField,
      { name: 'pageNumbers', value: String(payload.pages ?? 'all') },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/misc/extract-images', fields, signal);
    const out = await stageSingleOutput(outputDir, 'extracted-images.zip', 'zip', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'export-markdown') {
    const buffer = await postStirlingMultipart(baseUrl, '/api/v1/convert/pdf/markdown', [fileField], signal)
      .then(response => response.buffer, reflowFallback(textToMarkdown));
    if (!markdownHasText(buffer.toString('utf8'))) throw new Error('no-text');
    const out = await stageSingleOutput(outputDir, 'document.md', 'md', buffer);
    progress(1, 1);
    return { outputs: [out], fidelity: 'semantic-reflow' };
  }

  if (input.operation === 'export-text') {
    const out = await stageSingleOutput(outputDir, 'document.txt', 'txt', Buffer.from(await plainText()));
    progress(1, 1);
    return { outputs: [out], fidelity: 'plain-text' };
  }

  if (input.operation === 'export-csv') {
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/convert/pdf/csv', [fileField, { name: 'pageNumbers', value: 'all' }], signal);
    if (isEmptyZipBytes(buffer)) throw new Error('no-tables');
    const out = await stageSingleOutput(outputDir, 'document.csv', 'csv', buffer);
    progress(1, 1);
    return { outputs: [out], fidelity: 'tabular' };
  }

  if (input.operation === 'scale-pages') {
    const fields: MultipartField[] = [
      fileField,
      { name: 'scaleFactor', value: String(payload.scaleFactor ?? 1.0) },
      { name: 'pageNumbers', value: String(payload.pages ?? 'all') },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/general/scale-pages', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'multi-page-layout') {
    const fields: MultipartField[] = [
      fileField,
      { name: 'pagesPerSheet', value: String(payload.pagesPerSheet ?? 2) },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/general/multi-page-layout', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'pdf-to-single-page') {
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/general/pdf-to-single-page', [fileField], signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'edit-toc') {
    const tocData = typeof payload.toc === 'string' ? payload.toc : JSON.stringify(payload.toc ?? []);
    const fields: MultipartField[] = [
      fileField,
      { name: 'bookmarkData', value: tocData },
      { name: 'replaceExisting', value: String(payload.replaceExisting === true) },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/general/edit-table-of-contents', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'repair-metadata') {
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/misc/repair', [fileField], signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'crop') {
    const cropBox = (payload.crop && typeof payload.crop === 'object' ? payload.crop : payload) as Record<string, unknown>;
    const fields: MultipartField[] = [
      fileField,
      { name: 'x', value: String(cropBox.x ?? 0) },
      { name: 'y', value: String(cropBox.y ?? 0) },
      { name: 'width', value: String(cropBox.width ?? 100) },
      { name: 'height', value: String(cropBox.height ?? 100) },
      { name: 'pageNumbers', value: String(cropBox.pageNumbers ?? payload.pages ?? 'all') },
      { name: 'autoCrop', value: String(Boolean(cropBox.autoCrop)) },
    ];
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/general/crop', fields, signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'document-properties') {
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/analysis/document-properties', [fileField], signal);
    let properties: Record<string, unknown> = {};
    try { properties = JSON.parse(buffer.toString('utf8')); } catch { throw new Error('invalid-output'); }
    progress(1, 1);
    return { properties };
  }

  if (input.operation === 'basic-info') {
    const { buffer } = await postStirlingMultipart(baseUrl, '/api/v1/analysis/basic-info', [fileField], signal);
    let info: Record<string, unknown> = {};
    try { info = JSON.parse(buffer.toString('utf8')); } catch { throw new Error('invalid-output'); }
    progress(1, 1);
    return { info };
  }

  if (input.operation === 'convert-file-pdf') {
    const kind = typeof payload.fileType === 'string' ? payload.fileType.toLowerCase() : 'file';
    const isOffice = kind === 'file' || kind === 'doc' || kind === 'docx' || kind === 'ppt' || kind === 'pptx' || kind === 'xls' || kind === 'xlsx' || kind === 'odt';
    if (isOffice) {
      const caps = probeExternalCapabilities();
      if (!caps.libreoffice.available) {
        throw new Error('engine-missing');
      }
    }
    const endpoint =
      kind === 'image' || kind === 'img' ? '/api/v1/convert/img/pdf'
      : kind === 'html' ? '/api/v1/convert/html/pdf'
      : kind === 'markdown' || kind === 'md' ? '/api/v1/convert/markdown/pdf'
      : '/api/v1/convert/file/pdf';
    const { buffer } = await postStirlingMultipart(baseUrl, endpoint, [fileField], signal);
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  throw new Error('unsupported');
  } finally {
    defaultStirlingSidecar.setProcessing(false);
  }
}
