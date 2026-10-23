import { it } from 'node:test';
import assert from 'node:assert/strict';
import { WavPcmParser } from '../../src/main/services/audio/pocket-tts.provider';

function streamingWav() {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(2000000036, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(2000000000, 40);
  return Buffer.concat([header, Buffer.from([1, 0, 2, 0, 3, 0, 4, 0])]);
}

it('decodes streaming WAV at every possible HTTP split, including after fmt', () => {
  const wav = streamingWav();
  for (let split = 1; split < wav.length; split++) {
    const parser = new WavPcmParser();
    const output = [parser.push(wav.subarray(0, split)), parser.push(wav.subarray(split))];
    assert.deepEqual(Buffer.concat(output.flatMap((chunk) => chunk ? [chunk.data] : [])), wav.subarray(44), `split at ${split}`);
    for (const chunk of output) if (chunk) assert.equal(chunk.data.length % 2, 0);
    parser.finish();
  }
});

it('handles byte-by-byte headers and PCM without losing sample alignment', () => {
  const parser = new WavPcmParser();
  const wav = streamingWav();
  const output: Buffer[] = [];
  for (const byte of wav) {
    const chunk = parser.push(Buffer.from([byte]));
    if (chunk) output.push(Buffer.from(chunk.data));
  }
  assert.deepEqual(Buffer.concat(output), wav.subarray(44));
  parser.finish();
});

it('rejects empty, truncated, non-WAV and unsupported sample formats', () => {
  assert.throws(() => new WavPcmParser().finish(), /no playable audio/);
  assert.throws(() => new WavPcmParser().push(Buffer.alloc(12)), /invalid WAV/);
  const wav = streamingWav();
  const parser = new WavPcmParser();
  parser.push(wav.subarray(0, wav.length - 1));
  assert.throws(() => parser.finish(), /incomplete PCM/);
  wav.writeUInt16LE(32, 34);
  assert.throws(() => new WavPcmParser().push(wav), /unsupported PCM/);
});

it('skips padded metadata chunks before the data header', () => {
  const wav = streamingWav();
  const metadata = Buffer.alloc(10);
  metadata.write('JUNK');
  metadata.writeUInt32LE(1, 4);
  metadata[8] = 42;
  const parser = new WavPcmParser();
  const result = parser.push(Buffer.concat([wav.subarray(0, 36), metadata, wav.subarray(36)]));
  assert.deepEqual(result?.data, wav.subarray(44));
  parser.finish();
});
