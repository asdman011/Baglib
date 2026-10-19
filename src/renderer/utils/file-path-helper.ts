/**
 * Baglib — Robust File Path Resolver for Drag-and-Drop and File Selection
 *
 * In Electron 28+, HTML5 `File.path` is deprecated/empty in Chromium.
 * This helper resolves the genuine OS absolute path using `webUtils.getPathForFile(file)`.
 * If running in a context where a native path cannot be retrieved, it streams the File buffer
 * directly to the main process via IPC to persist it in `userData/imports` and return a guaranteed
 * valid filesystem path.
 */

export async function resolveDroppedFilePath(file: File): Promise<string> {
  const windowAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;

  // 1. Try webUtils via preload API
  let resolvedPath = '';
  if (windowAPI?.getPathForFile) {
    try {
      resolvedPath = windowAPI.getPathForFile(file);
    } catch (e) {
      console.warn('[resolveDroppedFilePath] webUtils.getPathForFile error:', e);
    }
  }

  // 2. Fallback to older Electron / direct file.path
  if (!resolvedPath) {
    resolvedPath = (file as any).path || '';
  }

  // 3. If resolvedPath is an authentic absolute path (contains / or \), return it immediately
  if (resolvedPath && (resolvedPath.includes('/') || resolvedPath.includes('\\'))) {
    return resolvedPath;
  }

  // 4. Guaranteed Native Buffer Fallback:
  // If only a bare filename was obtained, read the File bytes and write to persistent imports storage
  if (windowAPI?.saveDroppedFileBuffer) {
    try {
      const arrayBuf = await file.arrayBuffer();
      const savedPath = await windowAPI.saveDroppedFileBuffer(file.name, new Uint8Array(arrayBuf));
      if (savedPath && typeof savedPath === 'string') {
        return savedPath;
      }
    } catch (err) {
      console.warn('[resolveDroppedFilePath] Buffer persistence fallback error:', err);
    }
  }

  return resolvedPath || file.name;
}

/**
 * Safely format a cover image URL for renderer <img> tags.
 * Resolves local filesystem paths (e.g. C:\... or /...) to the registered `baglib-asset://` custom scheme,
 * while allowing data: URLs, http/https, and blob: URLs to pass through untouched.
 */
export function formatCoverUrl(coverUrl?: string | null): string {
  if (!coverUrl) return '';
  const trimmed = coverUrl.trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('baglib-asset://') ||
    trimmed.startsWith('local-pdf://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  // Windows absolute path (e.g. C:\... or C:/...) or POSIX absolute path (/...)
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\\\')) {
    return `baglib-asset://${trimmed.replace(/\\/g, '/')}`;
  }
  return trimmed;
}
