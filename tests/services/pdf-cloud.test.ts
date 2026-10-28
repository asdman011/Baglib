import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { CloudVault, type CloudStore } from '../../src/main/services/pdf-editor/cloud-vault';
import { nativeCloudLogin, pkce } from '../../src/main/services/pdf-editor/cloud-oauth';
import { CloudDrive, boundedBody, cloudDocumentMime } from '../../src/main/services/pdf-editor/cloud-drive';
import { PdfCloudConnector } from '../../src/main/services/pdf-editor/cloud-connector';
import { translations } from '../../src/renderer/translations';
import { cloudId } from '../../src/shared/types/pdf-cloud';
import { makePagePdf } from '../helpers/pdf-pages';

function fixture() {
  const values = new Map<string, unknown>();
  const store: CloudStore = { get: <T,>(key: string) => structuredClone(values.get(key)) as T | undefined, set: (key, value) => { values.set(key, structuredClone(value)); }, delete: key => values.delete(key) };
  const key = randomBytes(32);
  const cipher = {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => { const iv = randomBytes(12), enc = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, enc.update(value), enc.final(), enc.getAuthTag()]); },
    decryptString: (value: Buffer) => { const dec = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); dec.setAuthTag(value.subarray(-16)); return Buffer.concat([dec.update(value.subarray(12, -16)), dec.final()]).toString('utf8'); },
  };
  const vault = new CloudVault(store, cipher);
  vault.write('google', { config: { clientId: 'test.apps.googleusercontent.com' }, tokens: { access: 'private-access', refresh: 'private-refresh', expires: Date.now() + 3600_000 } });
  vault.write('microsoft', { config: { clientId: 'test-microsoft', tenant: 'common' }, tokens: { access: 'microsoft-access', expires: Date.now() + 3600_000 } });
  return { values, store, cipher, vault };
}
test('PKCE loopback validates state/path, preserves Arabic callback and never exposes verifier in browser URL', async () => {
  assert.equal(pkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  let browserUrl: URL | undefined;
  const login = await nativeCloudLogin('google', 'client-id', 'common', 'ar', async address => {
    browserUrl = new URL(address);
    assert.equal(browserUrl.origin, 'https://accounts.google.com');
    assert.equal(browserUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(browserUrl.searchParams.get('code_verifier'), null);
    const callback = new URL(browserUrl.searchParams.get('redirect_uri')!);
    assert.equal(callback.hostname, '127.0.0.1');
    callback.searchParams.set('state', 'invalid-state'); callback.searchParams.set('code', 'should-not-accept');
    assert.equal((await fetch(callback)).status, 400);
    callback.searchParams.set('state', browserUrl.searchParams.get('state')!); callback.searchParams.set('code', 'accepted-code');
    const response = await fetch(callback);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), translations.ar.pdfCloudLoginReturn);
  }, new AbortController().signal);
  assert.equal(login.code, 'accepted-code');
  assert.equal(pkce(login.verifier), browserUrl!.searchParams.get('code_challenge'));
  await assert.rejects(() => fetch(login.redirectUri));
});
test('PKCE sign-in cancellation releases its loopback listener without exchanging credentials', async () => {
  const controller = new AbortController(); let redirect = '';
  const login = nativeCloudLogin('microsoft', 'client-id', 'common', 'en', async address => { redirect = new URL(address).searchParams.get('redirect_uri')!; controller.abort(); }, controller.signal);
  await assert.rejects(login, /login-cancelled/u);
  await assert.rejects(() => fetch(redirect));
});
test('cloud vault refuses plaintext storage, encrypts credentials and never returns tokens in status', () => {
  const { vault, values, store, cipher } = fixture();
  assert.ok(!JSON.stringify([...values]).includes('private-access'));
  assert.equal(vault.read('google').tokens?.access, 'private-access');
  const unsafe = new CloudVault(store, { ...cipher, getSelectedStorageBackend: () => 'basic_text' });
  assert.throws(() => unsafe.write('google', { config: { clientId: 'test' } }), /secure-storage-unavailable/u);
  const connector = new PdfCloudConnector(vault, new CloudDrive(vault), store, { source: async () => { throw new Error(); }, import: async () => { throw new Error(); } }, async () => { throw new Error('must-not-open-browser'); });
  assert.ok(!JSON.stringify(connector.status('google')).includes('access'));
  connector.configure('google', { clientId: 'new-app' });
  assert.equal(connector.status('google').connected, false);
  assert.throws(() => connector.configure('microsoft', { clientId: 'ok', tenant: '../../evil' }), /invalid-request/u);
  assert.throws(() => cloudId("root' or trashed=true"), /invalid-request/u);
});
test('cloud API bounds streams and rejects foreign pagination and credential-bearing download hosts', async () => {
  await assert.rejects(() => boundedBody(new Response('123456'), 5), /too-large/u);
  const { vault } = fixture(); let requests = 0;
  const request: typeof fetch = async (url, options) => {
    requests++;
    const target = new URL(String(url));
    assert.equal(target.hostname, 'graph.microsoft.com');
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer microsoft-access');
    if (target.pathname.endsWith('/content')) return new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } });
    return Response.json({ id: 'file-1', name: 'بحث.pdf', size: 20, eTag: '"version-1"' });
  };
  const drive = new CloudDrive(vault, request);
  await assert.rejects(() => drive.list('microsoft', 'root', 'https://evil.example/v1.0/me/drive/root/children'), /invalid-request/u);
  assert.equal(requests, 0);
  await assert.rejects(() => drive.download('microsoft', 'file-1'), /network/u);
  assert.equal(requests, 2);
});
test('OneDrive signed download URL receives no bearer and imports only stable PDF versions', async () => {
  const { vault } = fixture(); const bytes = makePagePdf(1, Buffer.alloc(0)); let downloads = 0;
  const request: typeof fetch = async (url, options) => {
    const target = new URL(String(url));
    if (target.hostname === 'content.files.1drv.com') { downloads++; assert.equal(new Headers(options?.headers).get('authorization'), null); assert.equal(options?.redirect, 'error'); return new Response(new Uint8Array(bytes)); }
    assert.equal(target.hostname, 'graph.microsoft.com');
    if (target.pathname.endsWith('/content')) return new Response(null, { status: 302, headers: { location: 'https://content.files.1drv.com/private-temporary-url' } });
    return Response.json({ id: 'file-1', name: 'Research بحث.pdf', size: bytes.length, eTag: '"v1"' });
  };
  const output = await new CloudDrive(vault, request).download('microsoft', 'file-1');
  assert.deepEqual(output.bytes, bytes); assert.equal(downloads, 1);
});
test('parallel expired-token calls refresh once, persist rotated token and propagate conditional conflicts', async () => {
  const { vault } = fixture();
  vault.write('google', { config: { clientId: 'client-id' }, tokens: { access: 'expired', refresh: 'old-refresh', expires: 0 } });
  let refreshes = 0, patches = 0;
  const request: typeof fetch = async (url, options) => {
    if (String(url).startsWith('https://oauth2.googleapis.com')) { refreshes++; assert.equal(new URLSearchParams(String(options?.body)).get('refresh_token'), 'old-refresh'); await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ access_token: 'new-access', refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 3600 }); }
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer new-access');
    if (options?.method === 'PATCH') { patches++; assert.equal(new Headers(options.headers).get('if-match'), '"v1"'); return new Response(null, { status: 412 }); }
    return Response.json({ id: 'remote-1', name: 'بحث.pdf', mimeType: 'application/pdf', size: 100 }, { headers: { etag: '"v1"' } });
  };
  const drive = new CloudDrive(vault, request);
  await Promise.all([drive.metadata('google', 'remote-1'), drive.metadata('google', 'remote-1')]);
  assert.equal(refreshes, 1); assert.equal(vault.read('google').tokens?.refresh, 'rotated-refresh');
  await assert.rejects(() => drive.upload('google', makePagePdf(1, Buffer.alloc(0)), 'root', 'بحث.pdf', { id: 'remote-1', revision: '"v1"' }), /conflict/u);
  assert.equal(patches, 1);
});
test('source sync starts disabled; simultaneous edits preserve both copies and pause without upload/import', async () => {
  const { vault, store } = fixture();
  const bytes = makePagePdf(1, Buffer.alloc(0)), hash = createHash('sha256').update(bytes).digest('hex');
  const key = 'private.pdf-cloud.links.v1';
  store.set(key, [{ id: 'link-1', provider: 'google', sourceId: 'source-1', workId: 'work-1', remoteId: 'remote-1', name: 'بحث.pdf', enabled: true, state: 'idle', localHash: hash, remoteRevision: '"v1"' }]);
  const request: typeof fetch = async (_url, options) => { assert.equal(options?.method || 'GET', 'GET'); return Response.json({ id: 'remote-1', name: 'بحث.pdf', size: bytes.length }, { headers: { etag: '"v2"' } }); };
  let imports = 0;
  const connector = new PdfCloudConnector(vault, new CloudDrive(vault, request), store, { source: async () => ({ path: '', sha256: 'a'.repeat(64), workId: 'work-1', editionId: 'edition-1', sourceId: 'source-1' }), import: async () => { imports++; throw new Error(); } }, async () => { throw new Error(); });
  const result = await connector.sync('link-1');
  assert.equal(result.state, 'conflict'); assert.equal(result.enabled, false); assert.equal(imports, 0);
  assert.ok(!JSON.stringify(result).includes('remoteRevision'));
  connector.unlink('link-1'); assert.deepEqual(connector.links(), []);
});

