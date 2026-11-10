'use client';

import React, { useState } from 'react';
import {
  WorkspaceProvider,
  useWorkspace,
} from '../../components/context/WorkspaceContext';
import {
  Button,
  IconButton,
  Chip,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Modal,
  Sheet,
  Menu,
  Tabs,
  TabPanel,
  ToastProvider,
  useToast,
  EmptyState,
  Skeleton,
  Tooltip,
} from '../../components/ui';
import {
  Bookmark,
  Check,
  ChevronDown,
  Copy,
  Download,
  FolderOpen,
  Globe,
  Info,
  Layers,
  Moon,
  Plus,
  Search,
  Settings,
  Share2,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';

function PlaygroundContent() {
  const { dir, theme, lang, toggleTheme, toggleLanguage, t } = useWorkspace();
  const { showToast } = useToast();

  const [activePlaygroundTab, setActivePlaygroundTab] = useState<string>('primitives');
  const [selectedFont, setSelectedFont] = useState<'amiri' | 'tajawal' | 'reem-kufi'>('amiri');
  const [readerFontSize, setReaderFontSize] = useState<number>(20);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Primitive states
  const [chipSelected, setChipSelected] = useState<Record<string, boolean>>({
    fiqh: true,
    history: false,
    philosophy: false,
    language: true,
  });
  const [removableChips, setRemovableChips] = useState<string[]>([
    'تفسير',
    'حديث',
    'لغة',
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [demoTabsActive, setDemoTabsActive] = useState('tab-one');

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const semanticTokens = [
    { name: 'canvas', cssVar: '--color-canvas-val', lightHex: '#efece4', darkHex: '#0e161b', role: 'Canvas Base (Warm Beige / Scholar Night)' },
    { name: 'surface', cssVar: '--color-surface-val', lightHex: '#f8f6f0', darkHex: '#141f26', role: 'Surface Card (Cream Paper / Dark Card)' },
    { name: 'surface-raised', cssVar: '--color-surface-raised-val', lightHex: '#ffffff', darkHex: '#1c2a33', role: 'Surface Raised (Elevated Card)' },
    { name: 'border', cssVar: '--color-border-val', lightHex: '#dcd4c3', darkHex: '#223440', role: 'Antique Parchment / Slate Border' },
    { name: 'text', cssVar: '--color-text-val', lightHex: '#2c221a', darkHex: '#efece4', role: 'Main Text Ink' },
    { name: 'text-muted', cssVar: '--color-text-muted-val', lightHex: '#6e5e4f', darkHex: '#95a8b5', role: 'Muted Ink' },
    { name: 'primary', cssVar: '--color-primary-val', lightHex: '#1e3e2b', darkHex: '#2d5a3f', role: 'Dark Evergreen Primary Action (D1)' },
    { name: 'primary-text', cssVar: '--color-primary-text-val', lightHex: '#1e3e2b', darkHex: '#8fd0a8', role: 'Text-Safe Primary (Light Evergreen in Dark Mode)' },
    { name: 'primary-contrast', cssVar: '--color-primary-contrast-val', lightHex: '#ffffff', darkHex: '#ffffff', role: 'Primary Contrast Text' },
    { name: 'accent', cssVar: '--color-accent-val', lightHex: '#b45309', darkHex: '#fbbf24', role: 'Baghdad Amber Accent' },
    { name: 'success', cssVar: '--color-success-val', lightHex: '#166534', darkHex: '#4ade80', role: 'Evergreen Success' },
    { name: 'warning', cssVar: '--color-warning-val', lightHex: '#92400e', darkHex: '#fbbf24', role: 'Warning Amber' },
    { name: 'danger', cssVar: '--color-danger-val', lightHex: '#991b1b', darkHex: '#f87171', role: 'Danger Red' },
    { name: 'focus', cssVar: '--color-focus-val', lightHex: '#2a576f', darkHex: '#6ba7c7', role: 'Pale Sky Focus & Links' },
  ];

  return (
    <div className="min-h-screen transition-colors duration-200 bg-canvas text-text font-sans" dir={dir}>
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b backdrop-blur-md bg-surface/90 border-border px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl border border-primary-text/30 shadow-xs overflow-hidden bg-primary/10 flex items-center justify-center text-primary-text font-bold">
              <Layers className="size-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold font-display text-text leading-snug">
                {lang === 'ar' ? 'معرض نظام التصميم والمكونات المشتركة' : 'Design System & Primitives Showcase'}
              </h1>
              <p className="text-[11px] text-text-muted font-sans">
                KEY-296 UI/UX U2 • Semantic Tokens & Shared Primitives (D1 Dark Evergreen)
              </p>
            </div>
          </div>

          {/* Controls: Navigation, Direction & Theme Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Tabs
              tabs={[
                { id: 'primitives', label: lang === 'ar' ? 'المكونات المشتركة' : 'Shared Primitives' },
                { id: 'tokens', label: lang === 'ar' ? 'رموز الألوان (Tokens)' : 'Tokens' },
                { id: 'typography', label: lang === 'ar' ? 'الخطوط' : 'Typography' },
                { id: 'sandbox', label: lang === 'ar' ? 'مختبر القراءة' : 'Reading Sandbox' },
              ]}
              activeTab={activePlaygroundTab}
              onChange={setActivePlaygroundTab}
            />

            {/* Language / Direction Toggle */}
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleLanguage}
              icon={<Globe className="size-3.5" />}
              title="Toggle Direction (RTL / LTR)"
            >
              {lang === 'ar' ? 'English (LTR)' : 'العربية (RTL)'}
            </Button>

            {/* Dark / Light Theme Toggle */}
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleTheme}
              icon={theme === 'dark' ? <Sun className="size-3.5 text-accent" /> : <Moon className="size-3.5 text-focus" />}
              title="Toggle Theme (Parchment / Scholar Night)"
            >
              {theme === 'dark' ? (lang === 'ar' ? 'الورق العتيق' : 'Parchment') : (lang === 'ar' ? 'ليلي أكاديمي' : 'Scholar Night')}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* TAB 1: SHARED PRIMITIVES */}
        {activePlaygroundTab === 'primitives' && (
          <section className="space-y-8">
            <div className="border-b border-border/80 pb-4">
              <h2 className="text-xl sm:text-2xl font-bold font-display text-text">
                {lang === 'ar' ? 'المكونات الأساسية المشتركة (UI Primitives)' : 'Shared UI Primitives'}
              </h2>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                {lang === 'ar'
                  ? 'مكونات موحدة تدعم الاتجاهين (RTL/LTR) مع إمكانية الوصول الكاملة ومحاذاة الرؤية التصميمية (D1).'
                  : 'Unified accessible primitives supporting RTL/LTR with keyboard reach and D1 dark evergreen action styling.'}
              </p>
            </div>

            {/* 1. BUTTONS & ICON BUTTONS */}
            <Card variant="raised">
              <CardHeader>
                <CardTitle>1. {lang === 'ar' ? 'الأزرار وأزرار الأيقونات (Buttons & IconButtons)' : 'Buttons & IconButtons'}</CardTitle>
                <CardDescription>
                  Variants: Primary (Dark Evergreen), Secondary, Ghost, Danger. Sizes: sm, md. States: normal, loading, disabled.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" icon={<Plus className="size-4" />}>
                    {lang === 'ar' ? 'كائن جديد +' : 'New Object +'}
                  </Button>
                  <Button variant="secondary" icon={<Bookmark className="size-4" />}>
                    {lang === 'ar' ? 'حفظ الملاحظة' : 'Save Note'}
                  </Button>
                  <Button variant="ghost" icon={<Share2 className="size-4" />}>
                    {lang === 'ar' ? 'مشاركة' : 'Share'}
                  </Button>
                  <Button variant="danger" icon={<Trash2 className="size-4" />}>
                    {lang === 'ar' ? 'حذف' : 'Delete'}
                  </Button>
                  <Button
                    variant="primary"
                    loading={buttonLoading}
                    onClick={() => {
                      setButtonLoading(true);
                      setTimeout(() => setButtonLoading(false), 2000);
                    }}
                  >
                    {buttonLoading ? (lang === 'ar' ? 'جاري التحميل...' : 'Loading...') : (lang === 'ar' ? 'اضغط للتحميل' : 'Click to Load')}
                  </Button>
                  <Button variant="secondary" disabled>
                    {lang === 'ar' ? 'معطل (Disabled)' : 'Disabled'}
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="border-t border-border/60">
                <span className="text-xs font-semibold text-text-muted">{lang === 'ar' ? 'أزرار الأيقونات:' : 'IconButtons:'}</span>
                <div className="flex items-center gap-2">
                  <IconButton label={lang === 'ar' ? 'بحث' : 'Search'} variant="primary" size="sm">
                    <Search className="size-3.5" />
                  </IconButton>
                  <IconButton label={lang === 'ar' ? 'تنزيل' : 'Download'} variant="secondary" size="sm">
                    <Download className="size-3.5" />
                  </IconButton>
                  <IconButton label={lang === 'ar' ? 'معلومات' : 'Information'} variant="ghost" size="sm">
                    <Info className="size-3.5" />
                  </IconButton>
                  <IconButton label={lang === 'ar' ? 'حذف العنصر' : 'Delete Item'} variant="danger" size="sm">
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </CardFooter>
            </Card>

            {/* 2. CHIPS & BADGES */}
            <Card variant="raised">
              <CardHeader>
                <CardTitle>2. {lang === 'ar' ? 'الرقائق والشارات (Chips & Badges)' : 'Chips & Badges'}</CardTitle>
                <CardDescription>
                  Chips with selectable (D1 evergreen selection) and removable capabilities. Badges in semantic status colors.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">{lang === 'ar' ? 'رقائق قابلة للاختيار:' : 'Selectable Topic Chips:'}</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { id: 'fiqh', label: lang === 'ar' ? 'الفقه الإسلامي' : 'Islamic Jurisprudence' },
                      { id: 'history', label: lang === 'ar' ? 'التاريخ والتراجم' : 'History' },
                      { id: 'philosophy', label: lang === 'ar' ? 'الفلسفة وعلم الكلام' : 'Philosophy' },
                      { id: 'language', label: lang === 'ar' ? 'اللغة العربية والمعاجم' : 'Arabic Lexicons' },
                    ].map((chip) => (
                      <Chip
                        key={chip.id}
                        label={chip.label}
                        selected={chipSelected[chip.id]}
                        onSelect={() =>
                          setChipSelected((prev) => ({ ...prev, [chip.id]: !prev[chip.id] }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">{lang === 'ar' ? 'رقائق قابلة للحذف:' : 'Removable Filter Chips:'}</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {removableChips.map((chip) => (
                      <Chip
                        key={chip}
                        label={chip}
                        removable
                        onRemove={() =>
                          setRemovableChips((prev) => prev.filter((c) => c !== chip))
                        }
                      />
                    ))}
                    {removableChips.length === 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemovableChips(['تفسير', 'حديث', 'لغة'])}
                      >
                        {lang === 'ar' ? 'استعادة الرقائق' : 'Reset Chips'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/60">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">{lang === 'ar' ? 'شارات الحالة (Badges):' : 'Status Badges:'}</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">{lang === 'ar' ? 'نسخة رقمية' : 'Digital'}</Badge>
                    <Badge variant="primary">{lang === 'ar' ? 'جديد (D1 Evergreen)' : 'New'}</Badge>
                    <Badge variant="accent">{lang === 'ar' ? 'نسخة ورقية' : 'Physical'}</Badge>
                    <Badge variant="success">{lang === 'ar' ? 'مكتمل 100%' : 'Completed'}</Badge>
                    <Badge variant="warning">{lang === 'ar' ? 'قيد المراجعة' : 'In Review'}</Badge>
                    <Badge variant="danger">{lang === 'ar' ? 'متأخر' : 'Overdue'}</Badge>
                    <Badge variant="outline">{lang === 'ar' ? 'إطار مجرد' : 'Outline'}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 3. MODAL & SHEET */}
            <Card variant="raised">
              <CardHeader>
                <CardTitle>3. {lang === 'ar' ? 'النوافذ المنبثقة والألواح الجانبية (Modal & Sheet)' : 'Modal & Sheet'}</CardTitle>
                <CardDescription>
                  Full focus trap, Escape key to close, return focus to opener, aria-modal, accessible titles.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                  {lang === 'ar' ? 'فتح نافذة مشروطة (Modal)' : 'Open Modal'}
                </Button>
                <Button variant="secondary" onClick={() => setIsSheetOpen(true)}>
                  {lang === 'ar' ? 'فتح لوح جانبي (Sheet)' : 'Open Sheet'}
                </Button>

                {/* The Modal */}
                <Modal
                  open={isModalOpen}
                  onClose={() => setIsModalOpen(false)}
                  title={lang === 'ar' ? 'إضافة بطاقة معرفية جديدة' : 'Create Knowledge Card'}
                  description={lang === 'ar' ? 'أدخل تفاصيل البطاقة وسؤال المراجعة بالتكرار المتباعد.' : 'Enter question details for spaced repetition review.'}
                >
                  <div className="space-y-3 font-sans text-xs">
                    <div>
                      <label className="block font-bold text-text mb-1">
                        {lang === 'ar' ? 'عنوان السؤال' : 'Card Title'}
                      </label>
                      <input
                        type="text"
                        defaultValue={lang === 'ar' ? 'تعريف القياس عند الأصوليين' : 'Definition of Qiyas in Usul'}
                        className="w-full p-2 bg-canvas border border-border rounded-lg text-text focus:outline-2 focus:outline-focus text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-text mb-1">
                        {lang === 'ar' ? 'نص الإجابة والاستدلال' : 'Card Answer'}
                      </label>
                      <textarea
                        rows={3}
                        defaultValue={lang === 'ar' ? 'إلحاق فرع بأصل في حكم لعلة جامعة بينهما...' : 'Analogy applied to derived rulings based on shared ratio legis...'}
                        className="w-full p-2 bg-canvas border border-border rounded-lg text-text focus:outline-2 focus:outline-focus text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                        {t('cancel')}
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => {
                        setIsModalOpen(false);
                        showToast({ message: lang === 'ar' ? 'تم حفظ البطاقة بنجاح' : 'Card saved successfully', type: 'success' });
                      }}>
                        {t('save')}
                      </Button>
                    </div>
                  </div>
                </Modal>

                {/* The Sheet */}
                <Sheet
                  open={isSheetOpen}
                  onClose={() => setIsSheetOpen(false)}
                  side="end"
                  title={lang === 'ar' ? 'تفاصيل الكتاب والمخطوطة' : 'Book Details Sheet'}
                  description={lang === 'ar' ? 'المعلومات الببليوغرافية وحالة الحفظ' : 'Bibliographic metadata and preservation status.'}
                >
                  <div className="space-y-4 font-sans text-xs">
                    <div className="p-3 bg-canvas rounded-xl border border-border">
                      <span className="text-[10px] text-text-muted block">{lang === 'ar' ? 'العنوان الأصلي' : 'Canonical Title'}</span>
                      <span className="font-bold text-sm text-text block mt-0.5">مقدمة ابن خلدون</span>
                      <span className="text-text-muted block mt-0.5">عبد الرحمن بن محمد بن خلدون (ت 808 هـ)</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between py-1 border-b border-border/60">
                        <span className="text-text-muted">{lang === 'ar' ? 'التصنيف' : 'Category'}</span>
                        <span className="font-medium text-text">{lang === 'ar' ? 'التاريخ وعلم الاجتماع' : 'History'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/60">
                        <span className="text-text-muted">{lang === 'ar' ? 'نوع المصدر' : 'Source Type'}</span>
                        <Badge variant="accent">{lang === 'ar' ? 'نسخة ورقية (رف 3)' : 'Physical (Shelf 3)'}</Badge>
                      </div>
                    </div>
                    <div className="pt-4 flex justify-end">
                      <Button variant="primary" size="sm" onClick={() => setIsSheetOpen(false)}>
                        {t('close')}
                      </Button>
                    </div>
                  </div>
                </Sheet>
              </CardContent>
            </Card>

            {/* 4. MENU & TABS */}
            <Card variant="raised">
              <CardHeader>
                <CardTitle>4. {lang === 'ar' ? 'القوائم المنسدلة وعلامات التبويب (Menu & Tabs)' : 'Menu & Tabs'}</CardTitle>
                <CardDescription>
                  Keyboard navigation: Arrow keys navigate between menu items and tabs with roving tabindex and Home/End support.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">{lang === 'ar' ? 'قائمة إجراءات مع أسهم لوحة المفاتيح (Menu):' : 'Action Menu:'}</h4>
                  <Menu
                    trigger={({ onClick, ref, 'aria-expanded': expanded }) => (
                      <Button
                        ref={ref}
                        variant="secondary"
                        size="sm"
                        onClick={onClick}
                        icon={<ChevronDown className="size-3.5" />}
                      >
                        {lang === 'ar' ? 'خيارات المستند' : 'Document Options'} ({expanded ? 'مفتوحة' : 'مغلقة'})
                      </Button>
                    )}
                    items={[
                      {
                        label: lang === 'ar' ? 'فتح في نافذة مستقلة' : 'Open in New Window',
                        icon: <FolderOpen className="size-4" />,
                        onClick: () => showToast({ message: 'Open triggered' }),
                      },
                      {
                        label: lang === 'ar' ? 'استخراج النص والتحليل' : 'Extract Text & AI Analysis',
                        icon: <Sparkles className="size-4" />,
                        onClick: () => showToast({ message: 'Analysis queued' }),
                      },
                      {
                        label: lang === 'ar' ? 'إعدادات متقدمة' : 'Advanced Settings',
                        icon: <Settings className="size-4" />,
                        onClick: () => showToast({ message: 'Settings clicked' }),
                      },
                      {
                        label: lang === 'ar' ? 'حذف من المكتبة' : 'Remove from Library',
                        icon: <Trash2 className="size-4" />,
                        danger: true,
                        onClick: () =>
                          showToast({
                            message: lang === 'ar' ? 'تم حذف السجل' : 'Record removed',
                            type: 'danger',
                            action: {
                              label: t('undo'),
                              onClick: () => showToast({ message: 'Undone', type: 'success' }),
                            },
                          }),
                      },
                    ]}
                  />
                </div>

                <div className="space-y-3 pt-3 border-t border-border/60">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">{lang === 'ar' ? 'تبويبات مع فهرس roving tabindex (Tabs):' : 'Roving Tabindex Tabs:'}</h4>
                  <Tabs
                    tabs={[
                      { id: 'tab-one', label: lang === 'ar' ? 'الفهرس والمحتويات' : 'Contents' },
                      { id: 'tab-two', label: lang === 'ar' ? 'الإشارات والملاحظات' : 'Bookmarks' },
                      { id: 'tab-three', label: lang === 'ar' ? 'البحث في النص' : 'Search' },
                    ]}
                    activeTab={demoTabsActive}
                    onChange={setDemoTabsActive}
                  />
                  <div className="p-4 bg-canvas rounded-xl border border-border text-xs text-text min-h-20 flex items-center justify-center">
                    <TabPanel tabId="tab-one" activeTab={demoTabsActive}>
                      {lang === 'ar' ? 'محتوى التبويب الأول: استعراض شجرة الأبواب والفصول.' : 'Contents tree panel.'}
                    </TabPanel>
                    <TabPanel tabId="tab-two" activeTab={demoTabsActive}>
                      {lang === 'ar' ? 'محتوى التبويب الثاني: قائمة العلامات المرجعية والملحوظات المسجلة.' : 'Bookmarks and reader marks panel.'}
                    </TabPanel>
                    <TabPanel tabId="tab-three" activeTab={demoTabsActive}>
                      {lang === 'ar' ? 'محتوى التبويب الثالث: البحث الدقيق في المتن الكامل.' : 'Full-text search panel.'}
                    </TabPanel>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 5. TOAST WITH UNDO ACTION & LIVE REGION */}
            <Card variant="raised">
              <CardHeader>
                <CardTitle>5. {lang === 'ar' ? 'إشعارات التنبيه والتراجع (Toast with Undo & Live Region)' : 'Toasts with Undo & Live Region'}</CardTitle>
                <CardDescription>
                  Toast notifications with accessible live regions, auto-dismiss timers paused on hover, and 1-click Undo actions.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    showToast({
                      message: lang === 'ar' ? 'تم نسخ المقتبس إلى الحافظة' : 'Quote copied to clipboard',
                      type: 'default',
                    })
                  }
                >
                  {lang === 'ar' ? 'إشعار عادي' : 'Default Toast'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    showToast({
                      message: lang === 'ar' ? 'تم مزامنة 14 كتاباً بنجاح' : '14 books synced successfully',
                      type: 'success',
                    })
                  }
                >
                  {lang === 'ar' ? 'إشعار نجاح' : 'Success Toast'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    showToast({
                      message: lang === 'ar' ? 'قاربت سعة التخزين على النفاد' : 'Storage quota nearly full',
                      type: 'warning',
                    })
                  }
                >
                  {lang === 'ar' ? 'إشعار تحذير' : 'Warning Toast'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    showToast({
                      message: lang === 'ar' ? 'تم حذف الملاحظة الدراسية' : 'Study note deleted',
                      type: 'danger',
                      action: {
                        label: t('undo'),
                        onClick: () =>
                          showToast({
                            message: lang === 'ar' ? 'تم استرجاع الملاحظة بنجاح' : 'Note restored',
                            type: 'success',
                          }),
                      },
                    })
                  }
                >
                  {lang === 'ar' ? 'حذف مع زر تراجع (Undo)' : 'Delete with Undo'}
                </Button>
              </CardContent>
            </Card>

            {/* 6. EMPTY STATE, SKELETON & TOOLTIP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Empty State */}
              <Card variant="raised">
                <CardHeader>
                  <CardTitle>6. {lang === 'ar' ? 'الحالة الفارغة (EmptyState)' : 'EmptyState'}</CardTitle>
                  <CardDescription>Calm, scholarly placeholder with guidance and actionable next step.</CardDescription>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    icon={<Search className="size-6 text-text-muted" />}
                    title={lang === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching books found'}
                    description={lang === 'ar' ? 'جرّب تعديل معايير التصفية أو البحث عن موضوع أو مؤلف آخر.' : 'Try adjusting your filters or search keywords.'}
                    action={
                      <Button variant="secondary" size="sm">
                        {lang === 'ar' ? 'مسح عوامل التصفية' : 'Clear Filters'}
                      </Button>
                    }
                  />
                </CardContent>
              </Card>

              {/* Skeleton & Tooltip */}
              <Card variant="raised">
                <CardHeader>
                  <CardTitle>7. {lang === 'ar' ? 'الهياكل العظمية والتلميحات (Skeleton & Tooltip)' : 'Skeleton & Tooltip'}</CardTitle>
                  <CardDescription>Fast-feeling placeholders and keyboard-accessible tooltips.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Skeletons */}
                  <div className="space-y-3 p-4 bg-canvas rounded-xl border border-border/70">
                    <div className="flex items-center gap-3">
                      <Skeleton rounded="full" className="size-10" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton rounded="md" className="h-4 w-3/4" />
                        <Skeleton rounded="sm" className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton rounded="lg" className="h-16 w-full" />
                  </div>

                  {/* Tooltips */}
                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <Tooltip content={lang === 'ar' ? 'إضافة إلى المفضلة' : 'Add to Bookmarks'} side="top">
                      <Button variant="secondary" size="sm" icon={<Bookmark className="size-3.5" />}>
                        {lang === 'ar' ? 'تلميح علوي' : 'Top Tooltip'}
                      </Button>
                    </Tooltip>

                    <Tooltip content={lang === 'ar' ? 'تنزيل نسخة PDF محلية' : 'Download Local PDF'} side="bottom">
                      <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />}>
                        {lang === 'ar' ? 'تلميح سفلي' : 'Bottom Tooltip'}
                      </Button>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* TAB 2: TOKENS & PALETTE */}
        {activePlaygroundTab === 'tokens' && (
          <section className="space-y-6">
            <div className="border-b border-border/80 pb-4">
              <h2 className="text-xl sm:text-2xl font-bold font-display text-text">
                {lang === 'ar' ? 'رموز الألوان الدلالية (Semantic Tokens)' : 'Semantic Color Tokens'}
              </h2>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                {lang === 'ar'
                  ? 'تم تحديث الرموز وفقاً لقرار D1 (Dark Evergreen للعمليات الرئيسية، Pale Sky للروابط والتركيز، وBaghdad Amber للتمييز).'
                  : 'Design Tokens updated per D1: Dark Evergreen for primary actions, Pale Sky for focus/links, and Baghdad Amber accent.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {semanticTokens.map((token) => (
                <div
                  key={token.name}
                  className="p-4 rounded-xl border border-border bg-surface shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-text">{token.name}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`var(${token.cssVar})`)}
                      title="Copy CSS var"
                      className="p-1 rounded text-text-muted hover:text-text hover:bg-canvas transition-colors"
                    >
                      {copiedToken === `var(${token.cssVar})` ? (
                        <Check className="size-3.5 text-success" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="flex gap-2 h-12 rounded-lg overflow-hidden border border-border/60">
                    <div
                      className="flex-1 flex items-center justify-center text-[10px] font-mono text-white/90 shadow-inner"
                      style={{ backgroundColor: token.lightHex }}
                    >
                      <span className="px-1 py-0.5 rounded bg-black/40">Light</span>
                    </div>
                    <div
                      className="flex-1 flex items-center justify-center text-[10px] font-mono text-white/90 shadow-inner"
                      style={{ backgroundColor: token.darkHex }}
                    >
                      <span className="px-1 py-0.5 rounded bg-black/40">Dark</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-text-muted leading-tight font-sans">
                    {token.role}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 3: TYPOGRAPHY */}
        {activePlaygroundTab === 'typography' && (
          <section className="space-y-6">
            <div className="border-b border-border/80 pb-4">
              <h2 className="text-xl sm:text-2xl font-bold font-display text-text">
                {lang === 'ar' ? 'هرمية الخطوط الثلاثية (Three-Tier Typography)' : 'Three-Tier Typography'}
              </h2>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Reem Kufi for display headers, Tajawal for UI controls, and Amiri for classical reading texts.
              </p>
            </div>

            <div className="space-y-4">
              <Card variant="raised">
                <CardHeader>
                  <CardTitle className="font-display text-2xl">
                    1. Reem Kufi — العناوين الكوفية الحديثة
                  </CardTitle>
                  <CardDescription className="font-mono">`font-display` / var(--font-reem-kufi)</CardDescription>
                </CardHeader>
                <CardContent className="font-display text-xl text-text leading-relaxed">
                  مكتبة بغداد الرقمية • بيت الحكمة للبحث والتصنيف الأكاديمي
                </CardContent>
              </Card>

              <Card variant="raised">
                <CardHeader>
                  <CardTitle className="font-sans text-xl">
                    2. Tajawal — واجهة المستخدم والأزرار واللوحات
                  </CardTitle>
                  <CardDescription className="font-mono">`font-sans` / var(--font-tajawal)</CardDescription>
                </CardHeader>
                <CardContent className="font-sans text-sm text-text leading-relaxed">
                  عناصر التحكم، القوائم الجانبية، أزرار التنقل، حقول البحث، وبطاقات التكرار المتباعد.
                </CardContent>
              </Card>

              <Card variant="raised">
                <CardHeader>
                  <CardTitle className="font-serif text-2xl">
                    3. Amiri — متون القراءة والتراث والتفاسير
                  </CardTitle>
                  <CardDescription className="font-mono">`font-serif` / `font-reading` / var(--font-amiri)</CardDescription>
                </CardHeader>
                <CardContent className="font-serif text-lg text-text leading-loose">
                  ﴿يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ﴾ [المجادلة: 11]
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* TAB 4: READING SANDBOX */}
        {activePlaygroundTab === 'sandbox' && (
          <section className="space-y-6">
            <div className="border-b border-border/80 pb-4">
              <h2 className="text-xl sm:text-2xl font-bold font-display text-text">
                {lang === 'ar' ? 'مختبر القراءة التفاعلي' : 'Reading Sandbox'}
              </h2>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Test font families, font sizes, and reader rendering on scholarly passages.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-border flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-text-muted">{lang === 'ar' ? 'نوع الخط:' : 'Font:'}</span>
                {(['amiri', 'tajawal', 'reem-kufi'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={selectedFont === f ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setSelectedFont(f)}
                  >
                    {f === 'amiri' ? 'أميري (Amiri)' : f === 'tajawal' ? 'تجول (Tajawal)' : 'ريم كوفي (Kufi)'}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-text-muted">{lang === 'ar' ? 'حجم الخط:' : 'Size:'} ({readerFontSize}px)</span>
                <input
                  type="range"
                  min={14}
                  max={32}
                  value={readerFontSize}
                  onChange={(e) => setReaderFontSize(Number(e.target.value))}
                  className="w-32 accent-primary cursor-pointer"
                />
              </div>
            </div>

            <Card variant="raised" className="p-6 sm:p-8 space-y-4">
              <div
                className={`leading-relaxed space-y-4 text-text ${
                  selectedFont === 'amiri'
                    ? 'font-serif'
                    : selectedFont === 'tajawal'
                    ? 'font-sans'
                    : 'font-display'
                }`}
                style={{ fontSize: `${readerFontSize}px` }}
              >
                <p>
                  اعلم وفقك الله لمرضاته أن المعرفة العلمية في التراث الإسلامي لم تكن مجرد تجميع للمعلومات، بل كانت منظومة متكاملة من التثبت والتمحيص الإسنادي والدلالي.
                </p>
                <p className="text-text-muted text-sm border-s-4 border-primary ps-3 py-1">
                  «الإسناد من الدين، ولولا الإسناد لقال من شاء ما شاء» — الإمام عبدالله بن المبارك رحمه الله.
                </p>
              </div>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}

export default function DesignSystemPlayground() {
  return (
    <WorkspaceProvider>
      <ToastProvider>
        <PlaygroundContent />
      </ToastProvider>
    </WorkspaceProvider>
  );
}
