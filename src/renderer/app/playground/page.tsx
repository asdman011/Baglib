'use client';

import React, { useState, useEffect } from 'react';

export default function DesignSystemPlayground() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeTab, setActiveTab] = useState<'overview' | 'colors' | 'typography' | 'components' | 'sandbox'>('overview');
  const [selectedFont, setSelectedFont] = useState<'amiri' | 'tajawal' | 'reem-kufi'>('amiri');
  const [readerFontSize, setReaderFontSize] = useState<number>(20);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const parchmentSwatches = [
    { name: 'parchment-50', hex: '#fbf9f4', role: 'Bright Paper Base' },
    { name: 'parchment-100', hex: '#f8f6f0', role: 'Cream Card Surface' },
    { name: 'parchment-200', hex: '#efece4', role: 'Warm Beige Canvas Base' },
    { name: 'parchment-300', hex: '#e5dfd0', role: 'Soft Parchment Sidebar' },
    { name: 'parchment-400', hex: '#dcd4c3', role: 'Antique Parchment Border' },
    { name: 'parchment-500', hex: '#c9bda5', role: 'Muted Parchment Accent' },
    { name: 'parchment-700', hex: '#7d6e57', role: 'Muted Ink Text' },
    { name: 'parchment-900', hex: '#2c221a', role: 'Deep Manuscript Ink' },
  ];

  const paleSkySwatches = [
    { name: 'pale-sky-50', hex: '#edf4f8', role: 'Light Accent Tint' },
    { name: 'pale-sky-100', hex: '#dae9f1', role: 'Sidebar Accent' },
    { name: 'pale-sky-200', hex: '#b5d3e3', role: 'Border Accent' },
    { name: 'pale-sky-300', hex: '#90bdd5', role: 'Dark Muted Text' },
    { name: 'pale-sky-400', hex: '#6ba7c7', role: 'Subtle Highlight' },
    { name: 'pale-sky-500', hex: '#4691b9', role: 'Primary Accent' },
    { name: 'pale-sky-600', hex: '#387494', role: 'Primary Button' },
    { name: 'pale-sky-700', hex: '#2a576f', role: 'Light Muted Text' },
    { name: 'pale-sky-800', hex: '#1c3a4a', role: 'Dark Border' },
    { name: 'pale-sky-900', hex: '#0e1d25', role: 'Dark Surface' },
    { name: 'pale-sky-950', hex: '#0a141a', role: 'Dark Canvas Base' },
  ];

  const evergreenSwatches = [
    { name: 'evergreen-50', hex: '#eef6f1', role: 'Success Light BG' },
    { name: 'evergreen-100', hex: '#ddeee4', role: 'Tag Light BG' },
    { name: 'evergreen-300', hex: '#9acbae', role: 'Success Border' },
    { name: 'evergreen-500', hex: '#57a877', role: 'Evergreen Primary' },
    { name: 'evergreen-600', hex: '#45875f', role: 'SRS Mastery Badge' },
    { name: 'evergreen-700', hex: '#346548', role: 'Zotero Sync Accent' },
    { name: 'evergreen-900', hex: '#112218', role: 'Dark Evergreen Card' },
  ];

  const amberSwatches = [
    { name: 'amber-50', hex: '#fffbeb', role: 'Highlight Light BG' },
    { name: 'amber-100', hex: '#fef3c7', role: 'Ayah Badge BG' },
    { name: 'amber-300', hex: '#fcd34d', role: 'Bookmark Border' },
    { name: 'amber-500', hex: '#d97706', role: 'Baghdad Amber Accent' },
    { name: 'amber-600', hex: '#b45309', role: 'Ayah Marker / Search' },
    { name: 'amber-800', hex: '#78350f', role: 'Warning Text' },
  ];

  return (
    <div className="min-h-screen transition-colors duration-300 bg-[var(--bg-canvas)] text-[var(--text-main)] font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b backdrop-blur-md bg-[var(--bg-surface)]/85 border-[var(--border-subtle)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-[var(--border-subtle)] shadow-md overflow-hidden bg-[var(--bg-canvas)]">
              <img src="/logo.png" alt="Baglib Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-pale-sky-700 via-pale-sky-600 to-evergreen-500 dark:from-pale-sky-400 dark:to-evergreen-500">
                نظام تصميم مكتبة بغداد (`baglib`)
              </h1>
              <p className="text-xs text-[var(--text-muted)] font-sans">
                Design System Playground & Component Showcase
              </p>
            </div>
          </div>

          {/* Controls: Navigation & Theme Toggle */}
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1 bg-[var(--bg-canvas)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'overview'
                    ? 'bg-pale-sky-600 text-white dark:bg-pale-sky-500 shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                نظرة عامة
              </button>
              <button
                onClick={() => setActiveTab('colors')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'colors'
                    ? 'bg-pale-sky-600 text-white dark:bg-pale-sky-500 shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                الألوان (Palette)
              </button>
              <button
                onClick={() => setActiveTab('typography')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'typography'
                    ? 'bg-pale-sky-600 text-white dark:bg-pale-sky-500 shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                الخطوط (Typography)
              </button>
              <button
                onClick={() => setActiveTab('components')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'components'
                    ? 'bg-pale-sky-600 text-white dark:bg-pale-sky-500 shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                المكونات (Components)
              </button>
              <button
                onClick={() => setActiveTab('sandbox')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'sandbox'
                    ? 'bg-amber-500 text-white shadow-sm font-bold'
                    : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900'
                }`}
              >
                مختبر القراءة (Sandbox)
              </button>
            </nav>

            {/* Dark Mode Switcher */}
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-pale-sky-500 text-xs font-medium transition-all shadow-sm"
              title="تبديل المظهر"
            >
              {theme === 'light' ? (
                <>
                  <span className="text-amber-500">🌙</span>
                  <span>الوضع الداكن</span>
                </>
              ) : (
                <>
                  <span className="text-amber-400">☀️</span>
                  <span>الوضع الفاتح</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-6 space-y-10">
        {copiedToken && (
          <div className="fixed bottom-6 left-6 z-50 bg-evergreen-700 text-white text-xs px-4 py-2 rounded-xl shadow-lg animate-bounce">
            تم نسخ الرمز: <code className="font-mono">{copiedToken}</code>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <section className="space-y-8">
            {/* Vision Hero Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-pale-sky-100 via-pale-sky-50 to-evergreen-100 dark:from-pale-sky-900 dark:via-pale-sky-950 dark:to-evergreen-900 border border-[var(--border-subtle)] p-8 shadow-sm">
              <div className="relative z-10 max-w-3xl space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                  <span>🏛️ بيت الحكمة الرقمي</span>
                  <span>•</span>
                  <span>Local-First Academic Workspace</span>
                </div>
                <h2 className="text-4xl font-bold font-display leading-tight text-pale-sky-950 dark:text-pale-sky-50">
                  رؤية التصميم: هدوء معرفي، رصانة أكاديمية، وتوازن بصري
                </h2>
                <p className="text-base text-[var(--text-muted)] font-sans leading-relaxed">
                  يجمع مشروع <strong className="text-pale-sky-600 dark:text-pale-sky-400">بغلب (baglib)</strong> بين التراث العلمي الإسلامي الأصيل وأحدث معايير التفاعلية في برمجيات البحث الشخصي (مثل Obsidian وZotero). تم تصميم نظام الألوان والخطوط والمكونات ليوفر تجربة قراءة ودراسة مريحة وممتازة للعين.
                </p>
                <div className="flex flex-wrap gap-4 pt-2">
                  <button
                    onClick={() => setActiveTab('components')}
                    className="px-5 py-2.5 rounded-xl bg-pale-sky-600 hover:bg-pale-sky-700 text-white font-medium text-sm transition-all shadow-md hover:shadow-lg"
                  >
                    استعراض المكونات التفاعلية
                  </button>
                  <button
                    onClick={() => setActiveTab('sandbox')}
                    className="px-5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-amber-500 text-amber-500 font-semibold text-sm transition-all shadow-sm"
                  >
                    تجربة مختبر النص القرآني والأكاديمي
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3 shadow-sm hover:border-pale-sky-500 transition-all">
                <div className="w-10 h-10 rounded-xl bg-pale-sky-100 dark:bg-pale-sky-800 text-pale-sky-600 dark:text-pale-sky-400 flex items-center justify-center font-bold text-xl">
                  🎨
                </div>
                <h3 className="font-bold text-lg font-display">Pale Sky (اللون الرئيسي)</h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  درجات الأزرق الهادئ التي ترمز للوضوح الفكري والهدوء الأكاديمي، وتُستخدم في عناصر الواجهة الرئيسية والأزرار والنوافذ.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3 shadow-sm hover:border-evergreen-500 transition-all">
                <div className="w-10 h-10 rounded-xl bg-evergreen-100 dark:bg-evergreen-900 text-evergreen-600 dark:text-evergreen-400 flex items-center justify-center font-bold text-xl">
                  🌿
                </div>
                <h3 className="font-bold text-lg font-display">Evergreen (اللون الثانوي)</h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  الأخضر المستوحى من التراث الإسلامي والطبيعة، مخصص لشارات الحفظ ومراجعة بطاقات التكرار المتباعد (SRS) ومزامنة Zotero.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3 shadow-sm hover:border-amber-500 transition-all">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900 text-amber-500 dark:text-amber-400 flex items-center justify-center font-bold text-xl">
                  📜
                </div>
                <h3 className="font-bold text-lg font-display">Baghdad Amber (اللون التمييزي)</h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  لون العمبر والمخطوطات الذهبية، مخصص للإشارات المرجعية (Bookmarks)، أرقام الآيات، نتائج البحث، والتظليلات الهامة.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* TAB 2: COLOR PALETTE */}
        {activeTab === 'colors' && (
          <section className="space-y-8">
            <div className="border-b border-[var(--border-subtle)] pb-4">
              <h2 className="text-2xl font-bold font-display">نظام الألوان والرموز (Color Tokens)</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                اضغط على أي مربع لون لنسخ رمز الـ Hex الخاص به مباشرة.
              </p>
            </div>

            {/* Parchment Beige */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold font-display text-lg text-parchment-700 dark:text-parchment-200">
                  1. Warm Parchment Palette (لون الورق والمخطوطات العتيقة)
                </h3>
                <span className="text-xs text-[var(--text-muted)]">Background & Surface Base</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
                {parchmentSwatches.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => copyToClipboard(s.hex)}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:scale-105 transition-all text-right group shadow-sm cursor-pointer"
                  >
                    <div
                      className="w-full h-12 rounded-lg mb-2 shadow-inner border border-black/10"
                      style={{ backgroundColor: s.hex }}
                    />
                    <div className="font-mono text-xs font-semibold">{s.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{s.hex}</div>
                    <div className="text-[10px] text-parchment-700 dark:text-parchment-200 font-medium truncate mt-1">
                      {s.role}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Pale Sky */}
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold font-display text-lg text-pale-sky-600 dark:text-pale-sky-400">
                  2. Pale Sky Palette (اللون الأكاديمي للواجهة والأزرار)
                </h3>
                <span className="text-xs text-[var(--text-muted)]">Primary UI & Accents</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {paleSkySwatches.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => copyToClipboard(s.hex)}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:scale-105 transition-all text-right group shadow-sm cursor-pointer"
                  >
                    <div
                      className="w-full h-12 rounded-lg mb-2 shadow-inner border border-black/5"
                      style={{ backgroundColor: s.hex }}
                    />
                    <div className="font-mono text-xs font-semibold">{s.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{s.hex}</div>
                    <div className="text-[10px] text-pale-sky-600 dark:text-pale-sky-400 font-medium truncate mt-1">
                      {s.role}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Evergreen */}
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold font-display text-lg text-evergreen-600 dark:text-evergreen-400">
                  3. Evergreen Palette (الشارات والتأكيد والـ SRS)
                </h3>
                <span className="text-xs text-[var(--text-muted)]">Secondary / Verification</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {evergreenSwatches.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => copyToClipboard(s.hex)}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:scale-105 transition-all text-right group shadow-sm cursor-pointer"
                  >
                    <div
                      className="w-full h-12 rounded-lg mb-2 shadow-inner border border-black/5"
                      style={{ backgroundColor: s.hex }}
                    />
                    <div className="font-mono text-xs font-semibold">{s.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{s.hex}</div>
                    <div className="text-[10px] text-evergreen-600 dark:text-evergreen-400 font-medium truncate mt-1">
                      {s.role}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Baghdad Amber */}
            <div className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold font-display text-lg text-amber-600 dark:text-amber-400">
                  4. Baghdad Amber Palette (العلامات والإشارات القرآانية)
                </h3>
                <span className="text-xs text-[var(--text-muted)]">Accent / Bookmarks / Verses</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {amberSwatches.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => copyToClipboard(s.hex)}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:scale-105 transition-all text-right group shadow-sm cursor-pointer"
                  >
                    <div
                      className="w-full h-12 rounded-lg mb-2 shadow-inner border border-black/5"
                      style={{ backgroundColor: s.hex }}
                    />
                    <div className="font-mono text-xs font-semibold">{s.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{s.hex}</div>
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate mt-1">
                      {s.role}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: TYPOGRAPHY */}
        {activeTab === 'typography' && (
          <section className="space-y-8">
            <div className="border-b border-[var(--border-subtle)] pb-4">
              <h2 className="text-2xl font-bold font-display">إستراتيجية الخطوط الثلاثية (Three-Tier Typography)</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                توزيع وظيفي محدد بين العناوين (`Reem Kufi`)، عناصر التحكم (`Tajawal`)، ونصوص القراءة والتراث (`Amiri`).
              </p>
            </div>

            <div className="space-y-6">
              {/* Tier 1: Reem Kufi */}
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-pale-sky-100 dark:bg-pale-sky-800 text-pale-sky-700 dark:text-pale-sky-400 font-bold">
                      1. Display Font
                    </span>
                    <h3 className="text-xl font-bold font-display mt-1">ريم كوفي (Reem Kufi)</h3>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">`font-display`</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  تُستخدم فقط للعناوين الرئيسية للملفات، أسماء الكتب، عناوين اللوحات المفتوحة، وعلامة المشروع.
                </p>
                <div className="p-4 rounded-xl bg-[var(--bg-canvas)] space-y-2">
                  <div className="font-display text-3xl font-bold text-pale-sky-600 dark:text-pale-sky-400">
                    مكتبة بغداد الرقمية - بيت الحكمة للبحث العلمي
                  </div>
                  <div className="font-display text-xl text-pale-sky-950 dark:text-pale-sky-50">
                    الفصل الأول: تاريخ التدوين والتصنيف في عصر المأمون
                  </div>
                </div>
              </div>

              {/* Tier 2: Tajawal */}
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-evergreen-100 dark:bg-evergreen-900 text-evergreen-600 dark:text-evergreen-400 font-bold">
                      2. UI & Controls Font
                    </span>
                    <h3 className="text-xl font-bold font-sans">تجول (Tajawal)</h3>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">`font-sans`</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  تُستخدم لجميع عناصر الواجهة الرسومية (الأزرار، القوائم الجانبية، حقول البحث، الوسوم، وأسماء المجلدات).
                </p>
                <div className="p-4 rounded-xl bg-[var(--bg-canvas)] space-y-3 font-sans">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold">القائمة الجانبية:</span>
                    <span className="px-2 py-1 rounded bg-pale-sky-600 text-white text-xs">المستندات الأخيرة</span>
                    <span className="px-2 py-1 rounded bg-[var(--bg-surface)] border text-xs">بطاقات SRS</span>
                    <span className="px-2 py-1 rounded bg-[var(--bg-surface)] border text-xs">إعدادات المزامنة</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    مثال على نموذج إدخال: "أدخل الكلمة المفتاحية للبحث في المخطوطات..."
                  </div>
                </div>
              </div>

              {/* Tier 3: Amiri */}
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                  <div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900 text-amber-600 dark:text-amber-400 font-bold">
                      3. Reading & Academic Body Font
                    </span>
                    <h3 className="text-xl font-bold font-serif">أميري (Amiri)</h3>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">`font-serif` / `font-reading`</span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  الخط الأساسي لقراءة النصوص الطويلة، الآيات القرآانية، متون الحديث، والشروح والتفاسير.
                </p>
                <div className="p-5 rounded-xl bg-[var(--bg-canvas)] space-y-3 font-serif text-lg leading-relaxed border-r-4 border-amber-500">
                  <p className="text-amber-600 dark:text-amber-300 font-bold">
                    ﴿إِنَّمَا يَخْشَى اللَّهَ مِنْ عِبَادِهِ الْعُلَمَاءُ﴾ <span className="text-xs font-sans text-[var(--text-muted)]">[فاطر: 28]</span>
                  </p>
                  <p className="text-pale-sky-950 dark:text-pale-sky-50 text-base">
                    قال الإمام ابن كثير في تفسيره: "أي إنما يخشاه حق خشيته العلماء العارفون به، لأنه كلما كانت المعرفة برب العالمين أتم والعلم به أكمل، كانت الخشية له أعظم وأكثر."
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: COMPONENTS */}
        {activeTab === 'components' && (
          <section className="space-y-8">
            <div className="border-b border-[var(--border-subtle)] pb-4">
              <h2 className="text-2xl font-bold font-display">معرض المكونات التفاعلية (UI Components)</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                عناصر مجهزة للاستخدام في تطبيق سطح المكتب بتنسيقات Pale Sky وEvergreen وBaghdad Amber.
              </p>
            </div>

            {/* Buttons Showcase */}
            <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-4">
              <h3 className="font-bold text-lg font-display text-pale-sky-600 dark:text-pale-sky-400">
                1. الأزرار وعناصر التفاعل (Buttons)
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <button className="px-4 py-2 rounded-xl bg-pale-sky-600 hover:bg-pale-sky-700 dark:bg-pale-sky-500 dark:hover:bg-pale-sky-600 text-white text-xs font-semibold transition-all shadow-sm">
                  زر رئيسي (Primary Pale Sky)
                </button>
                <button className="px-4 py-2 rounded-xl bg-evergreen-500 hover:bg-evergreen-600 text-white text-xs font-semibold transition-all shadow-sm">
                  زر ثانوي (Evergreen Sync)
                </button>
                <button className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-all shadow-sm">
                  زر تمييز (Baghdad Amber)
                </button>
                <button className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-pale-sky-600 text-xs font-semibold transition-all">
                  زر إطار (Outline)
                </button>
                <button className="px-4 py-2 rounded-xl bg-pale-sky-50 dark:bg-pale-sky-800 text-pale-sky-700 dark:text-pale-sky-400 text-xs font-semibold transition-all">
                  زر هادئ (Ghost)
                </button>
                <button disabled className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-400 text-xs font-semibold cursor-not-allowed">
                  معطل (Disabled)
                </button>
              </div>
            </div>

            {/* Knowledge & Verses Cards */}
            <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-4">
              <h3 className="font-bold text-lg font-display text-pale-sky-600 dark:text-pale-sky-400">
                2. بطاقات المعرفة والآيات والملاحظات (Knowledge Cards)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Quran Ayah Card */}
                <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-amber-500 transition-all space-y-3 relative group">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900 text-amber-600 dark:text-amber-400 border border-amber-300">
                      <span>آية قرآانية</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      <span>سورة البقرة: 255</span>
                    </span>
                    <button
                      onClick={() => setIsBookmarked(!isBookmarked)}
                      className={`text-lg transition-transform ${isBookmarked ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
                      title="إضافة إلى الإشارات المرجعية"
                    >
                      {isBookmarked ? '🔖' : '📑'}
                    </button>
                  </div>

                  <p className="font-serif text-xl leading-loose text-pale-sky-950 dark:text-pale-sky-50 border-r-4 border-amber-500 pr-3">
                    اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ﴿<span className="font-sans text-xs text-amber-500 font-bold">٢٥٥</span>﴾
                  </p>

                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)] font-sans">
                    <span>مصدر التفسير: ابن كثير</span>
                    <span className="text-evergreen-700 dark:text-evergreen-400 font-semibold">✓ تم التوثيق في Zotero</span>
                  </div>
                </div>

                {/* SRS Flashcard Mastery */}
                <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-evergreen-500 transition-all space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-evergreen-100 dark:bg-evergreen-900 text-evergreen-700 dark:text-evergreen-400 border border-evergreen-200">
                      <span>بطاقة تكرار متباعد (SRS)</span>
                    </span>
                    <span className="text-xs font-mono text-evergreen-500 font-bold">إتقان: 92%</span>
                  </div>

                  <div className="space-y-1 font-sans">
                    <h4 className="font-bold text-sm text-pale-sky-600 dark:text-pale-sky-400">
                      سؤال المراجعة: ما الفرق بين المحكم والمتشابه عند الأصوليين؟
                    </h4>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                      المحكم ما اتضح معناه ولم يحتمل إلا تأويلاً واحداً، والمتشابه ما استأثر الله بعلمه أو احتمل وجوهاً متعددة...
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                    <span className="text-[11px] text-[var(--text-muted)]">المراجعة القادمة: غداً 09:00 ص</span>
                    <div className="flex items-center gap-1">
                      <button className="px-2.5 py-1 rounded-lg bg-evergreen-500 text-white text-[10px] font-bold">سهل (+3 أيام)</button>
                      <button className="px-2.5 py-1 rounded-lg bg-pale-sky-600 text-white text-[10px] font-bold">جيد (+1 يوم)</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Badges and Search Bar Inputs */}
            <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-4">
              <h3 className="font-bold text-lg font-display text-pale-sky-600 dark:text-pale-sky-400">
                3. عناصر الإدخال والشارات (Form Inputs & Badges)
              </h3>

              <div className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ابحث في المتون، الآيات، وشروح المخطوطات..."
                    defaultValue="العلماء ورثة الأنبياء"
                    className="w-full px-4 py-3 pr-10 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] focus:border-pale-sky-500 focus:outline-none text-sm transition-all shadow-inner"
                  />
                  <span className="absolute left-3 top-3.5 text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-900 dark:text-amber-400 font-mono font-bold">
                    3 نتائج (Amber Highlight)
                  </span>
                </div>

                {/* Badges preview */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pale-sky-50 dark:bg-pale-sky-800 text-pale-sky-700 dark:text-pale-sky-400 border border-pale-sky-200 dark:border-pale-sky-800">
                    #علوم_القرآن
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-evergreen-100 dark:bg-evergreen-900 text-evergreen-700 dark:text-evergreen-400 border border-evergreen-200">
                    #مزامنة_Zotero
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-900 text-amber-600 dark:text-amber-400 border border-amber-300">
                    #إشارة_مرجعية
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB 5: INTERACTIVE SANDBOX */}
        {activeTab === 'sandbox' && (
          <section className="space-y-6">
            <div className="border-b border-[var(--border-subtle)] pb-4">
              <h2 className="text-2xl font-bold font-display">مختبر قراءة الملاحظات (Interactive Reading Sandbox)</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                جرب تغيير نوع الخط وحجمه والسمة لرؤية وتجربة النص الأكاديمي مباشرة.
              </p>
            </div>

            {/* Sandbox Controls Bar */}
            <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
              {/* Font Selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-[var(--text-muted)]">نوع الخط:</span>
                <button
                  onClick={() => setSelectedFont('amiri')}
                  className={`px-3 py-1.5 rounded-lg border ${
                    selectedFont === 'amiri'
                      ? 'bg-pale-sky-600 text-white border-pale-sky-600'
                      : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)]'
                  }`}
                >
                  أميري (Amiri - Serif)
                </button>
                <button
                  onClick={() => setSelectedFont('tajawal')}
                  className={`px-3 py-1.5 rounded-lg border ${
                    selectedFont === 'tajawal'
                      ? 'bg-pale-sky-600 text-white border-pale-sky-600'
                      : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)]'
                  }`}
                >
                  تجول (Tajawal - Sans)
                </button>
                <button
                  onClick={() => setSelectedFont('reem-kufi')}
                  className={`px-3 py-1.5 rounded-lg border ${
                    selectedFont === 'reem-kufi'
                      ? 'bg-pale-sky-600 text-white border-pale-sky-600'
                      : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)]'
                  }`}
                >
                  ريم كوفي (Reem Kufi - Display)
                </button>
              </div>

              {/* Font Size Slider */}
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-[var(--text-muted)]">حجم الخط: ({readerFontSize}px)</span>
                <input
                  type="range"
                  min={14}
                  max={32}
                  value={readerFontSize}
                  onChange={(e) => setReaderFontSize(Number(e.target.value))}
                  className="w-32 accent-pale-sky-600"
                />
              </div>
            </div>

            {/* Sandbox Canvas */}
            <div className="p-8 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
                <div>
                  <span className="text-xs text-evergreen-500 font-bold font-sans">مخطوطة رقم: #4092 • مكتبة بغداد</span>
                  <h3 className="text-2xl font-bold font-display text-pale-sky-600 dark:text-pale-sky-400 mt-1">
                    دراسة في مناهج المحدثين والأصوليين في قبول الأخبار
                  </h3>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900 dark:text-amber-400 text-xs font-bold border border-amber-300">
                  محفوظ في المفضلة
                </span>
              </div>

              {/* Text Container with Dynamic Styling */}
              <div
                className={`leading-relaxed space-y-4 transition-all ${
                  selectedFont === 'amiri'
                    ? 'font-serif'
                    : selectedFont === 'tajawal'
                    ? 'font-sans'
                    : 'font-display'
                }`}
                style={{ fontSize: `${readerFontSize}px` }}
              >
                <p>
                  اعلم وفقك الله لمرضاته أن المعرفة العلمية في التراث الإسلامي لم تكن مجرد تجميع للمعلومات، بل كانت منظومة متكاملة من التثبت والتمحيص، حيث وضع العلماء قواعد إسنادية صارمة تُعد مفخرة من مفاخر العقل البشري.
                </p>

                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/50 border-r-4 border-amber-500 text-amber-900 dark:text-amber-100 my-4">
                  <p className="font-bold text-sm mb-1 font-sans text-amber-600 dark:text-amber-400">
                    💡 فائدة منهجية (تظليل العمبر):
                  </p>
                  <p>
                    «الإسناد من الدين، ولولا الإسناد لقال من شاء ما شاء» — الإمام عبدالله بن المبارك رحمه الله.
                  </p>
                </div>

                <p>
                  وقد تجسد هذا المنهج في مؤلفات حافلة مثل كتاب التمهيد لابن عبد البر، والمبتدأ والخبر لابن خلدون، حيث تم ربط النصوص التاريخية بالتحليل النقدي المتزن.
                </p>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)] font-sans">
                <span>تاريخ التعديل: اليوم 14:30</span>
                <span>الحالة: متزامن محلياً (Local-First Sync Clean)</span>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
