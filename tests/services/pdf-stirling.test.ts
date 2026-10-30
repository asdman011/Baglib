import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { mkdtemp, writeFile, rm, mkdir, access } from 'node:fs/promises';
import { makePagePdf } from '../helpers/pdf-pages';
import { fileSha256 } from '../../src/main/services/pdf-editor/source';
import {
  applyRtlJsonReplacements,
  canStirlingHandle,
  checkJavaMajorVersion,
  compareStirlingJarVersions,
  extractZipEntries,
  inspectJarMinimumJavaVersion,
  probeStirlingReadiness,
  runStirlingPdf,
  selectNewestStirlingJar,
  StirlingSidecarService,
  validateStirlingLoopbackUrl,
} from '../../src/main/services/pdf-editor/stirling';
import type { PdfEngineTools } from '../../src/main/services/pdf-editor/python';

const cleanup = async (directory: string) => {
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(directory).startsWith('baglib-pdf-stirling-'));
  await rm(directory, { recursive: true, force: true });
};

function buildTestZip(entries: { name: string; data: Buffer; deflate?: boolean }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const method = entry.deflate ? 8 : 0;
    const compressed = entry.deflate ? deflateRawSync(entry.data) : entry.data;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    // Simulate Java ZipOutputStream bit 3 (0x0008) where sizes in local header are 0
    localHeader.writeUInt16LE(0x0008, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(0, 18);
    localHeader.writeUInt32LE(0, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0008, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, nameBuf, compressed);
    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

test('Stirling-PDF JAR version selector matches Tauri backend.rs semver and prerelease rules', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-stirling-jars-'));
  try {
    assert.ok(compareStirlingJarVersions('Stirling-PDF-server-3.10.0.jar', 'Stirling-PDF-server-3.9.0.jar') > 0);
    assert.ok(compareStirlingJarVersions('Stirling-PDF-server-3.2.2.jar', 'Stirling-PDF-server-3.2.2-rc.2.jar') > 0);
    assert.ok(compareStirlingJarVersions('Stirling-PDF-server-3.2.2-rc.2.jar', 'Stirling-PDF-server-3.2.2-rc.1.jar') > 0);
    assert.ok(compareStirlingJarVersions('Stirling-PDF-server-3.2.2-rc.1.jar', 'Stirling-PDF-server-3.2.2-beta.1.jar') > 0);
    assert.ok(compareStirlingJarVersions('Stirling-PDF-server-3.2.2-beta.1.jar', 'Stirling-PDF-server-3.2.2-alpha.1.jar') > 0);
    assert.ok(compareStirlingJarVersions('Stirling-PDF-server-3.2.2-alpha.1.jar', 'Stirling-PDF-server-3.2.2-snapshot.jar') > 0);

    for (const name of [
      'helper-99.0.0.jar',
      'Stirling-PDF-server-3.2.2-beta.1.jar',
      'Stirling-PDF-server-3.2.2-rc.1.jar',
      'Stirling-PDF-server-3.2.2.jar',
      'Stirling-PDF-server-3.1.9.jar',
    ]) {
      await writeFile(path.join(directory, name), 'jar');
    }
    const selected = selectNewestStirlingJar(directory);
    assert.equal(path.basename(selected ?? ''), 'Stirling-PDF-server-3.2.2.jar');
  } finally {
    await cleanup(directory);
  }
});

test('Stirling-PDF loopback validator enforces local-only HTTP origins without credentials', () => {
  assert.equal(canStirlingHandle('preview', { page: 2 }), true);
  assert.equal(canStirlingHandle('preview', { pages: [1, 2] }), true);
  assert.equal(validateStirlingLoopbackUrl('http://127.0.0.1:8080/api/v1'), 'http://127.0.0.1:8080');
  assert.equal(validateStirlingLoopbackUrl('http://localhost:19090'), 'http://localhost:19090');
  assert.throws(() => validateStirlingLoopbackUrl('https://stirlingpdf.io'), /permission-denied/u);
  assert.throws(() => validateStirlingLoopbackUrl('http://192.168.1.25:8080'), /permission-denied/u);
  assert.throws(() => validateStirlingLoopbackUrl('http://admin:secret@127.0.0.1:8080'), /permission-denied/u);
  assert.throws(() => validateStirlingLoopbackUrl('not-a-url'), /invalid-request/u);
});

test('Stirling-PDF loopback REST v1 adapter executes bilingual text edits, split ZIP extraction, encryption, validation and signature verification', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-stirling-api-'));
  const pdf1 = makePagePdf(1, Buffer.alloc(0));
  const pdf2 = makePagePdf(2, Buffer.alloc(0));
  const requests: { url: string; body: string }[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const reqUrl = req.url ?? '';
      requests.push({ url: reqUrl, body: rawBody });

      if (reqUrl === '/api/v1/info/status') { res.writeHead(200); res.end('UP'); return; }
      if (reqUrl === '/api/v1/general/overlay-pdfs') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(pdf2); return; }
      if (reqUrl === '/api/v1/general/edit-table-of-contents') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.end(pdf2);
        return;
      }

      if (reqUrl === '/api/v1/general/edit-text' || reqUrl === '/api/v1/general/rotate-pdf' || reqUrl === '/api/v1/security/add-password' || reqUrl === '/api/v1/security/redact' || reqUrl === '/api/v1/security/auto-redact') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.end(pdf2);
        return;
      }
      if (reqUrl === '/api/v1/general/split-pages') {
        const zip = buildTestZip([
          { name: 'split_1.pdf', data: pdf1, deflate: true },
          { name: 'split_2.pdf', data: pdf2, deflate: true },
        ]);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(zip);
        return;
      }
      if (reqUrl === '/api/v1/security/verify-pdf') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          {
            standard: 'PDF/A-2B',
            compliant: false,
            totalFailures: 1,
            failedChecks: [
              { specification: 'ISO 19005-2:2011', clause: '6.2.11.4', testNumber: 1, message: 'Font not embedded' },
            ],
          },
        ]));
        return;
      }
      if (reqUrl === '/api/v1/security/validate-signature') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
          {
            signatureId: 'Sig1',
            valid: true,
            chainValid: true,
            trustAnchor: true,
            selfSigned: false,
            signerName: 'CN=Baglib Scholarly Archive',
            serialNumber: 'ABCDEF123456',
            coversWholeDocument: true,
          },
        ]));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const sourcePath = path.join(directory, 'source.pdf');
    await writeFile(sourcePath, pdf1);
    const sourceHash = await fileSha256(sourcePath);
    const tools: PdfEngineTools = {
      python: path.join(directory, 'missing-python'),
      script: path.join(directory, 'missing-script.py'),
      tessdata: directory,
      stirlingUrl: baseUrl,
      preferStirling: true,
    };

    // 1. Capabilities
    const caps = await runStirlingPdf(
      tools,
      { filename: '', output: path.join(directory, 'caps.json'), operation: 'capabilities', language: 'ar', expectedHash: '' },
      new AbortController().signal,
      () => {},
    );
    assert.equal(caps.engine, 'Stirling-PDF 3.2.2');
    assert.ok(Array.isArray(caps.features) && caps.features.includes('edit-content') && caps.features.includes('validate'));

    // 2. Bilingual Find & Replace text edit (/api/v1/general/edit-text)
    assert.equal(canStirlingHandle('edit-content', { textReplacements: [{ find: 'مسودة', replace: 'نسخة محققة' }] }), true);
    assert.equal(canStirlingHandle('edit-content', { edits: [{ page: 1, kind: 'text', rect: [10, 10, 100, 40], text: 'hi' }] }), false);
    const editOutDir = path.join(directory, 'out-edit');
    const editRes = await runStirlingPdf(
      tools,
      {
        filename: sourcePath,
        output: path.join(editOutDir, 'document.html'),
        operation: 'edit-content',
        language: 'ar',
        expectedHash: sourceHash,
        payload: { textReplacements: [{ find: 'مسودة — Draft', replace: 'نسخة محققة — Verified Edition' }], wholeWordSearch: true },
      },
      new AbortController().signal,
      () => {},
    );
    assert.equal(editRes.outputs?.length, 1);
    assert.equal(editRes.outputs?.[0].sha256, await fileSha256(path.join(editOutDir, 'document.pdf')));
    assert.ok(requests.some(item => item.url === '/api/v1/general/edit-text' && item.body.includes('نسخة محققة — Verified Edition')));
    const inkResult = await runStirlingPdf(tools, { filename: sourcePath, output: path.join(directory, 'ink-output', 'document.pdf'), operation: 'edit-content', language: 'en', expectedHash: sourceHash, payload: { edits: [{ kind: 'ink-signature', page: 1, rect: [10, 20, 110, 70], strokes: [[[0, 0], [1, 1]]], color: '#3b82f6' }] } }, new AbortController().signal, () => {});
    assert.equal(inkResult.outputs?.length, 1);
    const inkRequest = requests.find(item => item.url === '/api/v1/general/overlay-pdfs')!;
    assert.ok(inkRequest.body.includes('name="overlayFiles"'));
    assert.ok(inkRequest.body.includes('SequentialOverlay'));
    assert.ok(inkRequest.body.includes('10.0000 980.0000 m'));

    for (const replaceExisting of [false, true]) {
      const toc = [{ title: 'المقدمة — Introduction', pageNumber: 1 }];
      const result = await runStirlingPdf(tools, {
        filename: sourcePath,
        output: path.join(directory, `toc-${replaceExisting}`, 'document.pdf'),
        operation: 'edit-toc', language: 'ar', expectedHash: sourceHash,
        payload: { toc, ...(replaceExisting ? { replaceExisting: true } : {}) },
      }, new AbortController().signal, () => {});
      assert.equal(result.outputs?.length, 1);
      const request = requests.filter(item => item.url === '/api/v1/general/edit-table-of-contents').at(-1)!;
      assert.ok(request.body.includes('name="bookmarkData"'));
      assert.ok(request.body.includes(JSON.stringify(toc)));
      assert.ok(request.body.includes(`name="replaceExisting"\r\n\r\n${replaceExisting}`));
      assert.equal(request.body.includes('name="toc"'), false);
    }

    // 3. Split with streaming ZIP Central Directory extraction (/api/v1/general/split-pages)
    const splitOutDir = path.join(directory, 'out-split');
    const splitRes = await runStirlingPdf(
      tools,
      {
        filename: sourcePath,
        output: path.join(splitOutDir, 'document.html'),
        operation: 'split',
        language: 'en',
        expectedHash: sourceHash,
        payload: { pageNumbers: '1,2' },
      },
      new AbortController().signal,
      () => {},
    );
    assert.equal(splitRes.outputs?.length, 2);
    assert.equal(splitRes.outputs?.[0].filename, 'part-0001.pdf');
    assert.equal(splitRes.outputs?.[1].filename, 'part-0002.pdf');

    // 4. Encrypt (/api/v1/security/add-password)
    const encOutDir = path.join(directory, 'out-enc');
    const encRes = await runStirlingPdf(
      tools,
      {
        filename: sourcePath,
        output: path.join(encOutDir, 'document.html'),
        operation: 'encrypt',
        language: 'en',
        expectedHash: sourceHash,
        payload: { mode: 'encrypt', ownerPassword: 'OwnerSecretPassword123', userPassword: 'UserRead123', bits: 256, permissions: { print: false, copy: false } },
      },
      new AbortController().signal,
      () => {},
    );
    assert.equal(encRes.outputs?.length, 1);
    assert.ok(requests.some(item => item.url === '/api/v1/security/add-password' && item.body.includes('OwnerSecretPassword123')));

    // 5. VeraPDF validation (/api/v1/security/verify-pdf)
    const valRes = await runStirlingPdf(
      tools,
      {
        filename: sourcePath,
        output: path.join(directory, 'val.html'),
        operation: 'validate',
        language: 'ar',
        expectedHash: sourceHash,
        payload: { profile: '2b' },
      },
      new AbortController().signal,
      () => {},
    );
    assert.equal(valRes.compliant, false);
    assert.equal(valRes.validator, 'Stirling-PDF/veraPDF');
    assert.equal((valRes.failures as { clause: string }[])[0].clause, '6.2.11.4');

    // 6. Signature verification (/api/v1/security/validate-signature)
    const sigRes = await runStirlingPdf(
      tools,
      {
        filename: sourcePath,
        output: path.join(directory, 'sig.html'),
        operation: 'verify-signatures',
        language: 'en',
        expectedHash: sourceHash,
      },
      new AbortController().signal,
      () => {},
    );
    assert.equal(sigRes.status, 'Verified');
    assert.equal((sigRes.signatures as { subject: string }[])[0].subject, 'CN=Baglib Scholarly Archive');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await cleanup(directory);
  }
});

