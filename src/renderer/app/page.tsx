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
    <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-center bg-[var(--bg-canvas)] text-[var(--text-main)] relative overflow-hidden font-sans">
      {/* Decorative ambient background blur using Pale Sky and Amber tints */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#4691b9]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-[#d97706]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl w-full p-8 sm:p-12 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl relative z-10">

        {/* Top Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#dae9f1] dark:bg-[#1c3a4a] border border-[#b5d3e3] dark:border-[#1c3a4a] text-[#387494] dark:text-[#6ba7c7] text-sm font-semibold mb-6">
          <span className="w-2.5 h-2.5 rounded-full bg-[#387494] dark:bg-[#4691b9] animate-pulse" />
          تطبيق بغلب للقراءة وإدارة الكتب (Baghlib Desktop)
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-bold font-display tracking-tight text-[#0a141a] dark:text-[#edf4f8] mb-4">
          بغلب <span className="text-[#387494] dark:text-[#6ba7c7]">Baghlib</span>
        </h1>
        <p className="text-[var(--text-muted)] text-base sm:text-lg mb-8 leading-relaxed max-w-xl mx-auto font-sans">
          منصة سطح المكتب الشاملة لإدارة المكتبات الشخصية ومتابعة القراءة والبحث العلمي.
        </p>

        {/* System Info Grid Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[#4691b9]/40 transition-colors">
            <span className="text-xs text-[var(--text-muted)] font-medium block mb-1">نظام التشغيل</span>
            <span className="text-base font-bold text-[var(--text-main)]">{getPlatformArabic(systemInfo?.platform)}</span>
          </div>
          <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[#4691b9]/40 transition-colors">
            <span className="text-xs text-[var(--text-muted)] font-medium block mb-1">معمارية المعالج</span>
            <span className="text-base font-bold text-[var(--text-main)]">{systemInfo?.arch ?? 'غير محدد'}</span>
          </div>
          <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[#4691b9]/40 transition-colors">
            <span className="text-xs text-[var(--text-muted)] font-medium block mb-1">إصدار Electron</span>
            <span className="text-base font-bold text-[var(--text-main)]">{systemInfo?.version ?? 'غير محدد'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <Link
            href="/playground"
            className="px-6 py-3 rounded-xl bg-[#d97706] hover:bg-[#b45309] text-white font-semibold transition-all shadow-lg shadow-[#d97706]/20 cursor-pointer flex items-center gap-2"
          >
            <span>🎨</span>
            <span>مختبر نظام التصميم (Playground)</span>
          </Link>

          <button className="px-6 py-3 rounded-xl bg-[#387494] text-white font-semibold hover:bg-[#2a576f] transition-all shadow-lg shadow-[#387494]/20 cursor-pointer">
            تصفح المكتبة
          </button>
          <button className="px-6 py-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-main)] font-semibold hover:bg-[#dae9f1] dark:hover:bg-[#1c3a4a] transition-all cursor-pointer">
            إضافة كتاب جديد
          </button>
        </div>

        {/* Footer Info */}
        <div className="flex flex-wrap justify-center gap-4 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-6">
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
