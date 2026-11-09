import { matchesStudyQuery, parseBookTarget, parseQuranTarget, studyLinkText, type StudyNote } from '../../shared/study-notes';
import type { SunnahCollectionId } from '../../shared/types/sunnah';
import { findParagraph, parseNoteTarget, stripParagraphAnchors } from '../../shared/note-paragraphs';
import type { BookItem } from '../../shared/types/work';

export type CorpusKind = 'quran' | 'hadith' | 'poem';
/** A Quran, hadith or poetry result: `link` is a study link; `quote` is a Markdown block with the text and that link. */
export interface CorpusOption { kind: CorpusKind; target: string; label: string; snippet: string; link: string; quote: string }

const toLatinDigits = (value: string) => value.replace(/[٠-٩]/gu, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
const quoted = (text: string) => text.split(/\r?\n/u).map(line => `> ${line}`).join('\n');

async function quranScript(profile: 'hafs' | 'warsh' = 'hafs'): Promise<string | null> {
  const catalog = await window.electronAPI?.quran?.readerCatalog();
  return catalog?.ok ? catalog.data.sources.find(source => source.kind === 'script' && source.profile === profile)?.id ?? null : null;
}

async function ayahTexts(surah: number, from: number, to: number, profile: 'hafs' | 'warsh' = 'hafs'): Promise<{ number: number; text: string }[]> {
  const script = await quranScript(profile);
  if (!script) return [];
  const passage = await window.electronAPI.quran.read({ script, surah, from });
  if (!passage.ok) return [];
  return passage.data.ayahs.filter(ayah => ayah.number >= from && ayah.number <= to).map(ayah => ({ number: ayah.number, text: ayah.words.filter(word => !word.marker).map(word => word.text).join(' ') }));
}

function quranOption(surah: number, from: number, to: number, ayahs: { number: number; text: string }[], profile: 'hafs' | 'warsh' = 'hafs'): CorpusOption {
  const reference = from === to ? `${surah}:${from}` : `${surah}:${from}-${to}`;
  const target = `quran:${profile}:${reference}`;
  const text = ayahs.map(ayah => `${ayah.text} (${ayah.number})`).join(' ');
  const link = studyLinkText(target, reference);
  return { kind: 'quran', target, label: reference, snippet: text.slice(0, 120), link, quote: `${quoted(`﴿${text}﴾`)}\n> ${link}` };
}

/** Searches the installed Quran (by `2:255`, `2:255-257` or words), Sunnah and poetry. Missing data gives no results, not an error. */
export async function searchCorpus(kinds: CorpusKind[], query: string, collectionLabel: (id: SunnahCollectionId) => string, limit = 6, profile: 'hafs' | 'warsh' = 'hafs'): Promise<CorpusOption[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  const jobs: Promise<CorpusOption[]>[] = [];
  if (kinds.includes('quran')) jobs.push((async () => {
    const citation = /^(\d{1,3})\s*[:：]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/u.exec(toLatinDigits(text));
    if (citation) {
      const surah = +citation[1], from = +citation[2], to = citation[3] ? +citation[3] : from;
      if (!parseQuranTarget(`quran:${profile}:${surah}:${from}${to !== from ? `-${to}` : ''}`)) return [];
      const ayahs = await ayahTexts(surah, from, to, profile);
      return ayahs.length ? [quranOption(surah, from, Math.min(to, ayahs.at(-1)!.number), ayahs, profile)] : [];
    }
    const script = await quranScript(profile);
    if (!script) return [];
    const found = await window.electronAPI.quran.searchAyahs({ script, text });
    return found.ok ? found.data.slice(0, limit).map(hit => quranOption(hit.surah, hit.ayah, hit.ayah, [{ number: hit.ayah, text: hit.text }], profile)) : [];
  })());
  if (kinds.includes('hadith')) jobs.push((async () => {
    const found = await window.electronAPI?.sunnah?.search?.({ text });
    if (!found?.ok) return [];
    return found.data.slice(0, limit).map(hit => {
      const target = `sunnah:${hit.chapter.collection}:${hit.chapter.number}:${hit.hadith.id}`;
      const label = `${collectionLabel(hit.chapter.collection)} ${hit.hadith.number}`;
      const link = studyLinkText(target, label);
      const matn = hit.hadith.text.ar.matn || hit.hadith.text.ar.full;
      return { kind: 'hadith' as const, target, label, snippet: matn.slice(0, 120), link, quote: `${quoted(matn)}\n> ${link}` };
    }).filter(option => option.link);
  })());
  if (kinds.includes('poem')) jobs.push((async () => {
    // The poetry search returns poems in storage order; fetch more and put poems whose title matches first,
    // so the poem itself comes before poems that quote it.
    const found = await window.electronAPI?.poetry?.search({ query: text, limit: 30 });
    if (!found?.ok) return [];
    const ranked = [...found.data.items].sort((a, b) => Number(matchesStudyQuery(b.title, text)) - Number(matchesStudyQuery(a.title, text)) || Number((b.match?.from ?? 1) === 0) - Number((a.match?.from ?? 1) === 0));
    return ranked.slice(0, limit).map(poem => {
      const from = poem.match?.from ?? 0;
      const lines = poem.match?.lines ?? [];
      const to = from + Math.max(lines.length - 1, 0);
      const target = `poetry:ashaar:${poem.id}:${from}:${to}`;
      const label = [poem.poetName, poem.title].filter(Boolean).join(' — ');
      const link = studyLinkText(target, label);
      const bayt = poem.language === 'ar' && poem.layoutType === 'bayt' && lines.length === 2;
      const body = bayt ? `${lines[0]}  ***  ${lines[1]}` : lines.join('\n');
      return { kind: 'poem' as const, target, label, snippet: (body || poem.title).slice(0, 120), link, quote: `${body ? `${quoted(body)}\n` : ''}> ${link}` };
    }).filter(option => option.link);
  })());
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

export interface StudyPreview { title: string; body: string; meta?: string }

/** Text for a hover card on a study link, read from local data only. */
export async function previewStudyTarget(target: string, notes: StudyNote[], books: BookItem[], collectionLabel: (id: SunnahCollectionId) => string): Promise<StudyPreview | null> {
  if (target.startsWith('note:')) {
    const parsed = parseNoteTarget(target);
    const note = parsed && notes.find(item => item.id === parsed.id);
    if (!note) return null;
    // A paragraph link previews only that paragraph; a missing anchor falls back to the whole note.
    const paragraph = parsed.anchor ? findParagraph(note.content, parsed.anchor) : undefined;
    return { title: note.title, body: stripParagraphAnchors(paragraph ? paragraph.text : note.content).slice(0, 600) };
  }
  if (target.startsWith('book:')) {
    const parsed = parseBookTarget(target);
    const book = parsed && books.find(item => item.id === parsed.id);
    return book ? { title: book.title, body: book.author || '', meta: parsed?.page ? String(parsed.page) : undefined } : null;
  }
  const quran = parseQuranTarget(target);
  if (quran) {
    const ayahs = await ayahTexts(quran.surah, quran.from, Math.min(quran.to, quran.from + 9));
    return ayahs.length ? { title: quran.from === quran.to ? `${quran.surah}:${quran.from}` : `${quran.surah}:${quran.from}-${quran.to}`, body: ayahs.map(ayah => `${ayah.text} (${ayah.number})`).join(' ') } : null;
  }
  const sunnah = /^sunnah:([^:]+):(\d+):(.+)$/u.exec(target);
  if (sunnah) {
    const chapter = await window.electronAPI?.sunnah?.chapter(sunnah[1] as SunnahCollectionId, +sunnah[2]);
    const hadith = chapter?.ok ? chapter.data.hadiths.find(item => item.id === sunnah[3]) : undefined;
    return hadith ? { title: `${collectionLabel(sunnah[1] as SunnahCollectionId)} ${hadith.number}`, body: (hadith.text.ar.matn || hadith.text.ar.full).slice(0, 800), meta: hadith.grade?.ar || undefined } : null;
  }
  const poetry = /^poetry:ashaar:(\d+):(\d+):(\d+)$/u.exec(target);
  if (poetry) {
    const detail = await window.electronAPI?.poetry?.detail(+poetry[1]);
    if (!detail?.ok || !detail.data) return null;
    let verses: string[] = [];
    try { const parsed: unknown = JSON.parse(detail.data.verses_json); if (Array.isArray(parsed)) verses = parsed.filter((line): line is string => typeof line === 'string'); } catch { /* shown without lines */ }
    return { title: [detail.data.poet_name, detail.data.title].filter(Boolean).join(' — '), body: verses.slice(+poetry[2], Math.min(+poetry[3] + 1, +poetry[2] + 8)).join('\n'), meta: detail.data.meter || undefined };
  }
  return null;
}
