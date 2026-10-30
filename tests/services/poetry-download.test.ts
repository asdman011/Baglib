import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadPoetryShard } from '../../src/main/services/poetry/download';

test('poetry shard downloader resumes a partial file and publishes only complete Parquet-framed bytes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'baglib-poetry-download-'));
  const bytes = Buffer.from('PAR1fixture-dataPAR1');
  const server = http.createServer((request, response) => {
    assert.equal(request.headers.range, 'bytes=7-');
    response.writeHead(206, { 'Content-Range': `bytes 7-${bytes.length - 1}/${bytes.length}`, 'Content-Length': bytes.length - 7 });
    response.end(bytes.subarray(7));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const target = path.join(directory, 'shard.parquet');
    await fs.writeFile(`${target}.partial`, bytes.subarray(0, 7));
    const address = server.address() as { port: number };
    const progress: number[] = [];
    await downloadPoetryShard(`http://127.0.0.1:${address.port}`, target, new AbortController().signal, value => progress.push(value.downloaded));
    assert.deepEqual(await fs.readFile(target), bytes);
    assert.equal(progress.at(-1), bytes.length);
    await assert.rejects(fs.stat(`${target}.partial`));
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(directory).startsWith('baglib-poetry-download-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
