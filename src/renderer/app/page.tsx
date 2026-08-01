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
      <div className="max-w-3xl w-full p-8 sm:p-12 rounded-3xl bg-surface border border-subtle shadow-xl relative z-10">

        {/* Logo Image */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl p-1 bg-surface border border-subtle shadow-md overflow-hidden">
          <img src="/logo.png" alt="Baglib Logo" className="w-full h-full object-cover rounded-xl" />
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-bold font-display tracking-tight text-main mb-4">
          بغلب Baghlib
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
