import assert from 'node:assert/strict';
import path from 'node:path';
import { StirlingSidecarService } from '../src/main/services/pdf-editor/stirling';

async function main() {
  const root = path.resolve('.baglib-data/pdf-engine');
  const service = new StirlingSidecarService();
  const statuses: string[] = [];
  const unsubscribe = service.onStatusChange(info => statuses.push(info.status));
  const originalFetch = globalThis.fetch;
  let healthRequests = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).match(/^http:\/\/127\.0\.0\.1:\d+\/api\/v1\/info\/status$/u)) {
      healthRequests++;
      return new Response('unavailable', { status: 503 });
    }
    return originalFetch(input, init);
  };
  try {
    await assert.rejects(service.ensureStarted({ javaPath: path.join(root, 'java/jdk-25.0.5+8-jre/bin/java.exe'), jarPath: path.join(root, 'stirling/Stirling-PDF-server.jar'), workDir: path.join(root, 'stirling/health-failure-verification'), startupTimeoutMs: 20_000 }), /engine-missing/u);
    assert.ok(healthRequests > 0, 'JVM must announce its port and reach health polling');
    assert.ok(!statuses.includes('ready'), 'Failed health must never announce LIVE');
    await service.stop();
    assert.equal(service.getStatus().status, 'stopped');
    console.log(JSON.stringify({ healthRequests, statuses, falseReady: false }));
  } finally {
    globalThis.fetch = originalFetch;
    unsubscribe();
    await service.stop();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
