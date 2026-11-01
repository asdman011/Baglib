// Live audit: compares Baglib's Hub tools and pipeline presets with the running Stirling OpenAPI document.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultStirlingSidecar, resolveStirlingEndpoint, selectNewestStirlingJar } from '../../src/main/services/pdf-editor/stirling';

const root = path.resolve('.baglib-data/pdf-engine');
const java = path.join(root, 'java', 'jdk-25.0.5+8-jre', 'bin', 'java.exe');
const tools = { python: '', script: '', tessdata: '', java, stirlingJar: selectNewestStirlingJar(path.join(root, 'stirling'))!, preferStirling: true } as never;

const base = await resolveStirlingEndpoint(tools);
const docs = await (await fetch(`${base}/v1/api-docs`)).json() as { paths: Record<string, Record<string, { requestBody?: { content?: Record<string, { schema?: { $ref?: string; required?: string[]; properties?: Record<string, unknown> } }> } }>>; components: { schemas: Record<string, { required?: string[]; properties?: Record<string, { enum?: string[] }> }> } };
writeFileSync(process.argv[2], JSON.stringify(docs));
const required = (endpoint: string) => {
  const media = docs.paths[endpoint]?.post?.requestBody?.content;
  const schema = media && Object.values(media)[0]?.schema;
  const resolved = schema?.$ref ? docs.components.schemas[schema.$ref.split('/').pop()!] : schema;
  return { required: resolved?.required ?? [], properties: Object.keys(resolved?.properties ?? {}) };
};
const hub = readFileSync('src/renderer/components/pdf-workstation/StirlingToolsHub.tsx', 'utf8');
const endpoints = [...new Set([...hub.matchAll(/'(\/api\/v1\/[^']+)'/gu)].map(match => match[1]))];
const processor = readFileSync('src/main/services/pdf-editor/processor.ts', 'utf8');
const stirling = readFileSync('src/main/services/pdf-editor/stirling.ts', 'utf8');
for (const match of `${processor}\n${stirling}`.matchAll(/['`](\/api\/v1\/[A-Za-z0-9_/-]+)['`]/gu)) if (!endpoints.includes(match[1])) endpoints.push(match[1]);
for (const endpoint of endpoints) {
  if (!docs.paths[endpoint]) console.log(`MISSING ${endpoint}`);
  else { const item = required(endpoint); console.log(`ok ${endpoint} required=[${item.required.join(',')}] props=[${item.properties.join(',')}]`); }
}
await defaultStirlingSidecar.stop?.();
process.exit(0);
