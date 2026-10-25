import { parseHTML } from 'linkedom';
import { QURAN_CATEGORIES, type QuranCategory, type QuranResource } from '../../../shared/types/quran';

export const QUL_ORIGIN = 'https://qul.tarteel.ai';

export function normalizeQuranSearch(text: string): string {
  return text.normalize('NFKC').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').toLowerCase();
}

export function category(value: unknown): QuranCategory {
  if (!QURAN_CATEGORIES.includes(value as QuranCategory)) throw new Error('invalid-resource');
  return value as QuranCategory;
}

export function sourcePath(value: unknown): string {
  if (typeof value !== 'string' || !/^\/resources\/[a-z-]+\/[a-zA-Z0-9_-]+$/.test(value)) throw new Error('invalid-resource');
  category(value.split('/')[2]);
  return value;
}

export function parseResourceListing(html: string, kind: QuranCategory): QuranResource[] {
  const { document } = parseHTML(html);
  const resources = new Map<string, QuranResource>();
  for (const heading of document.querySelectorAll('h2 a[href], h3 a[href], h4 a[href]')) {
    const href = heading.getAttribute('href') || '';
    if (!new RegExp(`^/resources/${kind}/[a-zA-Z0-9_-]+$`).test(href)) continue;
    const title = heading.textContent.trim().replace(/\s+/g, ' ');
    if (!title || title.length > 500) continue;
    const id = `${kind}/${href.split('/').at(-1)}`;
    resources.set(id, { id, category: kind, title, sourcePath: href, tags: [], formats: [], related: [], restricted: false,
      profile: { key: `qul:${id}:unverified`, qiraah: null, riwayah: null, tariq: null, numbering: null, segmentation: null, script: null, verified: false }, fetchedAt: new Date().toISOString() });
  }
  return [...resources.values()];
}

export function parseResourceDetails(html: string, resource: QuranResource): { resource: QuranResource; downloads: string[] } {
  const { document } = parseHTML(html);
  const tags = [...document.querySelectorAll('a[href*="tags"]')].map(node => node.textContent.trim()).filter(Boolean).slice(0, 40);
  const downloads: string[] = [];
  const formats: string[] = [];
  const related = new Set<string>();
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') || '';
    if (new RegExp(`^/resources/${resource.category}/[a-f0-9]{32}/download$`).test(href)) { downloads.push(href); formats.push(anchor.textContent.trim().replace(/\s+/g, ' ')); }
    else if (/^\/resources\/[a-z-]+\/[a-zA-Z0-9_-]+$/.test(href) && href !== resource.sourcePath) related.add(href.slice('/resources/'.length));
  }
  const restricted = /This resource is\s*©?\s*copyrighted/i.test(document.body.textContent || document.documentElement.textContent);
  return { resource: { ...resource, tags, formats: [...new Set(formats)], related: [...related].slice(0, 50), restricted, fetchedAt: new Date().toISOString() }, downloads: restricted ? [] : downloads };
}

export function validateSourceUrl(raw: string): URL {
  const url = new URL(raw, QUL_ORIGIN);
  if (url.origin !== QUL_ORIGIN || url.username || url.password) throw new Error('invalid-resource');
  return url;
}
