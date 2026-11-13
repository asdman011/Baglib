import path from 'node:path';

/**
 * KEY-264: where the bundled QUL resources live.
 * Development builds read the developer copy under `repos/Quran/QUL Developer Resources`. Installed builds read the
 * basic packs shipped in the installer's resources (`resources/quran/QUL Developer Resources`). Recitation audio is
 * not shipped, so it stays an in-app download.
 */
export interface QulLayout { packaged: boolean; appPath: string; resourcesPath?: string }

export const QUL_FOLDER = 'QUL Developer Resources';

/** The QUL resources folder, or null for an installed build that has no resources path. */
export function qulResourceRoot(layout: QulLayout): string | null {
  if (layout.packaged) return layout.resourcesPath ? path.join(layout.resourcesPath, 'quran', QUL_FOLDER) : null;
  return path.join(layout.appPath, 'repos', 'Quran', QUL_FOLDER);
}

/**
 * The file for a reader preset. A few presets live outside the QUL folder in development (their relative path starts
 * with `..`); installed builds ship those files flat in `resources/quran/extra`.
 */
export function qulPresetFile(layout: QulLayout, preset: { relative: string; filename: string }): string | null {
  const root = qulResourceRoot(layout);
  if (!root) return null;
  if (layout.packaged && preset.relative.startsWith('..')) return path.join(root, '..', 'extra', preset.filename);
  return path.join(root, preset.relative, preset.filename);
}

/**
 * The local copy of a Tarteel ayah recitation (Husary or Minshawi), when the audio folder exists next to the QUL
 * resources. Returns null for any other address, a mismatched surah/ayah, or an installed build without a root.
 */
export function suppliedRecitationFile(root: string | null, audioUrl: string, surah: number, ayah: number): string | null {
  if (!root) return null;
  let url: URL;
  try { url = new URL(audioUrl); } catch { return null; }
  const source = url.origin === 'https://audio-cdn.tarteel.ai' ? url.pathname.match(/^\/quran\/(husary|minshawyMurattal)\/(\d{3})(\d{3})\.mp3$/) : null;
  if (!source || Number(source[2]) !== surah || Number(source[3]) !== ayah) return null;
  return path.join(root, '3-Recitations and segments data', 'audio', source[1] === 'husary' ? 'husary' : 'minshawi', source[2], `${source[2]}${source[3]}.mp3`);
}
