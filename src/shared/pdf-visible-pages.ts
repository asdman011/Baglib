export function nearbyPdfPages(intersections: ReadonlyMap<number, number>, totalPages: number): Set<number> {
  const pages = new Set<number>();
  for (const page of intersections.keys()) {
    for (const candidate of [page - 1, page, page + 1]) {
      if (candidate >= 1 && candidate <= totalPages) pages.add(candidate);
    }
  }
  return pages;
}
