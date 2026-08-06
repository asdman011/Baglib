'use client';

import React, { useState } from 'react';
import { HardDrive, Trash2, CheckCircle2, AlertTriangle, RefreshCw, FileText, X } from 'lucide-react';
import { BookItem } from '../../types/library';

interface StorageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: BookItem[];
  onRemoveDuplicate: (id: string) => void;
}

export const StorageManagerModal: React.FC<StorageManagerModalProps> = ({
  isOpen,
  onClose,
  books,
  onRemoveDuplicate,
}) => {
  if (!isOpen) return null;

  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);

  const duplicates = books.filter((b) => b.isDuplicate || b.title.includes('تفسير'));

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setScanComplete(true);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col font-sans" dir="rtl">
        {/* Modal Header */}
        <div className="p-4 bg-canvas/80 border-b border-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-bold">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-main text-base">إدارة التخزين وتنظيف الملفات المكررة</h3>
              <p className="text-xs text-muted">حذف الملفات المكررة وتعديل الملفات الأصلية دون إنشاء نسخ عشوائية</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-canvas border border-subtle flex items-center justify-between">
            <div>
              <h4 className="font-bold text-main text-xs">حالة القرص المحلي والمكتبة الرقمية</h4>
              <p className="text-[11px] text-muted">تم استخدام 89.2 MB لمكتبتك المحلية • تعديل مباشر في المسار الأصلي</p>
            </div>
            <button
              onClick={handleScan}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'جاري الفحص...' : 'فحص الملفات المكررة'}</span>
            </button>
          </div>

          {scanComplete && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-main">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>الملفات المشتبه بتكرارها في المجلدات المحلية:</span>
              </div>

              {duplicates.length > 0 ? (
                duplicates.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-surface border border-subtle flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-pale-sky-500" />
                      <div>
                        <span className="font-bold text-main">{item.title}</span>
                        <span className="text-[10px] text-muted block font-mono">{item.filePath}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onRemoveDuplicate(item.id)}
                      className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 font-bold hover:bg-red-500/20 text-[11px] transition-colors"
                    >
                      حذف النسخة المكررة
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-muted text-xs bg-canvas rounded-2xl border border-subtle">
                  <CheckCircle2 className="w-8 h-8 text-evergreen-500 mx-auto mb-2" />
                  <span>المكتبة نظيفة تماماً! لا توجد أي ملفات مكررة أو نسخ زائدة.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-canvas border-t border-subtle flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-surface border border-subtle text-xs font-bold text-main hover:bg-canvas transition-all"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
