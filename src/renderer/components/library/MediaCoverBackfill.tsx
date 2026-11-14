'use client';

import { useEffect, useRef } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { isLectureFormat } from '../../../shared/lectures';
import { resolveMediaCover } from '../../utils/media-cover';

export function MediaCoverBackfill() {
  const { books, refreshBooks } = useWorkspace();
  const attempted = useRef(new Set<string>());
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    const api = window.electronAPI?.lectures;
    if (!api?.embeddedCover || !api.saveCoverFrame) return;
    for (const book of books) {
      const key = book.id + ':' + book.filePath;
      if (book.coverImage || !book.filePath || !isLectureFormat(book.digitalFormat) || attempted.current.has(key)) continue;
      attempted.current.add(key);
      queue.current = queue.current.then(async () => {
        const cover = await resolveMediaCover(book, api);
        if (cover) await refreshBooks();
      }).catch(() => {});
    }
  }, [books, refreshBooks]);
  return null;
}
