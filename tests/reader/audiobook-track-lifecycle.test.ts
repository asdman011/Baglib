import { it } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { useTTSAudio } from '../../src/renderer/hooks/useTTSAudio';

it('advances through three audiobook tracks with fresh callbacks and releases handlers', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  const saved = new Map(['window', 'document', 'Audio', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class TestAudio {
    src = ''; playbackRate = 1; currentTime = 0; duration = 30;
    ontimeupdate: (() => void) | null = null;
    onended: (() => void) | null = null;
    onwaiting: (() => void) | null = null;
    onplaying: (() => void) | null = null;
    onerror: (() => void) | null = null;
    plays: string[] = [];
    async play() { this.plays.push(this.src); }
    pause() {}
  }
  const elements: TestAudio[] = [];
  class AudioFactory extends TestAudio { constructor() { super(); elements.push(this); } }
  for (const [key, value] of Object.entries({ window, document: window.document, Audio: AudioFactory, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  let audio!: ReturnType<typeof useTTSAudio>;
  function Harness() { audio = useTTSAudio(); return null; }
  const root = createRoot(window.document.getElementById('root')!);
  try {
    await act(async () => { root.render(createElement(Harness)); });
    assert.equal(elements.length, 0, 'Text-only reading does not create an audio element');
    await act(async () => { audio.loadAudiobook({ bookId: 'tracks', sourceType: 'local', audioFiles: [1, 2, 3].map(number => ({ id: String(number), name: String(number), path: `https://example.test/${number}.mp3`, duration: 30 })), chapterMappings: [], createdAt: '', updatedAt: '' }); });
    await act(async () => { audio.play(); });
    const element = elements[0];
    await act(async () => { element.onended?.(); });
    await act(async () => { element.onended?.(); });
    assert.deepEqual(element.plays, [1, 2, 3].map(number => `https://example.test/${number}.mp3`));
    await act(async () => { element.onended?.(); });
    assert.equal(audio.playbackState, 'idle');
    await act(async () => { root.unmount(); });
    assert.equal(element.onended, null);
    assert.equal(element.ontimeupdate, null);
  } finally {
    await act(async () => { root.unmount(); });
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
