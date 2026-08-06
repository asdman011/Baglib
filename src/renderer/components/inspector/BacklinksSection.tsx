'use client';

import React from 'react';
import { Link, ArrowLeft, ArrowRight } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SAMPLE_BACKLINKS } from '../../data/mockData';

export const BacklinksSection: React.FC = () => {
  const { dir } = useWorkspace();
  const isRtl = dir === 'rtl';

  const backlinks = SAMPLE_BACKLINKS;

  return (
    <div className="space-y-3 font-sans text-xs">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-main flex items-center gap-1.5">
          <Link className="w-3.5 h-3.5 text-pale-sky-500" />
          <span>الإشارات المرجعية المرتبطة ({backlinks.length})</span>
        </h4>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-pale-sky-500/10 text-pale-sky-500 font-mono font-bold">
          [[Backlinks]]
        </span>
      </div>

      <p className="text-muted text-[11px]">
        الملفات والملاحظات التي تُشير وتستشهد بـ <strong>سورة البقرة: 255</strong>:
      </p>

      <div className="space-y-2">
        {backlinks.map((item, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl bg-surface border border-subtle hover:border-pale-sky-500/40 transition-all cursor-pointer group space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-main truncate font-sans text-xs group-hover:text-pale-sky-500 transition-colors">
                {item.title}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-bold shrink-0">
                ×{item.count}
              </span>
            </div>

            <p className="text-[11px] text-muted font-serif line-clamp-2 leading-relaxed bg-canvas/40 p-2 rounded-lg border border-subtle/40">
              "{item.excerpt}"
            </p>

            <div className="flex items-center justify-between text-[10px] text-muted pt-1">
              <span>{item.date}</span>
              <span className="group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform flex items-center gap-0.5 text-pale-sky-500">
                <span>فتح الملاحظة</span>
                {isRtl ? <ArrowLeft className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
