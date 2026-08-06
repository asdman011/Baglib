'use client';

import React from 'react';
import { Database, FileText } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export const StatusBar: React.FC = () => {
  const { dir, bookNotes } = useWorkspace();

  const isRtl = dir === 'rtl';

  return (
    <footer className="h-6 bg-surface border-t border-subtle flex items-center justify-between px-3 text-[11px] text-muted select-none z-20 shrink-0 font-sans">
      {/* Left Items */}
      <div className="flex items-center gap-4">
        {/* Total Book Notes Count */}
        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3 text-pale-sky-500" />
          <span>{bookNotes.length} ملاحظات مدوّنة</span>
        </div>

        <span className="text-subtle">•</span>

        {/* Local Indexing Status */}
        <div className="flex items-center gap-1.5" title="المكتبة الرقمية والفيزيائية المحلية">
          <Database className="w-3 h-3 text-evergreen-500" />
          <span>مكتبتك المحلية: جاهزة ومفهرسة</span>
        </div>
      </div>

      {/* Right Items */}
      <div className="flex items-center gap-4">
        {/* Active Shortcuts Quick Help */}
        <div className="hidden md:flex items-center gap-2 text-[10px] text-muted">
          <span className="flex items-center gap-0.5">
            <kbd className="px-1 py-0.2 rounded bg-canvas border border-subtle font-mono">Ctrl+K</kbd>{' '}
            البحث الشامل
          </span>
          <span>•</span>
          <span className="flex items-center gap-0.5">
            <kbd className="px-1 py-0.2 rounded bg-canvas border border-subtle font-mono">F11</kbd>{' '}
            وضع الصفاء والتركيز
          </span>
        </div>
      </div>
    </footer>
  );
};
