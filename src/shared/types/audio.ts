/**
 * Baglib — Audio, TTS, and Audiobook Domain Types (KEY-145)
 */

export type TTSPlaybackState = 'idle' | 'playing' | 'paused' | 'buffering' | 'stopped';

export interface TTSVoice {
  id: string;
  name: string;
  lang: string;
  isDefault?: boolean;
  localService?: boolean;
  provider?: 'pocket-tts' | 'browser';
}

export interface TTSUtteranceSegment {
  text: string;
  lang: string; // 'ar' | 'en' | etc.
  voiceId?: string;
  startIndex: number;
  endIndex: number;
}

export interface TTSConfig {
  rate: number; // 0.5 to 3.0
  pitch: number; // 0.5 to 2.0
  volume: number; // 0 to 1.0
  voiceAr?: string;
  voiceEn?: string;
  autoLanguageSwitch: boolean;
  sleepTimerMinutes?: number;
}

export interface SmilPar {
  textHref: string;
  textId: string;
  audioHref: string;
  clipBegin: number; // in seconds
  clipEnd: number; // in seconds
}

export interface SmilMediaOverlay {
  smilHref: string;
  pars: SmilPar[];
}

export interface AudiobookFile {
  id: string;
  name: string;
  path: string;
  duration: number; // in seconds
  sizeBytes?: number;
}

export interface AudiobookChapterMapping {
  ebookChapterId: string;
  audioChapterId: string;
  audioFilePath?: string;
  startOffset?: number;
  duration?: number;
}

export interface AudiobookMappingAnchor {
  ebookChapterId: string;
  audioChapterId: string;
}

export interface AudiobookPairingData {
  bookId: string;
  title?: string;
  narrator?: string;
  sourceType: 'local' | 'audiobookshelf' | 'epub_smil';
  serverUrl?: string;
  audioFiles: AudiobookFile[];
  chapterMappings: AudiobookChapterMapping[];
  createdAt: string;
  updatedAt: string;
}

export interface AudiobookPlaybackProgress {
  bookId: string;
  currentFileId?: string;
  currentTimeSeconds: number;
  playbackRate: number;
  isCompleted: boolean;
  lastPlayedAt: string;
}

export interface SaveAudiobookPairingPayload {
  bookId: string;
  title?: string;
  narrator?: string;
  sourceType: 'local' | 'audiobookshelf' | 'epub_smil';
  serverUrl?: string;
  audioFiles: AudiobookFile[];
  chapterMappings: AudiobookChapterMapping[];
}
