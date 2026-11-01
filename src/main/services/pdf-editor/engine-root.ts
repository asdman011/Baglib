import fs from 'node:fs';
import path from 'node:path';

/** The engine tools an installed app carries, or null when running from the repository. */
export function bundledPdfEngineRoot(): string | null {
  if (!process.resourcesPath) return null;
  const bundled = path.join(process.resourcesPath, 'pdf-engine');
  return fs.existsSync(bundled) ? bundled : null;
}

export function pdfEngineRoot(): string {
  return bundledPdfEngineRoot() ?? path.resolve('.baglib-data', 'pdf-engine');
}

/** A venv cannot move between machines, so installers carry an embeddable Python instead. */
export function pdfEnginePython(root: string): string {
  const candidates = [path.join(root, 'venv', 'Scripts', 'python.exe'), path.join(root, 'python', 'python.exe'), path.join(root, 'venv', 'bin', 'python')];
  return candidates.find(candidate => fs.existsSync(candidate)) ?? candidates[process.platform === 'win32' ? 0 : 2];
}
