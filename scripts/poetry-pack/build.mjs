// KEY-266: build a versioned local poetry pack from an existing bayan_poetry.sqlite.
// Usage (Electron's Node, for better-sqlite3):
//   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe node_modules/tsx/dist/cli.mjs scripts/poetry-pack/build.mjs <source.sqlite> <outDir>
// The pack is local only (never committed): <outDir>/bayan_poetry-v1.sqlite.gz and bayan_poetry-v1.pack.json.
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { buildPoetryPack } from '../../src/main/services/poetry/pack.ts';

const [source, outDir] = process.argv.slice(2);
if (!source || !outDir) { console.error('usage: build.mjs <source.sqlite> <outDir>'); process.exit(2); }
if (fs.existsSync(`${source}-wal`) && fs.statSync(`${source}-wal`).size > 0) { console.error('source has an unmerged -wal file; checkpoint it first'); process.exit(2); }
const database = new Database(source, { readonly: true, fileMustExist: true });
const check = database.pragma('quick_check', { simple: true });
const rows = Number(database.prepare('SELECT count(*) AS n FROM poems').get().n);
database.close();
if (check !== 'ok' || !rows) { console.error(`source failed quick_check (${check}) or has no poems`); process.exit(1); }
const started = Date.now();
const { manifestPath, manifest } = await buildPoetryPack({ source, outDir, rows });
const packBytes = fs.statSync(`${outDir}/${manifest.file}`).size;
console.log(JSON.stringify({ manifestPath, rows, bytes: manifest.bytes, packBytes, ratio: +(packBytes / manifest.bytes).toFixed(3), sha256: manifest.sha256, seconds: Math.round((Date.now() - started) / 1000) }));
