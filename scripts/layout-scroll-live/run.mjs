import { buildSync } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/layout-scroll-'));
const css = fs.readFileSync('src/renderer/app/globals.css', 'utf8').replace('@import "./ui-motion.css";', fs.readFileSync('src/renderer/app/ui-motion.css', 'utf8'));
const result = await postcss([tailwind()]).process(css, { from: path.join(directory, 'input.css') });
fs.writeFileSync(path.join(directory, 'style.css'), result.css);
buildSync({ entryPoints: ['scripts/layout-scroll-live/main.ts'], outfile: path.join(directory, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const env = { ...process.env, BAGLIB_LAYOUT_TEST_DIRECTORY: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [path.join(directory, 'main.cjs'), '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 60_000);
child.once('exit', code => { clearTimeout(timer); process.exitCode = code ?? 1; });
