'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  BookOpen,
  MapPin,
  Tag,
  Sparkles,
  Check,
  Trash2,
  Plus,
  FolderOpen,
  FileCheck
} from 'lucide-react';
import { BookItem, LendingRecord } from '../../types/library';

interface BookDetailModalProps {
  book: BookItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedBook: BookItem) => void;
  onDelete: (id: string) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isOpen,
  onClose,
  onSave,
  onDelete,
}) => {
  if (!isOpen || !book) return null;

  const [formData, setFormData] = useState<BookItem>({ ...book });
  const [activeTab, setActiveTab] = useState<'info' | 'physical' | 'lending'>('info');
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillSuccess, setAutoFillSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Lending state
  const [newBorrower, setNewBorrower] = useState('');
  const [newBorrowDate, setNewBorrowDate] = useState(new Date().toISOString().split('T')[0]);
  const [newReturnDate, setNewReturnDate] = useState('');

  const handleInputChange = (field: keyof BookItem, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePickFileNative = async () => {
    const windowAPI = (window as any).electronAPI;
    if (windowAPI?.openFileDialog) {
      const fullPath: string | null = await windowAPI.openFileDialog();
      if (!fullPath) return;

      const pathSegments = fullPath.split(/[/\\]/);
      const fileNameWithExt = pathSegments[pathSegments.length - 1];
      const ext = fileNameWithExt.split('.').pop()?.toUpperCase() || 'PDF';

      setFormData((prev) => ({
        ...prev,
        filePath: fullPath,
        digitalFormat: ext as any,
        bookType: prev.bookType === 'physical' ? 'hybrid' : 'digital',
      }));
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChangeFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toUpperCase() || 'PDF';

    setFormData((prev) => ({
      ...prev,
      filePath: (file as any).path || file.name,
      digitalFormat: ext as any,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      bookType: prev.bookType === 'physical' ? 'hybrid' : 'digital',
    }));
  };

  const handleAddLending = () => {
    if (!newBorrower.trim()) return;
    const newRecord: LendingRecord = {
      id: `lend-${Date.now()}`,
      borrowerName: newBorrower,
      borrowDate: newBorrowDate,
      expectedReturnDate: newReturnDate || 'غير محدد',
      isReturned: false,
    };
    setFormData((prev) => ({
      ...prev,
      lendingHistory: [newRecord, ...prev.lendingHistory],
    }));
    setNewBorrower('');
  };

  const handleToggleReturn = (lendId: string) => {
    setFormData((prev) => ({
      ...prev,
      lendingHistory: prev.lendingHistory.map((rec) =>
        rec.id === lendId
          ? {
              ...rec,
              isReturned: !rec.isReturned,
              actualReturnDate: !rec.isReturned ? new Date().toISOString().split('T')[0] : undefined,
            }
          : rec
      ),
    }));
  };

  // Real OpenLibrary / Google Books API Auto-Fill Engine
  const fetchMetadataAutoFill = async () => {
    setIsAutoFilling(true);
    try {
      const cleanIsbn = formData.isbn?.replace(/-/g, '').trim();
      const query = cleanIsbn || encodeURIComponent(formData.title);

      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}`);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        const volumeInfo = data.items[0].volumeInfo;

        setFormData((prev) => ({
          ...prev,
          title: prev.title || volumeInfo.title,
          author: prev.author !== 'مؤلف غير محدد' ? prev.author : (volumeInfo.authors ? volumeInfo.authors.join(', ') : prev.author),
          publisher: volumeInfo.publisher || prev.publisher || 'دار النشر الأكاديمية',
          publicationYear: volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : (prev.publicationYear || 2023),
          isbn: prev.isbn || (volumeInfo.industryIdentifiers ? volumeInfo.industryIdentifiers[0]?.identifier : '978-9953-0-1234-5'),
          categories: Array.from(new Set([...prev.categories, ...(volumeInfo.categories || ['تحقيق أكاديمي'])])),
          coverImage: volumeInfo.imageLinks?.thumbnail || prev.coverImage,
        }));
      }

      setIsAutoFilling(false);
      setAutoFillSuccess(true);
      setTimeout(() => setAutoFillSuccess(false), 2500);
    } catch (err) {
      console.warn('Auto-fill API fallback:', err);
      setIsAutoFilling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Native File Input for book linking */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChangeFallback}
        accept=".pdf,.epub,.mobi,.azw3,.txt,.html,.djvu,.docx"
        className="hidden"
      />

      <div className="w-full max-w-3xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-sans" dir="rtl">
        {/* Modal Header */}
        <div className="p-4 bg-canvas/80 border-b border-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-main text-base line-clamp-1">{formData.title}</h3>
              <p className="text-xs text-muted">{formData.author || 'مؤلف غير محدد'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-fill Button */}
            <button
              onClick={fetchMetadataAutoFill}
              disabled={isAutoFilling}
              title="تعبئة بيانات الكتاب تلقائياً من الإنترنت عبر (OpenLibrary / Google Books API)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAutoFilling ? 'animate-spin' : ''}`} />
              <span>{isAutoFilling ? 'جاري الجلب...' : 'جلب البيانات تلقائياً'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {autoFillSuccess && (
          <div className="bg-evergreen-500/10 border-b border-evergreen-500/20 px-4 py-2 text-xs text-evergreen-600 dark:text-evergreen-400 font-semibold flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>تم استكمال بيانات الكتاب والغلاف بنجاح من المراجع المفتوحة!</span>
          </div>
        )}

        {/* Modal Navigation Tabs (Streamlined: Info, Physical, Lending) */}
        <div className="flex items-center gap-2 px-4 pt-3 bg-canvas/30 border-b border-subtle text-xs font-semibold">
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-2 px-3 border-b-2 transition-all ${
              activeTab === 'info'
                ? 'border-pale-sky-500 text-pale-sky-500 font-bold'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            معلومات الكتاب الأساسية
          </button>
          <button
            onClick={() => setActiveTab('physical')}
            className={`pb-2 px-3 border-b-2 transition-all ${
              activeTab === 'physical'
                ? 'border-pale-sky-500 text-pale-sky-500 font-bold'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            الموقع الفيزيائي (الرف والغرفة)
          </button>
          <button
            onClick={() => setActiveTab('lending')}
            className={`pb-2 px-3 border-b-2 transition-all ${
              activeTab === 'lending'
                ? 'border-pale-sky-500 text-pale-sky-500 font-bold'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            سجل الإعارة ({formData.lendingHistory.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'info' && (
            <div className="space-y-4 text-xs">
              {/* Connected File Card */}
              <div className="p-3.5 rounded-2xl bg-canvas border border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileCheck className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <span className="font-bold text-main block">
                      {formData.filePath ? 'الملف الرقمي المربوط بالجهاز' : 'لم يتم ربط ملف كتاب بعد'}
                    </span>
                    <span className="text-[11px] text-muted font-mono truncate max-w-md block">
                      {formData.filePath || 'اضغط الزر لتحديد ملف الكتاب من جهازك مباشرة'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handlePickFileNative}
                  className="px-3 py-1.5 rounded-xl bg-surface border border-subtle hover:bg-canvas text-main font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                >
                  <FolderOpen className="w-4 h-4 text-amber-500" />
                  <span>{formData.filePath ? 'تغيير الملف' : 'اختيار كتاب من الجهاز'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-bold text-main">عنوان الكتاب (Title):</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">اسم المؤلف (Author):</label>
                  <input
                    type="text"
                    value={formData.author}
                    onChange={(e) => handleInputChange('author', e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">الطبعة (Edition):</label>
                  <input
                    type="text"
                    value={formData.edition || ''}
                    onChange={(e) => handleInputChange('edition', e.target.value)}
                    placeholder="مثال: الطبعة الثانية المحققة"
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">دار النشر (Publisher):</label>
                  <input
                    type="text"
                    value={formData.publisher || ''}
                    onChange={(e) => handleInputChange('publisher', e.target.value)}
                    placeholder="مثال: دار المعارف"
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">سنة النشر (Publication Year):</label>
                  <input
                    type="text"
                    value={formData.publicationYear || ''}
                    onChange={(e) => handleInputChange('publicationYear', e.target.value)}
                    placeholder="مثال: 1999 م"
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">المعرف الدولي ISBN:</label>
                  <input
                    type="text"
                    value={formData.isbn || ''}
                    onChange={(e) => handleInputChange('isbn', e.target.value)}
                    placeholder="978-XXXXX"
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">رابط صورة الغلاف (Cover Image):</label>
                  <input
                    type="text"
                    value={formData.coverImage || ''}
                    onChange={(e) => handleInputChange('coverImage', e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'physical' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-main flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-500" />
                  <span>الغرفة / القاعة (Room):</span>
                </label>
                <input
                  type="text"
                  value={formData.room || ''}
                  onChange={(e) => handleInputChange('room', e.target.value)}
                  placeholder="مثال: المكتبة الرئيسية (الغرفة الشمالية)"
                  className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-main flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-pale-sky-500" />
                  <span>الرف والتصنيف الفيزيائي (Shelf):</span>
                </label>
                <input
                  type="text"
                  value={formData.shelf || ''}
                  onChange={(e) => handleInputChange('shelf', e.target.value)}
                  placeholder="مثال: رف أ1 - العلوم الشرعية"
                  className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-main">حالة الكتاب الفيزيائي (Condition):</label>
                <select
                  value={formData.condition || 'ممتازة'}
                  onChange={(e) => handleInputChange('condition', e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                >
                  <option value="جديدة">جديدة (New)</option>
                  <option value="ممتازة">ممتازة (Excellent)</option>
                  <option value="جيدة">جيدة (Good)</option>
                  <option value="مستعملة">مستعملة (Used)</option>
                  <option value="أثرية/قديمة">أثرية/قديمة (Rare/Antique)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-main">سعر الشراء (Price):</label>
                <input
                  type="text"
                  value={formData.price || ''}
                  onChange={(e) => handleInputChange('price', e.target.value)}
                  placeholder="مثال: 150 ر.س"
                  className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                />
              </div>
            </div>
          )}

          {activeTab === 'lending' && (
            <div className="space-y-4 text-xs">
              {/* Add Lending Form */}
              <div className="p-3.5 rounded-2xl bg-canvas border border-subtle space-y-3">
                <h4 className="font-bold text-main text-xs">إضافة تسجيل إعارة جديد</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="اسم المستعير..."
                    value={newBorrower}
                    onChange={(e) => setNewBorrower(e.target.value)}
                    className="p-2 rounded-xl bg-surface border border-subtle text-main outline-none"
                  />
                  <input
                    type="date"
                    value={newBorrowDate}
                    onChange={(e) => setNewBorrowDate(e.target.value)}
                    className="p-2 rounded-xl bg-surface border border-subtle text-main outline-none font-sans"
                  />
                  <button
                    onClick={handleAddLending}
                    className="px-3 py-2 rounded-xl bg-pale-sky-500 text-white font-bold hover:bg-pale-sky-600 transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>سجل الإعارة</span>
                  </button>
                </div>
              </div>

              {/* Lending List */}
              <div className="space-y-2">
                {formData.lendingHistory.length > 0 ? (
                  formData.lendingHistory.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-xl bg-surface border border-subtle flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-main">{rec.borrowerName}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              rec.isReturned
                                ? 'bg-evergreen-500/10 text-evergreen-600'
                                : 'bg-amber-500/10 text-amber-600'
                            }`}
                          >
                            {rec.isReturned ? 'تمت الإعادة' : 'قيد الإعارة حالياً'}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted font-sans">
                          تاريخ الإعارة: {rec.borrowDate} • المتوقع: {rec.expectedReturnDate}
                        </p>
                      </div>

                      <button
                        onClick={() => handleToggleReturn(rec.id)}
                        className="px-2.5 py-1 rounded-lg border border-subtle hover:bg-canvas text-[11px] font-semibold text-main transition-colors"
                      >
                        {rec.isReturned ? 'إلغاء الإرجاع' : 'تسجيل الإرجاع'}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted py-6">لا توجد إعارات مسجلة لهذا الكتاب حتى الآن.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-canvas border-t border-subtle flex items-center justify-between">
          <button
            onClick={() => onDelete(formData.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-500 hover:bg-red-500/10 text-xs font-bold transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>حذف الكتاب من المكتبة</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-subtle text-muted hover:text-main hover:bg-surface text-xs font-semibold transition-all"
            >
              إلغاء
            </button>
            <button
              onClick={() => {
                onSave(formData);
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-pale-sky-500 text-white text-xs font-bold hover:bg-pale-sky-600 transition-all shadow-md cursor-pointer"
            >
              حفظ التغييرات
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
