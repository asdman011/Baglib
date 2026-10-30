export type ReaderEdge = '' | 'top' | 'bottom' | 'start' | 'end';

export function readerEdge(x: number, y: number, width: number, height: number, direction: 'rtl' | 'ltr'): ReaderEdge {
  if (x < 0 || y < 0 || x > width || y > height || width <= 0 || height <= 0) return '';
  if (y < 36) return 'top';
  if (height - y < 36) return 'bottom';
  if (x < 36) return direction === 'rtl' ? 'end' : 'start';
  if (width - x < 36) return direction === 'rtl' ? 'start' : 'end';
  return '';
}
