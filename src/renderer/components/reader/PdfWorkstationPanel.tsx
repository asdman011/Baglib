'use client';
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PdfCapability, PdfJob, PdfSession, PdfOperation, PdfFeature, PdfInspection, PdfEditorAPI, PdfTextBlock } from '../../../shared/types/pdf-editor';
import { useWorkspace } from '../context/WorkspaceContext';
import type { TranslationKey } from '../../translations';
import { PdfInlineEditor } from './PdfInlineEditor';
import { PdfWorkstationTools } from './PdfWorkstationTools';

const featureKeys: Record<PdfCapability['feature'], TranslationKey> = {
  preview: 'pdfSuitePreview', split: 'pdfSuiteSplit', 'repair-metadata': 'pdfSuiteRepair', 'verify-signatures': 'pdfSuiteVerifySignatures',
  inspect: 'pdfSuiteInspect', 'export-html': 'pdfSuiteHtml', create: 'pdfSuiteCreate', 'edit-content': 'pdfSuiteEdit', organize: 'pdfSuiteOrganize', ocr: 'pdfSuiteOcr', 'export-docx': 'pdfSuiteDocx', 'export-xlsx': 'pdfSuiteXlsx', 'export-pptx': 'pdfSuitePptx', redact: 'pdfSuiteRedact', encrypt: 'pdfSuiteEncrypt', validate: 'pdfSuiteValidate', sign: 'pdfSuiteSign', review: 'pdfSuiteReview', summarize: 'pdfSuiteSummary', cloud: 'pdfSuiteCloud',
};
export function PdfWorkstationPanel({ workId, onClose }: { workId?: string; onClose: () => void }) {
  const { lang, dir, t } = useWorkspace();
  const [session, setSession] = useState<PdfSession | null>(null);
  const [inlineBlock, setInlineBlock] = useState<PdfTextBlock | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ xref: number; originalRect: number[] } | null>(null), [imageCrop, setImageCrop] = useState('');
  const [sources, setSources] = useState<{ id: string; filename: string }[]>([]);
  const [capabilities, setCapabilities] = useState<PdfCapability[]>([]);
  const [job, setJob] = useState<PdfJob | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tool, setTool] = useState<PdfFeature>(workId ? 'inspect' : 'create');
  const [inspection, setInspection] = useState<PdfInspection | null>(null);
  const [preview, setPreview] = useState<{ page: number; image: string; width: number; height: number } | null>(null);
  const [output, setOutput] = useState<PdfJob | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1), [rect, setRect] = useState([36, 36, 400, 180]), [text, setText] = useState('');
  const [saveMode, setSaveMode] = useState<'copy' | 'overwrite' | 'edition' | 'new-work'>('copy'), [title, setTitle] = useState('');
  const extraSessions = useRef<string[]>([]), drag = useRef<number[] | null>(null);
  const replacementJob = useRef<string | null>(null);
  const api = (): PdfEditorAPI => window.electronAPI.pdfEditor;
  const signatureResult = (job?.result?.signature || (job?.operation === 'verify-signatures' ? job.result : null)) as { status: string; pendingFields?: string[]; signatures?: { subject: string; fingerprint: string }[] } | null;
  const jobId = job?.id;
  const jobState = job?.state;
  useEffect(() => {
    let alive = true;
    let opened: PdfSession | null = null;
    const api = window.electronAPI?.pdfEditor;
    const timer = setTimeout(() => {
      if (!api) { setError('unavailable'); return; }
      void (async () => {
        const [features, result] = await Promise.all([api.capabilities(), workId ? api.open({ workId }) : api.blankSession()]);
        if (result.ok === true) opened = result.data;
        if (!alive) { if (opened) await api.close(opened.id); return; }
        setCapabilities(features);
        if (result.ok === true) setSession(result.data);
        else {
          setError(result.error);
          if (result.error === 'source-required' && workId) {
            const available = await api.sources(workId);
            if (alive && available.ok === true) setSources(available.data);
          }
        }
      })().catch(() => { if (alive) setError('storage'); });
    }, 0);
    return () => { alive = false; clearTimeout(timer); if (opened) void api?.close(opened.id); for (const id of extraSessions.current) void api?.close(id); extraSessions.current = []; };
  }, [workId]);
  useEffect(() => {
    if (!jobId || jobState !== 'running') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await window.electronAPI.pdfEditor.status(jobId);
        if (!alive) return;
        if (result.ok === true) {
          setJob(result.data);
          if (result.data.state === 'running') timer = setTimeout(() => void poll(), 350);
          else if (result.data.state === 'completed') {
            if (replacementJob.current === result.data.id) {
              // Global edits can invalidate every old text box and preview.
              setInspection(null); setPreview(null); setThumbnails({});
              setInlineBlock(null); setSelectedImage(null); replacementJob.current = null;
            }
            if (result.data.inspection) setInspection(result.data.inspection);
            if (result.data.result?.image) setPreview(result.data.result as unknown as NonNullable<typeof preview>);
            if (result.data.outputs?.length) setOutput(result.data);
            if (Array.isArray(result.data.result?.thumbnails)) setThumbnails(previous => ({ ...previous, ...Object.fromEntries((result.data.result!.thumbnails as { key?: string; page: number; image: string }[]).map(item => [item.key || item.page, item.image])) }));
          }
        }
        else setError(result.error);
      } catch { if (alive) setError('storage'); }
    };
    timer = setTimeout(() => void poll(), 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [jobId, jobState]);
  const start = async (operation: PdfOperation, payload?: Record<string, unknown>) => {
    if (!session || starting || job?.state === 'running') return;
    setStarting(true); setError(null); setSaved(false);
    try {
      const result = await api().start({ sessionId: session.id, operation, payload, language: lang, ...(password ? { password } : {}) });
      if (result.ok === true) {
        if (operation === 'edit-content' && Array.isArray(payload?.textReplacements)) replacementJob.current = result.data.id;
        setJob(result.data);
      } else setError(result.error);
    } catch { setError('storage'); }
    finally { setStarting(false); }
  };
  const point = (event: React.PointerEvent<HTMLDivElement>) => { const area = event.currentTarget.getBoundingClientRect(); return [(event.clientX - area.left) / area.width * preview!.width, (event.clientY - area.top) / area.height * preview!.height]; };
  const switchSource = (value: PdfSession) => { extraSessions.current.push(value.id); setSession(value); setInspection(null); setPreview(null); setOutput(null); setPage(1); setError(null); setSaveMode('copy'); setInlineBlock(null); setSelectedImage(null); };
  return <aside role="region" aria-label={t('pdfSuiteTitle')} dir={dir} data-pdf-workstation className="fixed top-20 bottom-12 inset-x-3 mx-auto z-50 max-w-6xl rounded-2xl border border-subtle bg-surface shadow-xl flex flex-col">
    <header className="flex items-center justify-between gap-2 border-b border-subtle p-4"><div><h2 className="font-bold leading-relaxed">{t('pdfSuiteTitle')}</h2><p dir="auto" className="text-xs text-muted break-all">{session?.filename}</p></div><button type="button" aria-label={t('studyClose')} onClick={onClose}><X size={18} /></button></header>
    <div className="overflow-y-auto p-4 space-y-4 min-h-0 text-sm">
      <p className="text-xs text-muted leading-relaxed">{t('pdfSuiteCheckpoint')}</p>
      {sources.length > 0 && workId && <label className="block">{t('pdfChooseSource')}<select defaultValue="" onChange={event => { void api().open({ workId, sourceId: event.target.value }).then(result => { if (result.ok === true) switchSource(result.data); else setError(result.error); }); }} className="block w-full rounded border border-subtle bg-canvas p-2"><option value="" disabled>{t('pdfChooseSource')}</option>{sources.map(source => <option key={source.id} value={source.id}>{source.filename} · {source.id.slice(0, 8)}</option>)}</select></label>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={starting || job?.state === 'running'} className="rounded border border-subtle p-2" onClick={() => { void api().chooseSource().then(response => { if (response.ok === true && response.data) switchSource(response.data); }); }}>{t('pdfOpenSource')}</button><button type="button" disabled={starting || job?.state === 'running'} className="rounded border border-subtle p-2" onClick={() => { void api().blankSession().then(response => { if (response.ok === true) { switchSource(response.data); setTool('create'); } }); }}>{t('pdfNewBlank')}</button><label>{t('pdfTool')}<select className="rounded border border-subtle bg-canvas p-2 max-w-full" value={tool} onChange={event => setTool(event.target.value as PdfFeature)}>{Object.entries(featureKeys).map(([feature, key]) => <option key={feature} value={feature}>{t(key)}</option>)}</select></label></div>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(16rem,23rem)] gap-4">
      <section className="min-w-0 space-y-3 order-2 md:order-1"><div className="flex flex-wrap gap-2 items-center"><label>{t('page')}<input type="number" min={1} max={inspection?.totalPages || 10000} value={page} onChange={event => setPage(Math.max(1, Number(event.target.value)))} className="w-20 rounded border border-subtle bg-canvas p-2" /></label><button type="button" disabled={!session || starting || job?.state === 'running'} onClick={() => void start('inspect')} className="rounded border border-subtle p-2">{t('pdfSuiteInspect')}</button><button type="button" disabled={!session || starting || job?.state === 'running'} onClick={() => void start('preview', { page })} className="rounded border border-subtle p-2">{t('pdfSuitePreview')}</button></div><p className="text-xs text-muted">{t('pdfSelectArea')}</p>
      {preview && <div dir="ltr" data-pdf-page-preview className="relative bg-white w-full overflow-hidden select-none touch-none" style={{ aspectRatio: `${preview.width}/${preview.height}` }} onPointerDown={event => { drag.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={event => { const end = point(event), begin = drag.current; drag.current = null; if (begin && Math.abs(end[0] - begin[0]) > 3 && Math.abs(end[1] - begin[1]) > 3) { setPage(preview.page); setRect([Math.max(0, Math.min(begin[0], end[0])), Math.max(0, Math.min(begin[1], end[1])), Math.min(preview.width, Math.max(begin[0], end[0])), Math.min(preview.height, Math.max(begin[1], end[1]))]); } }}>
      {/* Physical PDF coordinates remain independent of interface direction. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.image} alt={t('pdfPagePreview', { page: preview.page })} draggable={false} className="w-full h-full pointer-events-none" />
      {tool === 'edit-content' && inspection?.pages.find(item => item.page === preview.page)?.images?.flatMap(image => image.rects.map((area, index) => <button key={`${image.xref}-${index}`} type="button" aria-label={t('pdfSelectEmbeddedImage')} onPointerDown={event => event.stopPropagation()} onClick={() => { setPage(preview.page); setRect(area); setSelectedImage({ xref: image.xref, originalRect: area }); setInlineBlock(null); }} className="absolute z-10 border border-violet-500/30 hover:bg-violet-500/10" style={{ left: `${area[0] / preview.width * 100}%`, top: `${area[1] / preview.height * 100}%`, width: `${(area[2] - area[0]) / preview.width * 100}%`, height: `${(area[3] - area[1]) / preview.height * 100}%` }} />))}
      {tool === 'edit-content' && inlineBlock && <textarea data-pdf-inline-text autoFocus aria-label={t('pdfText')} dir={inlineBlock.direction} value={text} onChange={event => setText(event.target.value)} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} className="absolute z-20 bg-white text-black border-2 border-emerald-600 leading-relaxed resize" style={{ left: `${rect[0] / preview.width * 100}%`, top: `${rect[1] / preview.height * 100}%`, width: `${(rect[2] - rect[0]) / preview.width * 100}%`, height: `${(rect[3] - rect[1]) / preview.height * 100}%`, minHeight: '3rem' }} />}
      <div className="absolute border-2 border-emerald-600 bg-emerald-500/10 pointer-events-none" style={{ left: `${rect[0] / preview.width * 100}%`, top: `${rect[1] / preview.height * 100}%`, width: `${(rect[2] - rect[0]) / preview.width * 100}%`, height: `${(rect[3] - rect[1]) / preview.height * 100}%` }} />
      {tool === 'edit-content' && inspection?.pages.find(item => item.page === preview.page)?.blocks.map((block, index) => <button key={index} type="button" aria-label={t('pdfEditBlock', { text: block.text.slice(0, 80) })} title={block.text} onPointerDown={event => event.stopPropagation()} onClick={() => { setPage(preview.page); setText(block.text); setInlineBlock(block); setSelectedImage(null); setRect([Math.max(0, block.x - 2), Math.max(0, block.y - 2), Math.min(preview.width, block.x + block.width + 8), Math.min(preview.height, block.y + block.height + (block.fontSize || 12))]); }} className="absolute z-10 border border-transparent hover:border-blue-500 hover:bg-blue-500/10" style={{ left: `${block.x / preview.width * 100}%`, top: `${block.y / preview.height * 100}%`, width: `${block.width / preview.width * 100}%`, height: `${block.height / preview.height * 100}%` }} />)}</div>}
      {tool === 'edit-content' && inlineBlock && <PdfInlineEditor key={`${preview?.page}-${inlineBlock.x}-${inlineBlock.y}`} block={inlineBlock} value={text} setValue={setText} busy={starting || job?.state === 'running'} onApply={style => { void start('edit-content', { edits: [{ kind: 'replace-text', page, rect, text, ...style }] }); setInlineBlock(null); }} onCancel={() => setInlineBlock(null)} />}
      {tool === 'edit-content' && selectedImage && <div className="space-y-2 rounded border border-subtle p-3"><p>{t('pdfMoveImageHint')}</p><label>{t('pdfCropPixels')}<input dir="ltr" value={imageCrop} onChange={event => setImageCrop(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2" /></label><button type="button" disabled={starting || job?.state === 'running'} onClick={() => { const crop = imageCrop ? imageCrop.split(',').map(Number) : undefined; if (crop && (crop.length !== 4 || crop.some(value => !Number.isFinite(value)))) { setError('invalid-request'); return; } void start('edit-content', { edits: [{ kind: 'move-image', page, rect, xref: selectedImage.xref, originalRect: selectedImage.originalRect, ...(crop ? { crop } : {}) }] }); setSelectedImage(null); }} className="rounded border border-subtle p-2">{t('pdfMoveImageApply')}</button></div>}
      {inspection && <details><summary>{t('pdfSuitePageCount', { count: inspection.totalPages })}</summary>{inspection.pages.map(item => <details key={item.page}><summary>{t('page')} {item.page}</summary><p dir="auto" className="whitespace-pre-wrap break-words leading-loose select-text p-2">{item.text || t('pdfSuiteNoText')}</p></details>)}</details>}</section>
      <section className="min-w-0 space-y-3 order-1 md:order-2"><h3 className="font-semibold">{t(featureKeys[tool])}</h3>
      {capabilities.some(item => item.feature === tool && !item.available) && <p role="status" className="text-xs text-muted">{t('pdfSuitePending')}</p>}
      {!['cloud', 'summarize', 'review', 'create'].includes(tool) && <label className="block space-y-1 text-xs"><span>{t('pdfSuitePassword')}</span><input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-subtle bg-canvas p-2" /></label>}
      {['edit-content', 'redact', 'sign', 'review'].includes(tool) && <fieldset><legend>{t('pdfAreaPoints')}</legend><div dir="ltr" className="grid grid-cols-4 gap-1">{rect.map((value, index) => <input type="number" key={index} step="0.1" aria-label={t((['pdfXStart', 'pdfYStart', 'pdfXEnd', 'pdfYEnd'] as const)[index])} value={Math.round(value * 10) / 10} onChange={event => setRect(previous => previous.map((value, current) => current === index ? Number(event.target.value) : value))} className="w-full rounded border border-subtle bg-canvas p-1" />)}</div></fieldset>}
      {session && <PdfWorkstationTools key={session.id} tool={tool} session={session} page={page} rect={rect} inspection={inspection} output={output} thumbnails={thumbnails} text={text} setText={setText} busy={starting || job?.state === 'running'} run={(operation, payload) => void start(operation, payload)} onPage={number => { setPage(number); void start('preview', { page: number }); }} onSource={source => extraSessions.current.push(source.id)} />}
      {(error || job?.error) && <p role="alert">{t(job?.error === 'text-does-not-fit' ? 'pdfTextDoesNotFit' : job?.error === 'signed-document-locked' ? 'pdfSignedLocked' : error === 'source-required' ? 'pdfSuiteSourceRequired' : error === 'encrypted' || job?.error === 'encrypted' ? 'pdfSuiteEncrypted' : error === 'source-changed' || job?.error === 'source-changed' ? 'pdfSuiteSourceChanged' : 'pdfSuiteFailure')}</p>}
      {job?.state === 'running' && <div role="status"><p>{t('pdfSuiteProgress', { current: job.current, total: job.total })}</p><button type="button" onClick={() => { void window.electronAPI.pdfEditor.cancel(job.id).then(() => window.electronAPI.pdfEditor.status(job.id)).then(result => { if (result.ok === true) setJob(result.data); }).catch(() => setError('storage')); }} className="underline py-2">{t('pdfSuiteCancel')}</button></div>}
      {signatureResult && <div className="space-y-2 rounded border border-subtle p-3"><p role="status">{t(signatureResult.status === 'Pending Signature' ? 'pdfSignaturePending' : signatureResult.status === 'Verified' ? 'pdfSignatureVerified' : signatureResult.status === 'Tampered' ? 'pdfSignatureTampered' : signatureResult.status === 'Signed' ? 'pdfSignatureSigned' : 'pdfSignatureDraft')}</p>{signatureResult.pendingFields?.map(name => <p key={name} dir="auto">{name}</p>)}{signatureResult.signatures?.map((item, index) => <p key={index} dir="auto">{item.subject}<br /><span dir="ltr" className="break-all text-xs">{item.fingerprint}</span></p>)}</div>}
      {job?.result && !signatureResult && !job.result.image && !job.result.outputs && <div className="text-xs space-y-2">{typeof job.result.compliant === 'boolean' && <p role="status">{t(job.result.compliant ? 'pdfCompliant' : 'pdfNotCompliant')}</p>}{Array.isArray(job.result.failures) && (job.result.failures as { clause: string; description: string }[]).map((item, index) => <p key={index} dir="auto">{item.clause}: {item.description}</p>)}{typeof job.result.status === 'string' && <p role="status">{t(job.result.status === 'Pending Signature' ? 'pdfSignaturePending' : job.result.status === 'Verified' ? 'pdfSignatureVerified' : job.result.status === 'Tampered' ? 'pdfSignatureTampered' : job.result.status === 'Signed' ? 'pdfSignatureSigned' : 'pdfSignatureDraft')}</p>}{Array.isArray(job.result.signatures) && (job.result.signatures as { subject: string; fingerprint: string }[]).map((item, index) => <p key={index} dir="auto">{item.subject}<br /><span dir="ltr">{item.fingerprint}</span></p>)}</div>}
      {output?.outputs && <section className="space-y-2 border-t border-subtle pt-3"><p className="text-xs text-muted">{t('pdfStagedHint')}</p><label>{t('pdfSaveMode')}<select value={saveMode} onChange={event => setSaveMode(event.target.value as typeof saveMode)} className="block w-full rounded border border-subtle bg-canvas p-2"><option value="copy">{t('pdfSuiteSaveCopy')}</option>{output.output?.format === 'pdf' && <>{session?.sha256 && <option value="overwrite">{t('pdfSafeSave')}</option>}{session?.workId && <option value="edition">{t('pdfSaveEdition')}</option>}<option value="new-work">{t('pdfSaveWork')}</option></>}</select></label>{(saveMode === 'edition' || saveMode === 'new-work') && <label>{t('pdfDocumentTitle')}<input dir="auto" value={title} onChange={event => setTitle(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2" /></label>}{saveMode === 'overwrite' && <p className="text-xs text-muted">{t('pdfBackupWarning')}</p>}{output.outputs.map((item, index) => <button type="button" key={item.filename} className="rounded-lg bg-emerald-700 text-white px-3 py-2 w-full break-all" disabled={starting || job?.state === 'running' || (saveMode === 'edition' || saveMode === 'new-work') && !title.trim()} onClick={() => { void api().save({ jobId: output.id, outputIndex: index, mode: saveMode, title }).then(result => { if (result.ok === true) { setSaved(result.data.saved); if (result.data.session) { if (result.data.session.id !== session?.id) { setSources([]); switchSource(result.data.session); setJob(null); } else setSession(result.data.session); } } else setError(result.error); }).catch(() => setError('storage')); }}>{t('pdfSaveOutput', { name: item.filename })}</button>)}</section>}
      {saved && <p role="status">{t('pdfSuiteSaved')}</p>}
      </section></div>
    </div>
  </aside>;
}
