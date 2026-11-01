// Live probe: runs the settings Hub forms did not yet offer against the real engine and reports what each one does.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultStirlingSidecar, resolveStirlingEndpoint, selectNewestStirlingJar } from '../../src/main/services/pdf-editor/stirling';

const root = path.resolve('.baglib-data/pdf-engine');
const out = path.resolve(process.argv[2]);
mkdirSync(out, { recursive: true });
const java = path.join(root, 'java', 'jdk-25.0.5+8-jre', 'bin', 'java.exe');
const python = path.join(root, 'venv', 'Scripts', 'python.exe');
const engineTools = { python: '', script: '', tessdata: '', java, stirlingJar: selectNewestStirlingJar(path.join(root, 'stirling'))!, preferStirling: true } as never;
let base = await resolveStirlingEndpoint(engineTools);

const report = path.join(out, 'probe_report.py');
writeFileSync(report, `
import sys, json, pikepdf
target = sys.argv[1]
result = {}
try:
    pdf = pikepdf.open(target, password=sys.argv[2] if len(sys.argv) > 2 else '')
    result['pages'] = len(pdf.pages); result['encrypted'] = pdf.is_encrypted
    if pdf.is_encrypted: result['encryption'] = {'R': pdf.encryption.R, 'bits': pdf.encryption.bits, 'owner_ok': pdf.owner_password_matched, 'user_ok': pdf.user_password_matched}
    result['info'] = {str(k): str(pdf.docinfo[k]) for k in pdf.docinfo.keys()}
except Exception as error:
    result['error'] = str(error)[:120]
print(json.dumps(result, ensure_ascii=False))
`);
const fixture = path.join(out, 'make_fixture.py');
writeFileSync(fixture, `
import sys, pikepdf
pdf = pikepdf.new()
font = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica))
for number in range(1, 7):
    page = pdf.add_blank_page(page_size=(595, 842))
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
    page.Contents = pdf.make_stream(f'BT /F1 14 Tf 250 420 Td (PAGE{number}) Tj ET'.encode())
pdf.save(sys.argv[1])
`);
const sample = path.join(out, 'sample.pdf');
execFileSync(python, [fixture, sample]);
const pdftotext = path.join(root, 'poppler', 'poppler-26.09.0', 'Library', 'bin', 'pdftotext.exe');
const textOf = (file: string, password?: string) => {
  const args = password ? ['-upw', password] : [];
  try {
    const pages = execFileSync(pdftotext, [...args, file, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\f').map(page => page.replace(/\s+/gu, ' ').trim()).filter(Boolean);
    const boxes = execFileSync(pdftotext, [...args, '-bbox', '-f', '1', '-l', '1', file, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const words = [...boxes.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]+)</gu)].map(match => `${match[3]}@${Math.round(Number(match[1]))},${Math.round(Number(match[2]))}`);
    return `text=${JSON.stringify(pages.slice(0, 8))} firstPage=${words.join(' ')}`;
  } catch { return 'text=unreadable'; }
};
const inspect = (file: string, password?: string) => `${execFileSync(python, password ? [report, file, password] : [report, file]).toString().trim()} ${textOf(file, password)}`;

async function run(label: string, endpoint: string, fields: Record<string, string>, input = sample, password?: string) {
  const form = new FormData();
  form.set('fileInput', new Blob([readFileSync(input)], { type: 'application/pdf' }), 'sample.pdf');
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const response = await fetch(`${base}${endpoint}`, { method: 'POST', body: form }).catch((error: Error) => { console.log(`${label}: connection failed ${String((error as { cause?: unknown }).cause ?? error.message)}`); return null; });
  if (!response) return '';
  const data = new Uint8Array(await response.arrayBuffer());
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok) { console.log(`${label}: HTTP ${response.status} ${Buffer.from(data).toString('utf8').slice(0, 170).replace(/\s+/gu, ' ')}`); return ''; }
  const target = path.join(out, `${label}.${type.includes('pdf') ? 'pdf' : type.includes('zip') ? 'zip' : 'bin'}`);
  writeFileSync(target, data);
  console.log(`${label}: ok ${type.split(';')[0]} ${data.length} ${type.includes('pdf') ? inspect(target, password) : `magic=${Buffer.from(data.subarray(0, 4)).toString('hex')}`}`);
  return target;
}