test('extractZipEntries unpacks stored and deflated entries using Central Directory offsets', () => {
  const zip = buildTestZip([
    { name: 'folder/first.pdf', data: Buffer.from('%PDF-1.4 stored'), deflate: false },
    { name: 'folder/second.pdf', data: Buffer.from('%PDF-1.4 deflated بِسْمِ اللَّهِ'), deflate: true },
  ]);
  const extracted = extractZipEntries(zip);
  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].name, 'first.pdf');
  assert.equal(extracted[0].data.toString('utf8'), '%PDF-1.4 stored');
  assert.equal(extracted[1].name, 'second.pdf');
  assert.equal(extracted[1].data.toString('utf8'), '%PDF-1.4 deflated بِسْمِ اللَّهِ');
});

test('background Java warm-up cancelled during preflight never creates a runtime or starts a child', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-stirling-cancel-'));
  const sidecar = new StirlingSidecarService();
  try {
    const javaRoot = path.join(directory, 'java');
    await mkdir(path.join(javaRoot, 'bin'), { recursive: true });
    const javaPath = path.join(javaRoot, 'bin', 'java.exe');
    await writeFile(javaPath, 'must never execute');
    await writeFile(path.join(javaRoot, 'release'), 'JAVA_VERSION="25.0.1"\n');
    const jarPath = path.join(directory, 'server.jar');
    await writeFile(jarPath, buildTestZip([{ name: 'META-INF/MANIFEST.MF', data: Buffer.from('Build-Jdk-Spec: 25\n') }]));
    const workDir = path.join(directory, 'must-not-start');
    const startup = sidecar.ensureStarted({ javaPath, jarPath, workDir });
    const rejected = assert.rejects(startup, /^Error: cancelled$/u);
    await sidecar.stop();
    await rejected;
    assert.equal(sidecar.getStatus().status, 'stopped');
    await assert.rejects(access(workDir));
  } finally {
    await sidecar.stop();
    await cleanup(directory);
  }
});

