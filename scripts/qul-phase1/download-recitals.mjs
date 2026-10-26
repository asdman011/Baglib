import { DatabaseSync } from 'node:sqlite';
import { mkdir, open, rename, stat, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';

const base = path.resolve('repos/Quran/QUL Developer Resources/3-Recitations and segments data/audio');
const sources = [
  ['husary', 'ayah-recitation-mahmoud-khalil-al-husary-murattal-hafs-957 (with segments).db.zip'],
  ['minshawi', 'ayah-recitation-muhammad-siddiq-al-minshawi-murattal-hafs-959.db.zip'],
];
const queue = [];
const snapshots = path.resolve('.baglib-data/recitation-download');
await mkdir(snapshots, { recursive: true });
for (const [reciter, filename] of sources) {
  const archive = await readFile(path.resolve(base, '..', filename));
  const entries = Object.entries(unzipSync(archive)).filter(([name]) => name.endsWith('.db'));
  if (entries.length !== 1 || entries[0][1].length > 8 * 1024 * 1024) throw new Error('Invalid source archive');
  const snapshot = path.join(snapshots, `${reciter}.db`);
  await writeFile(snapshot, entries[0][1]);
  const database = new DatabaseSync(snapshot, { readOnly: true });
  try {
    const rows = database.prepare('SELECT surah_number, audio_url FROM verses ORDER BY ayah_number').all();
    const seen = new Set();
    for (const row of rows) {
      const url = new URL(row.audio_url);
      const match = url.pathname.match(/\/(\d{3})(\d{3})\.mp3$/);
      if (url.origin !== 'https://audio-cdn.tarteel.ai' || url.username || url.password || !match || Number(match[1]) !== row.surah_number || seen.has(match[0])) throw new Error('Invalid source audio reference');
      seen.add(match[0]);
      queue.push({ reciter, url: url.href, file: path.join(base, reciter, match[1], `${match[1]}${match[2]}.mp3`) });
    }
    if (rows.length !== 6236) throw new Error('Incomplete source manifest');
  } finally { database.close(); }
}
let cursor = 0;
let downloaded = 0;
let reused = 0;
const failures = [];
await mkdir(base, { recursive: true });
async function transfer(item) {
  if ((await stat(item.file).catch(() => null))?.size > 1000) {
    const file = await open(item.file, 'r');
    const signature = Buffer.alloc(3);
    try { await file.read(signature, 0, 3, 0); } finally { await file.close(); }
    if (signature[0] === 0xff || signature.toString() === 'ID3') { reused++; return; }
  }
  await mkdir(path.dirname(item.file), { recursive: true });
  const temporary = `${item.file}.part`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await new Promise((resolve, reject) => {
        const request = https.get(item.url, { signal: AbortSignal.timeout(90000) }, resolve);
        request.on('error', reject);
      });
      if (response.statusCode !== 200 || !/audio|octet-stream/i.test(response.headers['content-type'] || '')) { response.destroy(); throw new Error('Audio unavailable'); }
      const file = await open(temporary, 'w');
      let bytes = 0;
      try {
        for await (const chunk of response) {
          if (!bytes && !(chunk[0] === 0xff || Buffer.from(chunk.subarray(0, 3)).toString() === 'ID3')) throw new Error('Invalid MP3 signature');
          bytes += chunk.length;
          if (bytes > 32 * 1024 * 1024) throw new Error('Audio size limit');
          await file.writeFile(chunk);
        }
      } finally { await file.close(); response.destroy(); }
      const length = Number(response.headers['content-length']);
      if (!bytes || (length && bytes !== length)) throw new Error('Incomplete audio');
      await rename(temporary, item.file);
      downloaded++;
      return;
    } catch {
      await rm(temporary, { force: true });
      if (attempt === 2) { failures.push(path.relative(base, item.file)); return; }
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < queue.length) {
    const index = cursor++;
    await transfer(queue[index]);
    if ((downloaded + reused + failures.length) % 100 === 0) console.log(JSON.stringify({ downloaded, reused, failed: failures.length, total: queue.length }));
  }
}));
const report = { downloaded, reused, failures, total: queue.length, completedAt: new Date().toISOString() };
await writeFile(path.join(base, 'download-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
process.exitCode = failures.length ? 1 : 0;
