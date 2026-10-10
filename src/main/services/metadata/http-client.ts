export interface HttpClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  requestsPerSecond?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export class HttpClient {
  private lastRequestTime = 0;
  private readonly config: HttpClientConfig;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: HttpClientConfig) {
    this.config = config;
    this.minIntervalMs = config.requestsPerSecond ? 1000 / config.requestsPerSecond : 0;
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.maxRetries = config.maxRetries ?? 2;
  }

  private async throttle(): Promise<void> {
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
    let lastError: any;

    while (attempt <= this.maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        // Chain with user abort signal if provided
        if (options.signal) {
          options.signal.addEventListener('abort', () => controller.abort());
        }

        const response = await fetch(fullUrl, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // If rate limited (429), respect Retry-After header unless it's Google Books (which needs fast failover)
        if (response.status === 429) {
          if (fullUrl.includes('googleapis.com')) {
            throw new Error('HTTP error 429: Too Many Requests (Google Books rate limited)');
          }
          if (attempt < this.maxRetries) {
            const retryAfterSec = parseInt(response.headers.get('Retry-After') || '2', 10);
            const backoff = (isNaN(retryAfterSec) ? 2 : retryAfterSec) * 1000;
            await new Promise((r) => setTimeout(r, backoff));
            attempt++;
            continue;
          }
        }

        // Retry on transient 5xx server errors
        if (response.status >= 500 && attempt < this.maxRetries) {
          const backoff = Math.pow(2, attempt) * 500 + Math.random() * 200;
          await new Promise((r) => setTimeout(r, backoff));
          attempt++;
          continue;
        }

        return response;
      } catch (err: any) {
        lastError = err;
        // Retry on network errors or timeouts if attempts remain
        if (attempt < this.maxRetries && err.name !== 'AbortError' && !String(err.message).includes('429')) {
          const backoff = Math.pow(2, attempt) * 500 + Math.random() * 200;
          await new Promise((r) => setTimeout(r, backoff));
          attempt++;
        } else {
          throw err;
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
  requestsPerSecond: 1, // Be a good citizen
});

export const internetArchiveClient = new HttpClient({
  baseUrl: 'https://archive.org',
  defaultHeaders: {
    'User-Agent': BAGLIB_USER_AGENT,
    Accept: 'application/json',
  },
  requestsPerSecond: 3,
});

export const googleBooksClient = new HttpClient({
  baseUrl: 'https://www.googleapis.com/books/v1',
  defaultHeaders: {
    'User-Agent': BAGLIB_USER_AGENT,
  },
  requestsPerSecond: 5,
});

