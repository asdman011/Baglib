import { errorMessage } from '../../../shared/errors';
/**
 * Content Shield & Ad Blocker Service for Baglib
 *
 * Reverse-engineered & inspired by uBlock Origin (uBlock-master: traffic.js, urlskip.js, scriptlets.js):
 * - Network-level ad & tracker blocking (webRequest.onBeforeRequest) across ALL sessions
 * - Window open defuser & popunder blocker (webContents.setWindowOpenHandler)
 * - Safe download streamer to bypass third-party ad redirect traps
 */

import { session, app, WebContents, Session, shell } from 'electron';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { libgenDownloadService } from '../digital/libgen-download.service';

// Comprehensive pattern list of known intrusive ad networks, popunders, and tracking domains
export const BLOCKED_HOST_PATTERNS = [
  // Ad Networks & Popunders
  'doubleclick.net',
  'google-analytics.com',
  'googlesyndication.com',
  'adservice.google.',
  'popads.net',
  'popcash.net',
  'adsterra.com',
  'propellerads.com',
  'exoclick.com',
  'trafficjunky.com',
  'clickadu.com',
  'adkeeper.co',
  'monetag.com',
  'adnxs.com',
  'outbrain.com',
  'taboola.com',
  'mgid.com',
  'yllix.com',
  'adfocus.us',
  'shorte.st',
  'linkvertise.com',
  'adcash.com',
  'bet365',
  '1xbet',
  'fastclick.net',
  'exosrv.com',
  'deloton.com',
  'hilltopads.net',
  'ad-maven.com',
  'admaven.com',
  'onclickalgo.com',
  'onclickpredictv1.com',
  'realsrv.com',
  'syndication.exoclick.com',
  'tsyndicate.com',
  'adxprts.com',
  'ad-delivery.net',
  'adclick.',
  'track.',
  'telemetry.',
  'adtracker.',
  'zeroredirect.',
  'redirectingat.com',
  'adroll.com',
  'criteo.com',
  'coinhive.com',
  'crypto-loot.com',
  'pushwoosh.com',
  'onesignal.com',
];

export class ContentShieldService {
  private static instance: ContentShieldService | null = null;
  private isInitialized = false;
  private attachedSessions = new Set<Session>();

  private constructor() {}

  public static getInstance(): ContentShieldService {
    if (!ContentShieldService.instance) {
      ContentShieldService.instance = new ContentShieldService();
    }
    return ContentShieldService.instance;
  }

  /**
   * Initializes network request filtering and popup defense across ALL Electron sessions
   */
  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Attach uBlock-inspired filter to default session
    if (typeof session !== 'undefined' && session.defaultSession) {
      this.attachToSession(session.defaultSession);
    }

