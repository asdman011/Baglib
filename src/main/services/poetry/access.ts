export function poetryOriginAllowed(rawUrl: string, mainFrame: boolean): boolean {
  if (!mainFrame) return false;
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password) return false;
    return url.protocol === 'file:' && !url.hostname || url.protocol === 'app:' && url.hostname === '-' || url.origin === 'http://localhost:3000';
  } catch { return false; }
}
