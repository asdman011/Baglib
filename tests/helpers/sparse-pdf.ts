import { open } from 'node:fs/promises';
import { makePagePdf } from './pdf-pages';

export async function writeSparsePagePdf(filename: string, count: number, paddingBytes: number): Promise<void> {
  if (!Number.isSafeInteger(paddingBytes) || paddingBytes < 1) throw new Error('invalid-request');
  const original = makePagePdf(count, Buffer.alloc(0));
  const start = original.indexOf('4 0 obj\n');
  const end = original.indexOf('\nendobj\n', start) + '\nendobj\n'.length;
  const xref = original.lastIndexOf('\nxref\n') + 1;
  const trailer = original.indexOf('trailer\n', xref);
  const prefix = Buffer.from(`4 0 obj\n<< /Length ${paddingBytes} >>\nstream\n`);
  const suffix = Buffer.from('\nendstream\nendobj\n');
  const shift = prefix.length + paddingBytes + suffix.length - (end - start);
  const entries = original.subarray(xref, trailer).toString('ascii').trimEnd().split('\n').slice(3);
  const relocated = entries.map(entry => {
    const offset = Number(entry.slice(0, 10));
    return `${String(offset >= end ? offset + shift : offset).padStart(10, '0')} 00000 n \n`;
  }).join('');
  const table = Buffer.from(`xref\n0 ${entries.length + 1}\n0000000000 65535 f \n${relocated}${original.subarray(trailer).toString('ascii').replace(/startxref\n\d+/u, `startxref\n${xref + shift}`)}`);
  const head = Buffer.concat([original.subarray(0, start), prefix]);
  const tail = Buffer.concat([suffix, original.subarray(end, xref), table]);
  const file = await open(filename, 'w');
  try {
    await file.write(head, 0, head.length, 0);
    await file.write(tail, 0, tail.length, head.length + paddingBytes);
  } finally { await file.close(); }
}
