import { emptySourceProps, RESEARCH_SOURCE_LIMIT as LIMIT, type ResearchSourceSearch, type ResearchSourceResult } from '../../../shared/research-editor-sources';
import { parseQuranTarget, bookStudyTarget } from '../../../shared/study-notes';
import { poetryBayts } from '../../../shared/poetry';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';
import { extractPassages } from '../../../shared/passage-extract';
import type { BookItem } from '../../../shared/types/work';
import type { LibraryFtsResult, IndexedBookPage } from '../../../shared/types/full-text-search';

/** Reuse existing preload IPCs; canonical text is fetched separately from FTS snippets. */
export function createResearchSourceSearch(api: Window['electronAPI'], books: () => BookItem[], open: (url: string) => Promise<void>, collectionLabel: (id: string) => string): ResearchSourceSearch {
  const pending = new Map<string, { cancelled: boolean }>();
  const normalize = (value: string) => normalizeArabicText(value, { normalizeTaaMarbuta: false });
  return {
    open,
    async cancel(id) { const job = pending.get(id); if (job) job.cancelled = true; await api.cancelSlashSearch(id); },
    async search(kind, raw, requestId) {
      if (!/^[a-zA-Z0-9-]{1,100}$/u.test(requestId)) throw new Error('invalid-request');
      const query = raw.trim().slice(0, 200);
      if (query.length < 2) return [];
      const job = { cancelled: false }; pending.set(requestId, job);
      const stale = () => job.cancelled || pending.get(requestId) !== job;
      const result = (props: Partial<ResearchSourceResult['props']>): ResearchSourceResult => ({ kind, props: { ...emptySourceProps(), ...props } });
      try {
        if (kind === 'ayah') {
          const catalog = await api.quran.readerCatalog();
          if (!catalog.ok || stale()) return [];
          const script = catalog.data.sources.find(s => s.kind === 'script' && s.profile === 'hafs')?.id;
          if (!script) return [];
          const digits = query.replace(/[٠-٩]/gu, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
          const ref = /^(\d{1,3}):\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/u.exec(digits);
          if (ref) {
            const from = +ref[2], to = +(ref[3] || ref[2]), surah = +ref[1];
            const label = surah + ':' + from + (to === from ? '' : '-' + to);
            if (!parseQuranTarget('quran:hafs:' + label) || to - from > 49) return [];
            let at: number | null = from;
            const ayahs: { number: number; text: string }[] = [];
            while (at !== null && at <= to) {
              const read = await api.quran.read({ script, surah, from: at });
              if (!read.ok || stale()) return [];
              ayahs.push(...read.data.ayahs.filter(a => a.number >= from && a.number <= to).map(a => ({ number: a.number, text: a.words.filter(w => !w.marker).map(w => w.text).join(' ') })));
              at = read.data.next !== null && read.data.next > at ? read.data.next : null;
            }
            if (ayahs.length !== to - from + 1) return [];
            return [result({ url: 'quran:hafs:' + label, label, text: ayahs.map(a => a.text).join('\n') })];
          }
          const translations = catalog.data.sources.filter(s => s.kind === 'translation' && s.profile === 'hafs').map(s => s.id);
          const found = await api.quran.searchAyahs({ script, text: query, translations, limit: LIMIT, requestId });
          return !found.ok || stale() ? [] : found.data.slice(0, LIMIT).map(hit => result({ url: 'quran:hafs:' + hit.surah + ':' + hit.ayah, label: hit.surah + ':' + hit.ayah, text: hit.text }));
        }
        if (kind === 'hadith') {
          const found = await api.sunnah.search?.({ text: query, limit: LIMIT, requestId });
          return !found?.ok || stale() ? [] : found.data.slice(0, LIMIT).map(hit => result({
            url: 'sunnah:' + hit.chapter.collection + ':' + hit.chapter.number + ':' + hit.hadith.id,
            label: collectionLabel(hit.chapter.collection) + ' ' + hit.hadith.number,
            text: hit.hadith.text.ar.full || [hit.hadith.text.ar.isnad, hit.hadith.text.ar.matn].filter(Boolean).join(' '),
            collection: collectionLabel(hit.chapter.collection), number: hit.hadith.number,
            grade: hit.hadith.grade.ar || hit.hadith.grade.en || '',
          }));
        }
        if (kind === 'verse') {
          const found = await api.poetry.search({ query, limit: LIMIT, requestId, offset: 0 });
          if (!found.ok || stale()) return [];
          const results: ResearchSourceResult[] = [];
          for (const poem of found.data.items.slice(0, LIMIT)) {
            if (stale()) return [];
            const detail = await api.poetry.detail(poem.id);
            if (!detail.ok || !detail.data || stale()) continue;
            const lines: unknown = JSON.parse(detail.data.verses_json);
            if (!Array.isArray(lines) || !lines.every((line): line is string => typeof line === 'string')) continue;
            const from = poem.layoutType === 'bayt' ? Math.floor((poem.match?.from ?? 0) / 2) * 2 : (poem.match?.from ?? 0);
            const passage = lines.slice(from, from + (poem.layoutType === 'bayt' ? 8 : 4));
            if (!passage.length) continue;
            const verses = poem.layoutType === 'bayt' ? poetryBayts(passage).map(v => ({ sadr: v.sadr, ajuz: v.ajuz ?? '' })) : passage.map(sadr => ({ sadr, ajuz: '' }));
            results.push(result({ url: 'poetry:ashaar:' + poem.id + ':' + from + ':' + (from + passage.length - 1), label: [poem.poetName, poem.title].filter(Boolean).join(' — '), verses, poet: poem.poetName, poem: poem.title }));
          }
          return results;
        }
        const hits = await api.searchLibraryFullText(query, { scope: 'books', limit: LIMIT, requestId }) as LibraryFtsResult[];
        if (stale()) return [];
        const results: ResearchSourceResult[] = [];
        const bookResult = (book: BookItem, page: number, text: string) => result({ url: bookStudyTarget(book, page), label: book.title + ' · ' + page, text, workId: book.id, editionId: book.editionId || '', sourceId: book.sourceId || '', page });
        for (const hit of hits.slice(0, LIMIT)) {
          const book = books().find(b => b.id === hit.bookId);
          if (!book || stale()) continue;
          const page = await api.getPageContent(book.id, hit.pageNumber) as IndexedBookPage | null;
          if (!page || stale()) continue;
          const passage = extractPassages(page.content, query, { limit: 1 })[0];
          if (passage) results.push(bookResult(book, hit.pageNumber, passage.text));
        }
        // Title lookup for an unindexed real PDF uses its text layer, never OCR.
        if (!results.length) {
          const terms = normalize(query).split(/\s+/u);
          const candidates: BookItem[] = [];
          const library = books();
          for (let i = 0; i < library.length && candidates.length < LIMIT; i++) {
            if (i % 32 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); if (stale()) return []; }
            const book = library[i];
            if (book.filePath && /\.pdf$/iu.test(book.filePath) && terms.every(term => normalize(book.title + ' ' + book.author).includes(term))) candidates.push(book);
          }
          for (const book of candidates) {
            if (stale()) return [];
            const extracted = await api.extractPdfText(book.filePath!);
            if (stale()) return [];
            if (!extracted?.text || extracted.isScannedImagePdf) continue;
            const pages: string[] = extracted.text.split(/\r?\n---PAGE_SPLIT_MARKER---\r?\n|\f/u);
            if (!pages[0].trim()) pages.shift();
            const index = pages.findIndex(t => t.trim());
            if (index >= 0) results.push(bookResult(book, index + 1, pages[index]));
          }
        }
        return stale() ? [] : results.slice(0, LIMIT);
      } finally { if (pending.get(requestId) === job) pending.delete(requestId); }
    },
  };
}
