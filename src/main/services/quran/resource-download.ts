import { open, rm } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import type { QuranResource } from '../../../shared/types/quran';
import { QUL_ORIGIN, parseResourceDetails } from './qul-catalog';

export function selectedExport(html: string, resource: QuranResource): string {
  const details = parseResourceDetails(html, resource);
  if (details.resource.restricted || !details.downloads.length) throw new Error('restricted');
  const { document } = parseHTML(html);
  const candidates = [...document.querySelectorAll('a[href]')].filter(anchor => details.downloads.includes(anchor.getAttribute('href') || ''));
  const formats = resource.category === 'font' ? [/woff2/i, /woff|ttf/i, /zip/i] : resource.category === 'mushaf-layout' ? [/svg/i, /sqlite|\.db/i, /zip/i] : [/sqlite|\.db|database/i, /json/i, /zip/i];
  const chosen = formats.flatMap(format => candidates.filter(anchor => format.test(anchor.textContent) && (resource.id !== 'translation/193' || /inline/i.test(anchor.textContent))))[0];
  if (!chosen) throw new Error('unsupported-format');
  return new URL(chosen.getAttribute('href')!, QUL_ORIGIN).href;
}

export async function downloadToFile({ url, filename, fetcher, origins, signal, limit, progress }: {
  url: string; filename: string; fetcher: (url: string, init?: RequestInit) => Promise<Response>; origins: Set<string>; signal: AbortSignal; limit: number;
  progress?: (received: number, total: number) => void;
}): Promise<void> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(300000)]);
  let current = new URL(url);
  let response: Response | undefined;
  for (let redirect = 0; redirect < 6; redirect++) {
    if (current.protocol !== 'https:' || current.username || current.password || !origins.has(current.origin)) throw new Error('invalid-resource');
    response = await fetcher(current.href, { redirect: 'manual', signal: bounded });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = response.headers.get('location');
    await response.body?.cancel();
    if (!next || redirect === 5) throw new Error('network');
    current = new URL(next, current);
  }
  if (!response?.ok || !response.body) throw new Error('network');
  const total = Number(response.headers.get('content-length')) || 0;
  if (total > limit) { await response.body.cancel(); throw new Error('invalid-package'); }
  const reader = response.body.getReader();
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let received = 0;
  let created = false;
  let notified = 0;
  try {
    handle = await open(filename, 'wx');
    created = true;
    while (true) {
      bounded.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.length;
      if (received > limit) throw new Error('invalid-package');
      let offset = 0;
      while (offset < chunk.value.length) offset += (await handle.write(chunk.value, offset)).bytesWritten;
      if (Date.now() - notified > 250) { progress?.(received, total); notified = Date.now(); }
    }
    if (!received || (total && total !== received)) throw new Error('invalid-package');
    progress?.(received, total);
  } catch (error) {
    await handle?.close(); handle = undefined;
    if (created) await rm(filename, { force: true });
    throw error;
  } finally { await reader.cancel(); await handle?.close(); }
}
