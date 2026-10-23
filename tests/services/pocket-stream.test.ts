import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PocketTTSProvider } from '../../src/main/services/audio/pocket-tts.provider';

it('aborts a stalled HTTP stream instead of leaving the next sentence buffering forever', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'audio/wav' });
    response.write('RIFF');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const provider = new PocketTTSProvider({ streamIdleTimeoutMs: 100 });
  provider['startServer'] = async () => ({ language: 'english', port: address.port, process: {} as never });
  try {
    await assert.rejects(provider.synthesize({ jobId: 'stalled-stream', text: 'Hello.', language: 'english' }, () => assert.fail('No complete PCM should be emitted')), /responding|aborted/i);
    assert.equal(provider['jobs'].size, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
