export function annotationPage(location: string): number | null {
  try {
    const value = location.trim().startsWith('{') ? JSON.parse(location).page : location;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const page = Number(value);
    return Number.isSafeInteger(page) && page > 0 ? page : null;
  } catch { return null; }
}
