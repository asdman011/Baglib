import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poetryOriginAllowed } from '../../src/main/services/poetry/access';

test('Poetry IPC rejects malformed, remote, credential-bearing and subframe origins', () => {
  for (const url of ['file:///D:/Baglib/out/index.html', 'app://-/index.html', 'http://localhost:3000/']) assert.equal(poetryOriginAllowed(url, true), true);
  for (const url of ['', 'not a URL', 'https://example.com', 'http://localhost:3001', 'http://localhost.evil:3000', 'file://remote/share/index.html', 'app://other/index.html', 'http://user:secret@localhost:3000/']) assert.equal(poetryOriginAllowed(url, true), false, url);
  assert.equal(poetryOriginAllowed('app://-/index.html', false), false);
});
