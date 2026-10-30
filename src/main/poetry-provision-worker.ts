import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { downloadPoetryCorpus } from './services/poetry/corpus';
import { seedPoetry } from './services/poetry/seed';

async function main() {
  const userData = process.env.BAGLIB_POETRY_USER_DATA;
  if (!userData || !path.isAbsolute(userData)) throw new Error('poetry-user-data-required');
  const developmentPython = path.resolve('tools/hadith-alignment/.venv/Scripts/python.exe');
  const python = process.env.BAGLIB_POETRY_PYTHON || (fs.existsSync(developmentPython) ? developmentPython : process.platform === 'win32' ? 'python' : 'python3');
  const controller = new AbortController();
  process.once('SIGTERM', () => controller.abort());
  process.once('SIGINT', () => controller.abort());
  await new Promise<void>((resolve, reject) => {
    const probe = spawn(python, ['-I', '-c', 'import pyarrow.parquet'], { windowsHide: true, stdio: 'ignore', signal: AbortSignal.timeout(15000) });
    probe.once('error', () => reject(new Error('poetry-python-unavailable')));
    probe.once('close', code => code === 0 ? resolve() : reject(new Error('poetry-python-unavailable')));
  });
  const root = process.env.BAGLIB_POETRY_CACHE || path.join(userData, 'cache/poetry/shards');
  const shards = await downloadPoetryCorpus(root, controller.signal, (downloaded, total) => console.log(JSON.stringify({ downloaded, total })));
  const poems = await seedPoetry({ userData, python, parser: process.env.BAGLIB_POETRY_PARSER || path.resolve('assets/poetry/parquet_rows.py'), shards, expectedCount: 254630, signal: controller.signal, progress: imported => console.log(JSON.stringify({ imported })) });
  console.log(JSON.stringify({ poems }));
}
void main().catch(error => { console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'poetry-provision-failed' })); process.exitCode = 1; });
