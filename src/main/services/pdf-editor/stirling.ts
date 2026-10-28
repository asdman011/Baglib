import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { PdfEngineResult, PdfOperation, PdfOutput, PdfOutputFormat } from '../../../shared/types/pdf-editor';
import { fileSha256 } from './source';
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

/**
 * Manages the lifecycle of a local Stirling-PDF Spring Boot sidecar process
 * following `frontend/src-tauri/src/commands/backend.rs`.
 */
export class StirlingSidecarService {
  private child: ChildProcess | null = null;
  private baseUrl: string | null = null;
  private shutdownFile: string | null = null;
  private starting: Promise<string> | null = null;

  async ensureStarted(options: StirlingSidecarOptions): Promise<string> {
    if (this.baseUrl && this.child && this.child.exitCode === null) {
      return this.baseUrl;
    }
    if (this.starting) return this.starting;
    this.starting = this.spawnBackend(options).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async spawnBackend(options: StirlingSidecarOptions): Promise<string> {
    if (!fs.existsSync(options.javaPath) || !fs.existsSync(options.jarPath)) {
      throw new Error('engine-missing');
    }
    let required: number | undefined;
    try { required = inspectJarMinimumJavaVersion(options.jarPath); } catch { throw new Error('engine-missing'); }
    const installed = await checkJavaMajorVersion(options.javaPath);
    if (required && installed && installed < required) throw new Error('engine-missing');
    const configDir = path.join(options.workDir, 'config');
    const logDir = path.join(options.workDir, 'logs');
    await mkdir(configDir, { recursive: true });
    await mkdir(logDir, { recursive: true });
    const shutdownFile = path.join(options.workDir, `.backend-stop-${process.pid}-${Date.now()}`);
    this.shutdownFile = shutdownFile;

    return new Promise<string>((resolve, reject) => {
      const args = [
        '-Xmx2g',
        '-DBROWSER_OPEN=false',
        '-DSTIRLING_PDF_TAURI_MODE=true',
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
      const child = spawn(options.javaPath, args, {
        cwd: options.workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          TAURI_PARENT_PID: String(process.pid),
          STIRLING_PDF_CONFIG_DIR: configDir,
          STIRLING_PDF_LOG_DIR: logDir,
          STIRLING_PDF_WORK_DIR: options.workDir,
          STIRLING_PDF_SHUTDOWN_FILE: shutdownFile,
        },
      });
      this.child = child;
      let settled = false;
      let stdoutBuffer = '';
      const timeoutMs = options.startupTimeoutMs ?? 45_000;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          void this.stop();
          reject(new Error('engine-failed'));
        }
      }, timeoutMs);

      const onLine = (line: string) => {
        const marker = 'running on port: ';
        const idx = line.indexOf(marker);
        if (idx >= 0) {
          const portText = line.slice(idx + marker.length).trim().split(/\s+/u)[0] ?? '';
          const port = Number.parseInt(portText, 10);
          if (Number.isInteger(port) && port > 0 && port <= 65535 && !settled) {
            settled = true;
            clearTimeout(timer);
            const url = `http://127.0.0.1:${port}`;
            this.baseUrl = url;
            resolve(url);
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
          reject(new Error('engine-failed'));
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.shutdownFile) {
      await writeFile(this.shutdownFile, '').catch(() => {});
    }
    const child = this.child;
    this.child = null;
    this.baseUrl = null;
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
  if (['split', 'ocr', 'export-docx', 'export-xlsx', 'export-pptx', 'export-html', 'redact', 'encrypt', 'validate', 'sign', 'verify-signatures'].includes(operation)) {
    return true;
  }
  if (operation === 'edit-content') {
    const replacements = payload?.textReplacements;
    const edits = payload?.edits;
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
      return !entry.blank && Number.isInteger(entry.page) && Number(entry.page) >= 1 && (!entry.rotation || entry.rotation === 0);
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

async function resolveStirlingEndpoint(tools: PdfEngineTools): Promise<string> {
  if (tools.stirlingUrl) {
    return validateStirlingLoopbackUrl(tools.stirlingUrl);
  }
  if (tools.java && tools.stirlingJar && fs.existsSync(tools.java) && fs.existsSync(tools.stirlingJar)) {
    const workDir = path.join(path.dirname(tools.stirlingJar), 'runtime-work');
    return defaultStirlingSidecar.ensureStarted({
      javaPath: tools.java,
      jarPath: tools.stirlingJar,
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
    await response.body?.cancel();
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
  if (format === 'pdf' && !data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('invalid-output');
  }
  if (['docx', 'xlsx', 'pptx'].includes(format) && !data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('invalid-output');
  const target = path.join(outputDir, filename);
  await writeFile(target, data);
  const info = await stat(target);
  const sha256 = createHash('sha256').update(data).digest('hex');
  return { filename, format, bytes: info.size, sha256 };
}

async function stirlingPageCount(data: Buffer): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, enableXfa: false, verbosity: 0 });
  try {
    const document = await loading.promise;
    // Preserve password/permission handling in the existing Python engine.
    if (await document.getPermissions()) throw new Error('engine-missing');
    if (document.numPages > 10000) throw new Error('document-too-large');
    return document.numPages;
  } catch (error) {
    if ((error as Error).name === 'PasswordException') throw new Error('engine-missing');
    throw error;
  } finally { await loading.destroy(); }
}

async function organizeStirling(baseUrl: string, file: MultipartField, input: PythonPdfInput, signal: AbortSignal): Promise<Buffer> {
  const payload = input.payload ?? {};
  if (!canStirlingHandle('organize', payload)) throw new Error('engine-missing');
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
    const groups: { id: string; pages: number[] }[] = [];
    for (const item of plan) {
      const id = typeof item.sessionId === 'string' ? item.sessionId : 'current';
      if (groups.at(-1)?.id !== id) groups.push({ id, pages: [] });
      groups.at(-1)!.pages.push(Number(item.page));
    }
    const sourceCache = new Map<string, { data: Buffer; count: number }>([['current', { data: current, count: currentCount }]]);
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
 * Executes a PDF workstation operation against Stirling-PDF's REST API v1 (`/api/v1/...`).
 */
export async function runStirlingPdf(
  tools: PdfEngineTools,
  input: PythonPdfInput,
  signal: AbortSignal,
  progress: (current: number, total: number) => void,
): Promise<PdfEngineResult> {
  if (signal.aborted) throw new Error('cancelled');
  const baseUrl = await resolveStirlingEndpoint(tools);
  await probeStirlingReadiness(baseUrl, signal);

  if (input.operation === 'capabilities') {
    return {
      engine: 'Stirling-PDF 3.2.2',
      features: [
        'edit-content',
        'organize',
        'split',
        'ocr',
        'redact',
        'encrypt',
        'export-docx',
        'export-xlsx',
        'export-pptx',
        'export-html',
        'validate',
        'sign',
        'verify-signatures',
      ],
    };
  }

  if (!input.filename || !fs.existsSync(input.filename)) {
    throw new Error('invalid-source');
  }
  if (input.expectedHash && (await fileSha256(input.filename)) !== input.expectedHash) {
    throw new Error('source-changed');
  }

  const outputDir = path.dirname(input.output);
  await mkdir(outputDir, { recursive: true });
  const sourceBytes = await readFile(input.filename);
  const payload = input.payload ?? {};
  const fileField: MultipartField = {
    name: 'fileInput',
    filename: path.basename(input.filename) || 'document.pdf',
    contentType: 'application/pdf',
    data: sourceBytes,
  };

  progress(0, 1);

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
    const out = await stageSingleOutput(outputDir, 'document.pdf', 'pdf', buffer);
    progress(1, 1);
    return { outputs: [out] };
  }

  if (input.operation === 'split') {
    const pageNumbers = typeof payload.pageNumbers === 'string' && payload.pageNumbers.trim()
      ? payload.pageNumbers.trim()
      : 'all';
    const { buffer } = await postStirlingMultipart(
      baseUrl,
      '/api/v1/general/split-pages',
      [fileField, { name: 'pageNumbers', value: pageNumbers }],
      signal,
    );
    const outputs: PdfOutput[] = [];
    if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      outputs.push(await stageSingleOutput(outputDir, 'part-0001.pdf', 'pdf', buffer));
    } else if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      const entries = extractZipEntries(buffer).filter(entry => entry.name.toLowerCase().endsWith('.pdf'));
      if (!entries.length) throw new Error('invalid-output');
      for (let i = 0; i < entries.length; i++) {
        outputs.push(await stageSingleOutput(outputDir, `part-${String(i + 1).padStart(4, '0')}.pdf`, 'pdf', entries[i].data));
      }
    } else {
      throw new Error('invalid-output');
    }
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
      const redactions = regions.map(region => {
        const rect = Array.isArray(region.rect) ? region.rect.map(Number) : [0, 0, 0, 0];
        return {
          page: Number(region.page ?? 1),
          x: rect[0] ?? 0,
          y: rect[1] ?? 0,
          width: Math.max(1, (rect[2] ?? 0) - (rect[0] ?? 0)),
          height: Math.max(1, (rect[3] ?? 0) - (rect[1] ?? 0)),
          color: '#000000',
        };
      });
      const response = await postStirlingMultipart(
        baseUrl,
        '/api/v1/security/redact',
        [
          { name: 'fileInput', filename: 'document.pdf', contentType: 'application/pdf', data: currentBuffer },
          { name: 'redactions', value: JSON.stringify(redactions) },
          { name: 'convertPDFToImage', value: 'true' },
        ],
        signal,
      );
      currentBuffer = response.buffer;
      totalCount += redactions.length;
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
    const { buffer } = await postStirlingMultipart(baseUrl, endpoint, fields, signal);
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

  throw new Error('unsupported');
}
