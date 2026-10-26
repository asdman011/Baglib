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
    const card = heading.closest('li,article,[data-resource-id]') || heading.parentElement!;
    const links = [...card.querySelectorAll('a[href]')];
    const downloads = links.filter(link => /^Download\b/i.test(link.textContent.trim()));
    const tags = links.filter(link => /tags/.test(link.getAttribute('href') || '')).map(link => link.textContent.trim()).filter(Boolean).slice(0, 40);
    const related = links.map(link => link.getAttribute('href') || '').filter(link => /^\/resources\/[a-z-]+\/[a-zA-Z0-9_-]+$/.test(link) && link !== href).map(link => link.slice('/resources/'.length));
    const signIn = downloads.some(link => /^\/users\/sign_in(?:\?|$)/.test(link.getAttribute('data-url') || ''));
    resources.set(id, { id, category: kind, title, sourcePath: href, tags, formats: [...new Set(downloads.map(link => link.textContent.trim().replace(/\s+/g, ' ')))], related: [...new Set(related)].slice(0, 50), restricted: /This resource is\s*©?\s*copyrighted/i.test(card.textContent), downloadAccess: signIn ? 'sign-in-required' : 'unknown',
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
  let signIn = Boolean(document.querySelector('form[action="/users/sign_in"]'));
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') || '';
    if (/^\/users\/sign_in(?:\?|$)/.test(href)) signIn = true;
    if (/^Download\b/i.test(anchor.textContent.trim()) && /^\/users\/sign_in(?:\?|$)/.test(anchor.getAttribute('data-url') || '')) { signIn = true; formats.push(anchor.textContent.trim().replace(/\s+/g, ' ')); }
    if (new RegExp(`^/resources/${resource.category}/[a-f0-9]{32}/download$`).test(href)) { downloads.push(href); formats.push(anchor.textContent.trim().replace(/\s+/g, ' ')); }
    else if (/^\/resources\/[a-z-]+\/[a-zA-Z0-9_-]+$/.test(href) && href !== resource.sourcePath) related.add(href.slice('/resources/'.length));
  }
  const restricted = /This resource is\s*©?\s*copyrighted/i.test(document.body.textContent || document.documentElement.textContent);
  return { resource: { ...resource, tags, formats: [...new Set(formats)], related: [...related].slice(0, 50), restricted, downloadAccess: signIn && !downloads.length ? 'sign-in-required' : downloads.length ? 'link-available' : 'unknown', fetchedAt: new Date().toISOString() }, downloads: restricted ? [] : downloads };
}

export function validateSourceUrl(raw: string): URL {
  const url = new URL(raw, QUL_ORIGIN);
  if (url.origin !== QUL_ORIGIN || url.username || url.password) throw new Error('invalid-resource');
  return url;
}
