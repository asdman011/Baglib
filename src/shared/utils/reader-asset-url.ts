export function readerAssetUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  // Preserve Windows drive letter (e.g. "C:" or "F:") unencoded so Chromium WHATWG URL parser does not reject '%3A' in host
  const driveMatch = /^(\/)?([a-zA-Z]:)(?:\/(.*))?$/.exec(normalized);
  if (driveMatch) {
    const drive = driveMatch[2];
    const rest = driveMatch[3];
    if (!rest) {
      return `baglib-asset:///${drive}/`;
    }
    const encodedRest = rest.split('/').map(encodeURIComponent).join('/');
    return `baglib-asset:///${drive}/${encodedRest}`;
  }
  const cleanPath = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  return `baglib-asset:///${cleanPath.split('/').map(encodeURIComponent).join('/')}`;
}
