/**
 * Baglib — Audio & Multilingual TTS Playback Hook (KEY-145)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  TTSPlaybackState,
  TTSVoice,
  TTSConfig,
  TTSUtteranceSegment,
  AudiobookPairingData,
  SmilMediaOverlay,
  SmilPar,
} from '../../shared/types/audio';
import { segmentMixedTextForTTS, detectDominantLanguage } from '../../shared/utils/tts-language-segmenter';
import type { PocketTTSLanguage, TTSProviderAudioChunk } from '../../shared/types/tts-provider';
import { POCKET_TTS_LANGUAGES } from '../../shared/types/tts-provider';
import { segmentTextIntoSentences } from '../../shared/utils/tts-text';

export type TTSProviderNoticeKind = 'unavailable' | 'arabicUnsupported' | 'playbackFallback';

export interface UseTTSAudioOptions {
  bookId?: string;
  initialText?: string;
  language?: string;
  onSentenceChange?: (sentenceIndex: number, text: string) => void;
  onOverlayParChange?: (par: SmilPar | null) => void;
  onProviderNotice?: (message: string, kind?: TTSProviderNoticeKind) => void;
}

export function useTTSAudio(options: UseTTSAudioOptions = {}) {
  const { bookId, initialText = '', language = 'en', onSentenceChange, onOverlayParChange, onProviderNotice } = options;

  // Playback state
  const [playbackState, setPlaybackState] = useState<TTSPlaybackState>('idle');
  const [playbackMode, setPlaybackMode] = useState<'tts' | 'audiobook' | 'smil'>('tts');

  // Text & Sentences
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(0);
  const [activeWord, setActiveWord] = useState<string>('');

  // Audio / Audiobook state
  const [audiobookPairing, setAudiobookPairing] = useState<AudiobookPairingData | null>(null);
  const [currentAudioFileIndex, setCurrentAudioFileIndex] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // EPUB 3 Media Overlay SMIL state
  const [activeSmilOverlay, setActiveSmilOverlay] = useState<SmilMediaOverlay | null>(null);
  const [activeSmilPar, setActiveSmilPar] = useState<SmilPar | null>(null);

  // TTS Config & Voices
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [config, setConfig] = useState<TTSConfig>({
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    autoLanguageSwitch: true,
  });

  // Sleep Timer
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number | null>(null);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const utteranceQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const sentencesRef = useRef<string[]>([]);
  const currentSentenceRef = useRef(0);
  const configRef = useRef(config);
  const pocketContextRef = useRef<AudioContext | null>(null);
  const pocketGainRef = useRef<GainNode | null>(null);
  const pocketSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const pocketJobRef = useRef<string | null>(null);
  const pocketJobCompleteRef = useRef(false);
  const pocketNextPlayTimeRef = useRef(0);
  const pocketUnavailableRef = useRef(false);
  const pocketPlayRef = useRef<(sentenceIdx: number) => void>(() => undefined);
  const pocketPrefetchRef = useRef<{ index: number; jobId: string; chunks: TTSProviderAudioChunk[]; complete: boolean } | null>(null);
  const pocketChunkRef = useRef<(chunk: TTSProviderAudioChunk) => void>(() => undefined);
  const pocketSessionRef = useRef(0);

  const cancelPocketQueue = useCallback(() => {
    pocketSessionRef.current++;
    const ttsApi = window.electronAPI?.audio?.tts;
    const prefetched = pocketPrefetchRef.current;
    pocketPrefetchRef.current = null;
    if (prefetched) ttsApi?.stop(prefetched.jobId).catch(() => undefined);
    if (pocketJobRef.current) ttsApi?.stop(pocketJobRef.current).catch(() => undefined);
    pocketJobRef.current = null;
    pocketJobCompleteRef.current = false;
    for (const source of pocketSourcesRef.current) {
      source.onended = null;
      try { source.stop(); } catch {}
    }
    pocketSourcesRef.current.clear();
    pocketNextPlayTimeRef.current = 0;
  }, []);

  const prefetchPocketSentence = useCallback((index: number) => {
    const ttsApi = window.electronAPI?.audio?.tts;
    const text = sentencesRef.current[index];
    if (!ttsApi || !text || pocketPrefetchRef.current) return;
    if (segmentMixedTextForTTS(text).some((segment) => segment.lang === 'ar')) return;
    const jobId = crypto.randomUUID();
    const entry = { index, jobId, chunks: [] as TTSProviderAudioChunk[], complete: false };
    pocketPrefetchRef.current = entry;
    void ttsApi.synthesize({
      jobId,
      text,
      language: (detectDominantLanguage(text, language) || language) as PocketTTSLanguage,
      voiceId: configRef.current.voiceEn?.startsWith('pocket:') ? configRef.current.voiceEn : undefined,
    }).catch(() => {
      if (pocketPrefetchRef.current === entry) pocketPrefetchRef.current = null;
    });
  }, [language]);

  useEffect(() => {
    sentencesRef.current = sentences;
  }, [sentences]);

  useEffect(() => {
    currentSentenceRef.current = currentSentenceIndex;
  }, [currentSentenceIndex]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Split text into readable sentences
  const splitSentences = useCallback((raw: string): string[] => {
    return segmentTextIntoSentences(raw).map((sentence) => sentence.text);
  }, []);

  // Initialize sentences when initialText changes
  useEffect(() => {
    if (initialText) {
      const parsed = splitSentences(initialText);
      sentencesRef.current = parsed;
      setSentences(parsed);
      setCurrentSentenceIndex(0);
    }
  }, [initialText, splitSentences]);

  // Load available speech synthesis voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;

      const updateVoices = () => {
        const rawVoices = window.speechSynthesis.getVoices();
        const mapped: TTSVoice[] = rawVoices.map((v) => ({
          id: v.voiceURI || v.name,
          name: v.name,
          lang: v.lang,
          isDefault: v.default,
          localService: v.localService,
          provider: 'browser',
        }));
        setVoices((previous) => [...previous.filter((voice) => voice.provider === 'pocket-tts'), ...mapped]);

        // Auto-select preferred Arabic & English voices if not yet configured
        const arVoice = mapped.find((v) => v.lang.toLowerCase().startsWith('ar'));

        setConfig((prev) => ({
          ...prev,
          voiceAr: prev.voiceAr || arVoice?.id,
          voiceEn: prev.voiceEn || 'pocket:alba',
        }));
      };

      updateVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = updateVoices;
      }
    }
  }, []);

  useEffect(() => {
    const ttsApi = typeof window !== 'undefined' ? window.electronAPI?.audio?.tts : undefined;
    if (!ttsApi) return;

    let mounted = true;
    Promise.all([ttsApi.getVoices(), ttsApi.getStatus()])
      .then(([pocketVoices, status]) => {
        if (!mounted) return;
        const mapped = (pocketVoices || []).map((voice: TTSVoice) => ({ ...voice, provider: 'pocket-tts' as const }));
        setVoices((previous) => [...mapped, ...previous.filter((voice) => voice.provider !== 'pocket-tts')]);
        if (!status?.available && status?.message && status.message !== 'Pocket TTS has not been initialized.') {
          onProviderNotice?.(status.message);
        }
      })
      .catch((error) => onProviderNotice?.(error instanceof Error ? error.message : String(error)));

    return () => {
      mounted = false;
    };
  }, [onProviderNotice]);

  useEffect(() => {
    const voiceId = config.voiceEn;
    if (!voiceId?.startsWith('pocket:') || !window.electronAPI?.audio?.tts) return;
    const normalizedLanguage = language.toLowerCase().split('-')[0];
    const languageMap: Record<string, PocketTTSLanguage> = {
      en: 'english', fr: 'french', de: 'german', pt: 'portuguese', it: 'italian', es: 'spanish', nl: 'dutch',
    };
    window.electronAPI.audio.tts.loadVoice({
      voiceId,
      language: languageMap[normalizedLanguage] || 'english',
    }).catch((error) => onProviderNotice?.(error instanceof Error ? error.message : String(error)));
  }, [config.voiceEn, language, onProviderNotice]);

  // Handle SpeechSynthesis segment execution
  const speakSegment = useCallback(
    (segments: TTSUtteranceSegment[], segIdx: number, sentenceIdx: number) => {
      if (!synthRef.current || !isPlayingRef.current) return;
      if (segIdx >= segments.length) {
        // Move to next sentence
        const nextSentenceIdx = sentenceIdx + 1;
        if (nextSentenceIdx < sentences.length) {
          setCurrentSentenceIndex(nextSentenceIdx);
          onSentenceChange?.(nextSentenceIdx, sentences[nextSentenceIdx]);
          const nextSegments = segmentMixedTextForTTS(sentences[nextSentenceIdx]);
          speakSegment(nextSegments, 0, nextSentenceIdx);
        } else {
          setPlaybackState('idle');
          isPlayingRef.current = false;
        }
        return;
      }

      setCurrentSegmentIndex(segIdx);
      const seg = segments[segIdx];
      const utterance = new SpeechSynthesisUtterance(seg.text);

      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      utterance.volume = config.volume;

      // Select voice based on segment language
      const allVoices = window.speechSynthesis.getVoices();
      if (seg.lang === 'ar') {
        const arV = allVoices.find((v) => (config.voiceAr ? v.voiceURI === config.voiceAr : v.lang.startsWith('ar')));
        if (arV) utterance.voice = arV;
        utterance.lang = arV?.lang || 'ar-SA';
      } else {
        const enV = allVoices.find((v) => (config.voiceEn ? v.voiceURI === config.voiceEn : v.lang.startsWith('en')));
        if (enV) utterance.voice = enV;
        utterance.lang = enV?.lang || 'en-US';
      }

      utterance.onboundary = (e) => {
        if (e.name === 'word') {
          const word = seg.text.substring(e.charIndex, e.charIndex + (e.charLength || 6));
          setActiveWord(word.trim());
        }
      };

      utterance.onend = () => {
        if (isPlayingRef.current) {
          speakSegment(segments, segIdx + 1, sentenceIdx);
        }
      };

      utterance.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('[useTTSAudio] SpeechSynthesis error:', e);
        }
        if (isPlayingRef.current) {
          speakSegment(segments, segIdx + 1, sentenceIdx);
        }
      };

      synthRef.current.speak(utterance);
    },
    [config, sentences, onSentenceChange]
  );

  // Play TTS
  const playTTS = useCallback(
    (sentenceIdx = currentSentenceIndex) => {
      const sentenceList = sentencesRef.current;
      if (sentenceIdx < 0 || sentenceIdx >= sentenceList.length) return;
      const sentenceSegments = segmentMixedTextForTTS(sentenceList[sentenceIdx]);
      const hasArabic = sentenceSegments.some((segment) => segment.lang === 'ar');
      const sentenceLanguage = detectDominantLanguage(sentenceList[sentenceIdx], language);
      if (!hasArabic && sentenceLanguage !== 'ar' && window.electronAPI?.audio?.tts && !pocketUnavailableRef.current) {
        pocketPlayRef.current(sentenceIdx);
        return;
      }
      if (!synthRef.current) return;
      synthRef.current.cancel();

      if (sentenceIdx >= sentenceList.length) {
        setPlaybackState('idle');
        return;
      }

      isPlayingRef.current = true;
      setPlaybackState('playing');
      setPlaybackMode('tts');
      setCurrentSentenceIndex(sentenceIdx);

      onSentenceChange?.(sentenceIdx, sentenceList[sentenceIdx]);
      const segments = segmentMixedTextForTTS(sentenceList[sentenceIdx]);
      speakSegment(segments, 0, sentenceIdx);
    },
    [currentSentenceIndex, language, speakSegment, onSentenceChange]
  );

  const getPocketAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!pocketContextRef.current) {
      const AudioContextConstructor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextConstructor) return null;
      pocketContextRef.current = new AudioContextConstructor();
    }
    const context = pocketContextRef.current;
    if (!context) return null;
    if (!pocketGainRef.current) {
      pocketGainRef.current = context.createGain();
      pocketGainRef.current.connect(context.destination);
      pocketGainRef.current.gain.value = configRef.current.volume;
    }
    return context;
  }, []);

  const finishPocketSentence = useCallback(() => {
    if (!isPlayingRef.current || !pocketJobCompleteRef.current) return;
    pocketJobRef.current = null;
    pocketJobCompleteRef.current = false;
    const nextIndex = currentSentenceRef.current + 1;
    if (nextIndex < sentencesRef.current.length) {
      currentSentenceRef.current = nextIndex;
      setCurrentSentenceIndex(nextIndex);
      onSentenceChange?.(nextIndex, sentencesRef.current[nextIndex]);
      pocketPlayRef.current(nextIndex);
      return;
    }
    setPlaybackState('idle');
    isPlayingRef.current = false;
  }, [onSentenceChange]);

  const playPocketSentence = useCallback(
    async (sentenceIdx: number) => {
      const ttsApi = window.electronAPI?.audio?.tts;
      const sentenceList = sentencesRef.current;
      if (!ttsApi || !sentenceList[sentenceIdx]) return;
      const detected = detectDominantLanguage(sentenceList[sentenceIdx], language);
      if (detected === 'ar') {
        onProviderNotice?.('Pocket TTS does not currently provide an official Arabic model; using the available local voice provider instead.', 'arabicUnsupported');
        if (synthRef.current) {
          isPlayingRef.current = true;
          setPlaybackState('playing');
          setPlaybackMode('tts');
          setCurrentSentenceIndex(sentenceIdx);
          onSentenceChange?.(sentenceIdx, sentenceList[sentenceIdx]);
          speakSegment(segmentMixedTextForTTS(sentenceList[sentenceIdx]), 0, sentenceIdx);
        }
        return;
      }

      const pocketLanguage = (POCKET_TTS_LANGUAGES.includes(detected as PocketTTSLanguage)
        ? detected
        : language) as PocketTTSLanguage;
      const context = getPocketAudioContext();
      if (!context) {
        pocketUnavailableRef.current = true;
        onProviderNotice?.('Pocket TTS audio playback is unavailable in this environment. Using browser speech instead.', 'playbackFallback');
        isPlayingRef.current = true;
        setPlaybackState('playing');
        setPlaybackMode('tts');
        setCurrentSentenceIndex(sentenceIdx);
        onSentenceChange?.(sentenceIdx, sentenceList[sentenceIdx]);
        speakSegment(segmentMixedTextForTTS(sentenceList[sentenceIdx]), 0, sentenceIdx);
        return;
      }
      const session = pocketSessionRef.current;
      if (context.state === 'suspended') await context.resume();
      if (session !== pocketSessionRef.current) return;
      if (pocketJobRef.current) await ttsApi.stop(pocketJobRef.current);

      isPlayingRef.current = true;
      setPlaybackState('buffering');
      setPlaybackMode('tts');
      setCurrentSentenceIndex(sentenceIdx);
      currentSentenceRef.current = sentenceIdx;
      setCurrentTime(0);
      setDuration(0);
      onSentenceChange?.(sentenceIdx, sentenceList[sentenceIdx]);
      pocketNextPlayTimeRef.current = Math.max(context.currentTime + 0.03, pocketNextPlayTimeRef.current);
      pocketJobCompleteRef.current = false;

      const prefetched = pocketPrefetchRef.current;
      if (prefetched?.index === sentenceIdx) {
        pocketPrefetchRef.current = null;
        pocketJobRef.current = prefetched.jobId;
        for (const chunk of prefetched.chunks) pocketChunkRef.current(chunk);
        pocketJobCompleteRef.current = prefetched.complete;
        if (prefetched.complete) {
          prefetchPocketSentence(sentenceIdx + 1);
          if (pocketSourcesRef.current.size === 0) finishPocketSentence();
        }
        return;
      }

      try {
        const jobId = crypto.randomUUID();
        pocketJobRef.current = jobId;
        await ttsApi.synthesize({
          jobId,
          text: sentenceList[sentenceIdx],
          language: pocketLanguage,
          voiceId: configRef.current.voiceEn?.startsWith('pocket:') ? configRef.current.voiceEn : undefined,
        });
        if (session !== pocketSessionRef.current) await ttsApi.stop(jobId);
      } catch (error) {
        if (session !== pocketSessionRef.current) return;
        setPlaybackState('idle');
        isPlayingRef.current = false;
        onProviderNotice?.(error instanceof Error ? error.message : String(error));
      }
    },
    [getPocketAudioContext, language, onProviderNotice, onSentenceChange, speakSegment, prefetchPocketSentence, finishPocketSentence]
  );

  useEffect(() => {
    pocketPlayRef.current = playPocketSentence;
  }, [playPocketSentence]);

  useEffect(() => {
    const ttsApi = typeof window !== 'undefined' ? window.electronAPI?.audio?.tts : undefined;
    if (!ttsApi) return;

    const decodeChunk = (chunk: TTSProviderAudioChunk) => {
      const prefetched = pocketPrefetchRef.current;
      if (prefetched?.jobId === chunk.jobId) {
        if (chunk.pcmBase64) prefetched.chunks.push(chunk);
        return;
      }
      if (chunk.jobId !== pocketJobRef.current || !chunk.pcmBase64) return;
      const context = getPocketAudioContext();
      if (!context) return;
      const bytes = Uint8Array.from(atob(chunk.pcmBase64), (value) => value.charCodeAt(0));
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      const frameCount = Math.floor(samples.length / chunk.channels);
      const buffer = context.createBuffer(chunk.channels, frameCount, chunk.sampleRate);
      for (let channel = 0; channel < chunk.channels; channel++) {
        const output = buffer.getChannelData(channel);
        for (let frame = 0; frame < frameCount; frame++) {
          output[frame] = samples[frame * chunk.channels + channel] / 32768;
        }
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = configRef.current.rate;
      source.connect(pocketGainRef.current || context.destination);
      const startAt = Math.max(context.currentTime + 0.02, pocketNextPlayTimeRef.current);
      source.start(startAt);
      pocketNextPlayTimeRef.current = startAt + buffer.duration / configRef.current.rate;
      pocketSourcesRef.current.add(source);
      if (isPlayingRef.current) setPlaybackState('playing');
      setDuration((value) => value + buffer.duration / configRef.current.rate);
      source.onended = () => {
        pocketSourcesRef.current.delete(source);
        if (pocketJobCompleteRef.current && pocketSourcesRef.current.size === 0) finishPocketSentence();
      };
    };
    pocketChunkRef.current = decodeChunk;

    const onComplete = ({ jobId }: { jobId: string }) => {
      if (pocketPrefetchRef.current?.jobId === jobId) {
        pocketPrefetchRef.current.complete = true;
        return;
      }
      if (jobId !== pocketJobRef.current) return;
      pocketJobCompleteRef.current = true;
      prefetchPocketSentence(currentSentenceRef.current + 1);
      const context = getPocketAudioContext();
      if (!context || pocketSourcesRef.current.size === 0) {
        finishPocketSentence();
        return;
      }
    };

    const onError = ({ jobId, message }: { jobId: string; message: string }) => {
      if (pocketPrefetchRef.current?.jobId === jobId) {
        pocketPrefetchRef.current = null;
        return;
      }
      if (jobId !== pocketJobRef.current) return;
      const failedSentenceIndex = currentSentenceRef.current;
      cancelPocketQueue();
      pocketJobRef.current = null;
      pocketJobCompleteRef.current = false;
      pocketUnavailableRef.current = true;
      setPlaybackState('idle');
      isPlayingRef.current = false;
      onProviderNotice?.(message, 'playbackFallback');
      if (synthRef.current && sentencesRef.current[failedSentenceIndex]) {
        isPlayingRef.current = true;
        setPlaybackState('playing');
        setPlaybackMode('tts');
        setCurrentSentenceIndex(failedSentenceIndex);
        onSentenceChange?.(failedSentenceIndex, sentencesRef.current[failedSentenceIndex]);
        speakSegment(segmentMixedTextForTTS(sentencesRef.current[failedSentenceIndex]), 0, failedSentenceIndex);
      }
    };

    const removeChunk = ttsApi.onChunk(decodeChunk);
    const removeComplete = ttsApi.onComplete(onComplete);
    const removeError = ttsApi.onError(onError);
    return () => {
      removeChunk();
      removeComplete();
      removeError();
    };
  }, [finishPocketSentence, getPocketAudioContext, onProviderNotice, onSentenceChange, speakSegment, prefetchPocketSentence, cancelPocketQueue]);

  // Audio element setup for Audiobook & SMIL
  const getOrCreateAudioElement = useCallback(() => {
    if (!audioRef.current && typeof window !== 'undefined') {
      const audio = new Audio();
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration || 0);

        // SMIL Media Overlay synchronization
        if (activeSmilOverlay && activeSmilOverlay.pars.length > 0) {
          const t = audio.currentTime;
          const matchingPar = activeSmilOverlay.pars.find(
            (p) => t >= p.clipBegin && t < p.clipEnd
          );
          if (matchingPar) {
            setActiveSmilPar(matchingPar);
            onOverlayParChange?.(matchingPar);
          }
        }
      };

      audio.onended = () => {
        // Advance to next audio track if available
        if (audiobookPairing && currentAudioFileIndex + 1 < audiobookPairing.audioFiles.length) {
          playAudioFile(currentAudioFileIndex + 1);
        } else {
          setPlaybackState('idle');
          isPlayingRef.current = false;
        }
      };

      audio.onwaiting = () => setPlaybackState('buffering');
      audio.onplaying = () => setPlaybackState('playing');
      audio.onerror = (e) => {
        console.warn('[useTTSAudio] Audio playback error:', e);
        setPlaybackState('idle');
        isPlayingRef.current = false;
      };
    }
    return audioRef.current;
  }, [activeSmilOverlay, audiobookPairing, currentAudioFileIndex, onOverlayParChange]);

  // Play specific audio file by index
  const playAudioFile = useCallback(
    (fileIndex: number, startSeconds = 0) => {
      if (!audiobookPairing || fileIndex >= audiobookPairing.audioFiles.length) return;
      const audio = getOrCreateAudioElement();
      if (!audio) return;

      const file = audiobookPairing.audioFiles[fileIndex];
      setCurrentAudioFileIndex(fileIndex);

      // Handle custom streaming scheme for local files or web URL
      let src = file.path;
      if (!src.startsWith('http') && !src.startsWith('baglib-asset://')) {
        src = `baglib-asset://${encodeURIComponent(file.path.replace(/\\/g, '/'))}`;
      }

      audio.src = src;
      audio.playbackRate = config.rate;
      audio.currentTime = startSeconds;

      isPlayingRef.current = true;
      setPlaybackState('buffering');
      setPlaybackMode('audiobook');

      audio
        .play()
        .then(() => {
          setPlaybackState('playing');
        })
        .catch((err) => {
          console.warn('[useTTSAudio] Failed to play audio:', err);
          setPlaybackState('idle');
          isPlayingRef.current = false;
        });
    },
    [audiobookPairing, config.rate, getOrCreateAudioElement]
  );

  // Play / Resume
  const play = useCallback(() => {
    if (playbackMode === 'audiobook' && audiobookPairing) {
      if (audioRef.current && audioRef.current.paused && audioRef.current.src) {
        isPlayingRef.current = true;
        setPlaybackState('playing');
        audioRef.current.play().catch(console.warn);
      } else {
        playAudioFile(currentAudioFileIndex, currentTime);
      }
    } else if (pocketContextRef.current?.state === 'suspended' && pocketJobRef.current) {
      pocketContextRef.current.resume().catch(() => undefined);
      isPlayingRef.current = true;
      setPlaybackState('playing');
      if (pocketJobCompleteRef.current && pocketSourcesRef.current.size === 0) finishPocketSentence();
    } else {
      playTTS(currentSentenceIndex);
    }
  }, [playbackMode, audiobookPairing, currentAudioFileIndex, currentTime, playAudioFile, playTTS, currentSentenceIndex, finishPocketSentence]);

  // Pause
  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setPlaybackState('paused');

    if (playbackMode === 'audiobook' && audioRef.current) {
      audioRef.current.pause();
    } else if (pocketContextRef.current && pocketJobRef.current) {
      pocketContextRef.current.suspend().catch(() => undefined);
    } else if (synthRef.current) {
      synthRef.current.cancel();
    }
  }, [playbackMode]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (playbackState === 'playing' || playbackState === 'buffering') {
      pause();
    } else {
      play();
    }
  }, [playbackState, pause, play]);

  // Stop
  const stop = useCallback(() => {
    cancelPocketQueue();
    isPlayingRef.current = false;
    setPlaybackState('stopped');
    setActiveWord('');

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    for (const source of pocketSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // A source can already be ended when stop is pressed.
      }
    }
    pocketSourcesRef.current.clear();
    pocketJobCompleteRef.current = false;
    if (pocketJobRef.current) {
      window.electronAPI?.audio?.tts?.stop(pocketJobRef.current).catch(() => undefined);
      pocketJobRef.current = null;
    }
    pocketContextRef.current?.suspend().catch(() => undefined);
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setCurrentTime(0);
  }, [cancelPocketQueue]);

  const sleepTimerRunning = playbackState === 'playing' || playbackState === 'buffering';
  useEffect(() => {
    if (sleepRemainingSeconds === 0) {
      stop();
      setSleepRemainingSeconds(null);
    } else if (sleepRemainingSeconds !== null && sleepRemainingSeconds > 0 && sleepTimerRunning) {
      sleepTimerRef.current = setTimeout(() => {
        setSleepRemainingSeconds((previous) => previous === null ? null : Math.max(0, previous - 1));
      }, 1000);
    }
    return () => {
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [sleepRemainingSeconds, sleepTimerRunning, stop]);

  // Jump to specific sentence
  const playSentence = useCallback(
    (index: number) => {
      if (index >= 0 && index < sentencesRef.current.length) {
        cancelPocketQueue();
        playTTS(index);
      }
    },
    [playTTS, cancelPocketQueue]
  );

  useEffect(() => {
    cancelPocketQueue();
    isPlayingRef.current = false;
    synthRef.current?.cancel();
    setPlaybackState('stopped');
  }, [bookId, config.voiceEn, config.voiceAr, cancelPocketQueue]);

  // Skip forward (seconds for audio, next sentence for TTS)
  const skipForward = useCallback(
    (seconds = 30) => {
      if (playbackMode === 'audiobook' && audioRef.current) {
        audioRef.current.currentTime = Math.min(
          audioRef.current.duration || Infinity,
          audioRef.current.currentTime + seconds
        );
      } else {
        const nextIdx = Math.min(sentences.length - 1, currentSentenceIndex + 1);
        playSentence(nextIdx);
      }
    },
    [playbackMode, sentences.length, currentSentenceIndex, playSentence]
  );

  // Skip backward (seconds for audio, previous sentence for TTS)
  const skipBackward = useCallback(
    (seconds = 15) => {
      if (playbackMode === 'audiobook' && audioRef.current) {
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - seconds);
      } else {
        const prevIdx = Math.max(0, currentSentenceIndex - 1);
        playSentence(prevIdx);
      }
    },
    [playbackMode, currentSentenceIndex, playSentence]
  );

  // Change speed rate
  const setPlaybackRate = useCallback(
    (rate: number) => {
      const clamped = Math.max(0.5, Math.min(3.0, rate));
      setConfig((prev) => ({ ...prev, rate: clamped }));
      if (audioRef.current) {
        audioRef.current.playbackRate = clamped;
      }
      if (pocketGainRef.current) pocketGainRef.current.gain.value = configRef.current.volume;
    },
    []
  );

  // Set sleep timer
  const setSleepTimer = useCallback((minutes: number | null) => {
    if (minutes === null || minutes <= 0) {
      setSleepRemainingSeconds(null);
    } else {
      setSleepRemainingSeconds(minutes * 60);
    }
  }, []);

  const setSentenceList = useCallback((value: string[] | ((previous: string[]) => string[])) => {
    const next = typeof value === 'function' ? value(sentencesRef.current) : value;
    sentencesRef.current = next;
    setSentences(next);
  }, []);

  // Seek audio position
  const seek = useCallback((timeSec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration || 0, timeSec));
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  // Load paired audiobook
  const loadAudiobook = useCallback(
    (pairing: AudiobookPairingData) => {
      setAudiobookPairing(pairing);
      setPlaybackMode('audiobook');
      if (pairing.audioFiles.length > 0) {
        setCurrentAudioFileIndex(0);
      }
    },
    []
  );

  // Load EPUB 3 SMIL overlay
  const loadSmilOverlay = useCallback(
    (overlay: SmilMediaOverlay, audioSrc: string) => {
      setActiveSmilOverlay(overlay);
      setPlaybackMode('smil');
      const audio = getOrCreateAudioElement();
      if (audio) {
        audio.src = audioSrc;
      }
    },
    [getOrCreateAudioElement]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      cancelPocketQueue();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      for (const source of pocketSourcesRef.current) {
        try {
          source.stop();
        } catch {
          // Ignore already-ended sources during reader teardown.
        }
      }
      if (pocketJobRef.current) {
        window.electronAPI?.audio?.tts?.stop(pocketJobRef.current).catch(() => undefined);
      }
      pocketContextRef.current?.close().catch(() => undefined);
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
      }
    };
  }, []);

  return {
    playbackState,
    playbackMode,
    isPlaying: playbackState === 'playing' || playbackState === 'buffering',
    buffering: playbackState === 'buffering',
    sentences,
    currentSentenceIndex,
    currentSegmentIndex,
    activeWord,
    currentTime,
    duration,
    voices,
    config,
    sleepRemainingSeconds,
    audiobookPairing,
    activeSmilPar,
    play,
    pause,
    togglePlay,
    stop,
    playSentence,
    skipForward,
    skipBackward,
    seek,
    setPlaybackRate,
    setSleepTimer,
    loadAudiobook,
    loadSmilOverlay,
    setSentences: setSentenceList,
    setConfig,
  };
}
