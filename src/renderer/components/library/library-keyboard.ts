export interface LibraryNavigation {
  key: string;
  index: number;
  count: number;
  columns: number;
  dir: 'rtl' | 'ltr';
}

/** Returns a visible-page book index. Horizontal navigation follows reading direction. */
export function libraryNavigationIndex({ key, index, count, columns, dir }: LibraryNavigation): number | null {
  if (count < 1 || index < 0 || index >= count) return null;
  const rowSize = Math.max(1, Math.floor(columns));
  const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  let next: number;
  switch (key) {
    case forward: next = index + 1; break;
    case backward: next = index - 1; break;
    case 'ArrowDown':
      if (Math.floor(index / rowSize) === Math.floor((count - 1) / rowSize)) return index;
      next = index + rowSize;
      break;
    case 'ArrowUp': next = index >= rowSize ? index - rowSize : index; break;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
  return Math.max(0, Math.min(count - 1, next));
}
