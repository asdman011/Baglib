import { parseHTML } from 'linkedom';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const origin = 'https://qul.tarteel.ai';
const directory = path.resolve('.baglib-data/qul-phase1');
const cookies = new Map();
let totalBytes = 0;

async function request(url, options = {}, depth = 0) {
  const target = new URL(url, origin);
  if (target.protocol !== 'https:' || target.username || target.password || depth > 5) throw new Error('Unsafe redirect');
  const headers = { ...options.headers };
  if (target.origin === origin && cookies.size) headers.cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  const response = await fetch(target, { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(45000) });
  if (target.origin === origin) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const separator = pair.indexOf('=');
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Unsafe redirect');
    const destination = new URL(location, target);
    if (options.method === 'POST' && [307, 308].includes(response.status)) throw new Error('Refusing credential-preserving redirect');
    await response.body?.cancel();
    return request(destination, {}, depth + 1);
  }
  return response;
}

async function html(url, options) {
  const response = await request(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { response, document: parseHTML(await response.text()).document };
}

function links(document) {
  return [...document.querySelectorAll('a[href]')].map(anchor => ({ title: anchor.textContent.trim().replace(/\s+/g, ' '), href: anchor.getAttribute('href') }));
}

async function execute(command) {
  if (command.action === 'login') {
    const { document } = await html('/users/sign_in');
    const form = document.querySelector('form[action="/users/sign_in"]');
    if (!form) throw new Error('Expected first-party login form missing');
    const body = new URLSearchParams({ authenticity_token: form.querySelector('[name="authenticity_token"]').value, 'user[email]': command.email, 'user[password]': command.password, 'user[remember_me]': '0' });
    command.email = undefined;
    command.password = undefined;
    try {
      const result = await html('/users/sign_in', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin, referer: `${origin}/users/sign_in` }, body });
      return { authenticated: Boolean(result.document.querySelector('a[href="/users/sign_out"], form[action="/users/sign_out"]')), remainsOnLogin: new URL(result.response.url).pathname === '/users/sign_in' };
    } finally {
      body.delete('user[email]');
      body.delete('user[password]');
    }
  }
  if (command.action === 'catalog') {
    const category = command.category || '';
    if (!/^[a-z-]*$/.test(category)) throw new Error('Invalid category');
    const { document } = await html(`/resources/${category}`);
    const resources = links(document).filter(link => new RegExp(`^/resources/${category ? category + '/[a-z0-9-]+' : '[a-z-]+'}$`).test(link.href));
    const result = { category, resources: [...new Map(resources.map(resource => [resource.href, resource])).values()] };
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `catalog-${category || 'categories'}.json`), JSON.stringify(result, null, 2));
    return result;
  }
  if (command.action === 'detail') {
    globalThis.pendingFiles = undefined;
    globalThis.pendingResource = undefined;
    if (!/^\/resources\/[a-z-]+\/[a-z0-9-]+$/.test(command.resource)) throw new Error('Invalid resource path');
    const { document } = await html(command.resource);
    const all = links(document);
    const files = all.filter(link => /\/[a-f0-9]{32}\/download$/.test(link.href));
    const copyrightNotice = /copyrighted/i.test(document.body.textContent);
    globalThis.pendingFiles = copyrightNotice ? [] : files;
    globalThis.pendingResource = command.resource;
    const result = { resource: command.resource, heading: document.querySelector('h1')?.textContent.trim(), formats: (globalThis.pendingFiles || []).map((file, index) => ({ index, title: file.title })), related: all.filter(link => /^\/resources\/[a-z-]+\/[a-z0-9-]+$/.test(link.href)), copyrightNotice };
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `detail-${command.resource.split('/').slice(2).join('-')}.json`), JSON.stringify(result, null, 2));
    return result;
  }
  if (command.action === 'unauthenticated-probe') {
    const file = globalThis.pendingFiles?.[0];
    if (!file) throw new Error('Invalid selected download');
    const saved = new Map(cookies);
    cookies.clear();
    try {
      const response = await request(file.href);
      await response.body?.cancel();
      return { downloadRequiresLogin: new URL(response.url).pathname === '/users/sign_in', status: response.status };
    } finally { cookies.clear(); for (const [key, value] of saved) cookies.set(key, value); }
  }
  if (command.action === 'download') {
    const file = globalThis.pendingFiles?.[command.index];
    if (!file || !/^[a-z0-9-]+\.(json|sqlite|zip|woff2?|ttf)$/.test(command.name)) throw new Error('Invalid selected download');
    const endpoint = new URL(file.href, origin);
    if (endpoint.origin !== origin) throw new Error('Download must originate at QUL');
    const response = await request(endpoint);
    if (!response.ok || /text\/html/.test(response.headers.get('content-type') || '')) throw new Error('Download unavailable or requires login');
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 20 * 1024 * 1024 || totalBytes + bytes > 60 * 1024 * 1024) throw new Error('Phase-one sample size limit reached');
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const metadata = { resource: globalThis.pendingResource, format: file.title, filename: command.name, bytes, sha256: createHash('sha256').update(buffer).digest('hex'), storageOrigin: new URL(response.url).origin, contentType: response.headers.get('content-type'), etag: response.headers.get('etag'), fetchedAt: new Date().toISOString() };
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, command.name), buffer, { flag: 'wx' });
    await writeFile(path.join(directory, `${command.name}.provenance.json`), JSON.stringify(metadata, null, 2), { flag: 'wx' });
    totalBytes += bytes;
    return metadata;
  }
  if (command.action === 'exit') {
    cookies.clear();
    process.exit(0);
  }
  throw new Error('Unknown action');
}

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
let input = '';
let queue = Promise.resolve();
process.stdin.on('data', chunk => {
  if (chunk.includes('\u0003')) {
    cookies.clear();
    process.exit(0);
  }
  input += chunk.replace(/\r/g, '\n');
  let delimiter;
  while ((delimiter = input.indexOf('\n')) !== -1) {
    let line = input.slice(0, delimiter).trim();
    input = input.slice(delimiter + 1);
    let command;
    try { command = JSON.parse(line); } catch { console.log(JSON.stringify({ error: 'Invalid command JSON' })); continue; }
    line = '';
    queue = queue.then(() => execute(command)).then(result => console.log(JSON.stringify(result))).catch(error => console.log(JSON.stringify({ error: error instanceof Error && /^(HTTP |Invalid |Unsafe |Refusing |Expected |Download |Phase-one )/.test(error.message) ? error.message : 'Request failed; no sensitive response logged' })));
  }
});
console.log('READY: memory-only authentication; input echo disabled');
