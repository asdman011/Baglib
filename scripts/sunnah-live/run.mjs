import { buildSync } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import electron from 'electron';

const directory = path.resolve('.baglib-data/sunnah-live');
fs.mkdirSync(directory, { recursive: true });
buildSync({ entryPoints: ['scripts/sunnah-live/fixture.tsx'], outfile: path.join(directory, 'fixture.js'), bundle: true, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' } });
for (const [source, name] of [['src/preload/index.ts', 'preload'], ['src/main/ipc/sunnah.ts', 'ipc'], ['src/main/services/sunnah/sunnah.service.ts', 'service']]) {
  buildSync({ entryPoints: [source], outfile: path.join(directory, `${name}.cjs`), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
}
let styles = fs.readFileSync('src/renderer/app/globals.css', 'utf8').replace('@import "./ui-motion.css";', fs.readFileSync('src/renderer/app/ui-motion.css', 'utf8')) + '\n@source "../../src/renderer/components/sunnah";\n@source "../../src/renderer/components/layout/NavigationRail.tsx";\n@source "../../scripts/sunnah-live/fixture.tsx";\n';
styles += fs.readFileSync('src/renderer/components/sunnah/sunnah.css', 'utf8');
const fonts = path.resolve('out/dev/static/chunks');
if (fs.existsSync(fonts)) {
  for (const file of fs.readdirSync(fonts).filter(name => /^\[next\]_internal_font_google_(amiri|tajawal|reem_kufi).*\.single\.css$/.test(name))) {
    styles += fs.readFileSync(path.join(fonts, file), 'utf8').replace(/url\("(\.\.\/media\/[^" ]+)"\)/g, (_, target) => `url("${pathToFileURL(path.resolve(fonts, target)).href}")`);
  }
}
styles += '\n:root { --font-amiri: Amiri; --font-tajawal: Tajawal; --font-reem-kufi: "Reem Kufi"; }';
const css = await postcss([tailwind()]).process(styles, { from: path.join(directory, 'input.css') });
fs.writeFileSync(path.join(directory, 'style.css'), css.css);
fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><html class="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
const environment = { ...process.env, BAGLIB_SUNNAH_TEST_DIRECTORY: directory };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/sunnah-live/main.cjs'], { env: environment, stdio: 'inherit', windowsHide: true });
const timeout = setTimeout(() => child.kill(), 120000);
child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
child.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
