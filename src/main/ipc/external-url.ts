/** Main-process boundary: never dispatch arbitrary OS protocols from renderer input. */
export function allowedExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || /[\u0000-\u0020\u007f]/u.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return null;
    if (parsed.protocol !== 'mailto:' && !parsed.hostname) return null;
    if (parsed.protocol === 'mailto:' && !parsed.pathname) return null;
    return url;
  } catch { return null; }
}
