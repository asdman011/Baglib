'use client';

import { useEffect, useState } from 'react';

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
    <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-center bg-[#efece4] text-[#4a1d25] relative overflow-hidden">
      {/* Decorative ambient background blur using burgundy and warm gold tints */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#853a47]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-[#d9caad]/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl w-full p-8 sm:p-12 rounded-3xl bg-[#f8f6f0] border border-[#dcd4c3] shadow-xl relative z-10">

        {/* Top Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#853a47]/10 border border-[#853a47]/20 text-[#853a47] text-sm font-semibold mb-6">
          <span className="w-2.5 h-2.5 rounded-full bg-[#853a47] animate-pulse" />
          تطبيق بغلب للقراءة وإدارة الكتب
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-[#4a1d25] mb-4">
          بغلب <span className="text-[#853a47]">Baghlib</span>
        </h1>
        <p className="text-[#736366] text-base sm:text-lg mb-8 leading-relaxed max-w-xl mx-auto">
          منصة سطح المكتب الشاملة لإدارة المكتبات الشخصية ومتابعة القراءة.
        </p>

        {/* Info Grid Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-[#efece4]/70 border border-[#dcd4c3] hover:border-[#853a47]/40 transition-colors">
            <span className="text-xs text-[#736366] font-medium block mb-1">نظام التشغيل</span>
            <span className="text-base font-bold text-[#4a1d25]">{getPlatformArabic(systemInfo?.platform)}</span>
          </div>
          <div className="p-5 rounded-2xl bg-[#efece4]/70 border border-[#dcd4c3] hover:border-[#853a47]/40 transition-colors">
            <span className="text-xs text-[#736366] font-medium block mb-1">معمارية المعالج</span>
            <span className="text-base font-bold text-[#4a1d25]">{systemInfo?.arch ?? 'غير محدد'}</span>
          </div>
          <div className="p-5 rounded-2xl bg-[#efece4]/70 border border-[#dcd4c3] hover:border-[#853a47]/40 transition-colors">
            <span className="text-xs text-[#736366] font-medium block mb-1">إصدار Electron</span>
            <span className="text-base font-bold text-[#4a1d25]">{systemInfo?.version ?? 'غير محدد'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <button className="px-6 py-3 rounded-xl bg-[#853a47] text-[#efece4] font-semibold hover:bg-[#652a34] transition-all shadow-lg shadow-[#853a47]/20 cursor-pointer">
            تصفح المكتبة
          </button>
          <button className="px-6 py-3 rounded-xl bg-[#efece4] border border-[#dcd4c3] text-[#4a1d25] font-semibold hover:bg-[#e4decb] transition-all cursor-pointer">
            إضافة كتاب جديد
          </button>
        </div>

        {/* Footer Info */}
        <div className="flex flex-wrap justify-center gap-4 text-xs text-[#736366] border-t border-[#dcd4c3] pt-6">
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
