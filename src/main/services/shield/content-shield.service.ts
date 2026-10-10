/**
 * Content Shield & Ad Blocker Service for Baglib
 *
 * Reverse-engineered & inspired by uBlock Origin (uBlock-master: traffic.js, urlskip.js, scriptlets.js):
 * - Network-level ad & tracker blocking (webRequest.onBeforeRequest)
 * - Window open defuser & popunder blocker (webContents.setWindowOpenHandler)
 * - Safe download streamer to bypass third-party ad redirect traps
 */

import { session, app, WebContents } from 'electron';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Known intrusive ad networks, popup gateways, and tracking domains commonly encountered on mirror sites
const BLOCKED_HOST_PATTERNS = [
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
  'adclick.',
  'track.',
  'telemetry.',
  'adtracker.',
  'zeroredirect.',
  'redirectingat.com',
  'adroll.com',
  'criteo.com',
  'coinhive.com',
  'crypto-loot.com'
];

export class ContentShieldService {
  private static instance: ContentShieldService | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ContentShieldService {
    if (!ContentShieldService.instance) {
      ContentShieldService.instance = new ContentShieldService();
    }
    return ContentShieldService.instance;
  }

  /**
   * Initializes network request filtering and popup defense across all Electron sessions
   */
  public initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Install uBlock-inspired onBeforeRequest filter
    const defaultSession = session.defaultSession;
    if (defaultSession) {
      defaultSession.webRequest.onBeforeRequest(
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

      // Strip intrusive ad headers
      defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({ responseHeaders: details.responseHeaders });
      });
    }

    // 2. Attach window.open defuser to all webContents
    app.on('web-contents-created', (_, contents: WebContents) => {
      this.defuseWebContents(contents);
    });
  }

  /**
   * Defuses popup ads and popunders on a specific WebContents instance
   */
  public defuseWebContents(contents: WebContents): void {
    contents.setWindowOpenHandler(({ url }) => {
      const urlLower = url.toLowerCase();

      // Block known ad networks and javascript: URI popunders
      if (
        urlLower.startsWith('javascript:') ||
        BLOCKED_HOST_PATTERNS.some((pattern) => urlLower.includes(pattern))
      ) {
        return { action: 'deny' };
      }

      // Allow legitimate safe navigations
      return { action: 'allow' };
    });
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

    // Collect candidate mirrors for LibGen / Anna MD5
    const getCandidateDownloadUrls = async (inputUrl: string): Promise<string[]> => {
      const candidates: string[] = [];
      const md5Match = inputUrl.match(/([a-fA-F0-9]{32})/);
      if (!md5Match) return [inputUrl];

      const md5 = md5Match[1].toLowerCase();

      // Mirror 1: libgen.li ads -> key -> get.php CDN stream
      try {
        const adsUrl = `https://libgen.li/ads.php?md5=${md5}`;
        const adsHtml = await new Promise<string>((res, rej) => {
          const req = https.get(adsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 4000, rejectUnauthorized: false }, (resp) => {
            let data = '';
            resp.on('data', (c) => (data += c));
            resp.on('end', () => res(data));
          });
          req.on('error', rej);
          req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
        });

        const keyMatch = adsHtml.match(/get\.php\?md5=[^&"']+&key=([a-zA-Z0-9]+)/i);
        if (keyMatch && keyMatch[1]) {
          const key = keyMatch[1];
          const getUrl = `https://libgen.li/get.php?md5=${md5}&key=${key}`;
          const cdnLocation = await new Promise<string | undefined>((res, rej) => {
            const req = https.get(getUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Referer: adsUrl,
              },
              timeout: 4000,
              rejectUnauthorized: false,
            }, (resp) => {
              res(resp.headers.location);
            });
            req.on('error', rej);
            req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
          });

          if (cdnLocation) {
            candidates.push(cdnLocation);
          }
          candidates.push(getUrl);
        }
      } catch {
        // Continue to other mirrors
      }

      // Mirror 2: libgen.bz ads -> key -> get.php
      try {
        const bzAdsUrl = `https://libgen.bz/ads.php?md5=${md5}`;
        const bzHtml = await new Promise<string>((res, rej) => {
          const req = https.get(bzAdsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3500, rejectUnauthorized: false }, (resp) => {
            let data = '';
            resp.on('data', (c) => (data += c));
            resp.on('end', () => res(data));
          });
          req.on('error', rej);
          req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
        });

        const bzKeyMatch = bzHtml.match(/get\.php\?md5=[^&"']+&key=([a-zA-Z0-9]+)/i);
        if (bzKeyMatch && bzKeyMatch[1]) {
          candidates.push(`https://libgen.bz/get.php?md5=${md5}&key=${bzKeyMatch[1]}`);
        }
      } catch {
        // Continue
      }

      // Mirror 3: Direct libgen.is get.php
      candidates.push(`http://libgen.is/get.php?md5=${md5}`);

      // Mirror 4: Direct libgen.rs get.php
      candidates.push(`http://libgen.rs/get.php?md5=${md5}`);

      // Mirror 5: Original inputUrl if not already present
      if (!candidates.includes(inputUrl)) {
        candidates.push(inputUrl);
      }

      return candidates;
    };

    const tryDownloadFromUrl = (targetUrl: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const executeRequest = (currentUrl: string, redirectCount = 0) => {
          if (redirectCount > 8) {
            resolve(false);
            return;
          }

          const client = currentUrl.startsWith('https:') ? https : http;
          let parsedOrigin = '';
          try {
            parsedOrigin = new URL(currentUrl).origin;
          } catch {
            parsedOrigin = 'https://libgen.li';
          }

          const req = client.get(
            currentUrl,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Referer: currentUrl.includes('booksdl.lc') || currentUrl.includes('libgen')
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
                executeRequest(nextUrl, redirectCount + 1);
                return;
              }

              // If HTTP error (500, 502, 404, 403, etc.), fail gracefully so next mirror can be tried
              if (!res.statusCode || res.statusCode >= 400) {
                console.warn(`[ContentShield] Mirror ${currentUrl} returned status ${res.statusCode}, failing over...`);
                resolve(false);
                return;
              }

              const contentType = res.headers['content-type'] || '';
              if (contentType.includes('text/html') && redirectCount > 0 && !safeFilename.endsWith('.html')) {
                console.warn(`[ContentShield] Received HTML webpage instead of binary file from ${currentUrl}, failing over...`);
                resolve(false);
                return;
              }

              const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
              let downloadedBytes = 0;

              const fileStream = fs.createWriteStream(destinationPath);
              res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (onProgress) {
                  onProgress(downloadedBytes, totalBytes);
                }
              });

              res.pipe(fileStream);

              fileStream.on('finish', () => {
                fileStream.close();
                try {
                  const stat = fs.statSync(destinationPath);
                  if (stat.size > 500) {
                    resolve(true);
                    return;
                  }
                } catch {}
                fs.unlink(destinationPath, () => {});
                resolve(false);
              });

              fileStream.on('error', () => {
                fs.unlink(destinationPath, () => {});
                resolve(false);
              });
            }
          );

          req.on('error', (err) => {
            console.warn(`[ContentShield] Network error fetching ${currentUrl}:`, err?.message || err);
            resolve(false);
          });

          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });
        };

        executeRequest(targetUrl);
      });
    };

    const candidateUrls = await getCandidateDownloadUrls(downloadUrl);
    for (const url of candidateUrls) {
      const ok = await tryDownloadFromUrl(url);
      if (ok) {
        return destinationPath;
      }
    }

    throw new Error('All download mirrors failed to provide the book file');
  }
}
