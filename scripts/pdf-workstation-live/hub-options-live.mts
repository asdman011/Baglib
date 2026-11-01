// Live audit: runs every Hub tool through the real pipeline on its defaults and on each option choice, and checks the results.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPdfDocument, defaultStirlingSidecar, selectNewestStirlingJar } from '../../src/main/services/pdf-editor/stirling';
import { StirlingProcessorService } from '../../src/main/services/pdf-editor/processor';
import { ADDITIONAL_FILES, STIRLING_TOOL_OPTIONS, applyToolOption, defaultToolValues, missingToolOption, optionVisible, toolParameters, type ToolOptionValues } from '../../src/renderer/components/pdf-workstation/stirling-tool-options';
import { STIRLING_INTERACTIVE_ENDPOINTS } from '../../src/shared/stirling-contract';

const root = path.resolve('.baglib-data/pdf-engine');
const java = path.join(root, 'java', 'jdk-25.0.5+8-jre', 'bin', 'java.exe');
const tools = { python: path.join(root, 'venv', 'Scripts', 'python.exe'), script: path.resolve('assets/pdf-editor/engine.py'), tessdata: path.join(root, 'tessdata'), java, stirlingJar: selectNewestStirlingJar(path.join(root, 'stirling'))!, preferStirling: true };
const directory = mkdtempSync(path.join(os.tmpdir(), 'baglib-hub-live-'));
const service = new StirlingProcessorService(directory);
const write = (name: string, content: string | Buffer) => { const file = path.join(directory, name); writeFileSync(file, content); return file; };
const source = write('سند source.pdf', createPdfDocument(['Page one sample@example.com', 'Page two', 'Page three', 'Page four']));
const other = write('other.pdf', createPdfDocument(['Other one', 'Other two']));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const image = write('image.png', png);
const keystore = path.join(directory, 'signer.p12');
const keytool = path.join(path.dirname(java), 'keytool.exe');
if (existsSync(keytool)) execFileSync(keytool, ['-genkeypair', '-alias', 'baglib', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '2', '-dname', 'CN=Baglib Test', '-storetype', 'PKCS12', '-keystore', keystore, '-storepass', 'testpass', '-keypass', 'testpass'], { stdio: 'ignore' });

