import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, open, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';
import { discoverImportFiles, hashImportFile } from '../../src/main/services/digital/import-files';
import { BackgroundMetadataService } from '../../src/main/services/digital/background-metadata.service';
import { DigitalFileValidatorService } from '../../src/main/services/digital/digital-file-validator.service';
import { DigitalImportPipelineService } from '../../src/main/services/digital/digital-import-pipeline.service';
import { DuplicateDetectorService } from '../../src/main/services/digital/duplicate-detector.service';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { createTestDatabase } from '../helpers/test-db';

async function temporaryDirectory(): Promise<string> {
  const root = path.resolve('.baglib-data', 'bulk-import-tests');
  await mkdir(root, { recursive: true });
  return mkdtemp(path.join(root, 'run-'));
}

it('discovers nested Arabic/English folders once and streams exact hashes', async () => {
  const directory = await temporaryDirectory();
  try {
    const nested = path.join(directory, 'كتب — Books');
    await mkdir(nested);
    const book = path.join(nested, 'كِتاب.txt');
    const content = 'Arabic العربية\n'.repeat(100_000);
    await writeFile(book, content);
    await writeFile(path.join(nested, 'notes.png'), 'not a book');
    const result = await discoverImportFiles([directory, nested, book, path.join(directory, 'missing')]);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].name, 'كِتاب.txt');
    assert.equal(result.files[0].size, Buffer.byteLength(content));
    assert.equal(result.errors.length, 1);
    assert.equal(await hashImportFile(book), createHash('sha256').update(content).digest('hex'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('bounds validation to four simultaneous file probes', async () => {
  const validator = new DigitalFileValidatorService();
  let active = 0;
  let peak = 0;
  validator.validateFile = async filePath => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return { isValid: true, filePath, fileName: filePath, extension: '.txt', fileSizeBytes: 1 };
  };
  const result = await validator.validateFiles(Array.from({ length: 300 }, (_, index) => `${index}.txt`));
  assert.equal(result.validFiles, 300);
  assert.equal(peak, 4);
  assert.equal(result.results[299].fileName, '299.txt');
});

it('imports 300 nested books with actual SQLite and background metadata while timers remain responsive', { timeout: 90_000 }, async () => {
  const directory = await temporaryDirectory();
  const database = createTestDatabase();
  const repository = new SqliteWorkRepository(database);
  const workerPath = path.join(directory, 'metadata-worker.cjs');
  buildSync({ entryPoints: ['src/main/metadata-worker.ts'], outfile: workerPath, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  const extractor = new BackgroundMetadataService(workerPath);
  let ticks = 0;
  let largestGap = 0;
  let previous = performance.now();
  const heartbeat = setInterval(() => { const now = performance.now(); largestGap = Math.max(largestGap, now - previous); previous = now; ticks++; }, 10);
  try {
    const booksDirectory = path.join(directory, 'books');
    await mkdir(booksDirectory);
    for (let index = 0; index < 300; index++) {
      const name = `${index % 2 ? 'كتاب' : 'Book'} ${index}`;
      if (index % 3 === 0) {
        await copyFile(path.resolve('docs/31-10-2020-084952101 Essays That Will Change The Way You Think - Brianna Wiest.pdf'), path.join(booksDirectory, `${name}.pdf`));
      } else if (index % 3 === 1) {
        await writeFile(path.join(booksDirectory, `${name}.epub`), zipSync({
          mimetype: strToU8('application/epub+zip'),
          'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'),
          'content.opf': strToU8(`<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>${name}</dc:title><dc:creator>Author ${index}</dc:creator><dc:language>en</dc:language></metadata><manifest></manifest><spine></spine></package>`),
        }, { level: 0 }));
      } else {
        await writeFile(path.join(booksDirectory, `${name}.txt`), `Unique book ${index}. العلم والمعرفة.\n`);
      }
    }
    const discovery = await discoverImportFiles([booksDirectory]);
    assert.equal(discovery.files.length, 300);
    const detector = new DuplicateDetectorService(repository, extractor);
    const pipeline = new DigitalImportPipelineService(repository, undefined, extractor, undefined, detector);
    const progress: number[] = [];
    const summary = await pipeline.importFiles(discovery.files.map(file => ({ filePath: file.path, duplicateAction: 'import_anyway' })), event => progress.push(event.progressPercentage));
    assert.equal(summary.successfulImports, 300);
    assert.equal(summary.failedImports, 0);
    for (const format of ['PDF', 'EPUB', 'TXT']) assert.equal(summary.results.filter(result => result.format === format).length, 100);
    assert.ok(summary.results.every(result => !result.extractedMetadata?.coverDataUrl));
    assert.equal(repository.getDuplicateCandidates().length, 300);
    assert.equal(progress.at(-1), 100);
    assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
    assert.ok(ticks > 10);
    assert.ok(largestGap < 2000, `Main event-loop gap ${largestGap} ms`);
    const duplicates = await detector.batchCheckDuplicates(discovery.files.slice(0, 3).map(file => ({ filePath: file.path })));
    assert.ok(duplicates.every(result => result.matchType === 'exact_file'));
    console.log(JSON.stringify({ bulkImported: summary.successfulImports, heartbeatTicks: ticks, largestMainLoopGapMs: Math.round(largestGap) }));
  } finally {
    clearInterval(heartbeat);
    extractor.dispose();
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it('recovers from a stalled parser and avoids deep reads for oversized books', { timeout: 15_000 }, async () => {
  const directory = await temporaryDirectory();
  const workerPath = path.join(directory, 'stalled.cjs');
  await writeFile(workerPath, "const {parentPort}=require('node:worker_threads'); parentPort.on('message', request => { if(request.filePath.includes('Small')) { while(true) {} } if(request.filePath.includes('Crash')) process.exit(1); parentPort.postMessage({metadata:{title:'Recovered',authors:[],tags:[],identifiers:{},format:'TXT'}}); });");
  const extractor = new BackgroundMetadataService(workerPath, 500);
  try {
    const small = path.join(directory, 'Small Book.txt');
    await writeFile(small, 'text');
    assert.ok((await extractor.extract(small)).title);
    const recovery = path.join(directory, 'Recovery.txt');
    await writeFile(recovery, 'recovery');
    assert.equal((await extractor.extract(recovery)).title, 'Recovered');
    const crashed = path.join(directory, 'Crash.txt');
    await writeFile(crashed, 'crash');
    assert.ok((await extractor.extract(crashed)).title);
    const recoveredAgain = path.join(directory, 'Recovery Again.txt');
    await writeFile(recoveredAgain, 'recovery');
    assert.equal((await extractor.extract(recoveredAgain)).title, 'Recovered');
    const large = path.join(directory, 'Large Book.pdf');
    const file = await open(large, 'w');
    await file.truncate(65 * 1024 * 1024);
    await file.close();
    const started = performance.now();
    const metadata = await extractor.extract(large);
    assert.equal(metadata.format, 'PDF');
    assert.ok(metadata.title);
    assert.ok(performance.now() - started < 1000);
  } finally { extractor.dispose(); await rm(directory, { recursive: true, force: true }); }
});

it('does not replicate existing cover blobs in hundreds of duplicate previews', async () => {
  const database = createTestDatabase();
  try {
    const repository = new SqliteWorkRepository(database);
    const cover = `data:image/jpeg;base64,${'A'.repeat(1_000_000)}`;
    const existing = repository.addBook({ title: 'Existing book', author: 'Author', bookType: 'digital', filePath: 'D:/existing.pdf', fileHash: 'a'.repeat(64), coverImage: cover });
    const detector = new DuplicateDetectorService(repository);
    const previews = await detector.batchCheckDuplicates(Array.from({ length: 300 }, () => ({ filePath: '', fileHash: 'a'.repeat(64) })));
    assert.ok(previews.every(result => result.existingWork?.id === existing.id));
    assert.ok(previews.every(result => !result.existingWork?.coverImage));
    assert.ok(Buffer.byteLength(JSON.stringify(previews)) < 500_000);
    assert.equal(repository.getById(existing.id)?.coverImage, cover);
  } finally { database.close(); }
});

it('skips only identical files when importing unreviewed similar titles', async () => {
  const directory = await temporaryDirectory();
  const database = createTestDatabase();
  try {
    const repository = new SqliteWorkRepository(database);
    const first = path.join(directory, 'Knowledge 101.txt');
    const second = path.join(directory, 'Knowledge 102.txt');
    const copy = path.join(directory, 'Knowledge copy.txt');
    await writeFile(first, 'First distinct volume');
    await writeFile(second, 'Second distinct volume');
    await copyFile(first, copy);
    const pipeline = new DigitalImportPipelineService(repository);
    const summary = await pipeline.importFiles([first, second, copy].map(filePath => ({ filePath, duplicateAction: 'skip', skipExactDuplicatesOnly: true })));
    assert.equal(summary.successfulImports, 2);
    assert.equal(summary.skippedImports, 1);
    assert.equal(summary.results[2].duplicateMatchType, 'exact_file');
  } finally { database.close(); await rm(directory, { recursive: true, force: true }); }
});
