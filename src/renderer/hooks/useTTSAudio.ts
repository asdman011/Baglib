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

export interface UseTTSAudioOptions {
  bookId?: string;
  initialText?: string;
  onSentenceChange?: (sentenceIndex: number, text: string) => void;
  onOverlayParChange?: (par: SmilPar | null) => void;
}

export function useTTSAudio(options: UseTTSAudioOptions = {}) {
  const { bookId, initialText = '', onSentenceChange, onOverlayParChange } = options;

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

  // Split text into readable sentences
  const splitSentences = useCallback((raw: string): string[] => {
    if (!raw || !raw.trim()) return [];
    // Split by punctuation: period, exclamation, question mark, Arabic comma/semicolon/question mark, or newlines
    const splits = raw
      .replace(/([.!?؟؛\n]+)/g, '$1\u0000')
      .split('\u0000')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return splits.length > 0 ? splits : [raw.trim()];
  }, []);

  // Initialize sentences when initialText changes
  useEffect(() => {
    if (initialText) {
      const parsed = splitSentences(initialText);
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
        }));
        setVoices(mapped);

        // Auto-select preferred Arabic & English voices if not yet configured
        const arVoice = mapped.find((v) => v.lang.toLowerCase().startsWith('ar'));
        const enVoice = mapped.find((v) => v.lang.toLowerCase().startsWith('en'));

        setConfig((prev) => ({
          ...prev,
          voiceAr: prev.voiceAr || arVoice?.id,
          voiceEn: prev.voiceEn || enVoice?.id,
        }));
      };

      updateVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = updateVoices;
      }
    }
  }, []);

  // Sleep timer interval tick
  useEffect(() => {
    if (sleepRemainingSeconds !== null && sleepRemainingSeconds > 0 && playbackState === 'playing') {
      sleepTimerRef.current = setTimeout(() => {
        setSleepRemainingSeconds((prev) => (prev && prev > 1 ? prev - 1 : null));
      }, 1000);
    } else if (sleepRemainingSeconds === 0) {
      stop();
      setSleepRemainingSeconds(null);
    }
    return () => {
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [sleepRemainingSeconds, playbackState]);

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
      if (!synthRef.current) return;
      synthRef.current.cancel();

      if (sentenceIdx >= sentences.length) {
        setPlaybackState('idle');
        return;
      }

      isPlayingRef.current = true;
      setPlaybackState('playing');
      setPlaybackMode('tts');
      setCurrentSentenceIndex(sentenceIdx);

      onSentenceChange?.(sentenceIdx, sentences[sentenceIdx]);
      const segments = segmentMixedTextForTTS(sentences[sentenceIdx]);
      speakSegment(segments, 0, sentenceIdx);
    },
    [sentences, currentSentenceIndex, speakSegment, onSentenceChange]
  );

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
    } else {
      playTTS(currentSentenceIndex);
    }
  }, [playbackMode, audiobookPairing, currentAudioFileIndex, currentTime, playAudioFile, playTTS, currentSentenceIndex]);

  // Pause
  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setPlaybackState('paused');

    if (playbackMode === 'audiobook' && audioRef.current) {
      audioRef.current.pause();
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
    isPlayingRef.current = false;
    setPlaybackState('stopped');
    setActiveWord('');

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setCurrentTime(0);
  }, []);

  // Jump to specific sentence
  const playSentence = useCallback(
    (index: number) => {
      if (index >= 0 && index < sentences.length) {
        playTTS(index);
      }
    },
    [sentences, playTTS]
  );

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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
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
    setSentences,
    setConfig,
  };
}
