import { errorMessage } from '../../../shared/errors';
import React, { useState } from 'react';
import {
  Scissors,
  Globe,
  Compass,
  BookOpen,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Layers,
  X,
  ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { ClippedArticle, ClipProgressEvent, ClipResult } from '../../../shared/types/web-clipper';

interface WebClipperModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookClipped?: () => void;
}

export const WebClipperModal: React.FC<WebClipperModalProps> = ({
  isOpen,
  onClose,
  onBookClipped,
}) => {
  const { t, dir } = useWorkspace();
  const isRtl = dir === 'rtl';
  const [activeTab, setActiveTab] = useState<'single' | 'browser' | 'novel'>('single');

  // Single Article State
  const [url, setUrl] = useState<string>('');
  const [targetFormat, setTargetFormat] = useState<'epub' | 'markdown'>('epub');
  const [downloadImages, setDownloadImages] = useState<boolean>(true);
  const [importToLibrary, setImportToLibrary] = useState<boolean>(true);
  const [previewArticle, setPreviewArticle] = useState<ClippedArticle | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isClipping, setIsClipping] = useState<boolean>(false);

  // Novel State
  const [novelUrl, setNovelUrl] = useState<string>('');
  const [novelTitle, setNovelTitle] = useState<string>('');
  const [novelAuthor, setNovelAuthor] = useState<string>('');
  const [isScrapingNovel, setIsScrapingNovel] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleFetchPreview = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return;

    setIsLoadingPreview(true);
    setStatusMessage(null);
    setPreviewArticle(null);

    try {
      const res = await window.electronAPI?.clipper?.clipUrl({
        url: url.trim(),
        importToLibrary: false,
      });

      if (res?.success) {
        setPreviewArticle({
          title: res.title || 'Untitled',
          byline: res.author,
          url: url.trim(),
          content: '',
          textContent: '',
          length: 0,
          images: [],
        });
      } else {
        setStatusMessage({ type: 'error', text: res?.error || 'Failed to extract article' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleClipSingle = async () => {
    if (!url.trim()) return;

    setIsClipping(true);
    setStatusMessage(null);
    setProgressMsg(t('clipProgressMessage'));

    try {
      const res: ClipResult = await window.electronAPI?.clipper?.clipUrl({
        url: url.trim(),
        targetFormat,
        downloadImages,
        importToLibrary,
      });

      if (res?.success) {
        setStatusMessage({ type: 'success', text: t('clipSuccessToast') });
        onBookClipped?.();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setStatusMessage({ type: 'error', text: res?.error || 'Clipping failed' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsClipping(false);
      setProgressMsg('');
    }
  };

  const handleOpenBrowser = async () => {
    try {
      await window.electronAPI?.clipper?.openBrowser(url.trim() || 'https://google.com');
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleClipFromBrowser = async () => {
    setIsClipping(true);
    setStatusMessage(null);
    try {
      const res: ClipResult = await window.electronAPI?.clipper?.clipBrowser();
      if (res?.success) {
        setStatusMessage({ type: 'success', text: t('clipSuccessToast') });
        onBookClipped?.();
      } else {
        setStatusMessage({ type: 'error', text: res?.error || 'Failed to clip browser' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsClipping(false);
    }
  };

  const handleScrapeNovel = async () => {
    if (!novelUrl.trim()) return;

    setIsScrapingNovel(true);
    setStatusMessage(null);
    setProgressMsg(t('clipProgressMessage'));

    try {
      const res: ClipResult = await window.electronAPI?.clipper?.scrapeNovel({
        url: novelUrl.trim(),
        title: novelTitle.trim() || undefined,
        author: novelAuthor.trim() || undefined,
        downloadImages,
        importToLibrary: true,
      });

      if (res?.success) {
        setStatusMessage({ type: 'success', text: t('clipNovelSuccessToast') });
        onBookClipped?.();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setStatusMessage({ type: 'error', text: res?.error || 'Scraping failed' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsScrapingNovel(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="relative flex flex-col w-full max-w-3xl max-h-[90vh] bg-surface rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-raised">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Scissors className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">{t('webClipperTitle')}</h2>
              <p className="text-xs text-text-secondary">{t('webClipperDesc')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-surface-raised/50 px-6">
          <button
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'single'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <FileText className="w-4 h-4" />
            {t('tabClipSingle')}
          </button>
          <button
            onClick={() => setActiveTab('browser')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'browser'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Compass className="w-4 h-4" />
            {t('tabClipBrowser')}
          </button>
          <button
            onClick={() => setActiveTab('novel')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'novel'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Layers className="w-4 h-4" />
            {t('tabClipNovel')}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Alert */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl flex items-center gap-3 border ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="text-sm font-medium">{statusMessage.text}</span>
            </div>
          )}

          {activeTab === 'single' && (
            <div className="space-y-6">
              {/* URL Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-secondary">
                  {t('clipUrlPlaceholder')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://example.com/article"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-surface-raised border border-white/10 rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleFetchPreview}
                    disabled={isLoadingPreview || !url.trim()}
                    className="px-4 py-2.5 bg-surface-raised hover:bg-white/10 disabled:opacity-50 text-text-secondary hover:text-text-primary border border-white/10 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
                  >
                    {isLoadingPreview ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    <span>{t('clipFetchAndPreview')}</span>
                  </button>
                </div>
              </div>

              {/* Preview Card */}
              {previewArticle && (
                <div className="p-4 rounded-xl bg-surface-raised border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-primary font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Article Extracted</span>
                  </div>
                  <h3 className="text-base font-bold text-text-primary">{previewArticle.title}</h3>
                  {previewArticle.byline && (
                    <p className="text-xs text-text-secondary">{previewArticle.byline}</p>
                  )}
                </div>
              )}

              {/* Configuration Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-text-secondary">
                    {t('clipFormatLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetFormat('epub')}
                      className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                        targetFormat === 'epub'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-white/10 bg-surface-raised text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>{t('clipFormatEpub')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetFormat('markdown')}
                      className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                        targetFormat === 'markdown'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-white/10 bg-surface-raised text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>{t('clipFormatMarkdown')}</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={downloadImages}
                      onChange={(e) => setDownloadImages(e.target.checked)}
                      className="rounded border-white/20 text-primary focus:ring-0"
                    />
                    <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-text-secondary" />
                      {t('clipDownloadImages')}
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importToLibrary}
                      onChange={(e) => setImportToLibrary(e.target.checked)}
                      className="rounded border-white/20 text-primary focus:ring-0"
                    />
                    <span className="text-xs font-medium text-text-primary">
                      {t('clipImportToLibrary')}
                    </span>
                  </label>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-white/10">
                <button
                  onClick={handleClipSingle}
                  disabled={isClipping || !url.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-bold text-sm shadow-lg transition-all"
                >
                  {isClipping ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{progressMsg || t('clipProgressMessage')}</span>
                    </>
                  ) : (
                    <>
                      <Scissors className="w-4 h-4" />
                      <span>{t('clipSaveBtn')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'browser' && (
            <div className="p-6 rounded-2xl bg-surface-raised border border-white/10 space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <Compass className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-lg font-bold text-text-primary">
                  {t('tabClipBrowser')}
                </h3>
                <p className="text-xs text-text-secondary">
                  {t('clipBrowserDesc')}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto pt-4">
                <button
                  onClick={handleOpenBrowser}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-surface hover:bg-white/10 border border-white/10 text-text-primary text-sm font-semibold transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{t('clipOpenBrowserBtn')}</span>
                </button>

                <button
                  onClick={handleClipFromBrowser}
                  disabled={isClipping}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-bold shadow-lg transition-colors"
                >
                  {isClipping ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Scissors className="w-4 h-4" />
                  )}
                  <span>{t('clipBrowserAction')}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'novel' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-secondary">
                  {t('clipNovelUrlPlaceholder')}
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/novel-toc"
                  value={novelUrl}
                  onChange={(e) => setNovelUrl(e.target.value)}
                  className="w-full bg-surface-raised border border-white/10 rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">
                    {t('sortTitle')}
                  </label>
                  <input
                    type="text"
                    placeholder="Custom Novel Title (optional)"
                    value={novelTitle}
                    onChange={(e) => setNovelTitle(e.target.value)}
                    className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary">
                    {t('sortAuthor')}
                  </label>
                  <input
                    type="text"
                    placeholder="Author (optional)"
                    value={novelAuthor}
                    onChange={(e) => setNovelAuthor(e.target.value)}
                    className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <button
                  onClick={handleScrapeNovel}
                  disabled={isScrapingNovel || !novelUrl.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-bold text-sm shadow-lg transition-all"
                >
                  {isScrapingNovel ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{progressMsg || t('clipProgressMessage')}</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-4 h-4" />
                      <span>{t('clipNovelScrapeBtn')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