const jks = path.join(directory, 'signer.jks');
if (existsSync(keytool)) execFileSync(keytool, ['-genkeypair', '-alias', 'baglib', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '2', '-dname', 'CN=Baglib Test', '-storetype', 'JKS', '-keystore', jks, '-storepass', 'testpass', '-keypass', 'testpass'], { stdio: 'ignore' });
// PEM signing needs a loose certificate and key, which keytool cannot export.
const pemCert = path.join(directory, 'signer.crt'), pemKey = path.join(directory, 'signer.key');
try { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=Baglib Test', '-keyout', pemKey, '-out', pemCert], { stdio: 'ignore' }); execFileSync('openssl', ['rsa', '-in', pemKey, '-traditional', '-out', pemKey], { stdio: 'ignore' }); } catch { /* the PEM choice then reports its missing sample */ }
// A real book supplies the bookmarks and images a generated fixture lacks; a copy keeps the original out of reach.
const book = path.join(directory, 'book.pdf');
if (existsSync('F:\\كتب\\Books\\Books\\egypt-inequality-book.pdf')) copyFileSync('F:\\كتب\\Books\\Books\\egypt-inequality-book.pdf', book);
const hub = readFileSync('src/renderer/components/pdf-workstation/StirlingToolsHub.tsx', 'utf8');
const hubTools = [...hub.matchAll(/id: '([^']+)',\s*category: '[^']+',[\s\S]*?endpoint: '([^']+)'/gu)].map(match => ({ id: match[1], endpoint: match[2] }));
const samples: Record<string, ToolOptionValues> = {
  'extract-pages': { pageNumbers: '2,4' }, merge: { [ADDITIONAL_FILES]: [other] }, reorder: { pageNumbers: '4,3,2,1' }, 'remove-pages': { pageNumbers: '2' }, split: { pageNumbers: '2' },
  'add-password': { password: 'user-pass', ownerPassword: 'owner-pass' }, 'change-permissions': { sourcePassword: 'owner-pass', ownerPassword: 'new-owner' }, 'compress-pdf': { expectedOutputSize: '1MB' }, 'add-stamp': { stampText: 'BAGLIB', stampImage: image }, watermark: { watermarkText: 'BAGLIB', watermarkImage: image },
  'auto-redact': { listOfText: 'sample' }, 'remove-password': { password: 'owner-pass', ownerPassword: 'owner-pass', retainedOpeningPassword: 'user-pass' }, 'cert-sign': { p12File: keystore, jksFile: jks, ...(existsSync(pemCert) ? { certFile: pemCert, privateKeyFile: pemKey } : {}), password: 'testpass', reason: 'Audit', location: 'Baglib', name: 'Tester' },
  'add-image': { imageFile: image }, 'overlay-pdfs': { overlayFiles: [other], counts: '1' }, 'filter-contains-text': { text: 'Page' }, 'edit-metadata': { title: 'عنوان', author: 'Tester' },
};
const inputs: Record<string, () => string> = {
  'split-by-chapters': () => book, 'extract-images': () => book, 'repair-pdf': () => book, 'markdown-to-pdf': () => write('note.md', '# عنوان\n\nبحث'), 'html-to-pdf': () => write('page.html', '<h1>Title</h1>'), 'img-to-pdf': () => image, 'convert-file-to-pdf': () => write('note.txt', 'Text file'),
};
const pageCounts = async (file: string) => { const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); const loading = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }); const document = await loading.promise; const pages = document.numPages; await loading.destroy(); return pages; };
const expectedPages: Record<string, number> = { 'extract-pages': 2, 'remove-pages': 3, merge: 6, rotate: 4, reorder: 4, 'add-stamp': 4, watermark: 4 };

let passed = 0;
const missingSettings: string[] = [];
const failures: string[] = [], unavailable = new Map<string, string>(), noMatch: string[] = [];
const run = async (id: string, endpoint: string, values: ToolOptionValues, input: string, label: string) => {
  const missing = missingToolOption(id, values);
  if (missing) { failures.push(`${label}: required ${missing.name} has no sample`); return null; }
  const additional = (values[ADDITIONAL_FILES] as string[] | undefined) ?? [];
  try {
    const result = await service.executePipeline(tools as never, [input, ...additional], { name: label, singleTool: true, pipeline: [{ operation: endpoint, parameters: toolParameters(id, values) }] }, AbortSignal.timeout(90_000));
    if (label === id && expectedPages[id] !== undefined && result.format === 'pdf') {
      const pages = await pageCounts(result.outputPath);
      if (pages !== expectedPages[id]) failures.push(`${label}: ${pages} pages, expected ${expectedPages[id]}`);
    }
    passed++;
    return result;
  } catch (error) {
    const code = (error as Error).message;
    if (code === 'engine-missing') { unavailable.set(id, code); missingSettings.push(label); }
    else if (code === 'no-output' && /^filter-/u.test(id)) noMatch.push(label);
    else failures.push(`${label}: ${code}`);
    return null;
  }
};

