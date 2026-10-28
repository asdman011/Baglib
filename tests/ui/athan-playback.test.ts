import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playLocalAthanSound } from '../../src/renderer/hooks/useAthan';

test('Athan playback reports completion/failure and cancelled playback cannot restart a fallback', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  let reject: (error: Error) => void = () => {};
  const players: FakeAudio[] = [];
  class FakeAudio {
    volume = 1; currentTime = 0; paused = false;
    onended: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(public src: string) { players.push(this); }
    play() { return new Promise<void>((_, fail) => { reject = fail; }); }
    pause() { this.paused = true; }
  }
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio });
  try {
    let ended = 0, failed = 0;
    const first = playLocalAthanSound(0.5, 'baglib-asset://test.wav', () => ended++, () => failed++);
    assert.equal(players[0].volume, 0.5);
    first.stop(); reject(new Error('cancelled')); await Promise.resolve();
    assert.equal(failed, 0); assert.equal(players[0].paused, true);
    playLocalAthanSound(1, undefined, () => ended++, () => failed++);
    reject(new Error('autoplay blocked')); await Promise.resolve();
    assert.equal(failed, 1);
    playLocalAthanSound(0.8, undefined, () => ended++, () => failed++);
    players[2].onended?.(); assert.equal(ended, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'Audio', original); else Reflect.deleteProperty(globalThis, 'Audio');
  }
});
