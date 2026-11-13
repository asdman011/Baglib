import path from 'node:path';
import { FilenameParser } from '../metadata/filename-parser';
import { readMediaTags, type MediaTags } from './media-sections';
import type { DigitalFormat } from '../../../shared/types/work';
import type { ExtractedEbookMetadata } from '../../../shared/types/digital-file';

export function mergeMediaMetadata(filename: string, tags: MediaTags): ExtractedEbookMetadata {
  const stem = path.basename(filename, path.extname(filename)).replace(/^\d+[.)]\s*/u, '');
  const parsed = FilenameParser.parse(stem + path.extname(filename));
  // Some Arabic lecture filenames separate the title and a full speaker name with two spaces.
  const parts = stem.split(/\s{2,}/u);
  const spacedSpeaker = parts.length === 2 && /^[\p{Script=Arabic}\p{M}]+(?:\s+[\p{Script=Arabic}\p{M}]+){1,3}$/u.test(parts[1]) ? parts[1] : undefined;
  const speaker = tags.speaker || parsed.authors[0] || spacedSpeaker;
  return {
    title: tags.title || (spacedSpeaker ? parts[0] : parsed.title) || path.basename(filename, path.extname(filename)),
    authors: speaker ? [speaker] : [], speaker,
    recordingDate: tags.recordingDate,
    language: parsed.language, tags: [], identifiers: {},
    format: path.extname(filename).slice(1).toLowerCase() as DigitalFormat,
  };
}
export async function readLectureMetadata(filename: string): Promise<ExtractedEbookMetadata> {
  return mergeMediaMetadata(filename, await readMediaTags(filename).catch(() => ({})));
}
