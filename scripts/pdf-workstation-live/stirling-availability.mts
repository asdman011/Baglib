// Prints why the running Stirling-PDF disabled each endpoint, which names the external tools a full install needs.
import path from 'node:path';
import { defaultStirlingSidecar, resolveStirlingEndpoint, selectNewestStirlingJar } from '../../src/main/services/pdf-editor/stirling';

const root = path.resolve('.baglib-data/pdf-engine');
const tools = { python: '', script: '', tessdata: '', java: path.join(root, 'java', 'jdk-25.0.5+8-jre', 'bin', 'java.exe'), stirlingJar: selectNewestStirlingJar(path.join(root, 'stirling'))!, preferStirling: true } as never;
const base = await resolveStirlingEndpoint(tools);
const availability = await (await fetch(`${base}/api/v1/config/endpoints-availability`)).json() as Record<string, { enabled: boolean; reason?: string }>;
const disabled = Object.entries(availability).filter(([, item]) => !item.enabled);
console.log(`${disabled.length} of ${Object.keys(availability).length} endpoints disabled`);
const groups = new Map<string, string[]>();
for (const [name, item] of disabled) groups.set(String(item.reason), [...(groups.get(String(item.reason)) ?? []), name]);
for (const [reason, names] of groups) console.log(reason, names.join(', '));
const dependencies = await fetch(`${base}/api/v1/config/app-config`).then(response => response.json()).catch(() => null) as Record<string, unknown> | null;
console.log(Object.fromEntries(Object.entries(dependencies ?? {}).filter(([key]) => /depend|tool|group|disabled/iu.test(key))));
await defaultStirlingSidecar.stop();
process.exit(0);
