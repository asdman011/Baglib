import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ATHAN_DEFAULT_CHIME, ATHAN_RECORDINGS, athanSoundUrl } from '../../src/shared/athan-calculator';

// KEY-312: two licensed recorded adhans ship with the app, downloaded with the user's approval.
const publicDir = path.resolve('src/renderer/public');

test('each sound preset plays the right audio', () => {
  assert.equal(athanSoundUrl({ soundPreset: 'madinah-recorded' }), '/assets/audio/madinah-prophets-mosque.ogg');
  assert.equal(athanSoundUrl({ soundPreset: 'adhan-recorded' }), '/assets/audio/adhan-short-aaqib-azeez.mp3');
  assert.equal(athanSoundUrl({ soundPreset: 'makkah-short' }), ATHAN_DEFAULT_CHIME);
  assert.equal(athanSoundUrl({ soundPreset: 'custom', customAudioPath: 'baglib-asset://C:/a.mp3' }), 'baglib-asset://C:/a.mp3');
  assert.equal(athanSoundUrl({ soundPreset: 'custom' }), ATHAN_DEFAULT_CHIME, 'custom without a file falls back to the chime');
});

test('the recorded files are bundled unchanged from their licensed source', () => {
  const expected: Record<string, string> = {
    'madinah-prophets-mosque.ogg': '4aa432b9e44804e7d72af4429bd743aa5fa9e3a4',
    'adhan-short-aaqib-azeez.mp3': '971bced4b0bf6067358afc78cac6e9d219226c19',
  };
  for (const url of [...Object.values(ATHAN_RECORDINGS), ATHAN_DEFAULT_CHIME]) assert.ok(fs.existsSync(path.join(publicDir, url)), url);
  for (const [name, sha1] of Object.entries(expected)) {
    const digest = createHash('sha1').update(fs.readFileSync(path.join(publicDir, 'assets/audio', name))).digest('hex');
    assert.equal(digest, sha1, name);
  }
});

test('the credits file names each recording and its licence', () => {
  const credits = fs.readFileSync(path.join(publicDir, 'assets/audio/ADHAN-CREDITS.md'), 'utf8');
  assert.match(credits, /madinah-prophets-mosque\.ogg[\s\S]*ejaz215[\s\S]*CC BY 3\.0/);
  assert.match(credits, /adhan-short-aaqib-azeez\.mp3[\s\S]*Atcovi[\s\S]*CC BY-SA 4\.0/);
});