test('converted document exports use correct MIME types and preserve conditional update safeguards', async () => {
  const { vault } = fixture();
  const office = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('disposable MIME routing fixture')]);
  assert.match(cloudDocumentMime(office, 'Research.docx'), /wordprocessingml/u);
  assert.match(cloudDocumentMime(office, 'بحث.xlsx'), /spreadsheetml/u);
  assert.match(cloudDocumentMime(office, 'Slides.pptx'), /presentationml/u);
  assert.equal(cloudDocumentMime(Buffer.from('<!doctype html><html></html>'), 'بحث.html'), 'text/html');
  assert.throws(() => cloudDocumentMime(Buffer.from('bad'), 'unsafe.docx'), /invalid-request/u);
  let uploads = 0;
  const request: typeof fetch = async (url, options) => {
    if (String(url).includes('/upload/drive/v3/files')) {
      uploads++;
      const body = Buffer.from(options?.body as Uint8Array).toString('utf8');
      assert.ok(body.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
      assert.ok(body.includes('Research.docx'));
      return Response.json({ id: 'converted-1' });
    }
    return Response.json({ id: 'converted-1', name: 'Research.docx', size: office.length }, { headers: { etag: '"v1"' } });
  };
  const uploaded = await new CloudDrive(vault, request).upload('google', office, 'root', 'Research.docx');
  assert.equal(uploaded.name, 'Research.docx'); assert.equal(uploads, 1);
});
