import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function researchEditorDirectory(packaged: boolean, resources: string, project: string): string {
  return packaged ? path.join(resources, 'research-editor') : path.join(project, 'research-editor', 'dist');
}
export async function researchEditorAvailable(directory: string): Promise<boolean> {
  try { return (await fs.stat(path.join(directory, 'index.html'))).isFile(); } catch { return false; }
}
/** Resolve only files within the requested root, with the renderer's existing HTML fallback. */
export async function researchEditorFile(url: string, editorDirectory: string, rendererDirectory: string): Promise<string | null> {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const editor = pathname === '/research-editor' || pathname.startsWith('/research-editor/');
  const root = editor ? editorDirectory : rendererDirectory;
  const relative = editor ? pathname.slice('/research-editor'.length) : pathname;
  const target = path.resolve(root, '.' + relative);
  const inside = path.relative(root, target);
  if (inside.startsWith('..') || path.isAbsolute(inside) || pathname.includes('\\') || pathname.includes('\0')) return null;
  const candidates = [target, path.join(target, 'index.html'), target + '.html'];
  for (const candidate of candidates) {
    try { if ((await fs.stat(candidate)).isFile()) return pathToFileURL(candidate).toString(); } catch { /* Try HTML routing. */ }
  }
  if (!editor && (!path.extname(target) || path.extname(target) === '.html')) return pathToFileURL(path.join(root, 'index.html')).toString();
  return null;
}
