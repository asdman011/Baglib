import { spawn } from 'child_process';
import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';
import { writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { rootCertificates } from 'tls';
import { probeExternalCapabilities } from './stirling';

const RENDER_TIMEOUT_MS = 15 * 60_000;
const URL_RENDER_TIMEOUT_MS = 3 * 60_000;
const URL_REQUEST_TIMEOUT_SECONDS = 30;
const MAX_URL_REDIRECTS = 5;

const privateAddresses = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]] as const) {
  privateAddresses.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) {
  privateAddresses.addSubnet(network, prefix, 'ipv6');
}

interface RenderOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  env?: Record<string, string>;
}

function runWeasyPrint(args: string[], input: string | null, { signal, timeoutMs = RENDER_TIMEOUT_MS, env }: RenderOptions): Promise<Buffer> {
  const executable = probeExternalCapabilities().weasyprint.path;
  if (!executable) return Promise.reject(new Error('engine-missing'));
  if (signal?.aborted) return Promise.reject(new Error('cancelled'));
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(executable, args, { cwd: os.tmpdir(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    const output: Buffer[] = [];
    let errorOutput = '';
    let settled = false;
    const finish = (error: Error | null, result?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () => { child.kill(); finish(new Error('cancelled')); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('engine-failed')); }, timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.on('data', chunk => { errorOutput = (errorOutput + String(chunk)).slice(-2000); });
    child.on('error', error => finish(new Error((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'engine-missing' : 'engine-failed')));
    child.on('close', code => {
      const result = Buffer.concat(output);
      if (code === 0 && result.subarray(0, 5).toString('latin1') === '%PDF-') { finish(null, result); return; }
      console.warn('[weasyprint] Render failed:', code, errorOutput.slice(-500));
      finish(new Error('engine-failed'));
    });
    // A closed stdin is reported through `close`, so a write failure needs no handling of its own.
    child.stdin.on('error', () => undefined);
    child.stdin.end(input ?? '');
  });
}

/**
 * Renders a complete HTML document offline as tagged PDF/UA. Only `data:` URLs load, so a clipped
 * page cannot pull a local file or a network address into the PDF.
 */
export function renderHtmlToPdf(html: string, options: RenderOptions = {}): Promise<Buffer> {
  return runWeasyPrint(['--allowed-protocols', 'data', '--encoding', 'utf-8', '--pdf-variant', 'pdf/ua-1', '--quiet', '-', '-'], html, options);
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new Error('invalid-request');
  for (const { address, family } of addresses) {
    if (privateAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4')) throw new Error('invalid-request');
  }
}

/** Follows redirects itself so each hop is checked, because WeasyPrint is told not to follow them. */
export async function resolvePublicUrl(input: string, signal?: AbortSignal): Promise<string> {
  let current: URL;
  try { current = new URL(input.trim()); } catch { throw new Error('invalid-request'); }
  for (let hop = 0; hop <= MAX_URL_REDIRECTS; hop += 1) {
    if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password) throw new Error('invalid-request');
    await assertPublicHost(current);
    const response = await fetch(current, { method: 'GET', redirect: 'manual', signal: signal ?? AbortSignal.timeout(URL_REQUEST_TIMEOUT_SECONDS * 1000) })
      .catch(() => { throw new Error('engine-failed'); });
    await response.body?.cancel().catch(() => undefined);
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return current.toString();
    current = new URL(location, current);
  }
  throw new Error('engine-failed');
}

/** The Windows WeasyPrint build carries no CA list, so HTTPS needs Node's. */
async function certificateBundle(): Promise<string> {
  const bundle = path.join(os.tmpdir(), 'baglib-weasyprint-ca.pem');
  await writeFile(bundle, rootCertificates.join('\n'));
  return bundle;
}

/** Renders a public web page. Stirling 3.2.2 cannot: its URL controller throws on every request. */
export async function renderUrlToPdf(input: string, options: RenderOptions = {}): Promise<Buffer> {
  const url = await resolvePublicUrl(input, options.signal);
  return runWeasyPrint([
    '--allowed-protocols', 'http,https,data', '--no-http-redirects', '--fail-on-http-errors',
    '--timeout', String(URL_REQUEST_TIMEOUT_SECONDS), '--quiet', url, '-',
  ], null, { timeoutMs: URL_RENDER_TIMEOUT_MS, ...options, env: { SSL_CERT_FILE: await certificateBundle() } });
}
