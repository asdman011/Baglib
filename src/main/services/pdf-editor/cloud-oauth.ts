import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PdfCloudProvider } from '../../../shared/types/pdf-cloud';
import { translations } from '../../../renderer/translations';

export const cloudOAuth = {
  google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/drive' },
  microsoft: { authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: 'offline_access https://graph.microsoft.com/Files.ReadWrite' },
};
export interface OAuthCode { code: string; verifier: string; redirectUri: string }
export function pkce(verifier: string): string { return createHash('sha256').update(verifier).digest('base64url'); }

/** Only the explicit Connect action calls this function. No embedded browser or credentials. */
export async function nativeCloudLogin(provider: PdfCloudProvider, clientId: string, tenant: string, language: 'ar' | 'en', openBrowser: (url: string) => Promise<void>, signal: AbortSignal): Promise<OAuthCode> {
  const verifier = randomBytes(48).toString('base64url'), state = randomBytes(32).toString('base64url');
  const callbackPath = '/baglib-oauth';
  let redirectUri = '';
  return new Promise<OAuthCode>((resolve, reject) => {
    let settled = false;
    const finish = (error?: string, code?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); server.close(); server.closeAllConnections();
      if (error) reject(new Error(error)); else resolve({ code: code!, verifier, redirectUri });
    };
    const server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      if (request.method !== 'GET' || (request.url?.length || 0) > 8192 || request.headers.host !== new URL(redirectUri).host) { response.writeHead(400).end(); return; }
      const url = new URL(request.url!, redirectUri);
      const returnedState = url.searchParams.get('state') || '';
      const validState = Buffer.byteLength(returnedState) === Buffer.byteLength(state) && timingSafeEqual(Buffer.from(returnedState), Buffer.from(state));
      if (url.pathname !== callbackPath || !validState || url.searchParams.getAll('state').length !== 1) { response.writeHead(400).end(); return; }
      const code = url.searchParams.get('code');
      const accepted = !!code && code.length < 4096 && url.searchParams.getAll('code').length === 1 && !url.searchParams.has('error');
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(translations[language].pdfCloudLoginReturn);
      finish(accepted ? undefined : 'login-failed', accepted ? code! : undefined);
    });
    const abort = () => finish('login-cancelled');
    const timer = setTimeout(() => finish('login-timeout'), 5 * 60_000);
    signal.addEventListener('abort', abort, { once: true });
    server.once('error', () => finish('login-failed'));
    // Entra only documents variable-port matching for the literal localhost host.
    // Use a registered, fixed 127.0.0.1 URI instead of relying on that exception.
    server.listen(provider === 'microsoft' ? 43819 : 0, '127.0.0.1', () => {
      if (signal.aborted) { abort(); return; }
      const address = server.address();
      if (!address || typeof address === 'string') { finish('login-failed'); return; }
      redirectUri = `http://127.0.0.1:${address.port}${callbackPath}`;
      const url = new URL(provider === 'microsoft' ? cloudOAuth.microsoft.authorize.replace('/common/', `/${tenant}/`) : cloudOAuth.google.authorize);
      for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: cloudOAuth[provider].scope, state, code_challenge: pkce(verifier), code_challenge_method: 'S256' })) url.searchParams.set(key, value);
      if (provider === 'google') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); }
      else url.searchParams.set('response_mode', 'query');
      void openBrowser(url.href).catch(() => finish('login-failed'));
    });
  });
}
