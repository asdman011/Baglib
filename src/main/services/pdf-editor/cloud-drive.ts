import { randomUUID } from 'node:crypto';
import type { PdfCloudFile, PdfCloudPage, PdfCloudProvider } from '../../../shared/types/pdf-cloud';
import { cloudId } from '../../../shared/types/pdf-cloud';
import { CloudVault, type CloudTokens } from './cloud-vault';
import { cloudOAuth, type OAuthCode } from './cloud-oauth';

type Json = Record<string, unknown>;
const MAX_PDF = 256 * 1024 * 1024;
export function cloudDocumentMime(bytes: Buffer, name: string): string {
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (extension === 'pdf' && bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) return 'application/pdf';
  if (['docx', 'xlsx', 'pptx'].includes(extension || '') && bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))) return ({ docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } as Record<string, string>)[extension!];
  if (extension === 'html' && /^\s*(?:<!doctype html|<html)/iu.test(bytes.subarray(0, 1024).toString('utf8'))) return 'text/html';
  throw new Error('invalid-request');
}
const googleFields = 'id,name,mimeType,size,modifiedTime,version';
const microsoftFields = 'id,name,size,folder,file,eTag,lastModifiedDateTime';
export async function boundedBody(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('too-large'); }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw new Error('too-large'); chunks.push(Buffer.from(value)); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export function remoteFile(provider: PdfCloudProvider, value: Json, etag?: string | null): PdfCloudFile {
  const id = cloudId(value.id);
  if (typeof value.name !== 'string' || value.name.length > 1024) throw new Error('network');
  return { id, name: value.name, folder: provider === 'google' ? value.mimeType === 'application/vnd.google-apps.folder' : !!value.folder, bytes: Number(value.size) || 0, modified: String(provider === 'google' ? value.modifiedTime || '' : value.lastModifiedDateTime || ''), revision: etag || (typeof value.eTag === 'string' ? value.eTag : undefined) };
}

