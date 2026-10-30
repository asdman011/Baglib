import path from 'node:path';
import { downloadPoetryCorpus } from '../../src/main/services/poetry/corpus';

async function main() {
  await downloadPoetryCorpus(process.env.BAGLIB_POETRY_CACHE || path.resolve('.baglib-data/poetry/shards'), AbortSignal.timeout(15 * 60_000), (downloaded, total) => console.log(JSON.stringify({ downloaded, total })));
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