if (process.env.PROBE_TAIL !== '1') {
const numbers = { customMargin: 'medium', startingNumber: '1', customText: '{n}', fontType: 'helvetica', fontSize: '12' };
await run('numbers-odd', '/api/v1/misc/add-page-numbers', { ...numbers, position: '8', pageNumbers: 'all', pagesToNumber: '2n+1' });
const stamp = { pageNumbers: 'all', stampType: 'text', stampText: 'STAMPED', alphabet: 'roman', fontSize: '20', rotation: '0', opacity: '1', customColor: '#000000', customMargin: 'medium', overrideX: '-1', overrideY: '-1' };
for (const position of ['1', '3', '7', '9']) await run(`stamp-pos${position}`, '/api/v1/misc/add-stamp', { ...stamp, position });
await run('stamp-qr', '/api/v1/misc/add-stamp', { ...stamp, stampType: 'qr', stampText: 'https://example.com', position: '9', fontSize: '80' });
const dated = await run('dated', '/api/v1/misc/update-metadata', { title: 'T', author: 'A', subject: '', keywords: '', creator: '', producer: '', deleteAll: 'false', creationDate: '2020/02/03 04:05:06', modificationDate: '2021/02/03 04:05:06', trapped: 'True' });
await run('meta-keeps-dates', '/api/v1/misc/update-metadata', { title: 'New', author: '', subject: '', keywords: '', creator: '', producer: '', deleteAll: 'false' }, dated);
await run('meta-bad-date', '/api/v1/misc/update-metadata', { title: 'New', author: '', subject: '', keywords: '', creator: '', producer: '', deleteAll: 'false', creationDate: '03-02-2020' }, dated);

const both = await run('secure-both', '/api/v1/security/add-password', { password: 'open-pass', ownerPassword: 'owner-pass', keyLength: '256', preventPrinting: 'true' }, sample, 'owner-pass');
const open = await run('secure-open-only', '/api/v1/security/add-password', { password: 'open-pass', keyLength: '256' }, sample, 'open-pass');
const allowScript = path.join(out, 'probe_allow.py');
writeFileSync(allowScript, `
import sys, pikepdf
pdf = pikepdf.open(sys.argv[1], password=sys.argv[2])
print({key: getattr(pdf.allow, key) for key in ('print_lowres', 'print_highres', 'modify_other', 'extract')})
`);
const allow = (file: string, password: string) => { try { return execFileSync(python, [allowScript, file, password], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'cannot open'; } };
console.log('both: owner', allow(both, 'owner-pass'), '| blank', allow(both, ''));
const preserved = await run('permissions-preserve', '/api/v1/security/add-password', { sourcePassword: 'owner-pass', preserveExisting: 'true', preventPrinting: 'false', preventModify: 'true', keyLength: '256' }, both, 'owner-pass');
console.log('preserved: owner', allow(preserved, 'owner-pass'), '| open', allow(preserved, 'open-pass'), '| blank', allow(preserved, ''));
const openOnly = await run('remove-open-only', '/api/v1/security/remove-password', { sourcePassword: 'owner-pass', password: 'open-pass' }, both, 'owner-pass');
console.log('remove-open: blank', allow(openOnly, ''), '| owner', allow(openOnly, 'owner-pass'));
const ownerOnly = await run('remove-owner-only', '/api/v1/security/remove-password', { sourcePassword: 'owner-pass', ownerPassword: 'owner-pass', retainedOpeningPassword: 'open-pass' }, both, 'open-pass');
console.log('remove-owner: blank', allow(ownerOnly, ''), '| open', allow(ownerOnly, 'open-pass'));
await run('remove-all-owner', '/api/v1/security/remove-password', { password: 'owner-pass', removeAll: 'true' }, both);
await run('remove-all-open', '/api/v1/security/remove-password', { password: 'open-pass', removeAll: 'true' }, both);
await run('remove-all-simple', '/api/v1/security/remove-password', { password: 'open-pass', removeAll: 'true' }, open);
await run('remove-all-wrong', '/api/v1/security/remove-password', { password: 'wrong', removeAll: 'true' }, both);

}

const redactFixture = path.join(out, 'make_redact.py');
writeFileSync(redactFixture, `
import sys, pikepdf
pdf = pikepdf.new()
data = open(r'C:/Windows/Fonts/arial.ttf', 'rb').read()
file2 = pdf.make_stream(data, Length1=len(data))
descriptor = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.FontDescriptor, FontName=pikepdf.Name.Arial, Flags=32, FontBBox=[-665, -325, 2000, 1006], ItalicAngle=0, Ascent=905, Descent=-212, CapHeight=716, StemV=80, FontFile2=file2))
font = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.TrueType, BaseFont=pikepdf.Name.Arial, Encoding=pikepdf.Name.WinAnsiEncoding, FirstChar=32, LastChar=126, Widths=[556] * 95, FontDescriptor=descriptor))
page = pdf.add_blank_page(page_size=(595, 842))
page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
lines = ['Mail amal.saad_1@example.org now', 'Call +20 100 123 4567 today', 'Card 4111 1111 1111 1111 end', 'Date 03/02/2020 and 2021-12-31 end', 'Plain line stays']
body = 'BT /F1 12 Tf 40 760 Td 16 TL ' + ' '.join(f'({line}) Tj T*' for line in lines) + ' ET'
page.Contents = pdf.make_stream(body.encode())
pdf.save(sys.argv[1])
`);
const redactable = path.join(out, 'redactable.pdf');
execFileSync(python, [redactFixture, redactable]);
const redact = { useRegex: 'true', wholeWordSearch: 'false', caseSensitive: 'false', redactColor: '#000000', customPadding: '0.1', convertPDFToImage: 'false' };
const PATTERNS: Record<string, string> = {
  email: '[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}-]+(\\.[\\p{L}\\p{N}-]+)+',
  phone: '(?<![\\p{N}])\\+?\\d[\\d ().-]{7,}\\d(?![\\p{N}])',
  card: '(?<![\\p{N}])\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{1,4}(?![\\p{N}])',
  date: '(?<![\\p{N}])(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}[/.-]\\d{1,2}[/.-]\\d{1,2})(?![\\p{N}])',
};
const VARIANTS: [string, Record<string, string>][] = [
  ['plain', { ...redact, useRegex: 'false', listOfText: 'Plain' }],
  ...Object.entries(PATTERNS).map(([name, listOfText]): [string, Record<string, string>] => [`pattern-${name}`, { ...redact, listOfText }]),
  ...Object.entries(PATTERNS).map(([name, listOfText]): [string, Record<string, string>] => [`raster-${name}`, { ...redact, convertPDFToImage: 'true', listOfText }]),
];
for (const [name, fields] of VARIANTS) {
  await run(`redact-${name}`, '/api/v1/security/auto-redact', fields, redactable);
  if (!(await fetch(`${base}/v1/api-docs`).then(reply => reply.ok).catch(() => false))) {
    console.log(`  engine down after ${name}, restarting`);
    await defaultStirlingSidecar.stop?.();
    base = await resolveStirlingEndpoint(engineTools);
  }
}

await run('box-redact-unembedded', '/api/v1/security/redact', { pageNumbers: '', pageRedactionColor: '#000000', convertPDFToImage: 'true', redactions: JSON.stringify([{ pageNumber: 1, x: 240, y: 400, width: 100, height: 40, color: '000000' }]) });

if (process.env.PROBE_SIGN === '1') {
const keytool = path.join(path.dirname(java), 'keytool.exe');
const store = path.join(out, 'signer.p12');
for (const [alias, name] of [['first', 'First'], ['second', 'Second']]) execFileSync(keytool, ['-genkeypair', '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048', '-dname', `CN=${name}`, '-validity', '30', '-storetype', 'PKCS12', '-keystore', store, '-storepass', 'store-pass'], { stdio: 'ignore' });
async function sign(label: string, alias?: string) {
  const form = new FormData();
  form.set('fileInput', new Blob([readFileSync(sample)], { type: 'application/pdf' }), 'sample.pdf');
  form.set('p12File', new Blob([readFileSync(store)]), 'signer.p12');
  form.set('certType', 'PKCS12'); form.set('password', 'store-pass'); form.set('showSignature', 'false');
  if (alias) form.set('alias', alias);
  const response = await fetch(`${base}/api/v1/security/cert-sign`, { method: 'POST', body: form });
  const data = Buffer.from(await response.arrayBuffer());
  console.log(`sign ${label}: ${response.status} ${response.ok ? `${data.length} signer=${data.includes('Second') ? 'Second' : data.includes('First') ? 'First' : 'compressed'}` : data.toString('utf8').slice(0, 160)}`);
  if (response.ok) writeFileSync(path.join(out, `sign-${label}.pdf`), data);
}
await sign('noalias'); await sign('second', 'second'); await sign('missing', 'nope');
}

await defaultStirlingSidecar.stop?.();
process.exit(0);
