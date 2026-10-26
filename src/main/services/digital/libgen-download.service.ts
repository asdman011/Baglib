import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import zlib from 'zlib';
import stream from 'stream';
import { app, BrowserWindow } from 'electron';

export interface LibgenDownloadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percent: number;
}

export interface LibgenDownloadOptions {
  md5: string;
  ipfsCid?: string;
  filename: string;
  targetDirectory?: string;
  expectedFormat?: string;
  expectedFilesize?: number;
  timeoutMs?: number;
  onProgress?: (progress: LibgenDownloadProgress) => void;
}

export interface LibgenDownloadResult {
  success: boolean;
  filePath?: string;
  filename?: string;
  byteSize?: number;
  md5?: string;
  sha256?: string;
  mimeType?: string;
  error?: string;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const PUBLIC_IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
];

export const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/epub+zip': '.epub',
  'application/x-mobipocket-ebook': '.mobi',
  'image/vnd.djvu': '.djvu',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.amazon.ebook': '.azw3',
};

// High-performance keep-alive agents to maximize download throughput and avoid TCP/TLS renegotiation lag
const keepAliveHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  keepAliveMsecs: 30000,
  rejectUnauthorized: false,
});

const keepAliveHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,
  keepAliveMsecs: 30000,
});

export class LibgenDownloadService {
  private static instance: LibgenDownloadService;

  public static getInstance(): LibgenDownloadService {
    if (!LibgenDownloadService.instance) {
      LibgenDownloadService.instance = new LibgenDownloadService();
    }
    return LibgenDownloadService.instance;
  }

