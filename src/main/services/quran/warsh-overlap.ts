/** Comparison-only normalization. Canonical source strings are never rewritten. */
export const overlapText = (text: string) => text.replace(/[\p{M}\u0640\u06dd-\u06de\u0660-\u0669\d\s]/gu, '').replace(/[أإآٱ]/gu, 'ا');
export interface OverlapWord { ayah: number; text: string }
// A joined spelling can differ by one letter between readings (e.g. وأن لو / وألو).
// This is an alignment cost, never a canonical-text substitution.
const joinCost = (a: string, b: string): number | null => {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return null;
  let i = 0, j = 0, changes = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++changes > 1) return null;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return changes + a.length - i + b.length - j <= 1 ? 5 : null;
};
type Edge = { i: number; j: number; cost: number; pairs: string[] };
/** Global monotone word alignment, with 1:2/2:1 spelling joins and all optimal paths checked.
 * Substitutions accommodate riwayah spelling differences. Gaps cost twice a substitution.
 * A gap is attributable only inside the same ayah; a boundary gap is ambiguous.
 * The band is a resource bound, never permission to accept an incomplete alignment.
 */
export function alignWarshSurah(hafs: OverlapWord[], warsh: OverlapWord[], fatiha = false): Record<number, number[]> {
  const a = hafs.filter(word => !fatiha || word.ayah !== 1).map(word => ({ ...word, token: overlapText(word.text) })).filter(word => word.token);
  const b = warsh.map(word => ({ ...word, token: overlapText(word.text) })).filter(word => word.token);
  if (!a.length || !b.length || Math.abs(a.length - b.length) > 12) throw new Error('ambiguous-alignment');
  const width = 25, size = (a.length + 1) * width;
  const index = (i: number, j: number) => i * width + j - i + 12;
  const valid = (i: number, j: number) => i >= 0 && j >= 0 && i <= a.length && j <= b.length && Math.abs(i - j) <= 12;
  const pairs = (i: number, j: number, na: number, nb: number): string[] => {
    const aa = na ? a.slice(i, i + na) : (a[i - 1] && a[i] && a[i - 1].ayah === a[i].ayah ? [a[i]] : []);
    const bb = nb ? b.slice(j, j + nb) : (b[j - 1] && b[j] && b[j - 1].ayah === b[j].ayah ? [b[j]] : []);
    return aa.length && bb.length ? [...new Set(aa.flatMap(h => bb.map(w => `${w.ayah}:${h.ayah}`)))] : ['ambiguous'];
  };
  const edges = (i: number, j: number): Edge[] => {
    const result: Edge[] = [];
    const add = (na: number, nb: number, cost: number) => { if (valid(i + na, j + nb)) result.push({ i: i + na, j: j + nb, cost, pairs: pairs(i, j, na, nb) }); };
    if (i < a.length && j < b.length) {
      add(1, 1, a[i].token === b[j].token ? 0 : 4);
      if (i + 1 < a.length) { const cost = joinCost(a[i].token + a[i + 1].token, b[j].token); if (cost !== null) add(2, 1, cost); }
      if (j + 1 < b.length) { const cost = joinCost(a[i].token, b[j].token + b[j + 1].token); if (cost !== null) add(1, 2, cost); }
    }
    if (i < a.length) add(1, 0, 8);
    if (j < b.length) add(0, 1, 8);
    return result;
  };
  const suffix = new Float64Array(size).fill(Infinity);
  suffix[index(a.length, b.length)] = 0;
  for (let i = a.length; i >= 0; i--) for (let j = Math.min(b.length, i + 12); j >= Math.max(0, i - 12); j--) {
    if (i === a.length && j === b.length) continue;
    for (const edge of edges(i, j)) suffix[index(i, j)] = Math.min(suffix[index(i, j)], edge.cost + suffix[index(edge.i, edge.j)]);
  }
  if (!Number.isFinite(suffix[index(0, 0)]) || suffix[index(0, 0)] > Math.max(8, 4 * Math.max(a.length, b.length) * 0.3)) throw new Error('ambiguous-alignment');
  // Retain only the optimal DAG reachable from the start.
  const reachable = new Uint8Array(size); reachable[index(0, 0)] = 1;
  const graph: { at: number; edges: { at: number; pairs: string[] }[] }[] = [];
  const possible = new Set<string>();
  for (let i = 0; i <= a.length; i++) for (let j = Math.max(0, i - 12); j <= Math.min(b.length, i + 12); j++) {
    const at = index(i, j);
    if (!reachable[at]) continue;
    const next = edges(i, j).filter(edge => edge.cost + suffix[index(edge.i, edge.j)] === suffix[at]).map(edge => {
      const target = index(edge.i, edge.j); reachable[target] = 1;
      for (const pair of edge.pairs) possible.add(pair);
      return { at: target, pairs: edge.pairs };
    });
    graph.push({ at, edges: next });
  }
  if (possible.has('ambiguous')) throw new Error('ambiguous-alignment');
  const end = index(a.length, b.length);
  // Every possible ayah pair must occur on EVERY optimal path. Interior spelling ties are harmless.
  for (const pair of possible) {
    const avoiding = new Uint8Array(size); avoiding[index(0, 0)] = 1;
    for (const node of graph) if (avoiding[node.at]) for (const edge of node.edges) if (!edge.pairs.includes(pair)) avoiding[edge.at] = 1;
    if (avoiding[end]) throw new Error('ambiguous-alignment');
  }
  const result: Record<number, number[]> = {};
  for (const pair of possible) { const [w, h] = pair.split(':').map(Number); (result[w] ??= []).push(h); }
  for (const refs of Object.values(result)) refs.sort((x, y) => x - y);
  if (new Set(a.map(word => word.ayah)).size !== new Set(Object.values(result).flat()).size || new Set(b.map(word => word.ayah)).size !== Object.keys(result).length) throw new Error('ambiguous-alignment');
  return result;
}