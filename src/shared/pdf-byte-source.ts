export interface PdfByteSource {
  length: number;
  initialData: Uint8Array;
  read(begin: number, end: number): Promise<Uint8Array>;
}

export async function openPdfByteSource(url: string, signal: AbortSignal): Promise<PdfByteSource> {
  const head = await fetch(url, { method: 'HEAD', signal, redirect: 'error', cache: 'no-store' });
  const length = Number(head.headers.get('content-length'));
  if (!head.ok || !Number.isSafeInteger(length) || length < 1 || head.headers.get('accept-ranges') !== 'bytes') throw new Error('engine-failed');
  const read = async (begin: number, end: number): Promise<Uint8Array> => {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin || end > length) throw new Error('invalid-request');
    const response = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal, redirect: 'error', cache: 'no-store' });
    if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${begin}-${end - 1}/${length}`) {
      await response.body?.cancel();
      throw new Error('invalid-output');
    }
    const data = new Uint8Array(end - begin);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('invalid-output');
    let offset = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (offset + chunk.value.byteLength > data.byteLength) {
          await reader.cancel();
          throw new Error('invalid-output');
        }
        data.set(chunk.value, offset);
        offset += chunk.value.byteLength;
      }
    } finally { reader.releaseLock(); }
    if (offset !== data.byteLength) throw new Error('invalid-output');
    return data;
  };
  return { length, initialData: await read(0, Math.min(length, 65536)), read };
}
