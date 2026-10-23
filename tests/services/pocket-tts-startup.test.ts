import { it } from 'node:test';
import assert from 'node:assert/strict';
import { PocketTTSProvider } from '../../src/main/services/audio/pocket-tts.provider';
import { hasPocketCache } from '../../src/main/services/audio/pocket-cache';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

it('enables offline startup only when model, tokenizer and selected voice are cached', () => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-pocket-cache-'));
  const languageRoot = path.join(cacheRoot, 'models--kyutai--pocket-tts-without-voice-cloning', 'snapshots', 'revision', 'languages', 'english');
  try {
    fs.mkdirSync(path.join(languageRoot, 'embeddings'), { recursive: true });
    fs.writeFileSync(path.join(languageRoot, 'model.safetensors'), 'model');
    fs.writeFileSync(path.join(languageRoot, 'tokenizer.json'), '{}');
    assert.equal(hasPocketCache('english', 'alba', cacheRoot), false);
    fs.writeFileSync(path.join(languageRoot, 'embeddings', 'alba.safetensors'), 'voice');
    assert.equal(hasPocketCache('english', 'alba', cacheRoot), true);
    assert.equal(hasPocketCache('english', 'anna', cacheRoot), false);
    assert.equal(hasPocketCache('french', 'alba', cacheRoot), false);
  } finally {
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  }
});

it('cancels requests waiting for model startup before any HTTP synthesis', async () => {
  const provider = new PocketTTSProvider();
  let finishStartup!: () => void;
  const gate = new Promise<void>((resolve) => { finishStartup = resolve; });
  provider['startServer'] = async () => {
    await gate;
    return { language: 'english', port: 1, process: {} as never };
  };
  const generation = provider.synthesize({ jobId: 'cancel-test', text: 'Hello.', language: 'english' }, () => assert.fail('canceled audio'));
  await provider.stop('cancel-test');
  finishStartup();
  await assert.rejects(generation, { name: 'AbortError' });
});

it('shares an in-flight startup between initialization and voice loading', async () => {
  const provider = new PocketTTSProvider();
  let attempts = 0;
  let finishStartup!: () => void;
  const gate = new Promise<void>((resolve) => { finishStartup = resolve; });
  provider['startServer'] = async () => {
    attempts++;
    await gate;
    return { language: 'english', port: 1234, process: {} as never };
  };
  const initialization = provider.init();
  const voiceLoading = provider.loadVoice({ voiceId: 'pocket:alba', language: 'english' });
  assert.equal(attempts, 1);
  finishStartup();
  await Promise.all([initialization, voiceLoading]);
  assert.equal(provider.getStatus().available, true);
});

it('allows retry after a failed startup instead of retaining a rejected promise', async () => {
  const provider = new PocketTTSProvider();
  let attempts = 0;
  provider['startServer'] = async () => {
    attempts++;
    throw new Error('model unavailable');
  };
  assert.equal((await provider.init()).available, false);
  await assert.rejects(provider.loadVoice({ voiceId: 'pocket:alba' }), /model unavailable/);
  assert.equal(attempts, 2);
});
