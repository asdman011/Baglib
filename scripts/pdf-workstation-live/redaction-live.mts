// Live check of per-page redaction: real engine, copies of real PDFs, verified by rendering and by searching the output.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { defaultStirlingSidecar, runStirlingPdf, selectNewestStirlingJar } from '../../src/main/services/pdf-editor/stirling';
import { inspectPdfFile } from '../../src/main/services/pdf-editor/inspection';

const book = process.env.BAGLIB_REDACTION_BOOK ?? 'F:\\كتب\\Books\\Books\\egypt-inequality-book.pdf';
const imageOnly = process.env.BAGLIB_REDACTION_SCAN;
const only = process.env.BAGLIB_REDACTION_ONLY?.split(',');
const root = path.resolve('.baglib-data/pdf-engine');
const python = path.join(root, 'venv', 'Scripts', 'python.exe');
const tools = { python, script: path.resolve('assets/pdf-editor/engine.py'), tessdata: path.join(root, 'tessdata'), java: path.join(root, 'java', 'jdk-25.0.5+8-jre', 'bin', 'java.exe'), stirlingJar: selectNewestStirlingJar(path.join(root, 'stirling'))!, preferStirling: true };
const directory = mkdtempSync(path.join(os.tmpdir(), 'baglib-redaction-'));
const source = path.join(directory, 'book.pdf');
copyFileSync(book, source);
const originalBytes = readFileSync(book);
const helper = (...args: string[]) => execFileSync(python, ['-I', path.resolve('scripts/pdf-workstation-live/redaction-fixtures.py'), ...args], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' }, maxBuffer: 64 * 1024 * 1024 });
const facts = (file: string, password = '') => JSON.parse(helper('facts', file, password));
const search = (file: string, needles: string[], password = '') => JSON.parse(helper('search', file, password, JSON.stringify(needles))) as Record<string, boolean>;
const fixture = (kind: string, name: string) => { const file = path.join(directory, name); helper(kind, source, file); return file; };

let counter = 0;
const redact = async (file: string, regions: { page: number; rect: number[] }[], convertPdfToImage = true, password?: string) => {
  const folder = mkdtempSync(path.join(directory, `run-${++counter}-`));
  const started = Date.now();
  const result = await runStirlingPdf(tools as never, { filename: file, output: path.join(folder, 'document.html'), operation: 'redact', language: 'ar', payload: { regions, convertPdfToImage }, password, expectedHash: '' } as never, AbortSignal.timeout(280_000), () => {}) as { outputs: { filename: string }[] };
  const output = path.join(folder, result.outputs[0].filename);
  return { output, seconds: (Date.now() - started) / 1000, bytes: statSync(output).size };
};
const pageText = async (file: string, pages: number[], password?: string) => {
  const texts = new Map<number, string>();
  for (let index = 0; index < pages.length; index += 200) for (const page of (await inspectPdfFile(file, password, () => {}, pages.slice(index, index + 200))).pages) texts.set(page.page, page.text);
  return texts;
};
const render = async (file: string, page: number, password?: string) => {
  const folder = mkdtempSync(path.join(directory, 'render-'));
  const rendered = await runStirlingPdf(tools as never, { filename: file, output: path.join(folder, 'x.html'), operation: 'preview', language: 'en', password, payload: { page }, expectedHash: '' } as never, AbortSignal.timeout(120_000), () => {}) as { image: string; width: number; height: number };
  const image = path.join(folder, 'page.png');
  writeFileSync(image, Buffer.from(rendered.image.split(',')[1], 'base64'));
  return { image, width: rendered.width, height: rendered.height };
};
const results: Record<string, unknown> = {};
const section = async (name: string, run: () => Promise<void>) => {
  if (only && !only.includes(name)) return;
  try { await run(); console.log(`PASS ${name}`, JSON.stringify(results[name] ?? {})); }
  catch (error) { console.log(`FAIL ${name}: ${(error as Error).message}`); process.exitCode = 1; }
};

const totalPages = (await inspectPdfFile(source, undefined, () => {}, [1])).totalPages;
const before = await pageText(source, Array.from({ length: totalPages }, (_, index) => index + 1));
const sourceFacts = facts(source);
// A line found on this page alone, so finding it anywhere afterwards can only mean the redaction leaked.
const inspected = await inspectPdfFile(source, undefined, () => {}, [29, 30]);
const target = inspected.pages[0].blocks.filter(block => block.width > 150 && block.height < 30 && block.y > inspected.pages[0].height * 0.3 && block.text.trim().length > 25 && [...before].filter(([, text]) => text.includes(block.text.trim())).length === 1)[0];
assert.ok(target, 'no unique line on page 29');
const box = [target.x - 2, target.y - 2, target.x + target.width + 2, target.y + target.height + 2];
const covered = target.text.trim();

await section('book', async () => {
  const run = await redact(source, [{ page: 29, rect: box }, { page: 29, rect: [60, 60, 200, 90] }, { page: 40, rect: [60, 200, 300, 260] }]);
  const after = await pageText(run.output, Array.from({ length: totalPages }, (_, index) => index + 1));
  const outputFacts = facts(run.output);
  assert.equal(outputFacts.pages.length, totalPages);
  assert.equal(after.get(29), ''); assert.equal(after.get(40), '');
  for (let page = 1; page <= totalPages; page++) {
    if (page === 29 || page === 40) continue;
    assert.equal(after.get(page), before.get(page), `page ${page} text changed`);
    assert.equal(outputFacts.pages[page - 1].content, sourceFacts.pages[page - 1].content, `page ${page} content changed`);
  }
  for (const [index, page] of outputFacts.pages.entries()) { assert.equal(page.w, sourceFacts.pages[index].w); assert.equal(page.h, sourceFacts.pages[index].h); assert.equal(page.rotate, sourceFacts.pages[index].rotate); }
  assert.equal(outputFacts.outline, sourceFacts.outline); assert.equal(outputFacts.eof, 1);
  assert.equal([...after.values()].some(text => text.includes(covered)), false, 'covered text can still be read');
  const words = covered.split(/\s+/u).filter(word => word.length > 6 && ![...after.values()].some(text => text.includes(word)));
  const hits = search(run.output, [covered, ...words]);
  assert.deepEqual(Object.entries(hits).filter(([, found]) => found), [], 'covered text found in the file');
  const rendered = await render(run.output, 29);
  const dark = JSON.parse(helper('darkness', rendered.image, JSON.stringify([[(box[0] + 4) / rendered.width, (box[1] + 3) / rendered.height, (box[2] - 4) / rendered.width, (box[3] - 3) / rendered.height], [0.2, 0.45, 0.8, 0.5]]))).dark;
  assert.ok(dark[0] > 0.98, `box not black: ${dark[0]}`); assert.ok(dark[1] < 0.5, 'other content blacked out');
  results.book = { bytes: run.bytes, sourceBytes: statSync(source).size, seconds: run.seconds, redactedPages: 2, untouchedPagesWithSameText: totalPages - 2, covered: covered.slice(0, 40), rawSearchTerms: words.length + 1 };
  assert.deepEqual(readFileSync(book), originalBytes);
});

await section('rotated', async () => {
  const file = fixture('rotated', 'rotated.pdf');
  const report: Record<string, unknown> = {};
  for (const [index, angle] of [0, 90, 180, 270].entries()) {
    const page = 29 + index;
    const display = await render(file, page);
    // Drawn in display space, near the top-left of what the reader sees.
    const rect = [display.width * 0.1, display.height * 0.08, display.width * 0.45, display.height * 0.2];
    const run = await redact(file, [{ page, rect }]);
    const output = await render(run.output, page);
    assert.deepEqual([Math.round(output.width), Math.round(output.height)], [Math.round(display.width), Math.round(display.height)], `angle ${angle} changed size`);
    const dark = JSON.parse(helper('darkness', output.image, JSON.stringify([[0.11, 0.09, 0.44, 0.19], [0.55, 0.09, 0.9, 0.19], [0.11, 0.8, 0.44, 0.92], [0.55, 0.8, 0.9, 0.92]]))).dark as number[];
    assert.ok(dark[0] > 0.98, `angle ${angle}: drawn area not black (${dark})`);
    assert.ok(dark.slice(1).every(value => value < 0.6), `angle ${angle}: black elsewhere (${dark})`);
    assert.equal(facts(run.output).pages[page - 1].rotate, angle);
    assert.equal((await pageText(run.output, [page])).get(page), '');
    report[angle] = dark;
  }
  results.rotated = report;
});

await section('cropped', async () => {
  const file = fixture('cropped', 'cropped.pdf');
  const display = await render(file, 29);
  const rect = [display.width * 0.1, display.height * 0.1, display.width * 0.5, display.height * 0.2];
  const run = await redact(file, [{ page: 29, rect }]);
  const dark = JSON.parse(helper('darkness', (await render(run.output, 29)).image, JSON.stringify([[0.11, 0.11, 0.49, 0.19], [0.55, 0.11, 0.9, 0.19]]))).dark;
  assert.ok(dark[0] > 0.98, `crop offset wrong: ${dark}`); assert.ok(dark[1] < 0.6, `black elsewhere: ${dark}`);
  results.cropped = dark;
});

await section('structured', async () => {
  const file = fixture('structured', 'structured.pdf');
  const original = facts(file);
  const display = await render(file, 29);
  // The secret field sits at PDF y 660 to 680, which is near the top of the displayed page.
  const run = await redact(file, [{ page: 29, rect: [40, display.height - 700, 260, display.height - 640] }]);
  const output = facts(run.output);
  assert.deepEqual(output.fields, ['kept_field'], `fields ${output.fields}`);
  assert.equal(output.pages[28].annots, 2, 'the link and kept field stay');
  assert.equal(output.title, original.title); assert.equal(output.outline, original.outline);
  assert.equal(search(run.output, ['SECRETFIELDVALUE']).SECRETFIELDVALUE, false, 'covered field value survived');
  results.structured = { fields: output.fields, annotations: output.pages[28].annots, title: output.title, bookmarks: output.outline };
});

await section('encrypted', async () => {
  const file = fixture('encrypted', 'encrypted.pdf');
  const run = await redact(file, [{ page: 29, rect: box }], true, 'user-pass');
  const output = facts(run.output, 'user-pass');
  assert.equal(output.encrypted, true, 'encryption was dropped');
  assert.equal((await pageText(run.output, [29, 30], 'user-pass')).get(29), '');
  await assert.rejects(inspectPdfFile(run.output, 'wrong', () => {}), /encrypted/u);
  results.encrypted = { stillEncrypted: output.encrypted };
});

await section('signed', async () => {
  const keystore = path.join(directory, 'signer.p12');
  execFileSync(path.join(path.dirname(tools.java), 'keytool.exe'), ['-genkeypair', '-alias', 'baglib', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '2', '-dname', 'CN=Baglib Test', '-storetype', 'PKCS12', '-keystore', keystore, '-storepass', 'testpass', '-keypass', 'testpass'], { stdio: 'ignore' });
  const folder = mkdtempSync(path.join(directory, 'sign-'));
  const assets = { certificate: keystore };
  const signed = await runStirlingPdf(tools as never, { filename: source, output: path.join(folder, 'document.html'), operation: 'sign', language: 'en', assets, payload: { certificate: 'certificate', certificatePassword: 'testpass', page: 1 }, expectedHash: '' } as never, AbortSignal.timeout(120_000), () => {}) as { outputs: { filename: string }[] };
  await assert.rejects(redact(path.join(folder, signed.outputs[0].filename), [{ page: 29, rect: box }]), /signed-document-locked/u);
  results.signed = { refused: true };
});

await section('selection', async () => {
  const first = await redact(source, [{ page: 1, rect: [50, 50, 200, 100] }]);
  const last = await redact(source, [{ page: totalPages, rect: [50, 50, 200, 100] }]);
  assert.equal(facts(first.output).pages.length, totalPages); assert.equal(facts(last.output).pages.length, totalPages);
  const everything = await redact(source, Array.from({ length: totalPages }, (_, index) => ({ page: index + 1, rect: [50, 50, 100, 80] })));
  const text = await pageText(everything.output, Array.from({ length: totalPages }, (_, index) => index + 1));
  assert.ok([...text.values()].every(value => value === ''));
  assert.equal(facts(everything.output).outline, sourceFacts.outline);
  results.selection = { firstSeconds: first.seconds, lastSeconds: last.seconds, allPagesSeconds: everything.seconds, allPagesBytes: everything.bytes };
});

await section('rasterize-off', async () => {
  const run = await redact(source, [{ page: 29, rect: box }], false);
  const dark = JSON.parse(helper('darkness', (await render(run.output, 29)).image, JSON.stringify([[(box[0] + 4) / 504, (box[1] + 3) / 720, (box[2] - 4) / 504, (box[3] - 3) / 720]]))).dark;
  assert.ok(dark[0] > 0.98); results['rasterize-off'] = { bytes: run.bytes, seconds: run.seconds, textStaysExtractable: Boolean((await pageText(run.output, [29])).get(29)) };
});

await section('image-only', async () => {
  if (!imageOnly || !existsSync(imageOnly)) throw new Error('set BAGLIB_REDACTION_SCAN');
  const file = path.join(directory, 'scan.pdf');
  copyFileSync(imageOnly, file);
  const original = facts(file);
  const display = await render(file, 5);
  const rect = [display.width * 0.2, display.height * 0.3, display.width * 0.7, display.height * 0.5];
  const run = await redact(file, [{ page: 5, rect }]);
  const dark = JSON.parse(helper('darkness', (await render(run.output, 5)).image, JSON.stringify([[0.21, 0.31, 0.69, 0.49]]))).dark;
  assert.ok(dark[0] > 0.98, `not black ${dark}`);
  const output = facts(run.output);
  for (const [index, page] of output.pages.entries()) if (index !== 4) assert.equal(page.content, original.pages[index].content);
  results['image-only'] = { bytes: run.bytes, sourceBytes: statSync(file).size, seconds: run.seconds, dark };
});

await defaultStirlingSidecar.stop();
process.exit(process.exitCode ?? 0);
