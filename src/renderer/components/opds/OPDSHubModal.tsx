import { errorMessage } from '../../../shared/errors';
import React, { useState, useEffect } from 'react';
import {
  Globe,
  Radio,
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  FolderOpen,
  Lock,
  ExternalLink,
  BookOpen,
  X,
  Wifi,
  Sliders,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { OPDSCatalog, OPDSEntry, OPDSFeed, OPDSServerStatus } from '../../../shared/types/opds';
import { Modal } from '../ui/Modal';

interface OPDSHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookImported?: () => void;
}

export const OPDSHubModal: React.FC<OPDSHubModalProps> = ({
  isOpen,
  onClose,
  onBookImported,
}) => {
  const { t, dir } = useWorkspace();
  const isRtl = dir === 'rtl';
  const [activeTab, setActiveTab] = useState<'catalogs' | 'server'>('catalogs');

  // Catalogs State
  const [presets, setPresets] = useState<OPDSCatalog[]>([]);
  const [selectedCatalogUrl, setSelectedCatalogUrl] = useState<string>('');
  const [customCatalogUrl, setCustomCatalogUrl] = useState<string>('');
  const [catalogUsername, setCatalogUsername] = useState<string>('');
  const [catalogPassword, setCatalogPassword] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFeed, setActiveFeed] = useState<OPDSFeed | null>(null);
  const [feedHistory, setFeedHistory] = useState<string[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);
  const [downloadingEntryId, setDownloadingEntryId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Server State
  const [serverStatus, setServerStatus] = useState<OPDSServerStatus | null>(null);
  const [serverPort, setServerPort] = useState<number>(8085);
  const [requireAuth, setRequireAuth] = useState<boolean>(false);
  const [serverUsername, setServerUsername] = useState<string>('admin');
  const [serverPassword, setServerPassword] = useState<string>('');
  const [isStartingServer, setIsStartingServer] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Load presets
    window.electronAPI?.opds?.getPresets().then((list: OPDSCatalog[]) => {
      setPresets(list || []);
      if (list && list.length > 0 && !selectedCatalogUrl) {
        setSelectedCatalogUrl(list[0].url);
        loadFeed(list[0].url);
      }
    });

    // Load server status
    loadServerStatus();
  }, [isOpen]);

  async function loadServerStatus() {
    try {
      const status = await window.electronAPI?.opds?.getServerStatus();
      if (status) {
        setServerStatus(status);
        setServerPort(status.port || 8085);
        setRequireAuth(Boolean(status.requireAuth));
      }
    } catch (err) {
      console.warn('Failed to get OPDS server status', err);
    }
  }

  async function loadFeed(url: string, pushHistory = true) {
    setIsLoadingFeed(true);
    setStatusMessage(null);
    try {
      const feed = await window.electronAPI?.opds?.browseCatalog(url, {
        username: catalogUsername || undefined,
        password: catalogPassword || undefined,
      });
      setActiveFeed(feed);
      if (pushHistory) {
        setFeedHistory((prev) => [...prev, url]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsLoadingFeed(false);
    }
  }

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim() || !activeFeed?.searchLink) return;

    setIsLoadingFeed(true);
    setStatusMessage(null);
    try {
      const feed = await window.electronAPI?.opds?.searchCatalog(
        activeFeed.searchLink.href,
        searchQuery.trim(),
        {
          username: catalogUsername || undefined,
          password: catalogPassword || undefined,
        }
      );
      setActiveFeed(feed);
      setFeedHistory((prev) => [...prev, activeFeed.searchLink!.href]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsLoadingFeed(false);
    }
  };

  const handleBackFeed = () => {
    if (feedHistory.length <= 1) return;
    const newHistory = [...feedHistory];
    newHistory.pop(); // Current
    const prevUrl = newHistory[newHistory.length - 1];
    setFeedHistory(newHistory);
    loadFeed(prevUrl, false);
  };

  const handleDownloadBook = async (entry: OPDSEntry) => {
    if (entry.downloadLinks.length === 0) return;
    const link = entry.downloadLinks[0];
    setDownloadingEntryId(entry.id);
    setStatusMessage(null);

    try {
      const result = await window.electronAPI?.opds?.downloadBook(
        link.href,
        {
          username: catalogUsername || undefined,
          password: catalogPassword || undefined,
        },
        `${entry.title}.epub`
      );

      if (result?.success) {
        setStatusMessage({
          type: 'success',
          text: `"${entry.title}" ${t('metadataSavedSuccess')}`,
        });
        onBookImported?.();
      } else {
        setStatusMessage({
          type: 'error',
          text: result?.error || 'Download failed',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setDownloadingEntryId(null);
    }
  };

  const handleToggleServer = async () => {
    setIsStartingServer(true);
    try {
      if (serverStatus?.running) {
        const res = await window.electronAPI?.opds?.stopServer();
        setServerStatus(res);
      } else {
        await window.electronAPI?.opds?.setServerConfig({
          port: serverPort,
          requireAuth,
          username: serverUsername,
          password: serverPassword,
        });
        const res = await window.electronAPI?.opds?.startServer(serverPort);
        setServerStatus(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? errorMessage(err) : String(err);
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsStartingServer(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <Modal asChild open={true} onClose={onClose} label={t('opdsHubTitle')}><div
        className="relative flex flex-col w-full max-w-5xl h-[85dvh] max-h-[calc(100dvh-2rem)] bg-surface rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-raised">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">{t('opdsHubTitle')}</h2>
              <p className="text-xs text-text-secondary">{t('opdsHubDesc')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 overflow-x-auto overscroll-x-contain border-b border-white/10 bg-surface-raised/50 px-3 sm:px-6 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          <button
            onClick={() => setActiveTab('catalogs')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'catalogs'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Globe className="w-4 h-4" />
            {t('tabOpdsCatalogs')}
          </button>
          <button
            onClick={() => setActiveTab('server')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'server'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Wifi className="w-4 h-4" />
            {t('tabOpdsServer')}
            {serverStatus?.running && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 space-y-6">
          {/* Status Message */}
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

          {activeTab === 'catalogs' && (
            <div className="space-y-6">
              {/* Catalog Selection & Search Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 space-y-2">
                  <label className="text-xs font-semibold text-text-secondary">
                    {t('opdsCatalogUrl')}
                  </label>
                  <select
                    value={selectedCatalogUrl}
                    onChange={(e) => {
                      setSelectedCatalogUrl(e.target.value);
                      if (e.target.value !== 'custom') {
                        loadFeed(e.target.value);
                      }
                    }}
                    className="w-full bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                  >
                    {presets.map((cat) => (
                      <option key={cat.id} value={cat.url}>
                        {cat.title}
                      </option>
                    ))}
                    <option value="custom">{t('opdsCatalogCustom')}</option>
                  </select>
                </div>

                {selectedCatalogUrl === 'custom' && (
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-semibold text-text-secondary">
                      {t('opdsCatalogCustom')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://example.com/opds"
                        value={customCatalogUrl}
                        onChange={(e) => setCustomCatalogUrl(e.target.value)}
                        className="flex-1 bg-surface-raised border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => loadFeed(customCatalogUrl)}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-colors"
                      >
                        {t('readBook')}
                      </button>
                    </div>
                  </div>
                )}

                {activeFeed?.searchLink && (
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-xs font-semibold text-text-secondary">
                      {t('searchPlaceholder')}
                    </label>
                    <form onSubmit={handleSearch} className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder={t('opdsSearchCatalogPlaceholder')}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-surface-raised border border-white/10 rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-primary ps-10"
                        />
                        <Search className="w-4 h-4 text-text-tertiary absolute start-3 top-3" />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl text-sm font-semibold transition-colors"
                      >
                        {t('globalSearch')}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Feed Navigation Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="flex items-center gap-2">
                  {feedHistory.length > 1 && (
                    <button
                      onClick={handleBackFeed}
                      className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-white/10 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                    >
                      ← {t('cancel')}
                    </button>
                  )}
                  <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                    {activeFeed?.title || 'Catalog'}
                  </h3>
                </div>
                {isLoadingFeed && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary" role="status">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>{t('opdsDownloading')}</span>
                  </div>
                )}
              </div>

              {/* Entries Grid / List */}
              {activeFeed && activeFeed.entries.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeFeed.entries.map((entry) => {
                    const isDownloading = downloadingEntryId === entry.id;
                    const hasDownload = entry.downloadLinks.length > 0;
                    const hasNav = entry.navigationLinks.length > 0;

                    return (
                      <div
                        key={entry.id}
                        className="flex gap-4 p-4 rounded-xl bg-surface-raised border border-white/5 hover:border-primary/30 transition-all group"
                      >
                        {/* Cover / Icon */}
                        {entry.coverUrl ? (
                          <img
                            src={entry.coverUrl}
                            alt={entry.title}
                            className="w-20 h-28 object-cover rounded-lg bg-black/20 flex-shrink-0 shadow"
                          />
                        ) : (
                          <div className="w-20 h-28 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-text-tertiary">
                            <BookOpen className="w-8 h-8" />
                          </div>
                        )}

                        {/* Details */}
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-text-primary line-clamp-2 group-hover:text-primary transition-colors">
                              {entry.title}
                            </h4>
                            {entry.authors && (
                              <p className="text-xs text-text-secondary mt-0.5">
                                {entry.authors.join(', ')}
                              </p>
                            )}
                            {entry.summary && (
                              <p className="text-xs text-text-tertiary line-clamp-2 mt-1.5">
                                {entry.summary}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/5">
                            {hasDownload && (
                              <button
                                onClick={() => handleDownloadBook(entry)}
                                disabled={isDownloading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-medium transition-colors"
                              >
                                {isDownloading ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>{t('opdsDownloading')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5" />
                                    <span>{t('opdsDownloadBook')}</span>
                                  </>
                                )}
                              </button>
                            )}

                            {hasNav && (
                              <button
                                onClick={() => loadFeed(entry.navigationLinks[0].href)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-white/10 text-text-secondary hover:text-text-primary text-xs font-medium transition-colors"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                                <span>{entry.title}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                !isLoadingFeed && (
                  <div className="text-center py-16 text-text-tertiary">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{t('emptySearchTitle')}</p>
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === 'server' && (
            <div className="space-y-6">
              {/* Server Control Card */}
              <div className="p-6 rounded-2xl bg-surface-raised border border-white/10 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-3 rounded-xl ${
                        serverStatus?.running
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-white/5 text-text-tertiary'
                      }`}
                    >
                      <Radio className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text-primary">
                        {serverStatus?.running
                          ? t('opdsServerStatusRunning')
                          : t('opdsServerStatusStopped')}
                      </h3>
                      <p className="text-xs text-text-secondary">
                        {serverStatus?.bookCount || 0} {t('bookPlural')} {t('localLibraryReady')}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleToggleServer}
                    disabled={isStartingServer}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                      serverStatus?.running
                        ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {isStartingServer ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : serverStatus?.running ? (
                      t('opdsServerStop')
                    ) : (
                      t('opdsServerStart')
                    )}
                  </button>
                </div>

                {/* Network Addresses */}
                {serverStatus?.running && (
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div>
                      <label className="text-xs font-semibold text-text-secondary mb-2 block">
                        {t('opdsServerLanUrls')}
                      </label>
                      <div className="space-y-2">
                        {serverStatus.lanUrls.map((url) => (
                          <div
                            key={url}
                            className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-black/20 border border-white/5 font-mono text-sm text-text-primary"
                          >
                            <span>{url}</span>
                            <button
                              onClick={() => handleCopyUrl(url)}
                              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-sans text-text-secondary hover:text-text-primary transition-colors"
                            >
                              {copiedUrl === url ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400">{t('opdsCopied')}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>{t('opdsCopyUrl')}</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-text-tertiary mt-2">
                        {t('opdsServerLanHint')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Configuration Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">
                      {t('opdsServerPort')}
                    </label>
                    <input
                      type="number"
                      value={serverPort}
                      disabled={serverStatus?.running}
                      onChange={(e) => setServerPort(Number(e.target.value))}
                      className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-2 pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requireAuth}
                        disabled={serverStatus?.running}
                        onChange={(e) => setRequireAuth(e.target.checked)}
                        className="rounded border-white/20 text-primary focus:ring-0"
                      />
                      <span className="text-xs font-medium text-text-primary">
                        {t('opdsServerRequireAuth')}
                      </span>
                    </label>
                  </div>

                  {requireAuth && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          {t('opdsServerUsername')}
                        </label>
                        <input
                          type="text"
                          value={serverUsername}
                          disabled={serverStatus?.running}
                          onChange={(e) => setServerUsername(e.target.value)}
                          className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          {t('opdsServerPassword')}
                        </label>
                        <input
                          type="password"
                          value={serverPassword}
                          disabled={serverStatus?.running}
                          onChange={(e) => setServerPassword(e.target.value)}
                          className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-50"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div></Modal>
    </div>
  );
};
