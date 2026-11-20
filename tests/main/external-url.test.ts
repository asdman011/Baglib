import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedExternalUrl } from '../../src/main/ipc/external-url';

test('external URL boundary allows only well-formed http, https and mailto', () => {
  for (const url of ['http://example.com/a?q=1#x', 'https://example.com/\u0639\u0631\u0628\u064a', 'HTTPS://example.com', 'mailto:reader@example.com?subject=BagLib']) {
    assert.equal(allowedExternalUrl(url), url);
  }
  assert.equal(allowedExternalUrl(' https://example.com '), 'https://example.com');
});
test('external URL boundary rejects arbitrary protocols, malformed and non-string input', () => {
  for (const url of [null, undefined, {}, 42, '', ' ', 'file:///C:/secret', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'baglib:note:x', '//example.com', '/relative', 'https://', 'mailto:', 'https://exa mple.com', 'java\nscript:alert(1)', 'https://example.com/\u0000', 'https:\t//example.com']) {
    assert.equal(allowedExternalUrl(url), null, String(url));
  }
});
