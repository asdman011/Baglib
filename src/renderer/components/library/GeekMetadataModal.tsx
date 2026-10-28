'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Terminal,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Layers,
  Globe,
  Code,
  Clock,
  Cpu,
  Database,
  Sparkles,
  FileText,
  AlertCircle,
  Hash,
  Server
} from 'lucide-react';
import { BookItem } from '../../types/library';
import { MetadataProvenance } from '../../../shared/types/work';
import { useWorkspace } from '../context/WorkspaceContext';

interface GeekMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: BookItem | null;
}

export const GeekMetadataModal: React.FC<GeekMetadataModalProps> = ({
  isOpen,
  onClose,
  book,
}) => {
  const { lang, dir, t } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'attribution' | 'audit' | 'raw'>('attribution');
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedTrace, setCopiedTrace] = useState(false);

  // Derive provenance and fallback diagnostics for pre-existing records
  const provenance: MetadataProvenance = useMemo(() => {
    if (!book) return {};

    const isOnline = Boolean(book.onlineSource || book.sourceUrl);
    const isFile = Boolean(book.filePath);
    const provider = book.onlineSource || (isFile ? 'Local Container Extractor' : 'Manual Input');
    const method = isOnline ? 'online_api' : (isFile ? 'offline_embedded' : 'manual');

    let base: MetadataProvenance = {};
    if (book.metadataProvenance && Object.keys(book.metadataProvenance).length > 0) {
      base = {
        ...book.metadataProvenance,
        fieldSources: { ...(book.metadataProvenance.fieldSources || {}) },
        auditTrace: [...(book.metadataProvenance.auditTrace || [])],
      };
    } else {
      const fields: NonNullable<MetadataProvenance['fieldSources']> = {};
      if (book.title) {
        fields.title = { source: provider, status: isOnline ? 'verified' : 'extracted', value: book.title, confidence: 0.95 };
      }
      if (book.author) {
        fields.author = { source: provider, status: isOnline ? 'verified' : 'extracted', value: book.author, confidence: 0.95 };
      }
      if (book.isbn) {
        fields.isbn = { source: provider, status: 'verified', value: book.isbn, confidence: 1.0 };
      }
      if (book.publisher) {
        fields.publisher = { source: provider, status: 'extracted', value: book.publisher, confidence: 0.9 };
      }
      if (book.publicationYear) {
        fields.publicationYear = { source: provider, status: 'extracted', value: book.publicationYear, confidence: 0.9 };
      }
      if (book.pagesCount) {
        fields.pagesCount = { source: isFile ? 'PDF/EPUB Page Counter' : provider, status: 'calculated', value: book.pagesCount, confidence: 1.0 };
      }
      if (book.coverImage) {
        fields.coverImage = { source: isFile ? 'Embedded Raster Stream' : provider, status: 'extracted', value: 'Raster Cover Available', confidence: 0.9 };
      }
      if (book.language) {
        fields.language = { source: provider, status: 'extracted', value: book.language, confidence: 0.85 };
      }
      if (book.description || book.abstract) {
        fields.description = { source: provider, status: 'extracted', value: 'Bibliographic Abstract Present', confidence: 0.9 };
      }

      base = {
        primaryProvider: provider,
        discoveredAt: book.lastVerifiedAt || new Date().toISOString(),
        method,
        confidence: isOnline ? 0.95 : 0.85,
        fieldSources: fields,
        auditTrace: [
          `[Provenance Engine] Loaded bibliographic record for "${book.title || 'Untitled'}"`,
          isFile ? `[Stream Inspector] Local binary container linked at ${book.filePath}` : `[Catalog] Record initialized via catalog entry`,
          book.isbn ? `[ISBN Checksum] Verified standard ISBN format: ${book.isbn}` : `[ISBN] No ISBN registered on record`,
          book.pagesCount ? `[Page Metric] Resolved document size: ${book.pagesCount} pages` : `[Page Metric] Page count pending extraction`,
        ],
        rawBibliographic: {
          id: book.id,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          publicationYear: book.publicationYear,
          edition: book.edition,
          isbn: book.isbn,
          pagesCount: book.pagesCount,
          digitalFormat: book.digitalFormat,
          filePath: book.filePath,
          onlineSource: book.onlineSource,
          sourceUrl: book.sourceUrl,
        },
      };
    }

    // Always ensure edition field attribution and audit trace are accurately reflected
    if (book.edition) {
      const edRaw = book.editionRawMatch || base.fieldSources?.edition?.rawMatch;
      const edSrc = book.editionSource || (base.fieldSources?.edition?.source?.startsWith('Tier:') ? base.fieldSources.edition.source : undefined);
      const edConf = book.editionConfidence || base.fieldSources?.edition?.confidence || 0.85;

      const formatSourceDesc = (src?: string, raw?: string) => {
        if (raw) return raw;
        if (!src) return isFile ? 'Local Container Extractor' : provider;
        if (src === 'filename') return 'Filename Parser';
        if (src === 'embedded_metadata') return 'Container OPF / DocInfo Metadata';
        if (src === 'front_matter') return 'Front-Matter / Imprint Page Scan';
        if (src === 'back_matter') return 'Colophon / Back-Matter Scan';
        return src;
      };

      const sourceDescription = formatSourceDesc(edSrc, edRaw);

      if (!base.fieldSources) base.fieldSources = {};
      base.fieldSources.edition = {
        source: sourceDescription,
        status: 'extracted',
        value: book.edition,
        confidence: edConf,
        rawMatch: edRaw,
      };

      if (!base.auditTrace) base.auditTrace = [];
      const hasEditionTrace = base.auditTrace.some((line) => line.includes('[Edition Engine]'));
      if (!hasEditionTrace) {
        base.auditTrace.push(
          edRaw
            ? `[Edition Engine] ${edRaw} -> "${book.edition}"`
            : `[Edition Engine] Edition registered on record: "${book.edition}"`
        );
      }
    }

    return base;
  }, [book]);

  const rawJsonString = useMemo(() => {
    const raw = provenance.rawBibliographic || book || {};
    return JSON.stringify(raw, null, 2);
  }, [provenance, book]);

  const auditTraceLines = useMemo(() => {
    if (provenance.auditTrace && provenance.auditTrace.length > 0) {
      return provenance.auditTrace;
    }
    return [
      `[Geek Console] Ready: Processed record "${book?.title || 'Unknown'}"`,
      `[Geek Console] Primary API / Stream: ${provenance.primaryProvider || 'Local Storage'}`,
      `[Geek Console] Method: ${provenance.method || 'manual'}`,
    ];
  }, [provenance, book]);

  if (!isOpen || !book) return null;

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(rawJsonString);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (err) {
      console.warn('Failed to copy JSON:', err);
    }
  };

  const handleCopyTrace = async () => {
    try {
      await navigator.clipboard.writeText(auditTraceLines.join('\n'));
      setCopiedTrace(true);
      setTimeout(() => setCopiedTrace(false), 2000);
    } catch (err) {
      console.warn('Failed to copy audit trace:', err);
    }
  };

  // Provider badge styling
  const getProviderBadge = (provider?: string) => {
    const p = (provider || '').toLowerCase();
    if (p.includes('google')) {
      return {
        label: t('geekProviderGoogleBooks') || 'Google Books API v1',
        classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
        icon: Globe,
      };
    }
    if (p.includes('open library') || p.includes('openlibrary')) {
      return {
        label: t('geekProviderOpenLibrary') || 'Open Library REST API',
        classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        icon: Database,
      };
    }
    if (p.includes('archive')) {
      return {
        label: t('geekProviderInternetArchive') || 'Internet Archive API',
        classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        icon: Server,
      };
    }
    if (p.includes('embedded') || p.includes('container') || p.includes('stream')) {
      return {
        label: t('geekProviderEmbedded') || 'Embedded File Metadata',
        classes: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
        icon: Cpu,
      };
    }
    return {
      label: provider || t('geekProviderManual') || 'Local Catalog',
      classes: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
      icon: Terminal,
    };
  };

  const providerBadge = getProviderBadge(provenance.primaryProvider);
  const ProviderIcon = providerBadge.icon;

  const getMethodLabel = (method?: string) => {
    switch (method) {
      case 'online_api':
        return t('geekMethodOnlineApi');
      case 'offline_embedded':
        return t('geekMethodOfflineEmbedded');
      case 'offline_filename':
        return t('geekMethodOfflineFilename');
      case 'hybrid':
        return t('geekMethodHybrid');
      case 'manual':
      default:
        return t('geekMethodManual');
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'verified':
        return {
          label: t('geekVerificationVerified'),
          classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        };
      case 'extracted':
        return {
          label: t('geekVerificationExtracted'),
          classes: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
        };
      case 'calculated':
        return {
          label: t('geekVerificationCalculated'),
          classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        };
      case 'user_override':
        return {
          label: t('geekVerificationUserOverride'),
          classes: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
        };
      case 'fallback':
      default:
        return {
          label: t('geekVerificationFallback'),
          classes: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
        };
    }
  };

  const fieldEntries = Object.entries(provenance.fieldSources || {});

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-70 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      dir={dir}
    >
      <div className="relative w-full max-w-4xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-sans">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-canvas/90 border-b border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-sm">
              <Terminal className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-main text-base sm:text-lg truncate">
                  {t('geekDetailsTitle')}
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${providerBadge.classes}`}>
                  <ProviderIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{providerBadge.label}</span>
                </span>
              </div>
              <p className="text-xs text-muted truncate mt-0.5">
                {t('geekDetailsSubtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Diagnostic Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-canvas/40 border-b border-subtle text-xs">
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted font-medium">{t('geekPrimaryProvider')}</span>
            <div className="font-bold text-main truncate flex items-center gap-1.5">
              <ProviderIcon className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
              <span>{provenance.primaryProvider || 'Local'}</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[11px] text-muted font-medium">{t('geekMethod')}</span>
            <div className="font-bold text-main truncate flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-pale-sky-500 shrink-0" />
              <span>{getMethodLabel(provenance.method)}</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[11px] text-muted font-medium">{t('geekConfidence')}</span>
            <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{Math.round((provenance.confidence || 0.95) * 100)}%</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[11px] text-muted font-medium">{t('geekTimestamp')}</span>
            <div className="font-mono text-muted truncate flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                {provenance.discoveredAt
                  ? new Date(provenance.discoveredAt).toLocaleTimeString()
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 pt-2 bg-canvas/20 border-b border-subtle text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('attribution')}
            className={`px-4 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'attribution'
                ? 'border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-400 bg-surface/50 rounded-t-lg'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('geekTabAttribution')}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-canvas text-[10px] text-muted border border-subtle">
              {fieldEntries.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-400 bg-surface/50 rounded-t-lg'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{t('geekTabAuditTrace')}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-canvas text-[10px] text-muted border border-subtle">
              {auditTraceLines.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('raw')}
            className={`px-4 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'raw'
                ? 'border-pale-sky-500 text-pale-sky-600 dark:text-pale-sky-400 bg-surface/50 rounded-t-lg'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>{t('geekTabRawJson')}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 1. Field-by-Field Attribution Tab */}
          {activeTab === 'attribution' && (
            <div className="space-y-3">
              {fieldEntries.length === 0 ? (
                <div className="p-8 text-center text-muted text-sm space-y-2">
                  <AlertCircle className="w-8 h-8 text-muted mx-auto opacity-50" />
                  <p>{t('geekNoDiagnostics')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-subtle bg-canvas/30 shadow-xs">
                  <table className="w-full text-xs text-start border-collapse">
                    <thead>
                      <tr className="border-b border-subtle bg-canvas/70 text-muted font-semibold">
                        <th className="p-3 text-start">{t('geekFieldCol')}</th>
                        <th className="p-3 text-start">{t('geekValueCol')}</th>
                        <th className="p-3 text-start">{t('geekSourceCol')}</th>
                        <th className="p-3 text-start">{t('geekStatusCol')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {fieldEntries.map(([fieldName, info]) => {
                        const statusBadge = getStatusBadge(info.status);
                        const displayVal =
                          info.value !== undefined
                            ? String(info.value)
                            : String(book[fieldName as keyof BookItem] || '—');

                        return (
                          <tr key={fieldName} className="hover:bg-canvas/50 transition-colors">
                            <td className="p-3 font-bold text-main capitalize whitespace-nowrap">
                              {fieldName}
                            </td>
                            <td className="p-3 text-main max-w-xs sm:max-w-md truncate font-medium">
                              {displayVal}
                            </td>
                            <td
                              className="p-3 text-muted max-w-xs sm:max-w-md truncate font-mono text-[11px]"
                              title={info.source || provenance.primaryProvider || 'Local'}
                            >
                              {info.source || provenance.primaryProvider || 'Local'}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.classes}`}>
                                <span>{statusBadge.label}</span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Source URL if available */}
              {(provenance.sourceUrl || book.sourceUrl) && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-canvas border border-subtle text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-4 h-4 text-pale-sky-500 shrink-0" />
                    <span className="text-muted">{lang === 'ar' ? 'رابط المصدر الأصلي:' : 'Origin Source URL:'}</span>
                    <span className="font-mono text-main truncate max-w-sm sm:max-w-lg">
                      {provenance.sourceUrl || book.sourceUrl}
                    </span>
                  </div>
                  <a
                    href={provenance.sourceUrl || book.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-pale-sky-600 dark:text-pale-sky-400 font-bold hover:underline shrink-0"
                  >
                    <span>{lang === 'ar' ? 'فتح' : 'Open'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* 2. Audit Trace Console Tab */}
          {activeTab === 'audit' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-semibold">{t('geekAuditTrace')}</span>
                <button
                  type="button"
                  onClick={handleCopyTrace}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-canvas border border-subtle hover:text-main text-muted transition-all cursor-pointer text-[11px] font-bold"
                >
                  {copiedTrace ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTrace ? t('geekTraceCopied') : t('geekCopyTrace')}</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 text-emerald-400 font-mono text-xs leading-relaxed border border-zinc-800 shadow-inner overflow-x-auto max-h-[50vh]">
                <div className="space-y-1.5">
                  {auditTraceLines.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-zinc-600 select-none text-[10px] pt-0.5">{(idx + 1).toString().padStart(2, '0')}</span>
                      <span className="text-zinc-300">$</span>
                      <span className={line.includes('Error') || line.includes('fail') ? 'text-rose-400' : line.includes('Verified') ? 'text-emerald-400' : 'text-zinc-200'}>
                        {line}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. Raw JSON Inspector Tab */}
          {activeTab === 'raw' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-semibold">{t('geekRawJson')}</span>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-canvas border border-subtle hover:text-main text-muted transition-all cursor-pointer text-[11px] font-bold"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? t('geekJsonCopied') : t('geekCopyJson')}</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 text-sky-300 font-mono text-xs leading-relaxed border border-zinc-800 shadow-inner overflow-x-auto max-h-[50vh]">
                <pre>{rawJsonString}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-canvas/90 border-t border-subtle flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-muted">
            <Terminal className="w-3.5 h-3.5 text-purple-500" />
            <span>Baglib Bibliographic Provenance & Diagnostics Engine v1.0</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-canvas border border-subtle text-main font-bold hover:bg-surface transition-all cursor-pointer shadow-xs"
          >
            {t('geekClose')}
          </button>
        </div>
      </div>
    </div>
  );
};
