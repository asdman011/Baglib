// Summarizes the latest native scroll benchmark: frame budget plus the functions that were busy during the slowest frames.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.baglib-data/pdf-workstation-live');
const runs = fs.readdirSync(root).map(name => path.join(root, name)).filter(run => fs.existsSync(path.join(run, 'performance.json')));
const run = runs.sort((first, second) => fs.statSync(second).mtimeMs - fs.statSync(first).mtimeMs)[0];
const report = JSON.parse(fs.readFileSync(path.join(run, 'performance.json'), 'utf8'));
const deltas = report.deltas.slice(1);
const sorted = [...deltas].sort((first, second) => first - second);
const budget = 17; // rAF timestamps land on a 16.6/16.7/16.8 grid at 60 Hz
console.log({ run: path.basename(run), frames: deltas.length, overBudget: deltas.filter(value => value > budget).length, p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1), longTasks: report.longTasks.length, maxCanvases: report.maxCanvases, slowFrames: deltas.flatMap((value, index) => value > budget ? [[index, Math.round(value)]] : []) });

const profile = JSON.parse(fs.readFileSync(path.join(run, 'scroll.cpuprofile'), 'utf8'));
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const self = new Map();
let time = 0;
const windowMs = Number(process.argv[2] ?? 300);
profile.samples.forEach((id, index) => {
  const delta = (profile.timeDeltas[index] ?? 0) / 1000;
  time += delta;
  if (time > windowMs) return;
  const frame = nodes.get(id).callFrame;
  const key = `${frame.functionName || '(anonymous)'} ${path.basename(frame.url || '')}:${frame.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + delta);
});
console.log([...self].sort((first, second) => second[1] - first[1]).slice(0, 18).map(([name, ms]) => `${ms.toFixed(1)}ms ${name}`).join('\n'));