let protectedPdf = source;
const needsPassword = (id: string) => Number(id === 'remove-password' || id === 'change-permissions');
const ordered = [...hubTools].sort((first, second) => needsPassword(first.id) - needsPassword(second.id));
for (const { id, endpoint } of ordered) {
  if (STIRLING_INTERACTIVE_ENDPOINTS.has(endpoint) || id === 'pipeline-processor' || id === 'url-to-pdf') continue;
  const input = needsPassword(id) ? protectedPdf : inputs[id]?.() ?? source;
  const base: ToolOptionValues = { ...defaultToolValues(id), ...samples[id] };
  const first = await run(id, endpoint, base, input, id);
  if (id === 'add-password' && first) protectedPdf = first.outputPath;
  else if (first) unlinkSync(first.outputPath);
  if (!first && unavailable.has(id)) continue;
  for (const option of STIRLING_TOOL_OPTIONS[id] ?? []) {
    const variants = option.kind === 'select' ? option.choices!.map(choice => choice.value).filter(value => value !== base[option.name]) : option.kind === 'toggle' ? [!base[option.name]] : [];
    for (const variant of variants) {
      const values = applyToolOption(id, base, option.name, variant);
      // A mode change clears the fields it shares, so put the sample inputs back.
      for (const [name, value] of Object.entries(samples[id] ?? {})) if (!values[name]) values[name] = value;
      if (id === 'change-permissions' && values.preserveExisting) delete values.ownerPassword;
      if (!optionVisible(option, base) && !optionVisible(option, values)) continue;
      const result = await run(id, endpoint, values, input, `${id} ${option.name}=${variant}`);
      if (result) unlinkSync(result.outputPath);
    }
  }
}
// Behaviour the sweep above cannot see: these read the output, not just the job's success.
const textOf = (file: string) => execFileSync(path.join(root, 'poppler', 'poppler-26.09.0', 'Library', 'bin', 'pdftotext.exe'), [file, '-']).toString().split('\f').map(page => page.replace(/\s+/gu, ' ').trim()).filter(Boolean);
const rawPages = (file: string) => execFileSync(path.join(root, 'poppler', 'poppler-26.09.0', 'Library', 'bin', 'pdftotext.exe'), [file, '-']).toString().split('\f').map(page => page.replace(/\s+/gu, ' ').trim());
const check = (label: string, passes: boolean, detail: unknown) => { if (passes) passed++; else failures.push(`${label}: ${JSON.stringify(detail)}`); };
const toolEndpoint = (id: string) => hubTools.find(tool => tool.id === id)!.endpoint;
const numbered = await run('add-page-numbers', toolEndpoint('add-page-numbers'), { ...defaultToolValues('add-page-numbers'), pagesToNumber: '2' }, source, 'numbers only page 2');
// The fixture's own text extracts poorly, so compare pages with the source rather than with literals.
if (numbered) { const before = rawPages(source), after = rawPages(numbered.outputPath); check('numbers only page 2', before[0] === after[0] && before[1] !== after[1] && before[2] === after[2] && before[3] === after[3], { before, after }); }
const annotated = path.join(directory, 'annotated.pdf');
const annotate = write('annotate.py', `
import sys, pikepdf
pdf = pikepdf.open(sys.argv[1])
page = pdf.pages[0]
make = lambda subtype: pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot, Subtype=subtype, Rect=[10, 10, 50, 50]))
page.Annots = pikepdf.Array([make(pikepdf.Name.Text), make(pikepdf.Name.Link), make(pikepdf.Name.Widget), make(pikepdf.Name.Highlight)])
pdf.save(sys.argv[2])
`);
const subtypes = write('subtypes.py', `
import sys, pikepdf
pdf = pikepdf.open(sys.argv[1])
print(sorted(str(item.Subtype) for item in pdf.pages[0].get('/Annots', [])))
`);
execFileSync(tools.python, [annotate, source, annotated]);
const remaining = async (values: ToolOptionValues) => { const result = await run('remove-annotations', toolEndpoint('remove-annotations'), values, annotated, `annotations ${JSON.stringify(values)}`); return result ? execFileSync(tools.python, [subtypes, result.outputPath]).toString().trim() : ''; };
check('comments go, links and fields stay', (await remaining(defaultToolValues('remove-annotations'))) === "['/Link', '/Widget']", 'defaults');
check('everything can go', (await remaining({ keepLinks: false, keepFormFields: false })) === '[]', 'all off');
const dated = await run('edit-metadata', toolEndpoint('edit-metadata'), { ...defaultToolValues('edit-metadata'), title: 'T', creationDate: '2020/02/03 04:05:06', trapped: 'True' }, source, 'metadata dates');
const docinfo = write('docinfo.py', `
import sys, pikepdf
pdf = pikepdf.open(sys.argv[1])
print(str(pdf.docinfo.get('/CreationDate', '')), str(pdf.docinfo.get('/Trapped', '')))
`);
if (dated) { const info = execFileSync(tools.python, [docinfo, dated.outputPath]).toString(); check('metadata dates written', info.includes('D:20200203040506') && info.includes('/True'), info); }
const stamped = await run('add-stamp', toolEndpoint('add-stamp'), { ...defaultToolValues('add-stamp'), stampText: 'EXACT', customPlacement: true, overrideX: 100, overrideY: 200, position: undefined as never }, source, 'exact stamp');
if (stamped) { const boxes = execFileSync(path.join(root, 'poppler', 'poppler-26.09.0', 'Library', 'bin', 'pdftotext.exe'), ['-bbox', '-f', '1', '-l', '1', stamped.outputPath, '-']).toString(); check('exact stamp position', /xMin="100\.\d*"[^>]*>EXACT/u.test(boxes), boxes.slice(0, 300)); }
const failsWith = async (id: string, values: ToolOptionValues, input: string, code: string) => {
  try { await service.executePipeline(tools as never, [input], { name: id, singleTool: true, pipeline: [{ operation: toolEndpoint(id), parameters: toolParameters(id, values) }] }, AbortSignal.timeout(90_000)); check(`${id} should fail`, false, 'succeeded'); }
  catch (error) { check(`${id} reports ${code}`, (error as Error).message === code, (error as Error).message); }
};
const replaced = await run('change-permissions', toolEndpoint('change-permissions'), { ...defaultToolValues('change-permissions'), preserveExisting: true, sourcePassword: 'owner-pass', password: 'user-pass', ownerPassword: 'replaced-owner' }, protectedPdf, 'replace permissions password');
if (replaced) unlinkSync(replaced.outputPath);
await failsWith('remove-password', { removeMode: 'all', password: 'wrong' }, protectedPdf, 'encrypted');
await failsWith('remove-password', { removeMode: 'all', password: 'user-pass' }, protectedPdf, 'owner-password-required');
if (existsSync(book)) await failsWith('auto-redact', { ...defaultToolValues('auto-redact'), listOfText: 'Inequality' }, book, 'redaction-unverified');
const afterFailure = await run('rotate', toolEndpoint('rotate'), defaultToolValues('rotate'), source, 'engine works after a failed redaction');
if (afterFailure) unlinkSync(afterFailure.outputPath);
if (process.argv[2]) {
  // A PDF with the composite fonts the redactor accepts; expected hits are counted from its text.
  const composite = process.argv[2];
  for (const [name, gone] of [['email', 'amal.saad_1@example.org'], ['phone', '4567'], ['card', '4111'], ['date', '03/02/2020']] as const) {
    const result = await run('auto-redact', toolEndpoint('auto-redact'), applyToolOption('auto-redact', defaultToolValues('auto-redact'), 'redactPattern', name), composite, `preset ${name}`);
    if (result) { const text = textOf(result.outputPath).join(' '); check(`preset ${name} removes its match`, !text.includes(gone), text.slice(0, 160)); }
  }
}
console.log(`passed ${passed}, failed ${failures.length}, unavailable tools ${unavailable.size}`);
console.log('FAILED', JSON.stringify(failures, null, 1));
console.log('UNAVAILABLE (engine component missing)', missingSettings.join(' | '));
console.log('FILTER NO MATCH (empty result is correct when the file fails the filter)', noMatch.join(' | '));
await defaultStirlingSidecar.stop();
process.exit(0);
