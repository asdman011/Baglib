export function readerAssetUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const cleanPath = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  return `baglib-asset:///${cleanPath.split('/').map(encodeURIComponent).join('/')}`;
}