test('Java preflight reads release and application bytecode, ignoring nested libraries and older Boot launcher', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-stirling-preflight-'));
  try {
    const javaRoot = path.join(directory, 'java', 'jdk-21');
    await mkdir(path.join(javaRoot, 'bin'), { recursive: true });
    const javaPath = path.join(javaRoot, 'bin', 'java.exe');
    await writeFile(javaPath, 'not an executable: preflight must never spawn it');
    await writeFile(path.join(javaRoot, 'release'), 'IMPLEMENTOR="Eclipse Adoptium"\nJAVA_VERSION="21.0.9"\n');
    assert.equal(await checkJavaMajorVersion(javaPath), 21);
    const bytecode = (major: number) => { const bytes = Buffer.alloc(8); bytes.writeUInt32BE(0xcafebabe); bytes.writeUInt16BE(major, 6); return bytes; };
    const jarPath = path.join(directory, 'server.jar');
    await writeFile(jarPath, buildTestZip([
      { name: 'META-INF/MANIFEST.MF', data: Buffer.from('Manifest-Version: 1.0\nBuild-Jdk-Spec: 21\n'), deflate: true },
      { name: 'org/springframework/boot/Loader.class', data: bytecode(61), deflate: true },
      { name: 'BOOT-INF/lib/unrelated.jar', data: Buffer.alloc(2 * 1024 * 1024, 65), deflate: true },
      { name: 'BOOT-INF/classes/App.class', data: bytecode(69), deflate: true },
    ]));
    assert.equal(inspectJarMinimumJavaVersion(jarPath), 25);
    const workDir = path.join(directory, 'must-not-start');
    const sidecar = new StirlingSidecarService();
    const start = performance.now();
    await assert.rejects(sidecar.ensureStarted({ javaPath, jarPath, workDir }), /^Error: engine-missing$/u);
    const elapsed = performance.now() - start;
    t.diagnostic(`Cached Java 21 / class-major 69 mismatch rejected in ${elapsed.toFixed(3)} ms`);
    assert.ok(elapsed < 20, `preflight took ${elapsed} ms`);
    await assert.rejects(access(workDir));
    await writeFile(path.join(javaRoot, 'release'), 'JAVA_VERSION="25.0.1"\n');
    assert.equal(await checkJavaMajorVersion(javaPath), 25);
    const legacyPath = path.join(directory, 'legacy.jar');
    await writeFile(legacyPath, buildTestZip([{ name: 'META-INF/MANIFEST.MF', data: Buffer.from('Created-By: 1.8.0_202 (Oracle)\n') }]));
    assert.equal(inspectJarMinimumJavaVersion(legacyPath), 8);
    const manifestPath = path.join(directory, 'manifest.jar');
    await writeFile(manifestPath, buildTestZip([{ name: 'META-INF/MANIFEST.MF', data: Buffer.from('Build-Jdk-Spec: 25\n') }]));
    assert.equal(inspectJarMinimumJavaVersion(manifestPath), 25);
    const classPath = path.join(directory, 'class.jar');
    await writeFile(classPath, buildTestZip([{ name: 'App.class', data: bytecode(69) }]));
    assert.equal(inspectJarMinimumJavaVersion(classPath), 25);
  } finally { await cleanup(directory); }
});

