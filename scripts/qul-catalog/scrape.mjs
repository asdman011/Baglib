import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseHTML } from 'linkedom';
import { parseResourceListing } from '../../src/main/services/quran/qul-catalog.ts';
import { QURAN_CATEGORIES } from '../../src/shared/types/quran.ts';

const origin = 'https://qul.tarteel.ai';
const directory = path.resolve('.baglib-data/qul-public-catalog');
await mkdir(directory, { recursive: true });
const records = [];
const resources = new Map();
const counts = {};
const failures = [];
async function page(route) {
  const startedDateTime = new Date().toISOString();
  const started = performance.now();
  const response = await fetch(new URL(route, origin), { redirect: 'error', signal: AbortSignal.timeout(45000), headers: { 'user-agent': 'Baglib-QUL-Catalog/1.0 (public metadata; no authentication)' } });
  if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error(`HTTP ${response.status}`);
  const bytes = [];
  let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new Error('Page size limit'); bytes.push(chunk); }
  const html = Buffer.concat(bytes).toString('utf8');
  const document = parseHTML(html).document;
  const excerpt = [...document.querySelectorAll('a[data-url]')].filter(link => /Download/i.test(link.textContent)).slice(0, 4).map(link => link.outerHTML).join('\n');
  records.push({ startedDateTime, time: performance.now() - started, request: { method: 'GET', url: `${origin}${route}`, httpVersion: 'HTTP/1.1', headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 }, response: { status: response.status, statusText: response.statusText, httpVersion: 'HTTP/1.1', headers: [], cookies: [], content: { size, mimeType: 'text/html', text: excerpt }, redirectURL: '', headersSize: -1, bodySize: size, _bodyExcerptOnly: true }, cache: {}, timings: { send: -1, wait: -1, receive: -1 }, _timingPhasesNotMeasured: true });
  return { html, document };
}
for (const category of QURAN_CATEGORIES) {
  try {
    const visited = new Set();
    const pending = [`/resources/${category}`];
    let count = 0;
    while (pending.length) {
      const route = pending.shift();
      if (visited.has(route)) continue;
      if (visited.size >= 32) throw new Error('Pagination limit');
      visited.add(route);
      const { html, document } = await page(route);
      const listing = parseResourceListing(html, category);
      if (!listing.length) throw new Error('Empty listing');
      for (const resource of listing) { if (!resources.has(resource.id)) count++; resources.set(resource.id, resource); }
      for (const anchor of document.querySelectorAll('a[href]')) {
        const url = new URL(anchor.getAttribute('href'), new URL(route, origin));
        if (url.origin === origin && url.pathname === `/resources/${category}` && /^\?page=\d+$/.test(url.search) && !visited.has(url.pathname + url.search)) pending.push(url.pathname + url.search);
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    counts[category] = count;
  } catch (error) { failures.push({ category, error: error.message }); }
}
const snapshot = { source: `${origin}/resources`, fetchedAt: new Date().toISOString(), authenticated: false, counts, failures, resources: [...resources.values()].sort((first, second) => first.id.localeCompare(second.id)) };
const database = new DatabaseSync(path.join(directory, 'catalog.sqlite'));
database.exec('CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY,category TEXT NOT NULL,descriptor TEXT NOT NULL); DELETE FROM resources;');
const insert = database.prepare('INSERT INTO resources VALUES(?,?,?)');
database.exec('BEGIN');
for (const resource of snapshot.resources) insert.run(resource.id, resource.category, JSON.stringify(resource));
database.exec('COMMIT');
database.close();
await writeFile(path.join(directory, 'catalog.json'), JSON.stringify(snapshot, null, 2));
await writeFile(path.join(directory, 'anonymous.har'), JSON.stringify({ log: { version: '1.2', creator: { name: 'Baglib public catalog audit', version: '1' }, entries: records } }));
console.log(JSON.stringify({ counts, failures, total: resources.size, signInRequired: snapshot.resources.filter(resource => resource.downloadAccess === 'sign-in-required').length, advertisedSQLite: snapshot.resources.filter(resource => resource.formats.some(format => /sqlite|\.db/i.test(format))).length }));
process.exitCode = failures.length ? 1 : 0;