  /**
   * Step 1: Resolves direct download URL from MD5 with fast multi-mirror racing (libgen.li, libgen.bz)
   */
  public async resolveDownloadUrl(
    md5: string,
    preferredMirror = 'https://libgen.li'
  ): Promise<{ downloadUrl: string; referer: string; cdnLocation?: string } | null> {
    const cleanMd5 = md5.trim().toLowerCase();

    // Mirror list to race in parallel: primary + reliable mirrors
    const candidateMirrors = [
      preferredMirror,
      'https://libgen.li',
      'https://libgen.bz',
      'https://libgen.is',
      'https://libgen.rs',
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    const probeMirror = async (mirror: string) => {
      const adsUrl = `${mirror}/ads.php?md5=${cleanMd5}`;
      const client = mirror.startsWith('https:') ? https : http;
      const agent = mirror.startsWith('https:') ? keepAliveHttpsAgent : keepAliveHttpAgent;

      const html = await new Promise<string>((resolve, reject) => {
        const req = client.get(
          adsUrl,
          {
            agent,
            headers: {
              'User-Agent': DEFAULT_USER_AGENT,
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Connection': 'keep-alive',
            },
            timeout: 6000,
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`ads.php returned status ${res.statusCode}`));
            }
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Connection timed out contacting ${mirror} ads.php`));
        });
      });

      // Extract get.php link with key token: <a href="get.php?md5=...&key=...">
      let fullGetUrl: string | null = null;
      const match = html.match(/<a[^>]+href=["']([^"']*get\.php\?md5=[^"']+)["']/i);
      if (match && match[1]) {
        fullGetUrl = new URL(match[1], mirror).toString();
      } else {
        const directKeyMatch = html.match(/get\.php\?md5=([a-fA-F0-9]{32})&key=([a-zA-Z0-9]+)/i);
        if (directKeyMatch) {
          fullGetUrl = `${mirror}/get.php?md5=${directKeyMatch[1]}&key=${directKeyMatch[2]}`;
        }
      }

      if (!fullGetUrl) {
        throw new Error(`No get.php token found in ${mirror} response`);
      }

      return {
        downloadUrl: fullGetUrl,
        referer: adsUrl,
      };
    };

    try {
      // Race candidate mirrors concurrently so a slow or blocked mirror doesn't stall the download
      return await Promise.any(candidateMirrors.map((m) => probeMirror(m)));
    } catch (err: any) {
      console.warn(`[LibgenDownloadService] Failed to resolve gateway for ${cleanMd5}:`, err?.message || err);
      return null;
    }
  }

  /**
   * Validate magic bytes of downloaded binary stream chunk
   */
  public validateMagicBytes(chunk: Buffer, expectedFormat?: string): { isValid: boolean; detectedMime: string } {
    if (!chunk || chunk.length < 4) {
      return { isValid: false, detectedMime: 'application/octet-stream' };
    }

    const fmt = (expectedFormat || '').toLowerCase();
    const strHeader = chunk.slice(0, 1024).toString('latin1');

    // Reject disguised HTML error landing pages immediately
    if (
      strHeader.includes('<!DOCTYPE html') ||
      strHeader.includes('<html') ||
      strHeader.includes('<head') ||
      strHeader.includes('Cloudflare')
    ) {
      return { isValid: false, detectedMime: 'text/html' };
    }

    // PDF validation: Starts with "%PDF-" (Hex: 25 50 44 46 2d)
    if (chunk.length >= 5 && chunk.slice(0, 5).toString('ascii') === '%PDF-') {
      return { isValid: true, detectedMime: 'application/pdf' };
    }

    // EPUB / ZIP / DOCX / CBZ validation: Starts with "PK\x03\x04" (Hex: 50 4b 03 04)
    if (chunk[0] === 0x50 && chunk[1] === 0x4b && chunk[2] === 0x03 && chunk[3] === 0x04) {
      const detectedMime = fmt === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/epub+zip';
      return { isValid: true, detectedMime };
    }

    // MOBI validation: Contains "BOOKMOBI" header at byte offset 60
    if (chunk.length >= 68 && chunk.slice(60, 68).toString('ascii') === 'BOOKMOBI') {
      return { isValid: true, detectedMime: 'application/x-mobipocket-ebook' };
    }

    // DJVU validation: Starts with "AT&T" (Hex: 41 54 26 54) or "FORM" (Hex: 46 4f 52 4d)
    if (
      (chunk[0] === 0x41 && chunk[1] === 0x54 && chunk[2] === 0x26 && chunk[3] === 0x54) ||
      (chunk[0] === 0x46 && chunk[1] === 0x4f && chunk[2] === 0x52 && chunk[3] === 0x4d)
    ) {
      return { isValid: true, detectedMime: 'image/vnd.djvu' };
    }

    // Fallback: If format specified matches generic binary
    if (fmt === 'pdf' || fmt === 'epub' || fmt === 'mobi' || fmt === 'djvu') {
      return { isValid: false, detectedMime: 'application/octet-stream' };
    }

    return { isValid: true, detectedMime: 'application/octet-stream' };
  }

  /**
   * Main Entry Point: Downloads book file with multi-mirror failover,
   * high-speed streaming, magic byte validation, and on-the-fly checksum verification.
   */
  public async downloadBookFile(options: LibgenDownloadOptions): Promise<LibgenDownloadResult> {
    const {
      md5,
      ipfsCid,
      filename,
      targetDirectory,
      expectedFormat,
      expectedFilesize,
      timeoutMs = 30000,
      onProgress,
    } = options;

    const cleanMd5 = md5.trim().toLowerCase();
    const safeFilename = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

    let targetDir = targetDirectory;
    if (!targetDir) {
      if (typeof app !== 'undefined' && app.getPath) {
        targetDir = app.getPath('downloads');
      } else {
        targetDir = path.join(os.tmpdir(), 'baglib-downloads');
      }
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const destinationPath = path.join(targetDir, safeFilename);
    const tempPath = path.join(targetDir, `.tmp_${cleanMd5}_${Date.now()}`);

    // Build ordered list of candidate download URLs
    const candidateUrls: Array<{ url: string; referer?: string }> = [];

    // Candidate 1: Resolved get.php with session key from multi-mirror race
    const resolved = await this.resolveDownloadUrl(cleanMd5);
    if (resolved) {
      candidateUrls.push({ url: resolved.downloadUrl, referer: resolved.referer });
    }

    // Candidate 2: Decentralized IPFS Gateways (if key 877 returned CID)
    if (ipfsCid && ipfsCid.trim()) {
      const cleanCid = ipfsCid.trim();
      for (const gw of PUBLIC_IPFS_GATEWAYS) {
        candidateUrls.push({ url: `${gw}${cleanCid}` });
      }
    }

    // Candidate 3: Proactive fallback mirror key resolution if primary hasn't resolved
    if (candidateUrls.length === 0) {
      for (const fallbackMirror of ['https://libgen.bz', 'https://libgen.is', 'https://libgen.rs']) {
        try {
          const fbResolved = await this.resolveDownloadUrl(cleanMd5, fallbackMirror);
          if (fbResolved) {
            candidateUrls.push({ url: fbResolved.downloadUrl, referer: fbResolved.referer });
            break;
          }
        } catch {}
      }
    }

    let lastError = 'No download mirrors succeeded';

    // 1. Try High-Speed Node Stream first across all candidate mirrors
    for (const candidate of candidateUrls) {
      try {
        const streamResult = await this.streamFileFromUrl({
          url: candidate.url,
          referer: candidate.referer,
          tempPath,
          cleanMd5,
          expectedFormat,
          expectedFilesize,
          timeoutMs,
          onProgress,
        });

        if (streamResult.success) {
          let finalFilename = safeFilename;
          const detectedExt = streamResult.mimeType ? MIME_EXTENSION_MAP[streamResult.mimeType] : undefined;
          const currentExt = path.extname(safeFilename).toLowerCase();
          if (detectedExt && currentExt !== detectedExt) {
            finalFilename = `${path.basename(safeFilename, currentExt)}${detectedExt}`;
          }
          const finalDestinationPath = path.join(targetDir, finalFilename);

          if (fs.existsSync(finalDestinationPath)) {
            try {
              fs.unlinkSync(finalDestinationPath);
            } catch {}
          }
          fs.renameSync(tempPath, finalDestinationPath);

          return {
            success: true,
            filePath: finalDestinationPath,
            filename: finalFilename,
            byteSize: streamResult.byteSize,
            md5: streamResult.md5,
            sha256: streamResult.sha256,
            mimeType: streamResult.mimeType,
          };
        } else {
          lastError = streamResult.error || 'Failed stream download';
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
      } catch (streamErr: any) {
        lastError = streamErr?.message || String(streamErr);
        if (fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch {}
        }
      }
    }

    // 2. Headless Native Chromium Fallback: If direct streams fail, use hidden Electron BrowserWindow with will-download
    if (typeof BrowserWindow === 'function' && candidateUrls.length > 0) {
      const fallbackUrl = candidateUrls[0].url;
      try {
        const nativeResult = await this.downloadViaChromiumNative({
          url: fallbackUrl,
          referer: candidateUrls[0].referer,
          tempPath,
          cleanMd5,
          expectedFormat,
          expectedFilesize,
          timeoutMs,
          onProgress,
        });

        if (nativeResult.success) {
          let finalFilename = safeFilename;
          const detectedExt = nativeResult.mimeType ? MIME_EXTENSION_MAP[nativeResult.mimeType] : undefined;
          const currentExt = path.extname(safeFilename).toLowerCase();
          if (detectedExt && currentExt !== detectedExt) {
            finalFilename = `${path.basename(safeFilename, currentExt)}${detectedExt}`;
          }
          const finalDestinationPath = path.join(targetDir, finalFilename);

          if (fs.existsSync(finalDestinationPath)) {
            try {
              fs.unlinkSync(finalDestinationPath);
            } catch {}
          }
          fs.renameSync(tempPath, finalDestinationPath);

          return {
            success: true,
            filePath: finalDestinationPath,
            filename: finalFilename,
            byteSize: nativeResult.byteSize,
            md5: nativeResult.md5,
            sha256: nativeResult.sha256,
            mimeType: nativeResult.mimeType,
          };
        }
      } catch (nativeErr: any) {
        lastError = nativeErr?.message || String(nativeErr);
        if (fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch {}
        }
      }
    }

    return {
      success: false,
      error: `Download failed across all mirrors. Reason: ${lastError}`,
    };
  }

  /**
   * High-Performance Direct Streaming via Node HTTP/HTTPS with 1MB HighWaterMark Buffer and Keep-Alive
   */
  private streamFileFromUrl(options: {
    url: string;
    referer?: string;
    tempPath: string;
    cleanMd5: string;
    expectedFormat?: string;
    expectedFilesize?: number;
    timeoutMs: number;
    onProgress?: (progress: LibgenDownloadProgress) => void;
  }): Promise<{ success: boolean; byteSize?: number; md5?: string; sha256?: string; mimeType?: string; serverFilename?: string; error?: string }> {
    const {
      url,
      referer,
      tempPath,
      cleanMd5,
      expectedFormat,
      expectedFilesize,
      timeoutMs,
      onProgress,
    } = options;

    return new Promise((resolve) => {
      let isResolved = false;
      const safeResolve = (resVal: { success: boolean; byteSize?: number; md5?: string; sha256?: string; mimeType?: string; serverFilename?: string; error?: string }) => {
        if (isResolved) return;
        isResolved = true;
        resolve(resVal);
      };

      const executeRequest = (currentUrl: string, currentReferer?: string, redirectCount = 0) => {
        if (redirectCount > 8) {
          return safeResolve({ success: false, error: 'Too many HTTP redirects' });
        }

        const client = currentUrl.startsWith('https:') ? https : http;
        const agent = currentUrl.startsWith('https:') ? keepAliveHttpsAgent : keepAliveHttpAgent;
        let origin = 'https://libgen.li';
        try {
          origin = new URL(currentUrl).origin;
        } catch {}

        let idleTimer: NodeJS.Timeout | null = null;
        let activeReq: http.ClientRequest | null = null;
        let activeRes: http.IncomingMessage | null = null;
        let activePass: stream.PassThrough | null = null;
        let activeFileStream: fs.WriteStream | null = null;

        const cleanup = () => {
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
          if (activeReq) {
            try { activeReq.destroy(); } catch {}
            activeReq = null;
          }
          if (activeRes) {
            try { activeRes.destroy(); } catch {}
            activeRes = null;
          }
          if (activePass) {
            try { activePass.destroy(); } catch {}
            activePass = null;
          }
          if (activeFileStream) {
            try { activeFileStream.close(); } catch {}
            activeFileStream = null;
          }
        };

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            cleanup();
            safeResolve({ success: false, error: `Download stream stalled: no data received for ${timeoutMs}ms` });
          }, timeoutMs);
        };

        const req = client.get(
          currentUrl,
          {
            agent,
            headers: {
              'User-Agent': DEFAULT_USER_AGENT,
              Accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/octet-stream,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'identity',
              Connection: 'keep-alive',
              Referer: currentReferer || (currentUrl.includes('libgen') ? 'https://libgen.li/ads.php?md5=' + cleanMd5 : origin),
            },
            timeout: timeoutMs,
            rejectUnauthorized: false,
          },
          (res) => {
            activeRes = res;

            // Follow 301, 302, 303, 307, 308 redirects with referer preservation
            if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
              cleanup();
              const nextUrl = new URL(res.headers.location, currentUrl).toString();
              return executeRequest(nextUrl, currentReferer, redirectCount + 1);
            }

            // Once headers are received and not redirecting, disable request socket timeout
            // and switch to stream chunk inactivity timer
            try {
              req.setTimeout(0);
            } catch {}
            resetIdleTimer();

            if (!res.statusCode || res.statusCode >= 400) {
              cleanup();
              return safeResolve({ success: false, error: `HTTP status ${res.statusCode}` });
            }

            // Guard against disguised HTML landing pages
            const contentType = (res.headers['content-type'] || '').toLowerCase();
            if (contentType.includes('text/html')) {
              cleanup();
              return safeResolve({
                success: false,
                error: 'Server returned HTML webpage instead of binary book file',
              });
            }

            // Extract original server filename from Content-Disposition if present
            let serverFilename: string | undefined = undefined;
            const contentDisp = res.headers['content-disposition'];
            if (contentDisp) {
              const fnMatch = contentDisp.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
              if (fnMatch && fnMatch[1]) {
                try {
                  serverFilename = decodeURIComponent(fnMatch[1].trim());
                } catch {
                  serverFilename = fnMatch[1].trim();
                }
              }
            }

            // Fallback decompressor if mirror ignored Accept-Encoding: identity
            let decompressor: NodeJS.ReadWriteStream | null = null;
            const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
            if (contentEncoding === 'gzip') {
              decompressor = zlib.createGunzip();
            } else if (contentEncoding === 'deflate') {
              decompressor = zlib.createInflate();
            } else if (contentEncoding === 'br') {
              decompressor = zlib.createBrotliDecompress();
            }

            const contentLength = parseInt(res.headers['content-length'] || '0', 10);
            const totalBytes = contentLength > 0 ? contentLength : expectedFilesize || 0;
            let downloadedBytes = 0;
            let isFirstChunk = true;
            let detectedMime = 'application/octet-stream';

            const hash = crypto.createHash('md5');
            const sha256Hash = crypto.createHash('sha256');

            // 1MB buffer for maximum disk write throughput
            const fileStream = fs.createWriteStream(tempPath, { highWaterMark: 1024 * 1024 });
            activeFileStream = fileStream;
            const pass = new stream.PassThrough();
            activePass = pass;

            pass.on('data', (chunk: Buffer) => {
              resetIdleTimer();

              if (isFirstChunk) {
                isFirstChunk = false;
                const magic = this.validateMagicBytes(chunk, expectedFormat);
                if (!magic.isValid) {
                  cleanup();
                  return safeResolve({
                    success: false,
                    error: `File header failed magic bytes verification (detected: ${magic.detectedMime})`,
                  });
                }
                detectedMime = magic.detectedMime;
              }

              downloadedBytes += chunk.length;
              hash.update(chunk);
              sha256Hash.update(chunk);

              if (onProgress) {
                const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
                onProgress({ bytesTransferred: downloadedBytes, totalBytes, percent });
              }
            });

            const inputStream = decompressor ? res.pipe(decompressor) : res;
            inputStream.pipe(pass).pipe(fileStream);

            fileStream.on('finish', () => {
              if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
              }
              fileStream.close();
              const downloadedMd5 = hash.digest('hex').toLowerCase();
              const downloadedSha256 = sha256Hash.digest('hex').toLowerCase();

              let statSize = 0;
              try {
                statSize = fs.statSync(tempPath).size;
              } catch {}

              if (statSize < 1000) {
                return safeResolve({ success: false, error: 'Downloaded file is unexpectedly small (< 1KB)' });
              }

              if (cleanMd5 && /^[a-f0-9]{32}$/i.test(cleanMd5)) {
                if (downloadedMd5 !== cleanMd5) {
                  return safeResolve({
                    success: false,
                    error: `MD5 checksum mismatch (expected: ${cleanMd5}, got: ${downloadedMd5})`,
                  });
                }
              }

              safeResolve({
                success: true,
                byteSize: statSize,
                md5: downloadedMd5,
                sha256: downloadedSha256,
                mimeType: detectedMime,
                serverFilename,
              });
            });

            fileStream.on('error', (err) => {
              cleanup();
              safeResolve({ success: false, error: err.message });
            });

            res.on('error', (err) => {
              cleanup();
              safeResolve({ success: false, error: err.message });
            });
          }
        );

        activeReq = req;

        req.on('error', (err) => {
          cleanup();
          safeResolve({ success: false, error: err.message });
        });

        req.on('timeout', () => {
          cleanup();
          safeResolve({ success: false, error: 'Connection timed out during stream download' });
        });
      };

      executeRequest(url, referer);
    });
  }

  /**
   * Headless Native Chromium Downloader Fallback:
   * Uses a hidden Electron BrowserWindow with will-download and backgroundThrottling disabled.
   * Completely invisible to the user (show: false strictly enforced, popups denied).
   */
  public async downloadViaChromiumNative(options: {
    url: string;
    referer?: string;
    tempPath: string;
    cleanMd5: string;
    expectedFormat?: string;
    expectedFilesize?: number;
    timeoutMs?: number;
    onProgress?: (progress: LibgenDownloadProgress) => void;
  }): Promise<{ success: boolean; byteSize?: number; md5?: string; sha256?: string; mimeType?: string; error?: string }> {
    const { url, referer, tempPath, cleanMd5, expectedFormat, expectedFilesize, timeoutMs = 35000, onProgress } = options;

    return new Promise((resolve) => {
      let helperWin: BrowserWindow | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (helperWin && !helperWin.isDestroyed()) {
          helperWin.destroy();
        }
        helperWin = null;
      };

      try {
        // Enforce strictly hidden helper window with background throttling disabled
        helperWin = new BrowserWindow({
          show: false,
          width: 800,
          height: 600,
          webPreferences: {
            backgroundThrottling: false,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        });

        // Intercept all popup / target=_blank attempts and deny them immediately
        helperWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

        const ses = helperWin.webContents.session;

        // Listen for Chromium native download stream
        ses.once('will-download', (_event, item) => {
          item.setSavePath(tempPath);

          const totalBytes = item.getTotalBytes() > 0 ? item.getTotalBytes() : expectedFilesize || 0;

          item.on('updated', (_updEvent, state) => {
            if (state === 'progressing' && onProgress) {
              const received = item.getReceivedBytes();
              const percent = totalBytes > 0 ? Math.min(100, Math.round((received / totalBytes) * 100)) : 0;
              onProgress({ bytesTransferred: received, totalBytes, percent });
            }
          });

          item.once('done', (_doneEvent, state) => {
            cleanup();

            if (state === 'completed') {
              try {
                const stat = fs.statSync(tempPath);
                if (stat.size < 1000) {
                  return resolve({ success: false, error: 'Downloaded file is unexpectedly small' });
                }

                // Verify magic bytes
                const fd = fs.openSync(tempPath, 'r');
                const headerBuf = Buffer.alloc(1024);
                fs.readSync(fd, headerBuf, 0, 1024, 0);
                fs.closeSync(fd);

                const magic = this.validateMagicBytes(headerBuf, expectedFormat);
                if (!magic.isValid) {
                  return resolve({
                    success: false,
                    error: `File header failed verification (detected: ${magic.detectedMime})`,
                  });
                }

                // Verify MD5 if available
                const fileBuf = fs.readFileSync(tempPath);
                const fileHash = crypto.createHash('md5').update(fileBuf).digest('hex').toLowerCase();
                const sha256Hash = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();
                if (cleanMd5 && /^[a-f0-9]{32}$/i.test(cleanMd5) && fileHash !== cleanMd5) {
                  return resolve({ success: false, error: `MD5 checksum mismatch` });
                }

                return resolve({
                  success: true,
                  byteSize: stat.size,
                  md5: fileHash,
                  sha256: sha256Hash,
                  mimeType: magic.detectedMime,
                });
              } catch (err: any) {
                return resolve({ success: false, error: err?.message || 'File verification failed' });
              }
            } else {
              return resolve({ success: false, error: `Chromium download cancelled or interrupted: ${state}` });
            }
          });
        });

        // Set timeout to prevent hanging helper window
        timeoutTimer = setTimeout(() => {
          cleanup();
          resolve({ success: false, error: 'Native Chromium download timed out' });
        }, timeoutMs);

        // Load the URL with headers
        helperWin.loadURL(url, {
          userAgent: DEFAULT_USER_AGENT,
          httpReferrer: referer || 'https://libgen.li/',
        }).catch((err) => {
          // If loadURL fails due to download starting (which aborts frame navigation in Chromium), ignore
          if (!err?.message?.includes('ERR_ABORTED')) {
            console.warn('[LibgenDownloadService] helperWin loadURL warning:', err?.message || err);
          }
        });
      } catch (err: any) {
        cleanup();
        resolve({ success: false, error: err?.message || 'Failed to create headless download helper' });
      }
    });
  }
}

export const libgenDownloadService = LibgenDownloadService.getInstance();
