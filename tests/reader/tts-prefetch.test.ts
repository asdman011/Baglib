import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { useTTSAudio } from '../../src/renderer/hooks/useTTSAudio';

it('prefetches during playback, pauses the sleep timer and cancels queued audio on expiry', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const requests: any[] = [];
  const stopped: string[] = [];
  const sources: any[] = [];
  let chunkListener: (chunk: any) => void = () => {};
  let completeListener: (event: any) => void = () => {};
  const context = {
    state: 'running', currentTime: 0, destination: {},
    resume: async () => { context.state = 'running'; },
    suspend: async () => { context.state = 'suspended'; },
    close: async () => {},
    createGain: () => ({ connect() {}, gain: { value: 1 } }),
    createBuffer: (_channels: number, frames: number, sampleRate: number) => ({ duration: frames / sampleRate, getChannelData: () => new Float32Array(frames) }),
    createBufferSource: () => {
      const source: any = { playbackRate: { value: 1 }, connect() {}, start() {}, stop() {}, onended: null };
      sources.push(source);
      return source;
    },
  };
  (window as any).AudioContext = function () { return context; };
  (window as any).electronAPI = { audio: { tts: {
    getVoices: async () => [], getStatus: async () => ({ available: true }), loadVoice: async () => {},
    synthesize: async (request: any) => { requests.push(request); return { jobId: request.jobId }; },
    stop: async (jobId: string) => { stopped.push(jobId); },
    onChunk: (listener: any) => { chunkListener = listener; return () => {}; },
    onComplete: (listener: any) => { completeListener = listener; return () => {}; },
    onError: () => () => {},
  } } };
  let audio!: ReturnType<typeof useTTSAudio>;
  function Harness() {
    audio = useTTSAudio({ initialText: 'First sentence. Second sentence. Third sentence.' });
    return null;
  }
  const root = createRoot(window.document.getElementById('root')!);
  const emitChunk = (jobId: string) => chunkListener({ jobId, pcmBase64: Buffer.alloc(480).toString('base64'), sampleRate: 24000, channels: 1, bitsPerSample: 16 });
  try {
    await act(async () => { root.render(createElement(Harness)); });
    await act(async () => { audio.playSentence(0); });
    await act(async () => { emitChunk(requests[0].jobId); completeListener({ jobId: requests[0].jobId }); });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].text, 'Second sentence.');
    assert.equal(sources.length, 1);
    await act(async () => { emitChunk(requests[1].jobId); completeListener({ jobId: requests[1].jobId }); });
    assert.equal(sources.length, 1);
    await act(async () => { sources[0].onended(); });
    assert.equal(audio.currentSentenceIndex, 1);
    assert.equal(sources.length, 2);
    assert.equal(requests.length, 3);
    await act(async () => { audio.setSleepTimer(1 / 60); audio.pause(); });
    assert.equal(context.state, 'suspended');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    assert.equal(audio.sleepRemainingSeconds, 1);
    await act(async () => { emitChunk(requests[2].jobId); });
    assert.equal(audio.playbackState, 'paused');
    await act(async () => { audio.play(); });
    assert.equal(context.state, 'running');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    assert.equal(audio.playbackState, 'stopped');
    assert.equal(audio.sleepRemainingSeconds, null);
    assert.equal(context.state, 'suspended');
    const sourceCount = sources.length;
    await act(async () => { emitChunk(requests[2].jobId); completeListener({ jobId: requests[2].jobId }); });
    assert.equal(sources.length, sourceCount);
    assert.ok(stopped.includes(requests[1].jobId));
    assert.ok(stopped.includes(requests[2].jobId));
  } finally {
    await act(async () => { root.unmount(); });
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as any).window;
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
    else delete (globalThis as any).document;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
