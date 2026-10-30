import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

export async function streamAssetResponse(request: Request, filename: string, mimeType: string, headers: Record<string, string> = {}): Promise<Response> {
  request.signal.throwIfAborted();
  const info = await stat(filename);
  request.signal.throwIfAborted();
  if (!info.isFile()) return new Response(null, { status: 404, headers });
  const common = { ...headers, 'Content-Type': mimeType, 'Content-Length': String(info.size), 'Accept-Ranges': 'bytes' };
  if (request.method === 'HEAD') return new Response(null, { headers: common });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  const rangeHeader = request.headers.get('range');
  const range = rangeHeader ? parseAssetRange(rangeHeader, info.size) : undefined;
  if (rangeHeader && !range) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${info.size}` } });
  const stream = createReadStream(filename, { ...(range || {}), signal: request.signal });
  const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: range ? { ...common, 'Content-Length': String(range.end - range.start + 1), 'Content-Range': `bytes ${range.start}-${range.end}/${info.size}` } : common,
  });
}

export function parseAssetRange(header: string, size: number): { start: number; end: number } | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}
