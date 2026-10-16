/**
 * Baglib — Audiobook & Ebook Chapter Continuum Anchor Mapping (KEY-145)
 *
 * Reverse-engineered from Readest's Continuum-style anchor mapping algorithm.
 * Pairs an anchor chapter (e.g. Audio Track 1 -> Ebook Chapter 1), and then
 * aligns subsequent and prior chapters by ordinal offset.
 */

import type {
  AudiobookChapterMapping,
  AudiobookMappingAnchor,
} from '../types/audio';

export interface AudiobookTextChapter {
  id: string;
  label: string;
  href: string;
}

export interface BuildSequentialMappingsOptions {
  ebookChapterIds: string[];
  audioChapterIds: string[];
  anchor?: AudiobookMappingAnchor;
}

/**
 * Automatically builds sequential chapter-to-audio mappings from a user-selected anchor.
 * Supports both positional arguments `(ebookIds, audioIds, anchor)` and options object `{ ebookChapterIds, audioChapterIds, anchor }`.
 */
export function buildSequentialAudiobookMappings(
  optionsOrEbookIds: string[] | BuildSequentialMappingsOptions,
  maybeAudioIds?: string[],
  maybeAnchor?: AudiobookMappingAnchor
): AudiobookChapterMapping[] {
  let ebookChapterIds: string[];
  let audioChapterIds: string[];
  let anchor: AudiobookMappingAnchor | undefined;

  if (Array.isArray(optionsOrEbookIds)) {
    ebookChapterIds = optionsOrEbookIds;
    audioChapterIds = maybeAudioIds || [];
    anchor = maybeAnchor;
  } else {
    ebookChapterIds = optionsOrEbookIds.ebookChapterIds || [];
    audioChapterIds = optionsOrEbookIds.audioChapterIds || [];
    anchor = optionsOrEbookIds.anchor;
  }

  if (ebookChapterIds.length === 0 || audioChapterIds.length === 0) {
    return [];
  }

  const defaultAnchor: AudiobookMappingAnchor = {
    ebookChapterId: ebookChapterIds[0],
    audioChapterId: audioChapterIds[0],
  };
  const activeAnchor = anchor || defaultAnchor;

  const ebookAnchorIndex = ebookChapterIds.indexOf(activeAnchor.ebookChapterId);
  const audioAnchorIndex = audioChapterIds.indexOf(activeAnchor.audioChapterId);

  if (ebookAnchorIndex < 0 || audioAnchorIndex < 0) return [];

  const offset = ebookAnchorIndex - audioAnchorIndex;

  return audioChapterIds.flatMap((audioChapterId, audioIndex) => {
    const targetEbookIndex = audioIndex + offset;
    const ebookChapterId = ebookChapterIds[targetEbookIndex];
    return ebookChapterId ? [{ ebookChapterId, audioChapterId }] : [];
  });
}
