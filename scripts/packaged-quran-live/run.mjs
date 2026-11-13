// KEY-264 and KEY-265 packaged acceptance (Quran packs and the merged Sunnah database): an installed build (release/win-unpacked) on a clean throwaway profile, with Chromium
// networking pointed at a dead proxy, must install the bundled Quran packs on first run and read the Quran at once in
// Arabic (RTL) and English (LTR). Installed pack digests must match the SHA-256 of the shipped source files.
// Run after `npm run build` and `electron-builder --dir`. Screenshots go to .baglib-data/KEY-264-evidence/.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readerPresets } from '../../src/shared/quran-resource-presets.ts';

const root = path.resolve('.');
const exe = path.join(root, 'release', 'win-unpacked', 'Baglib.exe');
const resources = path.join(root, 'release', 'win-unpacked', 'resources', 'quran');
const evidence = path.join(root, '.baglib-data', 'KEY-264-evidence');
fs.mkdirSync(evidence, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The shipped file for each preset, as the packaged app resolves it (resources/quran). */
function shippedFile(preset) {
  if (preset.relative.startsWith('..')) return path.join(resources, 'extra', preset.filename);
  return path.join(resources, 'QUL Developer Resources', preset.relative, preset.filename);
}
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function cdp(port) {
  let targets = [];
  for (let attempt = 0; attempt < 120 && !targets.some(target => target.type === 'page' && !target.url.startsWith('devtools')); attempt++) {
    await sleep(500);
    targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json()).catch(() => []);
  }
  const page = targets.find(target => target.type === 'page' && !target.url.startsWith('devtools'));
  if (!page) throw new Error('no page target');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map(); const events = [];
  socket.onmessage = message => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); } else if (data.method) events.push(data);
  };
  // Every call times out, because a call that destroys its page (a reload) never gets a reply.
  const send = (method, params = {}, timeout = 15000) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); socket.send(JSON.stringify({ id: key, method, params })); setTimeout(() => { if (pending.delete(key)) resolve({ timedOut: true }); }, timeout); });
  const evaluate = async expression => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description || 'evaluate failed');
    return reply.result?.result?.value;
  };
  const until = async (expression, tries = 240, step = 500) => {
    for (let attempt = 0; attempt < tries; attempt++) { if (await evaluate(expression).catch(() => false)) return true; await sleep(step); }
    throw new Error(`timed out: ${expression}`);
  };
  return { send, evaluate, until, events, close: () => socket.close(), url: page.url };
}

