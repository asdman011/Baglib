export interface LectureSeriesItem { workId: string; title: string; completed: boolean }
export interface LectureSeries {
  id: string; name: string; autoplayNext: boolean; createdAt: string; updatedAt: string; items: LectureSeriesItem[];
}
export interface LectureSeriesAPI {
  list(): Promise<LectureSeries[]>;
  create(name: string): Promise<LectureSeries>;
  update(id: string, changes: { name?: string; autoplayNext?: boolean }): Promise<void>;
  remove(id: string): Promise<void>;
  assign(workId: string, seriesId: string | null): Promise<void>;
  reorder(id: string, workIds: string[]): Promise<void>;
}
export function validSeriesName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('invalid-request');
  return name.trim();
}
export function nextSeriesLecture(series: LectureSeries[], workId: string): { series: LectureSeries; next: LectureSeriesItem } | null {
  const group = series.find(item => item.items.some(lecture => lecture.workId === workId));
  if (!group) return null;
  const next = group.items[group.items.findIndex(item => item.workId === workId) + 1];
  return next ? { series: group, next } : null;
}