/** Provider endpoints are fixed; renderer never supplies URLs, tokens or local paths. */
export class CloudDrive {
  private refreshing = new Map<PdfCloudProvider, Promise<CloudTokens>>();
  constructor(private vault: CloudVault, private request: typeof fetch = fetch) {}
  private async tokenRequest(provider: PdfCloudProvider, fields: Record<string, string>, signal?: AbortSignal): Promise<Json> {
    const config = this.vault.read(provider).config;
    const url = cloudOAuth[provider].token.replace('/common/', `/${config.tenant || 'common'}/`);
    const response = await this.request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, ...fields }), redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('login-failed'); }
    return JSON.parse((await boundedBody(response, 256 * 1024)).toString('utf8')) as Json;
  }
  private tokens(value: Json, previous?: CloudTokens): CloudTokens {
    if (typeof value.access_token !== 'string' || value.access_token.length > 32000 || value.token_type && String(value.token_type).toLowerCase() !== 'bearer') throw new Error('login-failed');
    if (value.refresh_token !== undefined && (typeof value.refresh_token !== 'string' || value.refresh_token.length > 32000)) throw new Error('login-failed');
    const seconds = Number(value.expires_in);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) throw new Error('login-failed');
    return { access: value.access_token, refresh: value.refresh_token as string | undefined || previous?.refresh, expires: Date.now() + seconds * 1000 };
  }
  async exchange(provider: PdfCloudProvider, login: OAuthCode, signal: AbortSignal): Promise<void> {
    const account = this.vault.read(provider);
    const value = await this.tokenRequest(provider, { grant_type: 'authorization_code', code: login.code, redirect_uri: login.redirectUri, code_verifier: login.verifier }, signal);
    if (signal.aborted) throw new Error('login-cancelled');
    this.vault.write(provider, { config: account.config, tokens: this.tokens(value) });
  }
  private async access(provider: PdfCloudProvider): Promise<string> {
    const account = this.vault.read(provider);
    if (!account.tokens) throw new Error('not-connected');
    if (account.tokens.expires > Date.now() + 60_000) return account.tokens.access;
    if (!account.tokens.refresh) throw new Error('not-connected');
    let pending = this.refreshing.get(provider);
    if (!pending) {
      pending = (async () => {
        const data = await this.tokenRequest(provider, { grant_type: 'refresh_token', refresh_token: account.tokens!.refresh! });
        const latest = this.vault.read(provider);
        if (latest.config.clientId !== account.config.clientId || latest.tokens?.refresh !== account.tokens!.refresh) throw new Error('not-connected');
        const tokens = this.tokens(data, account.tokens); this.vault.write(provider, { config: account.config, tokens }); return tokens;
      })().finally(() => this.refreshing.delete(provider));
      this.refreshing.set(provider, pending);
    }
    return (await pending).access;
  }
  private async api(provider: PdfCloudProvider, route: string, init: RequestInit = {}): Promise<Response> {
    const base = provider === 'google' ? 'https://www.googleapis.com' : 'https://graph.microsoft.com';
    const response = await this.request(base + route, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${await this.access(provider)}` }, redirect: 'manual', signal: AbortSignal.timeout(90_000) });
    if (!response.ok && response.status !== 302 && response.status !== 307) {
      await response.body?.cancel();
      throw new Error(response.status === 409 || response.status === 412 ? 'conflict' : response.status === 401 ? 'not-connected' : response.status === 403 ? 'permission-denied' : 'network');
    }
    return response;
  }
  async list(provider: PdfCloudProvider, folder = 'root', cursor?: string): Promise<PdfCloudPage> {
    cloudId(folder);
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 8192)) throw new Error('invalid-request');
    let route: string;
    if (provider === 'google') {
      const query = new URLSearchParams({ q: `'${folder}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.folder')`, fields: `nextPageToken,files(${googleFields})`, pageSize: '100', orderBy: 'folder,name' });
      if (cursor) query.set('pageToken', cursor);
      route = '/drive/v3/files?' + query;
    } else if (cursor) {
      const url = new URL(cursor);
      if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/me/drive/')) throw new Error('invalid-request');
      route = url.pathname + url.search;
    } else route = `/v1.0/me/drive/${folder === 'root' ? 'root' : `items/${encodeURIComponent(folder)}`}/children?$select=${microsoftFields}&$top=100`;
    const response = await this.api(provider, route);
    const data = JSON.parse((await boundedBody(response, 2 * 1024 * 1024)).toString('utf8')) as Json;
    const items = (provider === 'google' ? data.files : data.value) as Json[];
    if (!Array.isArray(items) || items.length > 1000) throw new Error('network');
    return { files: items.map(item => remoteFile(provider, item)).filter(item => item.folder || /\.pdf$/iu.test(item.name)), next: typeof (provider === 'google' ? data.nextPageToken : data['@odata.nextLink']) === 'string' ? (provider === 'google' ? data.nextPageToken : data['@odata.nextLink']) as string : undefined };
  }
  async metadata(provider: PdfCloudProvider, id: string): Promise<PdfCloudFile> {
    cloudId(id);
    const response = await this.api(provider, provider === 'google' ? `/drive/v3/files/${encodeURIComponent(id)}?fields=${googleFields}` : `/v1.0/me/drive/items/${encodeURIComponent(id)}?$select=${microsoftFields}`);
    return remoteFile(provider, JSON.parse((await boundedBody(response, 256 * 1024)).toString('utf8')), response.headers.get('etag'));
  }
  async download(provider: PdfCloudProvider, id: string): Promise<{ file: PdfCloudFile; bytes: Buffer }> {
    const file = await this.metadata(provider, id);
    if (file.folder || !/\.pdf$/iu.test(file.name)) throw new Error('invalid-pdf');
    if (file.bytes > MAX_PDF) throw new Error('too-large');
    let response = await this.api(provider, provider === 'google' ? `/drive/v3/files/${encodeURIComponent(id)}?alt=media` : `/v1.0/me/drive/items/${encodeURIComponent(id)}/content`, { headers: file.revision ? { 'If-Match': file.revision } : {} });
    if ([302, 307].includes(response.status)) {
      const target = new URL(response.headers.get('location') || '');
      await response.body?.cancel();
      // Microsoft preauthenticated content URLs must never receive the Graph bearer token.
      if (provider !== 'microsoft' || target.protocol !== 'https:' || target.username || target.password || !['.1drv.com', '.sharepoint.com', '.sharepoint-df.com'].some(suffix => target.hostname.endsWith(suffix))) throw new Error('network');
      response = await this.request(target, { redirect: 'error', signal: AbortSignal.timeout(90_000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('network'); }
    }
    const bytes = await boundedBody(response, MAX_PDF);
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('invalid-pdf');
    const after = await this.metadata(provider, id);
    if (file.revision !== after.revision || file.modified !== after.modified || file.bytes !== after.bytes) throw new Error('conflict');
    return { file: after, bytes };
  }
  async upload(provider: PdfCloudProvider, bytes: Buffer, folder: string, name: string, replace?: { id: string; revision: string }): Promise<PdfCloudFile> {
    cloudId(folder);
    if (typeof name !== 'string' || name.length > 180 || /[<>:"/\\|?*\u0000-\u001f]/u.test(name) || name.endsWith('.') || name.endsWith(' ')) throw new Error('invalid-request');
    if (bytes.length > MAX_PDF) throw new Error('too-large');
    const mime = cloudDocumentMime(bytes, name);
    if (replace) { cloudId(replace.id); if (!replace.revision || replace.revision.length > 1024 || /[\r\n]/u.test(replace.revision)) throw new Error('conflict'); }
    let response: Response;
    if (provider === 'google') {
      const headers: Record<string, string> = {};
      if (replace) {
        headers['Content-Type'] = mime; headers['If-Match'] = replace.revision;
        response = await this.api(provider, `/upload/drive/v3/files/${encodeURIComponent(replace.id)}?uploadType=media&fields=${googleFields}`, { method: 'PATCH', headers, body: new Uint8Array(bytes) });
      } else {
        const boundary = `baglib_${randomUUID().replaceAll('-', '')}`;
        const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: mime, parents: [folder] })}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
        response = await this.api(provider, `/upload/drive/v3/files?uploadType=multipart&fields=${googleFields}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body) });
      }
    } else {
      // Upload sessions provide documented conditional updates and fail-on-conflict creation.
      const route = replace ? `/v1.0/me/drive/items/${encodeURIComponent(replace.id)}/createUploadSession` : `/v1.0/me/drive/${folder === 'root' ? 'root' : `items/${encodeURIComponent(folder)}`}:/${encodeURIComponent(name)}:/createUploadSession`;
      const sessionResponse = await this.api(provider, route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(replace ? { 'If-Match': replace.revision } : {}) }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'fail', name } }) });
      const session = JSON.parse((await boundedBody(sessionResponse, 128 * 1024)).toString('utf8'));
      const target = new URL(session.uploadUrl);
      if (target.protocol !== 'https:' || target.username || target.password || !['.1drv.com', '.sharepoint.com', '.sharepoint-df.com'].some(suffix => target.hostname.endsWith(suffix))) throw new Error('network');
      let finalResponse: Response | undefined;
      const step = 10 * 327680;
      for (let offset = 0; offset < bytes.length; offset += step) {
        const end = Math.min(offset + step, bytes.length);
        const part = await this.request(target, { method: 'PUT', headers: { 'Content-Length': String(end - offset), 'Content-Range': `bytes ${offset}-${end - 1}/${bytes.length}` }, body: new Uint8Array(bytes.subarray(offset, end)), redirect: 'error', signal: AbortSignal.timeout(90_000) });
        if (!part.ok) { await part.body?.cancel(); throw new Error([409, 412].includes(part.status) ? 'conflict' : 'network'); }
        if (end === bytes.length) finalResponse = part; else { if (part.status !== 202) throw new Error('network'); await part.body?.cancel(); }
      }
      if (!finalResponse || ![200, 201].includes(finalResponse.status)) throw new Error('network');
      response = finalResponse;
    }
    const data = JSON.parse((await boundedBody(response, 256 * 1024)).toString('utf8'));
    return this.metadata(provider, cloudId(data.id));
  }
}
