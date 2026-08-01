'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
}

export default function Home() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.getSystemInfo().then(setSystemInfo).catch(console.error);
    }
  }, []);

  const getPlatformArabic = (platform?: string) => {
    if (!platform) return 'متصفح / ويب';
    if (platform === 'win32') return 'ويندوز (Windows)';
    if (platform === 'darwin') return 'ماك (macOS)';
    if (platform === 'linux') return 'لينكس (Linux)';
    return platform;
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-center bg-canvas text-main relative overflow-hidden font-sans">
      {/* Decorative ambient background blur using Pale Sky and Amber tints */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-pale-sky-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl w-full p-8 sm:p-12 rounded-3xl bg-surface border border-subtle shadow-xl relative z-10">

        {/* Top Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-pale-sky-100 dark:bg-pale-sky-800 border border-pale-sky-200 dark:border-pale-sky-800 text-pale-sky-600 dark:text-pale-sky-400 text-sm font-semibold mb-6">
          <span className="w-2.5 h-2.5 rounded-full bg-pale-sky-600 dark:bg-pale-sky-500 animate-pulse" />
          تطبيق بغلب للقراءة وإدارة الكتب (Baghlib Desktop)
        </div>

        {/* Logo Image */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl p-1 bg-gradient-to-br from-pale-sky-500 via-evergreen-500 to-amber-500 shadow-xl overflow-hidden">
          <img src="/logo.png" alt="Baglib Logo" className="w-full h-full object-cover rounded-xl" />
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-bold font-display tracking-tight text-pale-sky-950 dark:text-pale-sky-50 mb-4">
          بغلب <span className="text-pale-sky-600 dark:text-pale-sky-400">Baghlib</span>
        </h1>
        <p className="text-muted text-base sm:text-lg mb-8 leading-relaxed max-w-xl mx-auto font-sans">
          منصة سطح المكتب الشاملة لإدارة المكتبات الشخصية ومتابعة القراءة والبحث العلمي.
        </p>

        {/* System Info Grid Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-canvas border border-subtle hover:border-pale-sky-500/40 transition-colors">
            <span className="text-xs text-muted font-medium block mb-1">نظام التشغيل</span>
            <span className="text-base font-bold text-main">{getPlatformArabic(systemInfo?.platform)}</span>
          </div>
          <div className="p-5 rounded-2xl bg-canvas border border-subtle hover:border-pale-sky-500/40 transition-colors">
            <span className="text-xs text-muted font-medium block mb-1">معمارية المعالج</span>
            <span className="text-base font-bold text-main">{systemInfo?.arch ?? 'غير محدد'}</span>
          </div>
          <div className="p-5 rounded-2xl bg-canvas border border-subtle hover:border-pale-sky-500/40 transition-colors">
            <span className="text-xs text-muted font-medium block mb-1">إصدار Electron</span>
            <span className="text-base font-bold text-main">{systemInfo?.version ?? 'غير محدد'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <Link
            href="/playground"
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center gap-2"
          >
            <span>🎨</span>
            <span>مختبر نظام التصميم (Playground)</span>
          </Link>

          <button className="px-6 py-3 rounded-xl bg-pale-sky-600 text-white font-semibold hover:bg-pale-sky-700 transition-all shadow-lg shadow-pale-sky-600/20 cursor-pointer">
            تصفح المكتبة
          </button>
          <button className="px-6 py-3 rounded-xl bg-canvas border border-subtle text-main font-semibold hover:bg-pale-sky-100 dark:hover:bg-pale-sky-800 transition-all cursor-pointer">
            إضافة كتاب جديد
          </button>
        </div>

        {/* Footer Info */}
        <div className="flex flex-wrap justify-center gap-4 text-xs text-muted border-t border-subtle pt-6">
          <span>العملية الرئيسية: Node.js</span>
          <span>•</span>
          <span>عملية العرض: Chromium</span>
          <span>•</span>
          <span>الجسر الآمن: ContextBridge</span>
        </div>
      </div>
    </main>
  );
}
