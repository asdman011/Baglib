import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const revision = '9862abc066c9b83bf84c3e8ed1fc2d8d48f9bbf0';
const families = [
  ['amiri', 'Amiri-Regular.ttf'],
  ['scheherazadenew', 'ScheherazadeNew-Regular.ttf'],
  ['notonaskharabic', 'NotoNaskhArabic[wght].ttf'],
  ['ebgaramond', 'EBGaramond[wght].ttf'],
  ['lora', 'Lora[wght].ttf'],
];
const directory = path.resolve('src/renderer/public/assets/poetry-fonts');
await fs.mkdir(directory, { recursive: true });
const files = [];
for (const [family, font] of families) {
  for (const filename of [font, 'OFL.txt']) {
    const url = `https://raw.githubusercontent.com/google/fonts/${revision}/ofl/${family}/${encodeURIComponent(filename)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Font download failed: ${response.status} ${url}`);
    const content = Buffer.from(await response.arrayBuffer());
    if (filename === 'OFL.txt' ? !content.toString('utf8').includes('SIL OPEN FONT LICENSE') : content.readUInt32BE(0) !== 0x00010000) throw new Error(`Invalid font asset: ${filename}`);
    const output = filename === 'OFL.txt' ? `${family}-OFL.txt` : `${family}.ttf`;
    await fs.writeFile(path.join(directory, output), content);
    files.push({ file: output, source: url, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
  }
}
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ repository: 'https://github.com/google/fonts', revision, files }, null, 2) + '\n');
console.log(`Bundled ${families.length} Poetry font families with licenses.`);