test('readiness is bounded, falls back to HEAD, preserves cancellation and never uploads offline', async () => {
  const methods: string[] = [];
  let mode: 'head' | 'hang' | 'denied' = 'head';
  const server = http.createServer((req, res) => {
    methods.push(`${req.method} ${req.url}`);
    if (mode === 'hang') return;
    res.writeHead(mode === 'denied' ? 403 : req.method === 'HEAD' ? 200 : 404); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await probeStirlingReadiness(url, new AbortController().signal);
    assert.deepEqual(methods, ['GET /api/v1/info/status', 'HEAD /']);
    mode = 'denied';
    await assert.rejects(probeStirlingReadiness(url, new AbortController().signal), /permission-denied/u);
    mode = 'hang';
    const start = performance.now();
    await assert.rejects(probeStirlingReadiness(url, new AbortController().signal, 40), /engine-missing/u);
    assert.ok(performance.now() - start < 1000);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(probeStirlingReadiness(url, controller.signal), /cancelled/u);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  await assert.rejects(runStirlingPdf(
    { python: '', script: '', tessdata: '', stirlingUrl: url },
    { filename: 'missing-large-source.pdf', output: 'unused.pdf', operation: 'edit-content', language: 'en', expectedHash: '', payload: { textReplacements: [{ find: 'x', replace: 'y' }] } },
    new AbortController().signal, () => {},
  ), /engine-missing/u);
  assert.ok(methods.every(method => !method.startsWith('POST')));
});

test('organizer routes deletion, reorder, crop and ordered source-range merges without trusting source hashes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-stirling-organize-'));
  const requests: { url: string; body: string }[] = [];
  const sourcePdf = makePagePdf(4, Buffer.alloc(0));
  const server = http.createServer((req, res) => {
    if (req.url === '/api/v1/info/status') { res.writeHead(200); res.end('UP'); return; }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => { requests.push({ url: req.url || '', body: Buffer.concat(chunks).toString('utf8') }); res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(sourcePdf); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const filename = path.join(directory, 'source.pdf');
    const imported = path.join(directory, 'imported.pdf');
    await writeFile(filename, sourcePdf); await writeFile(imported, makePagePdf(3, Buffer.alloc(0)));
    const tools: PdfEngineTools = { python: '', script: '', tessdata: '', stirlingUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
    const base = { filename, output: path.join(directory, 'out', 'result.pdf'), operation: 'organize' as const, language: 'en' as const, expectedHash: await fileSha256(filename), sources: { imported: { filename: imported, sha256: await fileSha256(imported) } } };
    const run = (payload: Record<string, unknown>) => runStirlingPdf(tools, { ...base, payload }, new AbortController().signal, () => {});
    await run({ pages: [{ page: 1 }, { page: 3 }] });
    assert.equal(requests.at(-1)?.url, '/api/v1/general/remove-pages');
    assert.match(requests.at(-1)!.body, /name="pageNumbers"\r\n\r\n2,4\r\n/u);
    await run({ pages: [{ page: 3 }, { page: 1 }, { page: 3 }] });
    assert.equal(requests.at(-1)?.url, '/api/v1/general/rearrange-pages');
    assert.match(requests.at(-1)!.body, /name="pageNumbers"\r\n\r\n3,1,3\r\n/u);
    await run({ crop: { x: 12, y: 25, width: 300, height: 500 } });
    assert.equal(requests.at(-1)?.url, '/api/v1/general/crop');
    assert.match(requests.at(-1)!.body, /name="y"\r\n\r\n25\r\n/u);
    assert.match(requests.at(-1)!.body, /name="width"\r\n\r\n300\r\n/u);
    requests.length = 0;
    await run({ pages: [{ page: 1 }, { page: 2 }, { page: 2, sessionId: 'imported' }, { page: 3, sessionId: 'imported' }], crop: { x: 0, y: 0, width: 300, height: 500 } });
    assert.deepEqual(requests.map(item => item.url), ['/api/v1/general/remove-pages', '/api/v1/general/remove-pages', '/api/v1/general/merge-pdfs', '/api/v1/general/crop']);
    const merge = requests[2].body;
    assert.equal([...merge.matchAll(/name="fileInput"/gu)].length, 2);
    assert.match(merge, /name="sortType"\r\n\r\norderProvided\r\n/u);
    assert.match(merge, /name="removeCertSign"\r\n\r\ntrue\r\n/u);
    requests.length = 0;
    await run({ pages: [...[1, 2, 3, 4].map(page => ({ page })), ...[1, 2, 3].map(page => ({ page, sessionId: 'imported' }))] });
    assert.deepEqual(requests.map(item => item.url), ['/api/v1/general/merge-pdfs']);
    requests.length = 0;
    await writeFile(imported, sourcePdf);
    await assert.rejects(run({ pages: [{ page: 1 }, { page: 1, sessionId: 'imported' }] }), /source-changed/u);
    assert.equal(requests.length, 0);
    await assert.rejects(run({ pages: [{ page: 99 }] }), /invalid-request/u);
    await assert.rejects(run({ crop: { x: 0, y: 0, width: -1, height: 5 } }), /invalid-request/u);
    assert.equal(canStirlingHandle('organize', { pages: [{ page: 1, sessionId: 'imported' }] }), true);
    assert.equal(canStirlingHandle('organize', { pages: [{ blank: true }] }), true);
    assert.equal(canStirlingHandle('organize', { pages: [{ page: 1, rotation: 90 }] }), true);
    assert.equal(canStirlingHandle('organize', { pages: [{ page: 1, rotation: 45 }] }), false);
    await assert.rejects(run({ pages: [{ page: Number.NaN }] }), /invalid-request/u);
    assert.equal(canStirlingHandle('edit-content', { textReplacements: [{ find: 'a', replace: 'b' }], images: [{}] }), false);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await cleanup(directory);
  }
});

test('XLSX export uses the Core Tabula endpoint and reports an empty table result', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-stirling-xlsx-'));
  const requests: string[] = [];
  let empty = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/v1/info/status') { res.writeHead(200); res.end('UP'); return; }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push(`${req.url}\n${Buffer.concat(chunks).toString('utf8')}`);
      if (empty) { res.writeHead(204); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      res.end(buildTestZip([{ name: '[Content_Types].xml', data: Buffer.from('<Types/>') }]));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const filename = path.join(directory, 'source.pdf'); await writeFile(filename, makePagePdf(1, Buffer.alloc(0)));
    const tools: PdfEngineTools = { python: '', script: '', tessdata: '', stirlingUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
    const input = { filename, output: path.join(directory, 'out', 'result.xlsx'), expectedHash: await fileSha256(filename), operation: 'export-xlsx' as const, language: 'ar' as const, payload: { pageNumbers: '1' } };
    const result = await runStirlingPdf(tools, input, new AbortController().signal, () => {});
    assert.equal(canStirlingHandle('export-xlsx'), true);
    assert.equal(result.outputs?.[0].format, 'xlsx');
    assert.match(requests[0], /^\/api\/v1\/convert\/pdf\/xlsx\n/u);
    assert.match(requests[0], /name="useStirlingOfficeConvert"\r\n\r\nfalse\r\n/u);
    assert.match(requests[0], /name="pageNumbers"\r\n\r\n1\r\n/u);
    empty = true;
    await assert.rejects(runStirlingPdf(tools, input, new AbortController().signal, () => {}), /no-tables/u);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await cleanup(directory); }
});


test('RTL JSON preserves a measured right edge and refuses speculative reconstruction', () => {
  const make = () => ({ pages: [{ contentStreams: [], textElements: [
    { text: 'قديم', fontId: 'F1', fontSize: 12, width: 40, textMatrix: [1, 0, 0, 1, 160, 500], charCodes: [1, 2] },
    { text: 'جديد', fontId: 'F1', fontSize: 12, width: 30, x: 50, y: 450 },
  ] }] });
  const model = make();
  assert.equal(applyRtlJsonReplacements(model, [{ find: 'قديم', replace: 'جديد' }], true), 1);
  const run = model.pages[0].textElements[0];
  assert.equal(run.text, 'جديد');
  assert.equal(run.x, 170);
  assert.equal(run.textMatrix?.[4], 170);
  assert.equal(run.x! + run.width, 200);
  assert.equal(run.charCodes, undefined);
  const streams = { ...make(), pages: [{ ...make().pages[0], contentStreams: [{ data: 'original vector/text stream' }] }] };
  assert.throws(() => applyRtlJsonReplacements(streams, [{ find: 'قديم', replace: 'جديد' }], false), /engine-missing/u);
  assert.throws(() => applyRtlJsonReplacements(make(), [{ find: 'قديم', replace: 'غير مقاس' }], false), /engine-missing/u);
  assert.throws(() => applyRtlJsonReplacements({ ...make(), lazyImages: true }, [{ find: 'قديم', replace: 'جديد' }], false), /engine-missing/u);
  assert.throws(() => applyRtlJsonReplacements(make(), [{ find: '', replace: 'x' }], false), /invalid-request/u);
  const word = make(); word.pages[0].textElements[0].text = 'القديم';
  assert.equal(applyRtlJsonReplacements(word, [{ find: 'قديم', replace: 'جديد' }], true), 0);
});

test('RTL JSON endpoints round-trip and only missing endpoints fall back to legacy edits', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-stirling-rtl-'));
  let mode: 'json' | 'export-missing' | 'import-missing' | 'broken' | 'denied' | 'streams' = 'json';
  const requests: { url: string; body: string }[] = [];
  const pdf = makePagePdf(1, Buffer.alloc(0));
  const server = http.createServer((req, res) => {
    if (req.url === '/api/v1/info/status') { res.writeHead(200); res.end(); return; }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ url: req.url || '', body: Buffer.concat(chunks).toString('utf8') });
      if (req.url === '/api/v1/convert/pdf/text-editor') {
        if (mode === 'export-missing' || mode === 'broken' || mode === 'denied') {
          res.writeHead(mode === 'export-missing' ? 404 : mode === 'denied' ? 403 : 500); res.end(); return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ metadata: { title: 'أصل Original' }, fonts: [{ id: 'F1' }], pages: [{ contentStreams: mode === 'streams' ? [{ data: 'preserved' }] : [], textElements: [
          { text: 'قديم', fontId: 'F1', fontSize: 12, width: 40, textMatrix: [1, 0, 0, 1, 160, 500], charCodes: [1, 2] },
          { text: 'جديد', fontId: 'F1', fontSize: 12, width: 30, x: 50, y: 450 },
        ] }] })); return;
      }
      if (req.url === '/api/v1/convert/text-editor/pdf' && mode === 'import-missing') { res.writeHead(405); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(pdf);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const filename = path.join(directory, 'source.pdf'); await writeFile(filename, pdf);
    const tools = { python: '', script: '', tessdata: '', stirlingUrl: 'http://127.0.0.1:' + (server.address() as { port: number }).port };
    const input = { filename, output: path.join(directory, 'out', 'document.pdf'), expectedHash: await fileSha256(filename), operation: 'edit-content' as const, language: 'ar' as const, payload: { textReplacements: [{ find: 'قديم', replace: 'جديد' }], wholeWordSearch: true } };
    const run = () => runStirlingPdf(tools, input, new AbortController().signal, () => {});
    assert.equal((await run()).outputs?.length, 1);
    assert.deepEqual(requests.map(item => item.url), ['/api/v1/convert/pdf/text-editor', '/api/v1/convert/text-editor/pdf']);
    assert.ok(requests[0].body.includes('name="lightweight"'));
    assert.ok(requests[1].body.includes('"textMatrix":[1,0,0,1,170,500]'));
    assert.ok(requests[1].body.includes('أصل Original'));
    assert.ok(!requests[1].body.includes('"charCodes"'));
    for (const missing of ['export-missing', 'import-missing'] as const) {
      mode = missing; requests.length = 0; await run();
      assert.equal(requests.at(-1)?.url, '/api/v1/general/edit-text');
      assert.ok(requests.at(-1)!.body.includes('name="wholeWordSearch"'));
    }
    for (const [failure, error] of [['broken', 'engine-failed'], ['denied', 'permission-denied'], ['streams', 'engine-missing']] as const) {
      mode = failure; requests.length = 0;
      await assert.rejects(run(), new RegExp(error));
      assert.ok(!requests.some(item => item.url === '/api/v1/general/edit-text'));
    }
    mode = 'json'; requests.length = 0;
    await runStirlingPdf(tools, { ...input, payload: { ...input.payload, rtlAwareJsonRoundTrip: false } }, new AbortController().signal, () => {});
    assert.deepEqual(requests.map(item => item.url), ['/api/v1/general/edit-text']);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await cleanup(directory); }
});

