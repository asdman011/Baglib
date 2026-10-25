import { net } from 'electron';

export function electronDownloadFetch(session: Electron.Session, limit = 128 * 1024 * 1024) {
  return (url: string, init?: RequestInit): Promise<Response> => new Promise((resolve, reject) => {
    const request = net.request({ url, session, redirect: 'manual', useSessionCookies: true });
    const abort = () => { request.abort(); reject(init?.signal?.reason || new Error('cancelled')); };
    if (init?.signal?.aborted) { abort(); return; }
    init?.signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => init?.signal?.removeEventListener('abort', abort);
    request.on('redirect', (status, _method, location) => {
      resolve(new Response(null, { status, headers: { location } }));
      cleanup();
      request.abort();
    });
    request.on('error', error => { cleanup(); reject(error); });
    request.on('response', response => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let received = 0;
          let closed = false;
          const fail = (error: Error) => { if (!closed) { closed = true; cleanup(); controller.error(error); request.abort(); } };
          response.on('data', chunk => {
            received += chunk.length;
            if (received > limit) { fail(new Error('invalid-package')); return; }
            if (!closed) controller.enqueue(new Uint8Array(chunk));
          });
          response.once('end', () => { if (!closed) { closed = true; cleanup(); controller.close(); } });
          response.once('error', fail);
          request.once('abort', () => fail(new Error('cancelled')));
        },
        cancel() { cleanup(); request.abort(); },
      });
      resolve(new Response(body, { status: response.statusCode, headers }));
    });
    request.end();
  });
}
