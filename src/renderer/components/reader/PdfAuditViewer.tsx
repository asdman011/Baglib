'use client';
import React, { useState } from 'react';
import type { PdfEditorAPI } from '../../../shared/types/pdf-editor';
import { useWorkspace } from '../context/WorkspaceContext';
export function PdfAuditViewer() {
  const { t, lang } = useWorkspace();
  const [audit, setAudit] = useState<{ valid: boolean; records: { id: string; at: string; operation: string; sourceHash: string; outputHash: string; certificateFingerprint?: string; signer?: string; status: string }[] } | null>(null), [error, setError] = useState(false);
  return <section className="space-y-2 border-t border-subtle pt-3"><button type="button" onClick={() => { const api: PdfEditorAPI = window.electronAPI.pdfEditor; void api.audit().then(result => { if (result.ok === true) { setAudit(result.data); setError(false); } else setError(true); }).catch(() => setError(true)); }} className="underline p-2">{t('pdfAuditShow')}</button><p className="text-xs text-muted">{t('pdfAuditLimit')}</p>{error && <p role="alert">{t('pdfSuiteFailure')}</p>}{audit && <><p role={audit.valid ? 'status' : 'alert'}>{t(audit.valid ? 'pdfAuditIntact' : 'pdfAuditAltered')}</p>{audit.records.slice(-30).reverse().map(record => <details key={record.id}><summary>{new Date(record.at).toLocaleString(lang)} · {t(record.operation === 'prepare-signature' ? 'pdfPrepareSignature' : record.operation === 'sign' ? 'pdfSuiteSign' : 'pdfSuiteVerifySignatures')}</summary><p dir="auto">{record.signer}</p><dl className="text-xs break-all"><dt>{t('pdfAuditSource')}</dt><dd dir="ltr">{record.sourceHash}</dd><dt>{t('pdfAuditOutput')}</dt><dd dir="ltr">{record.outputHash}</dd><dt>{t('pdfAuditCertificate')}</dt><dd dir="ltr">{record.certificateFingerprint}</dd></dl></details>)}</>}</section>;
}