test('Stirling-PDF extended endpoints: chapters/size split, crop, document-properties, basic-info, and convert-file-pdf', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'baglib-pdf-stirling-'));
  const requests: { url: string; body: string }[] = [];
  const pdf = makePagePdf(1, Buffer.alloc(0));
  const server = http.createServer((req, res) => {
    if (req.url === '/api/v1/info/status') { res.writeHead(200); res.end(); return; }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ url: req.url || '', body: Buffer.concat(chunks).toString('utf8') });
      if (req.url === '/api/v1/analysis/document-properties') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ title: 'كتاب الفقه', author: 'البخاري' }));
        return;
      }
      if (req.url === '/api/v1/analysis/basic-info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pageCount: 1, pdfVersion: 1.4 }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(pdf);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const filename = path.join(directory, 'source.pdf');
    await writeFile(filename, pdf);
    const expectedHash = await fileSha256(filename);
    const tools = { python: '', script: '', tessdata: '', stirlingUrl: 'http://127.0.0.1:' + (server.address() as { port: number }).port };

    // 1. Chapter Split
    requests.length = 0;
    const splitChapters = await runStirlingPdf(tools, {
      filename,
      output: path.join(directory, 'out', 'chapter.pdf'),
      expectedHash,
      operation: 'split' as const,
      language: 'ar' as const,
      payload: { splitType: 'chapters', bookmarkLevel: 1 },
    }, new AbortController().signal, () => {});
    assert.equal(requests[0].url, '/api/v1/general/split-pdf-by-chapters');
    assert.ok(requests[0].body.includes('name="bookmarkLevel"'));
    assert.equal(splitChapters.outputs?.length, 1);

    // 2. Size / Count Split
    requests.length = 0;
    const splitSize = await runStirlingPdf(tools, {
      filename,
      output: path.join(directory, 'out', 'part.pdf'),
      expectedHash,
      operation: 'split' as const,
      language: 'en' as const,
      payload: { splitType: 'count', splitValue: '2' },
    }, new AbortController().signal, () => {});
    assert.equal(requests[0].url, '/api/v1/general/split-by-size-or-count');
    assert.ok(requests[0].body.includes('name="splitType"\r\n\r\n1'));
    assert.ok(requests[0].body.includes('name="splitValue"\r\n\r\n2'));
    assert.equal(splitSize.outputs?.length, 1);

    // 3. Standalone Crop
    requests.length = 0;
    const cropResult = await runStirlingPdf(tools, {
      filename,
      output: path.join(directory, 'out', 'cropped.pdf'),
      expectedHash,
      operation: 'crop' as const,
      language: 'en' as const,
      payload: { x: 10, y: 20, width: 300, height: 400 },
    }, new AbortController().signal, () => {});
    assert.equal(requests[0].url, '/api/v1/general/crop');
    assert.ok(requests[0].body.includes('name="x"\r\n\r\n10'));
    assert.ok(requests[0].body.includes('name="height"\r\n\r\n400'));
    assert.equal(cropResult.outputs?.length, 1);

    // 4. Document Properties & Basic Info
    requests.length = 0;
    const docProps = await runStirlingPdf(tools, {
      filename,
      output: path.join(directory, 'out', 'props.pdf'),
      expectedHash,
      operation: 'document-properties' as const,
      language: 'ar' as const,
    }, new AbortController().signal, () => {});
    assert.equal(requests[0].url, '/api/v1/analysis/document-properties');
    assert.equal((docProps.properties as Record<string, unknown>).title, 'كتاب الفقه');

    requests.length = 0;
    const basicInfo = await runStirlingPdf(tools, {
      filename,
      output: path.join(directory, 'out', 'info.pdf'),
      expectedHash,
      operation: 'basic-info' as const,
      language: 'en' as const,
    }, new AbortController().signal, () => {});
    assert.equal(requests[0].url, '/api/v1/analysis/basic-info');
    assert.equal((basicInfo.info as Record<string, unknown>).pageCount, 1);

    // 5. Convert File to PDF
    requests.length = 0;
    const convertFile = await runStirlingPdf(tools, {
      filename,
      output: path.join(directory, 'out', 'converted.pdf'),
      expectedHash,
      operation: 'convert-file-pdf' as const,
      language: 'en' as const,
      payload: { fileType: 'html' },
    }, new AbortController().signal, () => {});
    assert.equal(requests[0].url, '/api/v1/convert/html/pdf');
    assert.equal(convertFile.outputs?.length, 1);

    // Verify canStirlingHandle returns true for all of them
    assert.equal(canStirlingHandle('crop'), true);
    assert.equal(canStirlingHandle('document-properties'), true);
    assert.equal(canStirlingHandle('basic-info'), true);
    assert.equal(canStirlingHandle('convert-file-pdf'), true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await cleanup(directory);
  }
});