async function run(language, port) {
  const profile = fs.mkdtempSync(path.join(root, '.baglib-data', `KEY-264-live-${language}-`));
  const child = spawn(exe, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'], { stdio: 'ignore', windowsHide: false });
  const result = { language, profile: path.basename(profile) };
  try {
    const page = await cdp(port);
    result.pageUrl = page.url.slice(0, 60);
    await page.send('Network.enable');
    await page.until('!!window.electronAPI && !!document.querySelector("footer")');
    await page.evaluate(`localStorage.setItem('baglib-lang', ${JSON.stringify(language)}); true`);
    await page.send('Page.reload', {}, 3000);
    await sleep(2500);
    await page.until('!!window.electronAPI && !!document.querySelector("footer")');
    result.dir = await page.evaluate('document.documentElement.dir');
    // A fresh profile opens the welcome guide; skip it the way a user would, so the window shows the Quran, not the dialog.
    await page.until(`!!document.querySelector('[data-guide-skip]') || !document.querySelector('[data-first-run]')`, 40, 250).catch(() => {});
    await page.evaluate(`document.querySelector('[data-guide-skip]')?.click(); true`);
    await page.until(`!document.querySelector('[data-first-run]')`, 40, 250);
    result.guideSkipped = true;
    // First-run install from the bundled packs: wait until no job is pending and packs are installed.
    const started = Date.now();
    // Fail fast when the Quran API itself refuses (that hid KEY-264's real bug for ten minutes).
    const probe = await page.evaluate(`window.electronAPI.quran.library({ view: 'installed' }).then(r => r.ok ? 'ok' : r.error)`);
    if (probe !== 'ok') throw new Error(`quran.library refused: ${probe}`);
    await page.until(`(async () => { const r = await window.electronAPI.quran.library({ view: 'installed' }); if (!r.ok) return false; const busy = r.data.jobs.some(job => ['queued', 'downloading', 'installing', 'awaiting-download'].includes(job.state)); return !busy && r.data.installed.length > 0; })()`, 180, 1000);
    result.installSeconds = Math.round((Date.now() - started) / 1000);
    const library = await page.evaluate(`window.electronAPI.quran.library({ view: 'installed' }).then(r => ({ installed: r.data.installed.map(p => ({ id: p.resource.id, digest: p.digest })), failed: r.data.jobs.filter(j => !['complete'].includes(j.state)).map(j => ({ id: j.resourceId, state: j.state, error: j.error })) }))`);
    result.installed = library.installed.length;
    result.failedJobs = library.failed;
    // Digests: every installed pack must match the shipped file's SHA-256.
    const mismatches = [];
    for (const pack of library.installed) {
      const preset = readerPresets.find(value => value.id === pack.id || value.aliases?.includes(pack.id));
      if (!preset) { mismatches.push({ id: pack.id, reason: 'no preset' }); continue; }
      const file = shippedFile(preset);
      if (!fs.existsSync(file)) { mismatches.push({ id: pack.id, reason: 'shipped file missing' }); continue; }
      if (sha(file) !== pack.digest) mismatches.push({ id: pack.id, reason: 'digest differs' });
    }
    result.digestMismatches = mismatches;
    // Open the Quran tab and wait for real ayah words.
    await page.evaluate(`[...document.querySelectorAll('[data-nav-item]')].find(b => b.getAttribute('data-nav-item') === 'quran')?.click(); true`);
    await page.until(`document.querySelectorAll('[data-aya]').length > 20`, 240, 500);
    await sleep(1500);
    result.ayahWords = await page.evaluate(`document.querySelectorAll('[data-aya]').length`);
    result.surahs = await page.evaluate(`[...new Set([...document.querySelectorAll('[data-surah]')].map(e => e.getAttribute('data-surah')))].slice(0, 5)`);
    await page.send('Page.bringToFront');
    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, 60000);
    if (shot.result?.data) fs.writeFileSync(path.join(evidence, `packaged-quran-${language}.png`), Buffer.from(shot.result.data, 'base64'));
    result.screenshot = !!shot.result?.data;
    // KEY-265: the merged Sunnah database shipped in resources/sunnah answers search, chapters and research offline.
    const sunnah = await page.evaluate(`(async () => {
      const api = window.electronAPI.sunnah;
      const catalog = await api.catalog();
      const search = await api.search({ text: 'إنما الأعمال بالنيات' });
      const chapter = await api.chapter('Bukhari', 1);
      const hits = search.ok ? (Array.isArray(search.data) ? search.data : (search.data.hits || search.data.hadiths || [])) : [];
      const first = Array.isArray(hits) ? hits[0] : null;
      const hadithId = first?.hadith?.researchId ?? chapter.data?.hadiths?.find(h => h.researchId !== undefined)?.researchId;
      const research = hadithId !== undefined ? await api.research(hadithId) : { ok: false, error: 'no-hit' };
      return { catalog: catalog.ok, catalogError: catalog.error, search: search.ok, searchError: search.error, hits: Array.isArray(hits) ? hits.length : -1,
        chapter: chapter.ok, chapterError: chapter.error, chapterHadiths: chapter.ok ? chapter.data.hadiths.length : 0, research: research.ok, researchError: research.error };
    })()`);
    result.sunnah = sunnah;
    await page.evaluate(`[...document.querySelectorAll('[data-nav-item]')].find(b => b.getAttribute('data-nav-item') === 'sunnah')?.click(); true`);
    result.sunnahUi = await page.until(`document.querySelectorAll('[data-hadith-id], [data-sunnah-collection], .sunnah-entry').length > 0 || /البخاري|Bukhari/.test(document.querySelector('main')?.textContent || '')`, 60, 500).then(() => true, () => false);
    // Network: nothing may leave the machine (file:, devtools, data:, blob: and loopback are local).
    result.remoteRequests = [...new Set(page.events.filter(event => event.method === 'Network.requestWillBeSent').map(event => event.params.request.url).filter(url => !/^(app|file|data|blob|devtools|baglib-asset|chrome-extension):/.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)))];
    result.consoleErrors = page.events.filter(event => event.method === 'Runtime.exceptionThrown').length;
    page.close();
    result.passed = !!(sunnah.catalog && sunnah.search && sunnah.hits > 0 && sunnah.chapter && sunnah.chapterHadiths > 0 && sunnah.research && result.sunnahUi) && result.installed > 0 && !mismatches.length && !library.failed.length && result.ayahWords > 20 && result.dir === (language === 'ar' ? 'rtl' : 'ltr');
  } catch (error) {
    result.passed = false; result.error = String(error?.message || error);
  } finally {
    child.kill();
    await sleep(2500);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    result.profileDeleted = !fs.existsSync(profile);
  }
  return result;
}

const results = [];
for (const [index, language] of ['ar', 'en'].entries()) results.push(await run(language, 9420 + index));
console.log(JSON.stringify({ passed: results.every(result => result.passed), results }, null, 2));
process.exitCode = results.every(result => result.passed) ? 0 : 1;