    // 2. Automatically attach to any newly created sessions (custom partitions, helper windows)
    if (typeof app !== 'undefined' && app.on) {
      app.on('session-created', (newSession: Session) => {
        this.attachToSession(newSession);
      });

      // 3. Attach window.open defuser to all webContents
      app.on('web-contents-created', (_, contents: WebContents) => {
        this.defuseWebContents(contents);
      });
    }
  }

  /**
   * Attaches uBlock-inspired network filtering to a specific Electron Session instance
   */
  public attachToSession(targetSession: Session): void {
    if (!targetSession || this.attachedSessions.has(targetSession)) return;
    this.attachedSessions.add(targetSession);

    // 1. Block ad & tracker network requests
    try {
      targetSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*'] },
        (details, callback) => {
          const urlLower = details.url.toLowerCase();

          // Check if destination hostname matches ad/tracker blacklist
          const isBlocked = BLOCKED_HOST_PATTERNS.some((pattern) => urlLower.includes(pattern));
          if (isBlocked) {
            callback({ cancel: true });
            return;
          }

          callback({ cancel: false });
        }
      );

      // 2. Strip intrusive headers and protect against frame hijackings
      targetSession.webRequest.onHeadersReceived((details, callback) => {
        callback({ responseHeaders: details.responseHeaders });
      });

      // 3. Ensure valid Referer & User-Agent for LibGen book cover requests to bypass 0-byte anti-hotlink gate
      targetSession.webRequest.onBeforeSendHeaders(
        {
          urls: [
            '*://*.libgen.li/*',
            '*://*.libgen.bz/*',
            '*://*.libgen.is/*',
            '*://*.libgen.rs/*',
            '*://*.libgen.gs/*',
            '*://*.libgen.vg/*',
            '*://*.booksdl.lc/*',
          ],
        },
        (details, callback) => {
          const requestHeaders = { ...details.requestHeaders };
          if (!requestHeaders['Referer'] || requestHeaders['Referer'] === 'about:blank') {
            requestHeaders['Referer'] = 'https://libgen.li/';
          }
          if (!requestHeaders['User-Agent']) {
            requestHeaders['User-Agent'] =
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
          }
          callback({ requestHeaders });
        }
      );
    } catch (err) {
      console.warn('[ContentShield] Error registering webRequest on session:', err);
    }

    // 3. Check and load any unpacked extension (e.g. uBlock Origin) if present
    this.tryLoadExtension(targetSession);
  }

  /**
   * Tries loading an unpacked extension if present on disk
   */
  private async tryLoadExtension(targetSession: Session): Promise<void> {
    try {
      const candidatePaths = [
        path.join(process.cwd(), 'extensions', 'ublock'),
        path.join(process.cwd(), 'resources', 'extensions', 'ublock'),
      ];

      for (const extPath of candidatePaths) {
        if (fs.existsSync(path.join(extPath, 'manifest.json'))) {
          await targetSession.loadExtension(extPath, { allowFileAccess: true });
          console.log(`[ContentShield] Successfully loaded extension from ${extPath}`);
          break;
        }
      }
    } catch (err: unknown) {
      console.warn('[ContentShield] Extension load notice:', errorMessage(err) || err);
    }
  }

  /**
   * Defuses popup ads and popunders on a specific WebContents instance.
   * NEVER opens a raw internal Electron window! External links are delegated to the OS browser.
   */
  public defuseWebContents(contents: WebContents): void {
    if (!contents || contents.isDestroyed()) return;

    contents.setWindowOpenHandler(({ url }) => {
      const urlLower = url.toLowerCase();

      // Block known ad networks, javascript: URIs, and blank popunders
      if (
        urlLower.startsWith('javascript:') ||
        urlLower.startsWith('about:blank') ||
        BLOCKED_HOST_PATTERNS.some((pattern) => urlLower.includes(pattern))
      ) {
        return { action: 'deny' };
      }

      // If user clicked a legitimate external web link, open it in their default system web browser
      // and ALWAYS deny Electron creating an unexpected internal visible BrowserWindow.
      if (url.startsWith('http://') || url.startsWith('https://')) {
        if (typeof shell !== 'undefined' && shell && typeof shell.openExternal === 'function') {
          shell.openExternal(url).catch((err) => {
            console.warn('[ContentShield] Failed to open external URL in system browser:', err);
          });
        }
      }

      return { action: 'deny' };
    });
  }

  /**
   * Diagnostic method returning current shield status across active sessions
   */
  public getActiveShieldStatus(): {
    attachedSessionsCount: number;
    blockedDomainsCount: number;
    loadedExtensions: Array<{ id: string; name: string }>;
  } {
    const loadedExtensions =
      typeof session !== 'undefined' && session.defaultSession
        ? session.defaultSession.getAllExtensions().map((ext) => ({ id: ext.id, name: ext.name }))
        : [];

    return {
      attachedSessionsCount: this.attachedSessions.size,
      blockedDomainsCount: BLOCKED_HOST_PATTERNS.length,
      loadedExtensions,
    };
  }

  /**
   * Safely downloads a file via HTTP/HTTPS stream directly to disk,
   * bypassing intermediate ad landing pages and browser popunders.
   */
  public async downloadFileDirectly(
    downloadUrl: string,
    targetDirectory: string,
    filename: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<string> {
    const safeFilename = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    fs.mkdirSync(targetDirectory, { recursive: true });
    const destinationPath = path.join(targetDirectory, safeFilename);

    // If downloadUrl contains an MD5, delegate to LibgenDownloadService which has full multi-mirror failover
    const md5Match = downloadUrl.match(/([a-fA-F0-9]{32})/);
    if (md5Match && md5Match[1]) {
      const ext = path.extname(safeFilename).replace(/^\./, '').toLowerCase();
      const res = await libgenDownloadService.downloadBookFile({
        md5: md5Match[1],
        filename: safeFilename,
        targetDirectory,
        expectedFormat: ext,
        onProgress: onProgress
          ? (p) => onProgress(p.bytesTransferred, p.totalBytes)
          : undefined,
      });

      if (res.success && res.filePath) {
        return res.filePath;
      }
    }

    // High-performance fallback direct stream
    return new Promise((resolve, reject) => {
      const executeRequest = (currentUrl: string, redirectCount = 0) => {
        if (redirectCount > 8) {
          return reject(new Error('Too many HTTP redirects'));
        }

        const client = currentUrl.startsWith('https:') ? https : http;
        let parsedOrigin = 'https://libgen.li';
        try {
          parsedOrigin = new URL(currentUrl).origin;
        } catch {}

        const req = client.get(
          currentUrl,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/octet-stream,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'identity',
              Connection: 'keep-alive',
              Referer:
                currentUrl.includes('booksdl.lc') || currentUrl.includes('libgen')
                  ? 'https://libgen.li/'
                  : parsedOrigin,
            },
            rejectUnauthorized: false,
            timeout: 15000,
          },
          (res) => {
            // Follow redirects (301, 302, 303, 307, 308)
            if (
              res.statusCode &&
              [301, 302, 303, 307, 308].includes(res.statusCode) &&
              res.headers.location
            ) {
              const nextUrl = new URL(res.headers.location, currentUrl).toString();
              return executeRequest(nextUrl, redirectCount + 1);
            }

            if (!res.statusCode || res.statusCode >= 400) {
              return reject(new Error(`Server returned HTTP ${res.statusCode}`));
            }

            const contentType = res.headers['content-type'] || '';
            if (contentType.includes('text/html') && !safeFilename.endsWith('.html')) {
              return reject(new Error('Received HTML webpage instead of binary file'));
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
            let downloadedBytes = 0;

            const fileStream = fs.createWriteStream(destinationPath, {
              highWaterMark: 1024 * 1024,
            });

            // Handle potential compression if server ignored identity request
            let decompressor: NodeJS.ReadWriteStream | null = null;
            const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
            if (contentEncoding === 'gzip') {
              decompressor = zlib.createGunzip();
            } else if (contentEncoding === 'deflate') {
              decompressor = zlib.createInflate();
            } else if (contentEncoding === 'br') {
              decompressor = zlib.createBrotliDecompress();
            }

            const inputStream = decompressor ? res.pipe(decompressor) : res;

            inputStream.on('data', (chunk: Buffer) => {
              downloadedBytes += chunk.length;
              if (onProgress) {
                onProgress(downloadedBytes, totalBytes);
              }
            });

            inputStream.pipe(fileStream);

            fileStream.on('finish', () => {
              fileStream.close();
              try {
                const stat = fs.statSync(destinationPath);
                if (stat.size > 500) {
                  return resolve(destinationPath);
                }
              } catch {}
              fs.unlink(destinationPath, () => {});
              reject(new Error('Downloaded file is empty or corrupted'));
            });

            fileStream.on('error', (err) => {
              fs.unlink(destinationPath, () => {});
              reject(err);
            });
          }
        );

        req.on('error', (err) => {
          reject(err);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Download request timed out'));
        });
      };

      executeRequest(downloadUrl);
    });
  }
}
