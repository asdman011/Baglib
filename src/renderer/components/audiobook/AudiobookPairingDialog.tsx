/**
 * Baglib — 5-Step Audiobook Pairing Wizard (KEY-145)
 */

'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Headphones,
  FolderOpen,
  Server,
  Link2,
  Play,
  Square,
  Check,
  Trash2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  X,
  Loader2,
  CheckCircle2,
  Sparkles,
  FileAudio,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type {
  AudiobookFile,
  AudiobookChapterMapping,
  AudiobookPairingData,
  SaveAudiobookPairingPayload,
} from '../../../shared/types/audio';
import { buildSequentialAudiobookMappings } from '../../../shared/utils/audiobook-mapping';
import type { TOCItem } from '../../libs/reader/types';

export type WizardStep = 'summary' | 'select' | 'abs' | 'anchor' | 'review';

interface AudiobookPairingDialogProps {
  isOpen: boolean;
  bookId: string;
  bookTitle: string;
  toc?: TOCItem[];
  onClose: () => void;
  onPairingSaved?: (pairing: AudiobookPairingData) => void;
}

export const AudiobookPairingDialog: React.FC<AudiobookPairingDialogProps> = ({
  isOpen,
  bookId,
  bookTitle,
  toc = [],
  onClose,
  onPairingSaved,
}) => {
  const { t } = useWorkspace();

  // Wizard state
  const [step, setStep] = useState<WizardStep>('summary');
  const [existingPairing, setExistingPairing] = useState<AudiobookPairingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: Selected Audio Files
  const [sourceType, setSourceType] = useState<'local' | 'audiobookshelf' | 'epub_smil'>('local');
  const [audioFiles, setAudioFiles] = useState<AudiobookFile[]>([]);
  const [audioTitle, setAudioTitle] = useState('');
  const [audioNarrator, setAudioNarrator] = useState('');

  // Step 3: Audiobookshelf (ABS) Server State
  const [absServerUrl, setAbsServerUrl] = useState('http://localhost:13378');
  const [absApiKey, setAbsApiKey] = useState('');
  const [absQuery, setAbsQuery] = useState('');
  const [absResults, setAbsResults] = useState<any[]>([]);
  const [isSearchingAbs, setIsSearchingAbs] = useState(false);

  // Step 4: Continuum Alignment Anchors
  const [selectedEbookAnchor, setSelectedEbookAnchor] = useState<string>('');
  const [selectedAudioAnchor, setSelectedAudioAnchor] = useState<string>('');
  const [computedMappings, setComputedMappings] = useState<AudiobookChapterMapping[]>([]);

  // Step 5: Preview audio player
  const [previewingFileId, setPreviewingFileId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Flatten TOC items into linear chapter list
  const ebookChapters = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    const walk = (items: TOCItem[]) => {
      for (const item of items) {
        list.push({
          id: String(item.id || item.href || list.length + 1),
          label: item.label || `Chapter ${list.length + 1}`,
        });
        if (item.subitems && item.subitems.length > 0) {
          walk(item.subitems);
        }
      }
    };
    if (toc && toc.length > 0) {
      walk(toc);
    } else {
      // Default fallback if book has no formal TOC
      for (let i = 1; i <= 20; i++) {
        list.push({ id: `ch_${i}`, label: `${t('chapter')} ${i}` });
      }
    }
    return list;
  }, [toc, t]);

  // Load existing pairing when opened
  useEffect(() => {
    if (isOpen && bookId) {
      setIsLoading(true);
      setError(null);
      if (window.electronAPI?.audio?.getPairing) {
        window.electronAPI.audio
          .getPairing(bookId)
          .then((pairing) => {
            if (pairing) {
              setExistingPairing(pairing);
              setAudioFiles(pairing.audioFiles || []);
              setComputedMappings(pairing.chapterMappings || []);
              setAudioTitle(pairing.title || '');
              setAudioNarrator(pairing.narrator || '');
              setSourceType(pairing.sourceType || 'local');
              setStep('summary');
            } else {
              setExistingPairing(null);
              setStep('select');
            }
          })
          .catch((err) => {
            console.warn('[AudiobookPairingDialog] Error loading pairing:', err);
            setStep('select');
          })
          .finally(() => setIsLoading(false));
      } else {
        setStep('select');
        setIsLoading(false);
      }
    }
  }, [isOpen, bookId]);

  // Auto-compute Continuum alignment whenever anchors change
  useEffect(() => {
    if (ebookChapters.length > 0 && audioFiles.length > 0) {
      const ebookIds = ebookChapters.map((c) => c.id);
      const audioIds = audioFiles.map((f) => f.id);

      const anchor =
        selectedEbookAnchor && selectedAudioAnchor
          ? {
              ebookChapterId: selectedEbookAnchor,
              audioChapterId: selectedAudioAnchor,
            }
          : undefined;

      const mappings = buildSequentialAudiobookMappings({
        ebookChapterIds: ebookIds,
        audioChapterIds: audioIds,
        anchor,
      });

      // Enrich with file paths
      const enriched = mappings.map((m) => {
        const file = audioFiles.find((f) => f.id === m.audioChapterId);
        return {
          ...m,
          audioFilePath: file?.path,
          duration: file?.duration,
        };
      });

      setComputedMappings(enriched);
    }
  }, [ebookChapters, audioFiles, selectedEbookAnchor, selectedAudioAnchor]);

  // Clean up audio preview on unmount or close
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // Handler: Scan local directory
  const handleSelectFolder = async () => {
    if (!window.electronAPI?.openDirectoryDialog || !window.electronAPI?.audio?.scanLocalAudioFiles) {
      return;
    }
    setError(null);
    try {
      const folderPath = await window.electronAPI.openDirectoryDialog();
      if (!folderPath) return;

      setIsLoading(true);
      const scanned = await window.electronAPI.audio.scanLocalAudioFiles(folderPath);

      if (!scanned || scanned.length === 0) {
        setError(t('audiobookNoAudioFilesFound'));
      } else {
        setAudioFiles(scanned);
        setSourceType('local');
        setAudioTitle(bookTitle);
        // Default anchor: match first chapter with first audio track
        if (ebookChapters.length > 0 && scanned.length > 0) {
          setSelectedEbookAnchor(ebookChapters[0].id);
          setSelectedAudioAnchor(scanned[0].id);
        }
        setStep('anchor');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to scan audio directory');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Search ABS server
  const handleSearchAbs = async () => {
    if (!absServerUrl || !absApiKey) {
      setError(t('audiobookAbsCredentialsRequired'));
      return;
    }
    setIsSearchingAbs(true);
    setError(null);
    try {
      if (window.electronAPI?.audio?.queryAudiobookshelf) {
        const results = await window.electronAPI.audio.queryAudiobookshelf(
          absServerUrl,
          absApiKey,
          absQuery
        );
        setAbsResults(results || []);
        if (!results || results.length === 0) {
          setError(t('audiobookAbsNoResults'));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to query Audiobookshelf server');
    } finally {
      setIsSearchingAbs(false);
    }
  };

  // Handler: Select ABS Item
  const handleSelectAbsItem = (item: any) => {
    setAudioTitle(item.title);
    setAudioNarrator(item.author);
    setSourceType('audiobookshelf');

    // Convert tracks or chapters to AudiobookFile
    const files: AudiobookFile[] = (item.tracks || []).map((t: any, idx: number) => ({
      id: `abs_track_${idx + 1}`,
      name: t.title || `Track ${idx + 1}`,
      path: `${item.serverUrl}/api/items/${item.id}/file/${t.index}?token=${encodeURIComponent(
        absApiKey
      )}`,
      duration: t.duration || 0,
    }));

    setAudioFiles(files.length > 0 ? files : [{
      id: `abs_item_${item.id}`,
      name: item.title,
      path: `${item.serverUrl}/api/items/${item.id}/play?token=${encodeURIComponent(absApiKey)}`,
      duration: item.duration || 0,
    }]);

    if (ebookChapters.length > 0) {
      setSelectedEbookAnchor(ebookChapters[0].id);
      setSelectedAudioAnchor(files[0]?.id || `abs_item_${item.id}`);
    }
    setStep('anchor');
  };

  // Handler: Play preview audio
  const handleTogglePreview = (file: AudiobookFile) => {
    if (previewingFileId === file.id && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewingFileId(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }

    const audio = new Audio();
    previewAudioRef.current = audio;

    let src = file.path;
    if (!src.startsWith('http') && !src.startsWith('baglib-asset://')) {
      src = `baglib-asset://${encodeURIComponent(file.path.replace(/\\/g, '/'))}`;
    }

    audio.src = src;
    audio.onended = () => setPreviewingFileId(null);
    audio.onerror = () => setPreviewingFileId(null);

    audio
      .play()
      .then(() => setPreviewingFileId(file.id))
      .catch((err) => {
        console.warn('Preview playback failed:', err);
        setPreviewingFileId(null);
      });
  };

  // Handler: Save pairing
  const handleSavePairing = async () => {
    if (!audioFiles.length) {
      setError(t('audiobookNoAudioFilesSelected'));
      return;
    }
    setIsLoading(true);
    setError(null);

    const payload: SaveAudiobookPairingPayload = {
      bookId,
      title: audioTitle || bookTitle,
      narrator: audioNarrator,
      sourceType,
      serverUrl: sourceType === 'audiobookshelf' ? absServerUrl : undefined,
      audioFiles,
      chapterMappings: computedMappings,
    };

    try {
      if (window.electronAPI?.audio?.savePairing) {
        const saved = await window.electronAPI.audio.savePairing(payload);
        setExistingPairing(saved);
        onPairingSaved?.(saved);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save audiobook pairing');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Delete pairing
  const handleDeletePairing = async () => {
    if (!window.confirm(t('audiobookConfirmDeletePairing'))) return;
    setIsLoading(true);
    try {
      if (window.electronAPI?.audio?.deletePairing) {
        await window.electronAPI.audio.deletePairing(bookId);
        setExistingPairing(null);
        setAudioFiles([]);
        setComputedMappings([]);
        setStep('select');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete pairing');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface border border-subtle rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Dialog Header */}
        <div className="px-6 py-4 border-b border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-pale-sky-500/15 flex items-center justify-center text-pale-sky-600 dark:text-pale-sky-400">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-main">{t('audiobookPairingWizard')}</h2>
              <p className="text-xs text-muted truncate max-w-sm">{bookTitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main border border-subtle transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Step Navigation Indicator */}
        <div className="px-6 py-2.5 bg-canvas/40 border-b border-subtle flex items-center justify-between text-xs font-semibold">
          {[
            { id: 'summary', label: t('audiobookStepSummary') },
            { id: 'select', label: t('audiobookStepSelect') },
            { id: 'anchor', label: t('audiobookStepAnchor') },
            { id: 'review', label: t('audiobookStepReview') },
          ].map((s, idx) => {
            const isActive = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                    isActive
                      ? 'bg-pale-sky-500 text-white font-bold'
                      : 'bg-subtle/50 text-muted'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className={isActive ? 'text-pale-sky-600 dark:text-pale-sky-400 font-bold' : 'text-muted'}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500" />
              <span className="text-xs font-bold">{t('loading')}</span>
            </div>
          ) : step === 'summary' && existingPairing ? (
            /* STEP 1: SUMMARY OF EXISTING PAIRING */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-surface border border-subtle space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-main text-sm">{existingPairing.title}</h3>
                    {existingPairing.narrator && (
                      <p className="text-xs text-muted">
                        {t('narrator')}: {existingPairing.narrator}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                    {existingPairing.sourceType}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-subtle/50 text-xs text-muted">
                  <div>
                    <span className="text-muted">{t('audiobookFilesCount')}: </span>
                    <span className="font-mono font-bold text-main">
                      {existingPairing.audioFiles.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">{t('audiobookMappedCount')}: </span>
                    <span className="font-mono font-bold text-main">
                      {existingPairing.chapterMappings.length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setStep('select')}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-pale-sky-500 hover:bg-pale-sky-600 text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <Link2 className="w-4 h-4" />
                  <span>{t('audiobookRePairBtn')}</span>
                </button>
                <button
                  onClick={handleDeletePairing}
                  className="px-4 py-2.5 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold text-xs transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('audiobookRemovePairingBtn')}</span>
                </button>
              </div>
            </div>
          ) : step === 'select' ? (
            /* STEP 2: SELECT AUDIO FILES */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Local Audio Folder Scanner */}
                <div
                  onClick={handleSelectFolder}
                  className="p-5 rounded-2xl border-2 border-dashed border-subtle hover:border-pale-sky-500 bg-canvas/30 hover:bg-pale-sky-500/5 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 group"
                >
                  <FolderOpen className="w-8 h-8 text-pale-sky-500 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-xs text-main">{t('audiobookSelectLocalFolder')}</span>
                  <p className="text-[11px] text-muted">{t('audiobookLocalFolderDesc')}</p>
                </div>

                {/* Audiobookshelf Server Stream */}
                <div
                  onClick={() => setStep('abs')}
                  className="p-5 rounded-2xl border-2 border-dashed border-subtle hover:border-indigo-500 bg-canvas/30 hover:bg-indigo-500/5 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 group"
                >
                  <Server className="w-8 h-8 text-indigo-500 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-xs text-main">{t('audiobookStreamAbs')}</span>
                  <p className="text-[11px] text-muted">{t('audiobookStreamAbsDesc')}</p>
                </div>
              </div>

              {audioFiles.length > 0 && (
                <div className="p-3 rounded-2xl bg-surface border border-subtle space-y-2">
                  <span className="text-xs font-bold text-main">
                    {t('audiobookDetectedTracks')} ({audioFiles.length})
                  </span>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-muted">
                    {audioFiles.map((f, i) => (
                      <div key={f.id} className="flex justify-between px-2 py-1 bg-canvas rounded-lg">
                        <span className="truncate">{f.name}</span>
                        <span className="font-mono text-[11px]">#{i + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : step === 'abs' ? (
            /* STEP 3: AUDIOBOOKSHELF CONNECT & SEARCH */
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-xs text-muted">{t('audiobookAbsServerUrl')}</span>
                <input
                  type="text"
                  value={absServerUrl}
                  onChange={(e) => setAbsServerUrl(e.target.value)}
                  placeholder="http://localhost:13378"
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-canvas text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs text-muted">{t('audiobookAbsApiKey')}</span>
                <input
                  type="password"
                  value={absApiKey}
                  onChange={(e) => setAbsApiKey(e.target.value)}
                  placeholder="Bearer Token / API Key"
                  className="w-full px-3 py-2 rounded-xl border border-subtle bg-canvas text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={absQuery}
                  onChange={(e) => setAbsQuery(e.target.value)}
                  placeholder={bookTitle}
                  className="flex-1 px-3 py-2 rounded-xl border border-subtle bg-canvas text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
                />
                <button
                  onClick={handleSearchAbs}
                  disabled={isSearchingAbs}
                  className="px-4 py-2 rounded-xl bg-pale-sky-500 hover:bg-pale-sky-600 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSearchingAbs && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('search')}</span>
                </button>
              </div>

              {absResults.length > 0 && (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pt-2">
                  {absResults.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectAbsItem(item)}
                      className="p-3 rounded-xl border border-subtle hover:border-pale-sky-500 bg-surface hover:bg-pale-sky-500/5 cursor-pointer flex justify-between items-center transition-all"
                    >
                      <div>
                        <span className="font-bold text-xs text-main block">{item.title}</span>
                        <span className="text-[11px] text-muted">{item.author}</span>
                      </div>
                      <Check className="w-4 h-4 text-pale-sky-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : step === 'anchor' ? (
            /* STEP 4: CONTINUUM ANCHOR ALIGNMENT */
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 text-xs text-pale-sky-700 dark:text-pale-sky-300">
                <Sparkles className="w-4 h-4 inline me-1.5 text-pale-sky-500" />
                {t('audiobookAnchorExplanation')}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* eBook Chapter Anchor Picker */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-main">{t('audiobookEbookAnchor')}</span>
                  <select
                    value={selectedEbookAnchor}
                    onChange={(e) => setSelectedEbookAnchor(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-subtle bg-canvas text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
                  >
                    {ebookChapters.map((ch, idx) => (
                      <option key={ch.id} value={ch.id}>
                        #{idx + 1} - {ch.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Audio Track Anchor Picker */}
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-main">{t('audiobookAudioAnchor')}</span>
                  <select
                    value={selectedAudioAnchor}
                    onChange={(e) => setSelectedAudioAnchor(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-subtle bg-canvas text-xs outline-none focus:ring-1 focus:ring-pale-sky-500"
                  >
                    {audioFiles.map((af, idx) => (
                      <option key={af.id} value={af.id}>
                        #{idx + 1} - {af.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Mapping Stats */}
              <div className="p-3 rounded-xl bg-surface border border-subtle text-xs flex justify-between items-center">
                <span>{t('audiobookTotalMappingsComputed')}:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {computedMappings.length} {t('audiobookChaptersMapped')}
                </span>
              </div>
            </div>
          ) : (
            /* STEP 5: REVIEW & PREVIEW AUDIOTRACKS */
            <div className="space-y-3">
              <span className="text-xs font-bold text-main block">
                {t('audiobookReviewMappingsTitle')} ({computedMappings.length})
              </span>

              <div className="max-h-60 overflow-y-auto space-y-1.5 text-xs">
                {computedMappings.map((m, idx) => {
                  const ebookCh = ebookChapters.find((c) => c.id === m.ebookChapterId);
                  const audioF = audioFiles.find((f) => f.id === m.audioChapterId);
                  const isPlayingThis = previewingFileId === audioF?.id;

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl border border-subtle bg-surface flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 truncate">
                        <span className="font-semibold text-main">
                          {ebookCh?.label || m.ebookChapterId}
                        </span>
                        <span className="text-[11px] text-muted block truncate">
                          ↔ {audioF?.name || m.audioChapterId}
                        </span>
                      </div>

                      {audioF && (
                        <button
                          onClick={() => handleTogglePreview(audioF)}
                          title={isPlayingThis ? t('ttsStopBtn') : t('ttsPreviewAudio')}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            isPlayingThis
                              ? 'bg-pale-sky-500 text-white border-pale-sky-500'
                              : 'hover:bg-canvas text-muted hover:text-main border-subtle'
                          }`}
                        >
                          {isPlayingThis ? (
                            <Square className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current translate-x-0.5 rtl:-translate-x-0.5" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Actions */}
        <div className="px-6 py-4 border-t border-subtle flex justify-between items-center shrink-0 bg-surface/50">
          <div>
            {step !== 'summary' && step !== 'select' && (
              <button
                onClick={() => {
                  if (step === 'review') setStep('anchor');
                  else if (step === 'anchor') setStep('select');
                  else if (step === 'abs') setStep('select');
                }}
                className="px-3 py-1.5 rounded-xl border border-subtle hover:bg-canvas text-xs font-bold text-muted hover:text-main flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                <span>{t('back')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl hover:bg-canvas border border-subtle text-xs font-bold text-muted hover:text-main transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>

            {step === 'anchor' && (
              <button
                onClick={() => setStep('review')}
                disabled={computedMappings.length === 0}
                className="px-4 py-2 rounded-xl bg-pale-sky-500 hover:bg-pale-sky-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <span>{t('next')}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            )}

            {step === 'review' && (
              <button
                onClick={handleSavePairing}
                disabled={isLoading}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-pale-sky-600 to-indigo-600 hover:from-pale-sky-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{t('audiobookSavePairingBtn')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
