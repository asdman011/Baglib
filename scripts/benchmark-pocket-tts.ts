import { performance } from 'node:perf_hooks';
import { PocketTTSProvider } from '../src/main/services/audio/pocket-tts.provider';

async function main() {
  const provider = new PocketTTSProvider();
  const quantize = !process.argv.includes('--float');
  const voiceId = process.argv.includes('--anna') ? 'pocket:anna' : 'pocket:alba';
  const started = performance.now();
  try {
    const status = await provider.init({ language: 'english', quantize });
    console.log(JSON.stringify({ event: 'ready', quantize, voiceId, milliseconds: Math.round(performance.now() - started), status }));
    if (!status.available) throw new Error(status.message);
    const sentences = [
      'The library preserves knowledge for future generations.',
      'A reader should hear the next sentence without waiting for the entire chapter to be generated.',
      'This final sentence checks that repeated requests keep the model ready in memory.',
    ];
    for (const [index, text] of sentences.entries()) {
      const jobId = `benchmark-${index}`;
      const began = performance.now();
      let firstChunkMs: number | null = null;
      let audioSeconds = 0;
      let chunks = 0;
      const timer = setTimeout(() => { void provider.stop(jobId); }, 30000);
      try {
        await provider.synthesize({ jobId, text, language: 'english', voiceId }, (chunk) => {
          if (!chunk.pcmBase64) return;
          firstChunkMs ??= performance.now() - began;
          audioSeconds += Buffer.from(chunk.pcmBase64, 'base64').length / (chunk.sampleRate * chunk.channels * chunk.bitsPerSample / 8);
          chunks++;
        });
      } finally {
        clearTimeout(timer);
      }
      const elapsedMs = performance.now() - began;
      console.log(JSON.stringify({ event: 'sentence', index, firstChunkMs, elapsedMs, audioSeconds, chunks, realtimeSpeed: audioSeconds / (elapsedMs / 1000) }));
      if (!chunks) throw new Error('No PCM audio was delivered.');
    }
  } finally {
    await provider.release();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
