export const POCKET_TTS_LANGUAGES = [
  'english',
  'french',
  'german',
  'portuguese',
  'italian',
  'spanish',
  'dutch',
] as const;

export type PocketTTSLanguage = (typeof POCKET_TTS_LANGUAGES)[number];

export interface TTSProviderInitOptions {
  language?: PocketTTSLanguage;
  quantize?: boolean;
}

export interface TTSProviderVoiceOptions {
  voiceId: string;
  language?: PocketTTSLanguage;
}

export interface TTSProviderSynthesisRequest {
  jobId: string;
  text: string;
  language: PocketTTSLanguage;
  voiceId?: string;
}

export interface TTSProviderAudioChunk {
  jobId: string;
  pcmBase64: string;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  final?: boolean;
}

export interface TTSProviderStatus {
  providerId: 'pocket-tts';
  available: boolean;
  running: boolean;
  supportedLanguages: PocketTTSLanguage[];
  activeLanguages: PocketTTSLanguage[];
  message?: string;
}

export interface TTSProvider {
  readonly id: 'pocket-tts';
  init(options?: TTSProviderInitOptions): Promise<TTSProviderStatus>;
  loadVoice(options: TTSProviderVoiceOptions): Promise<void>;
  synthesize(
    request: TTSProviderSynthesisRequest,
    onChunk: (chunk: TTSProviderAudioChunk) => void,
  ): Promise<void>;
  stop(jobId?: string): Promise<void>;
  release(): Promise<void>;
  getStatus(): TTSProviderStatus;
}
