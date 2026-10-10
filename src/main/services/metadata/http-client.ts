import { net } from 'electron';

export interface HttpClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  requestsPerSecond?: number;
}

export class HttpClient {
  private lastRequestTime = 0;
  private readonly config: HttpClientConfig;
  private readonly minIntervalMs: number;

  constructor(config: HttpClientConfig) {
    this.config = config;
    this.minIntervalMs = config.requestsPerSecond ? 1000 / config.requestsPerSecond : 0;
  }

  private async throttle(): Promise<void> {
    if (this.minIntervalMs === 0) return;

    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    await this.throttle();

    const fullUrl = this.config.baseUrl && !url.startsWith('http') 
      ? `${this.config.baseUrl}${url}` 
      : url;

    const headers = {
      ...this.config.defaultHeaders,
      ...options.headers,
    };

    return fetch(fullUrl, {
      ...options,
      headers,
    });
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
    'Accept': 'application/json',
  },
  requestsPerSecond: 1, // Be a good citizen
});

export const googleBooksClient = new HttpClient({
  baseUrl: 'https://www.googleapis.com/books/v1',
  defaultHeaders: {
    'User-Agent': BAGLIB_USER_AGENT,
  },
  requestsPerSecond: 5, // A bit higher for Google Books
});
