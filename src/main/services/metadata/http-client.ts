import { errorMessage } from '../../../shared/errors';
import { RateLimitGate, googleBooksGate, openLibraryGate, internetArchiveGate } from './rate-limit-gate';

export interface HttpClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  requestsPerSecond?: number;
  timeoutMs?: number;
  maxRetries?: number;
  rateLimitGate?: RateLimitGate;
}

export class HttpClient {
  private lastRequestTime = 0;
  private readonly config: HttpClientConfig;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly rateLimitGate?: RateLimitGate;

  constructor(config: HttpClientConfig) {
    this.config = config;
    this.minIntervalMs = config.requestsPerSecond ? 1000 / config.requestsPerSecond : 0;
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.maxRetries = config.maxRetries ?? 2;
    this.rateLimitGate = config.rateLimitGate;
  }

  private async throttle(): Promise<void> {
    if (this.rateLimitGate) {
      await this.rateLimitGate.wait();
      return;
    }

    if (this.minIntervalMs === 0) return;

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    await this.throttle();

    const fullUrl =
      this.config.baseUrl && !url.startsWith('http')
        ? `${this.config.baseUrl}${url}`
        : url;

    const headers = {
      ...this.config.defaultHeaders,
      ...options.headers,
    };

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      let timeoutId: NodeJS.Timeout | undefined;
      const controller = new AbortController();
      const abortHandler = () => controller.abort();

      try {
        timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        // Chain with user abort signal if provided
        if (options.signal) {
          options.signal.addEventListener('abort', abortHandler, { once: true });
        }

        const response = await fetch(fullUrl, {
          ...options,
          headers,
          signal: controller.signal,
        });

        if (this.rateLimitGate) {
          this.rateLimitGate.handleResponse(response.status, response.headers);
        }

        // If rate limited (429), respect Retry-After header unless it's Google Books (which needs fast failover)
        if (response.status === 429) {
          if (fullUrl.includes('googleapis.com')) {
            throw new Error('HTTP error 429: Too Many Requests (Google Books rate limited)');
          }
          if (attempt < this.maxRetries) {
            const retryAfterSec = parseInt(response.headers.get('Retry-After') || '2', 10);
            const backoff = (isNaN(retryAfterSec) ? 2 : retryAfterSec) * 1000;
            await new Promise((r) => setTimeout(r, backoff));
            await this.throttle();
            attempt++;
            continue;
          }
        }

        // Retry on transient 5xx server errors
        if (response.status >= 500) {
          // Google Books 503 backendFailed indicates query rejection or backend timeout.
          // Retrying multiplies failure statistics in Google Cloud Console. Fail fast instead.
          if (fullUrl.includes('googleapis.com')) {
            throw new Error(`HTTP error ${response.status}: Google Books service notice`);
          }

          if (attempt < this.maxRetries) {
            const backoff = Math.pow(2, attempt) * 500 + Math.random() * 200;
            await new Promise((r) => setTimeout(r, backoff));
            await this.throttle();
            attempt++;
            continue;
          }
        }

        return response;
      } catch (err: unknown) {
        lastError = err;
        // Do not retry Google Books on errors
        if (fullUrl.includes('googleapis.com')) {
          throw err;
        }
        // Retry on network errors or timeouts if attempts remain
        if (attempt < this.maxRetries && (!(err instanceof Error) || err.name !== 'AbortError') && !String(errorMessage(err)).includes('429')) {
          const backoff = Math.pow(2, attempt) * 500 + Math.random() * 200;
          await new Promise((r) => setTimeout(r, backoff));
          await this.throttle();
          attempt++;
        } else {
          throw err;
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (options.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }
      }
    }

    throw lastError || new Error(`Request failed after ${this.maxRetries} retries`);
  }

  async getJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await this.fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
}

// Centralized Baglib User-Agent based on requirements:
// "Every Open Library HTTP request made by Baglib must include an identifying User-Agent containing the application name, version, and a real, valid contact email address."
export const BAGLIB_USER_AGENT = 'Baglib/1.0 (https://github.com/asdman011/Baglib; asdman011@example.com)';

// Open Library recommends max 1 request per second for search/bulk endpoints.
export const openLibraryClient = new HttpClient({
  baseUrl: 'https://openlibrary.org',
  defaultHeaders: {
    'User-Agent': BAGLIB_USER_AGENT,
    Accept: 'application/json',
  },
  rateLimitGate: openLibraryGate,
});

export const internetArchiveClient = new HttpClient({
  baseUrl: 'https://archive.org',
  defaultHeaders: {
    'User-Agent': BAGLIB_USER_AGENT,
    Accept: 'application/json',
  },
  rateLimitGate: internetArchiveGate,
  timeoutMs: 20000, // Internet Archive advanced search queries take longer than lightweight REST APIs
});

export const googleBooksClient = new HttpClient({
  baseUrl: 'https://www.googleapis.com/books/v1',
  defaultHeaders: {
    'User-Agent': BAGLIB_USER_AGENT,
  },
  rateLimitGate: googleBooksGate,
  timeoutMs: 12000,
});

