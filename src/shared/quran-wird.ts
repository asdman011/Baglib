/**
 * BagLib Quran Wird and Muraja'a (Study Workspace Task 8 / KEY-286)
 *
 * Domain model, validation, and portion math for daily Quran reading,
 * memorization, and revision cycles (muraja'a).
 *
 * Rules:
 * - Profile: Hafs or Warsh, using installed packs and quran: targets.
 * - Units: pages, ayahs, or juz.
 * - Active weekdays (0=Sunday .. 6=Saturday).
 * - Page units require installed Mushaf layout data for the profile;
 *   returns typed error 'missing-layout' when layout is missing.
 * - Missed portions roll into ONE catch-up suggestion without guilt wording.
 * - Ayahs never become ordinary books (ADR-004, ADR-005). Canonical text is never changed.
 */

export type QuranWirdProfile = 'hafs' | 'warsh';
export type QuranWirdUnit = 'pages' | 'ayahs' | 'juz';

export const QURAN_WIRD_SETTINGS_KEY = 'study.wird.v1';
export const QURAN_WIRD_CHANGED_EVENT = 'baglib:quran-wird-changed';

/**
 * Total ayah count per surah (index 0 = Surah 1 .. index 113 = Surah 114).
 * Hafs (Kufi numbering): 6236 ayahs total.
 */
export const HAFS_SURAH_AYAH_COUNTS: readonly number[] = Object.freeze([
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6
]);

/**
 * Total ayah count per surah for Warsh (Madani Al-Akhir numbering): 6214 ayahs total.
 */
export const WARSH_SURAH_AYAH_COUNTS: readonly number[] = Object.freeze([
  7, 285, 200, 175, 122, 167, 206, 76, 130, 109, 121, 111, 44, 54, 99, 128, 110, 105, 99, 134,
  111, 76, 119, 62, 77, 226, 95, 88, 69, 59, 33, 30, 73, 54, 46, 82, 182, 86, 72, 84,
  53, 50, 89, 56, 36, 34, 39, 29, 18, 45, 60, 47, 61, 55, 77, 99, 28, 21, 24, 13,
  14, 11, 11, 18, 12, 12, 31, 52, 52, 44, 30, 28, 18, 55, 39, 31, 50, 40, 45, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 32, 20, 15, 21, 11, 8, 8, 20, 5, 8, 9, 11,
  10, 8, 3, 9, 5, 5, 6, 3, 6, 3, 5, 4, 5, 6
]);

/** Surah Arabic names (1 to 114) */
export const SURAH_NAMES_AR: readonly string[] = Object.freeze([
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
  'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
  'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
  'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
  'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
  'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس'
]);

/** Surah English names (1 to 114) */
export const SURAH_NAMES_EN: readonly string[] = Object.freeze([
  'Al-Fatihah', 'Al-Baqarah', 'Ali \'Imran', 'An-Nisa', 'Al-Ma\'idah', 'Al-An\'am', 'Al-A\'raf', 'Al-Anfal', 'At-Tawbah', 'Yunus',
  'Hud', 'Yusuf', 'Ar-Ra\'d', 'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha',
  'Al-Anbiya', 'Al-Hajj', 'Al-Mu\'minun', 'An-Nur', 'Al-Furqan', 'Ash-Shu\'ara', 'An-Naml', 'Al-Qasas', 'Al-\'Ankabut', 'Ar-Rum',
  'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir',
  'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf',
  'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', 'Al-Waqi\'ah', 'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah',
  'As-Saff', 'Al-Jumu\'ah', 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', 'Al-Ma\'arij',
  'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba', 'An-Nazi\'at', '\'Abasa',
  'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-A\'la', 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad',
  'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin', 'Al-\'Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-\'Adiyat',
  'Al-Qari\'ah', 'At-Takathur', 'Al-\'Asr', 'Al-Humazah', 'Al-Fil', 'Quraysh', 'Al-Ma\'un', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr',
  'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas'
]);

/** Standard 30 Juz boundaries in Hafs (1-indexed) */
export interface JuzBoundary {
  juz: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

export const STANDARD_JUZ_BOUNDARIES: readonly JuzBoundary[] = Object.freeze([
  { juz: 1, startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 141 },
  { juz: 2, startSurah: 2, startAyah: 142, endSurah: 2, endAyah: 252 },
  { juz: 3, startSurah: 2, startAyah: 253, endSurah: 3, endAyah: 92 },
  { juz: 4, startSurah: 3, startAyah: 93, endSurah: 4, endAyah: 23 },
  { juz: 5, startSurah: 4, startAyah: 24, endSurah: 4, endAyah: 147 },
  { juz: 6, startSurah: 4, startAyah: 148, endSurah: 5, endAyah: 81 },
  { juz: 7, startSurah: 5, startAyah: 82, endSurah: 6, endAyah: 110 },
  { juz: 8, startSurah: 6, startAyah: 111, endSurah: 7, endAyah: 87 },
  { juz: 9, startSurah: 7, startAyah: 88, endSurah: 8, endAyah: 40 },
  { juz: 10, startSurah: 8, startAyah: 41, endSurah: 9, endAyah: 92 },
  { juz: 11, startSurah: 9, startAyah: 93, endSurah: 11, endAyah: 5 },
  { juz: 12, startSurah: 11, startAyah: 6, endSurah: 12, endAyah: 52 },
  { juz: 13, startSurah: 12, startAyah: 53, endSurah: 14, endAyah: 52 },
  { juz: 14, startSurah: 15, startAyah: 1, endSurah: 16, endAyah: 128 },
  { juz: 15, startSurah: 17, startAyah: 1, endSurah: 18, endAyah: 74 },
  { juz: 16, startSurah: 18, startAyah: 75, endSurah: 20, endAyah: 135 },
  { juz: 17, startSurah: 21, startAyah: 1, endSurah: 22, endAyah: 78 },
  { juz: 18, startSurah: 23, startAyah: 1, endSurah: 25, endAyah: 20 },
  { juz: 19, startSurah: 25, startAyah: 21, endSurah: 27, endAyah: 55 },
  { juz: 20, startSurah: 27, startAyah: 56, endSurah: 29, endAyah: 45 },
  { juz: 21, startSurah: 29, startAyah: 46, endSurah: 33, endAyah: 30 },
  { juz: 22, startSurah: 33, startAyah: 31, endSurah: 36, endAyah: 27 },
  { juz: 23, startSurah: 36, startAyah: 28, endSurah: 39, endAyah: 31 },
  { juz: 24, startSurah: 39, startAyah: 32, endSurah: 41, endAyah: 46 },
  { juz: 25, startSurah: 41, startAyah: 47, endSurah: 45, endAyah: 37 },
  { juz: 26, startSurah: 46, startAyah: 1, endSurah: 51, endAyah: 30 },
  { juz: 27, startSurah: 51, startAyah: 31, endSurah: 57, endAyah: 29 },
  { juz: 28, startSurah: 58, startAyah: 1, endSurah: 66, endAyah: 12 },
  { juz: 29, startSurah: 67, startAyah: 1, endSurah: 77, endAyah: 50 },
  { juz: 30, startSurah: 78, startAyah: 1, endSurah: 114, endAyah: 6 },
]);

export interface QuranPosition {
  surah: number;
  ayah: number;
  page?: number;
  juz?: number;
}

export interface QuranMurajaaConfig {
  enabled: boolean;
  unit: 'juz' | 'pages';
  amount: number; // e.g. 1 juz or 5 pages
  currentJuz: number; // 1..30
  currentPage?: number; // 1..604
  rangeLimit?: number; // e.g. 5 (last 5 juz) or 30 (full cycle)
  startJuz?: number; // start of rotation cycle, e.g. 26
  endJuz?: number; // end of rotation cycle, e.g. 30
}

export interface QuranWirdConfig {
  profile: QuranWirdProfile;
  unit: QuranWirdUnit;
  dailyAmount: number; // e.g. 2 pages, 10 ayahs, 1 juz
  startPosition: QuranPosition;
  currentPosition: QuranPosition;
  murajaa: QuranMurajaaConfig;
  activeWeekdays: number[]; // 0..6 (0=Sun, 1=Mon .. 6=Sat)
  lastCompletedDate: string | null; // YYYY-MM-DD
  catchUpAccumulated: number; // missed portions count, max capped at 10
}

export const DEFAULT_QURAN_WIRD_CONFIG: QuranWirdConfig = Object.freeze({
  profile: 'hafs' as const,
  unit: 'pages' as const,
  dailyAmount: 2,
  startPosition: { surah: 1, ayah: 1, page: 1, juz: 1 },
  currentPosition: { surah: 1, ayah: 1, page: 1, juz: 1 },
  murajaa: {
    enabled: false,
    unit: 'juz' as const,
    amount: 1,
    currentJuz: 1,
    currentPage: 1,
    rangeLimit: 30,
    startJuz: 1,
    endJuz: 30,
  },
  activeWeekdays: [0, 1, 2, 3, 4, 6], // Sunday through Thursday + Saturday (Friday rest)
  lastCompletedDate: null,
  catchUpAccumulated: 0,
});

export interface QuranWirdMissingLayoutError {
  error: 'missing-layout';
  profile: QuranWirdProfile;
  availableUnits: ('ayahs' | 'juz')[];
  message: string;
}

export interface MushafPageSummary {
  pageNumber: number;
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

export interface QuranPortionRange {
  surah: number;
  from: number;
  to: number;
}

export interface QuranPortion {
  kind: 'wird' | 'murajaa' | 'catch-up';
  profile: QuranWirdProfile;
  unit: QuranWirdUnit;
  unitsCount: number;
  start: QuranPosition;
  end: QuranPosition;
  nextPosition: QuranPosition;
  ranges: QuranPortionRange[];
  primaryTarget: string; // e.g. "quran:hafs:2:1" or "quran:hafs:2:1-25"
  targets: string[]; // ['quran:hafs:2:1-25']
  label: string;
}

export interface QuranCatchUpSuggestion {
  needed: boolean;
  missedDays: number;
  missedUnits: number;
  unit: QuranWirdUnit;
  portion: QuranPortion | null;
  label: string;
}

export interface TodayWirdSyncResult {
  config: QuranWirdConfig;
  portion: QuranPortion;
  murajaaPortion: QuranPortion | null;
  catchUp: QuranCatchUpSuggestion | null;
  taskId?: string;
  isCompletedToday: boolean;
  isActiveToday: boolean;
}

/** Get total ayahs in a surah for a given profile */
export function getSurahAyahCount(surah: number, profile: QuranWirdProfile = 'hafs'): number {
  if (surah < 1 || surah > 114) throw new Error('invalid-surah');
  const counts = profile === 'warsh' ? WARSH_SURAH_AYAH_COUNTS : HAFS_SURAH_AYAH_COUNTS;
  return counts[surah - 1];
}

/** Validate and bound QuranWirdConfig from raw untrusted storage */
export function validateQuranWirdConfig(raw: unknown): QuranWirdConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_QURAN_WIRD_CONFIG };

  const input = raw as Partial<QuranWirdConfig>;

  const profile: QuranWirdProfile = input.profile === 'warsh' ? 'warsh' : 'hafs';
  const unit: QuranWirdUnit =
    input.unit === 'ayahs' || input.unit === 'juz' ? input.unit : 'pages';

  const dailyAmount =
    typeof input.dailyAmount === 'number' && Number.isFinite(input.dailyAmount)
      ? Math.max(1, Math.min(Math.round(input.dailyAmount), unit === 'ayahs' ? 300 : unit === 'juz' ? 10 : 100))
      : DEFAULT_QURAN_WIRD_CONFIG.dailyAmount;

  const sanitizePosition = (pos: unknown): QuranPosition => {
    if (!pos || typeof pos !== 'object') return { surah: 1, ayah: 1, page: 1, juz: 1 };
    const p = pos as Partial<QuranPosition>;
    const surah =
      typeof p.surah === 'number' && Number.isInteger(p.surah) && p.surah >= 1 && p.surah <= 114
        ? p.surah
        : 1;
    const maxAyahs = getSurahAyahCount(surah, profile);
    const ayah =
      typeof p.ayah === 'number' && Number.isInteger(p.ayah) && p.ayah >= 1 && p.ayah <= maxAyahs
        ? p.ayah
        : 1;
    const page =
      typeof p.page === 'number' && Number.isInteger(p.page) && p.page >= 1 && p.page <= 604
        ? p.page
        : undefined;
    const juz =
      typeof p.juz === 'number' && Number.isInteger(p.juz) && p.juz >= 1 && p.juz <= 30
        ? p.juz
        : undefined;
    return { surah, ayah, ...(page ? { page } : {}), ...(juz ? { juz } : {}) };
  };

  const startPosition = sanitizePosition(input.startPosition);
  const currentPosition = sanitizePosition(input.currentPosition);

  // Muraja'a sanitization
  const rawM = (input.murajaa || {}) as Partial<QuranMurajaaConfig>;
  const mUnit: 'juz' | 'pages' = rawM.unit === 'pages' ? 'pages' : 'juz';
  const mAmount =
    typeof rawM.amount === 'number' && Number.isFinite(rawM.amount)
      ? Math.max(1, Math.min(Math.round(rawM.amount), mUnit === 'pages' ? 100 : 30))
      : 1;
  const currentJuz =
    typeof rawM.currentJuz === 'number' && Number.isInteger(rawM.currentJuz) && rawM.currentJuz >= 1 && rawM.currentJuz <= 30
      ? rawM.currentJuz
      : 1;
  const currentPage =
    typeof rawM.currentPage === 'number' && Number.isInteger(rawM.currentPage) && rawM.currentPage >= 1 && rawM.currentPage <= 604
      ? rawM.currentPage
      : 1;
  const rangeLimit =
    typeof rawM.rangeLimit === 'number' && Number.isInteger(rawM.rangeLimit) && rawM.rangeLimit >= 1 && rawM.rangeLimit <= 30
      ? rawM.rangeLimit
      : 30;
  const startJuz =
    typeof rawM.startJuz === 'number' && Number.isInteger(rawM.startJuz) && rawM.startJuz >= 1 && rawM.startJuz <= 30
      ? rawM.startJuz
      : 1;
  const endJuz =
    typeof rawM.endJuz === 'number' && Number.isInteger(rawM.endJuz) && rawM.endJuz >= startJuz && rawM.endJuz <= 30
      ? rawM.endJuz
      : 30;

  const murajaa: QuranMurajaaConfig = {
    enabled: Boolean(rawM.enabled),
    unit: mUnit,
    amount: mAmount,
    currentJuz,
    currentPage,
    rangeLimit,
    startJuz,
    endJuz,
  };

  // Weekdays
  let activeWeekdays = [0, 1, 2, 3, 4, 6];
  if (Array.isArray(input.activeWeekdays) && input.activeWeekdays.length > 0) {
    const valid = input.activeWeekdays
      .filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6);
    const unique = Array.from(new Set(valid)).sort((a, b) => a - b);
    if (unique.length > 0) activeWeekdays = unique;
  }

  const lastCompletedDate =
    typeof input.lastCompletedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(input.lastCompletedDate)
      ? input.lastCompletedDate
      : null;

  const catchUpAccumulated =
    typeof input.catchUpAccumulated === 'number' && Number.isInteger(input.catchUpAccumulated)
      ? Math.max(0, Math.min(input.catchUpAccumulated, 10))
      : 0;

  return {
    profile,
    unit,
    dailyAmount,
    startPosition,
    currentPosition,
    murajaa,
    activeWeekdays,
    lastCompletedDate,
    catchUpAccumulated,
  };
}

/** Check if a given date (0=Sun .. 6=Sat) is an active wird day */
export function isWirdActiveDay(config: QuranWirdConfig, date: Date = new Date()): boolean {
  const day = date.getDay();
  return config.activeWeekdays.includes(day);
}

/** Format localized label for a portion */
export function formatPortionLabel(
  ranges: QuranPortionRange[],
  lang: 'ar' | 'en' = 'ar'
): string {
  if (ranges.length === 0) return '';
  if (ranges.length === 1) {
    const r = ranges[0];
    const surahName = lang === 'ar' ? SURAH_NAMES_AR[r.surah - 1] : SURAH_NAMES_EN[r.surah - 1];
    return r.from === r.to ? `${surahName} ${r.from}` : `${surahName} ${r.from}-${r.to}`;
  }
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  const firstSurah = lang === 'ar' ? SURAH_NAMES_AR[first.surah - 1] : SURAH_NAMES_EN[first.surah - 1];
  const lastSurah = lang === 'ar' ? SURAH_NAMES_AR[last.surah - 1] : SURAH_NAMES_EN[last.surah - 1];
  return `${firstSurah} ${first.from} — ${lastSurah} ${last.to}`;
}

/**
 * Calculate ayah-based portion of size `count` starting from `start`.
 */
export function calculateAyahPortion(
  start: { surah: number; ayah: number },
  count: number,
  profile: QuranWirdProfile = 'hafs',
  kind: 'wird' | 'murajaa' | 'catch-up' = 'wird'
): QuranPortion {
  let curSurah = start.surah;
  let curAyah = start.ayah;
  let remaining = count;
  const ranges: QuranPortionRange[] = [];

  while (remaining > 0) {
    const totalInSurah = getSurahAyahCount(curSurah, profile);
    const availableInSurah = totalInSurah - curAyah + 1;

    if (remaining <= availableInSurah) {
      const toAyah = curAyah + remaining - 1;
      ranges.push({ surah: curSurah, from: curAyah, to: toAyah });
      curAyah = toAyah;
      remaining = 0;
    } else {
      ranges.push({ surah: curSurah, from: curAyah, to: totalInSurah });
      remaining -= availableInSurah;
      curSurah = (curSurah % 114) + 1;
      curAyah = 1;
    }
  }

  const endSurah = curSurah;
  const endAyah = curAyah;

  // Next starting position
  let nextSurah = endSurah;
  let nextAyah = endAyah + 1;
  if (nextAyah > getSurahAyahCount(nextSurah, profile)) {
    nextSurah = (nextSurah % 114) + 1;
    nextAyah = 1;
  }

  const targets = ranges.map(
    r => (r.from === r.to ? `quran:${profile}:${r.surah}:${r.from}` : `quran:${profile}:${r.surah}:${r.from}-${r.to}`)
  );
  const primaryTarget = `quran:${profile}:${start.surah}:${start.ayah}${ranges[0].to > start.ayah ? `-${ranges[0].to}` : ''}`;

  return {
    kind,
    profile,
    unit: 'ayahs',
    unitsCount: count,
    start: { surah: start.surah, ayah: start.ayah },
    end: { surah: endSurah, ayah: endAyah },
    nextPosition: { surah: nextSurah, ayah: nextAyah },
    ranges,
    primaryTarget,
    targets,
    label: formatPortionLabel(ranges, 'ar'),
  };
}

/**
 * Calculate juz-based portion of size `count` (e.g. 1) starting from `startJuz` (1..30).
 */
export function calculateJuzPortion(
  startJuz: number,
  count: number = 1,
  profile: QuranWirdProfile = 'hafs',
  kind: 'wird' | 'murajaa' | 'catch-up' = 'wird'
): QuranPortion {
  const boundedJuz = Math.max(1, Math.min(Math.round(startJuz), 30));
  const boundedCount = Math.max(1, Math.min(Math.round(count), 30));

  const endJuzNumber = ((boundedJuz - 1 + boundedCount - 1) % 30) + 1;
  const nextJuzNumber = (endJuzNumber % 30) + 1;

  const firstBoundary = STANDARD_JUZ_BOUNDARIES[boundedJuz - 1];
  const lastBoundary = STANDARD_JUZ_BOUNDARIES[endJuzNumber - 1];

  const ranges: QuranPortionRange[] = [];
  if (boundedCount === 1) {
    if (firstBoundary.startSurah === firstBoundary.endSurah) {
      ranges.push({
        surah: firstBoundary.startSurah,
        from: firstBoundary.startAyah,
        to: firstBoundary.endAyah,
      });
    } else {
      // First surah in juz
      ranges.push({
        surah: firstBoundary.startSurah,
        from: firstBoundary.startAyah,
        to: getSurahAyahCount(firstBoundary.startSurah, profile),
      });
      // Middle surahs
      for (let s = firstBoundary.startSurah + 1; s < firstBoundary.endSurah; s++) {
        ranges.push({ surah: s, from: 1, to: getSurahAyahCount(s, profile) });
      }
      // Last surah in juz
      ranges.push({
        surah: firstBoundary.endSurah,
        from: 1,
        to: firstBoundary.endAyah,
      });
    }
  } else {
    // Multi-juz range
    ranges.push({
      surah: firstBoundary.startSurah,
      from: firstBoundary.startAyah,
      to: firstBoundary.endAyah,
    });
  }

  const primaryTarget = `quran:${profile}:${firstBoundary.startSurah}:${firstBoundary.startAyah}`;
  const targets = ranges.map(
    r => (r.from === r.to ? `quran:${profile}:${r.surah}:${r.from}` : `quran:${profile}:${r.surah}:${r.from}-${r.to}`)
  );

  const label =
    boundedCount === 1
      ? `الجزء ${boundedJuz}`
      : `الأجزاء ${boundedJuz} - ${endJuzNumber}`;

  return {
    kind,
    profile,
    unit: 'juz',
    unitsCount: boundedCount,
    start: {
      surah: firstBoundary.startSurah,
      ayah: firstBoundary.startAyah,
      juz: boundedJuz,
    },
    end: {
      surah: lastBoundary.endSurah,
      ayah: lastBoundary.endAyah,
      juz: endJuzNumber,
    },
    nextPosition: {
      surah: STANDARD_JUZ_BOUNDARIES[nextJuzNumber - 1].startSurah,
      ayah: STANDARD_JUZ_BOUNDARIES[nextJuzNumber - 1].startAyah,
      juz: nextJuzNumber,
    },
    ranges,
    primaryTarget,
    targets,
    label,
  };
}

/**
 * Calculate page-based portion using installed layout data.
 * Throws typed error 'missing-layout' if layout pages are not provided.
 */
export function calculatePagePortion(
  startPage: number,
  pageCount: number,
  layoutPages: MushafPageSummary[],
  profile: QuranWirdProfile = 'hafs',
  kind: 'wird' | 'murajaa' | 'catch-up' = 'wird'
): QuranPortion {
  if (!layoutPages || layoutPages.length === 0) {
    const err: QuranWirdMissingLayoutError = {
      error: 'missing-layout',
      profile,
      availableUnits: ['ayahs', 'juz'],
      message: `Mushaf layout data for profile '${profile}' is not installed. Please choose ayah or juz units.`,
    };
    throw err;
  }

  const totalPages = layoutPages.length;
  const boundedStartPage = Math.max(1, Math.min(Math.round(startPage), totalPages));
  const boundedCount = Math.max(1, Math.min(Math.round(pageCount), totalPages));

  const endPage = ((boundedStartPage - 1 + boundedCount - 1) % totalPages) + 1;
  const nextPage = (endPage % totalPages) + 1;

  const pageMap = new Map<number, MushafPageSummary>(layoutPages.map(p => [p.pageNumber, p]));

  const firstPageSummary = pageMap.get(boundedStartPage);
  const lastPageSummary = pageMap.get(endPage);

  if (!firstPageSummary || !lastPageSummary) {
    const err: QuranWirdMissingLayoutError = {
      error: 'missing-layout',
      profile,
      availableUnits: ['ayahs', 'juz'],
      message: `Page ${boundedStartPage} or ${endPage} not found in installed layout data.`,
    };
    throw err;
  }

  const ranges: QuranPortionRange[] = [];
  if (firstPageSummary.surahStart === lastPageSummary.surahEnd) {
    ranges.push({
      surah: firstPageSummary.surahStart,
      from: firstPageSummary.ayahStart,
      to: lastPageSummary.ayahEnd,
    });
  } else {
    // First surah on start page
    ranges.push({
      surah: firstPageSummary.surahStart,
      from: firstPageSummary.ayahStart,
      to: firstPageSummary.surahStart === firstPageSummary.surahEnd ? firstPageSummary.ayahEnd : getSurahAyahCount(firstPageSummary.surahStart, profile),
    });
    // Intermediate pages/surahs if different
    if (lastPageSummary.surahEnd > firstPageSummary.surahStart) {
      ranges.push({
        surah: lastPageSummary.surahEnd,
        from: 1,
        to: lastPageSummary.ayahEnd,
      });
    }
  }

  const primaryTarget = `quran:${profile}:${firstPageSummary.surahStart}:${firstPageSummary.ayahStart}`;
  const targets = ranges.map(
    r => (r.from === r.to ? `quran:${profile}:${r.surah}:${r.from}` : `quran:${profile}:${r.surah}:${r.from}-${r.to}`)
  );

  const label =
    boundedCount === 1
      ? `صفحة ${boundedStartPage}`
      : `الصفحات ${boundedStartPage} - ${endPage}`;

  return {
    kind,
    profile,
    unit: 'pages',
    unitsCount: boundedCount,
    start: {
      surah: firstPageSummary.surahStart,
      ayah: firstPageSummary.ayahStart,
      page: boundedStartPage,
    },
    end: {
      surah: lastPageSummary.surahEnd,
      ayah: lastPageSummary.ayahEnd,
      page: endPage,
    },
    nextPosition: {
      surah: (pageMap.get(nextPage)?.surahStart ?? 1),
      ayah: (pageMap.get(nextPage)?.ayahStart ?? 1),
      page: nextPage,
    },
    ranges,
    primaryTarget,
    targets,
    label,
  };
}

/**
 * Calculate the Muraja'a (revision cycle) portion.
 * Rotates through the configured range of juz or pages.
 */
export function calculateMurajaaPortion(
  config: QuranWirdConfig,
  layoutPages?: MushafPageSummary[]
): QuranPortion | null {
  if (!config.murajaa || !config.murajaa.enabled) return null;

  const m = config.murajaa;
  if (m.unit === 'pages') {
    if (!layoutPages || layoutPages.length === 0) {
      // Cannot calculate page-based murajaa without layout
      return null;
    }
    const curPage = m.currentPage || 1;
    return calculatePagePortion(curPage, m.amount, layoutPages, config.profile, 'murajaa');
  }

  // Juz unit
  const curJuz = m.currentJuz || 1;
  const startJuz = m.startJuz || 1;
  const endJuz = m.endJuz || 30;

  // Ensure current juz is within start..end
  const clampedJuz = curJuz < startJuz || curJuz > endJuz ? startJuz : curJuz;
  const portion = calculateJuzPortion(clampedJuz, m.amount, config.profile, 'murajaa');

  // Next position rotates within startJuz..endJuz
  const nextJuz = clampedJuz + m.amount > endJuz ? startJuz : clampedJuz + m.amount;
  portion.nextPosition.juz = nextJuz;

  return portion;
}

/**
 * Calculate single consolidated catch-up portion if previous days were missed.
 * Never piles up multiple tasks; aggregates into ONE gentle catch-up suggestion
 * without guilt wording.
 */
export function calculateCatchUpSuggestion(
  config: QuranWirdConfig,
  currentDateStr: string,
  layoutPages?: MushafPageSummary[]
): QuranCatchUpSuggestion {
  if (!config.lastCompletedDate) {
    return { needed: false, missedDays: 0, missedUnits: 0, unit: config.unit, portion: null, label: '' };
  }

  if (config.lastCompletedDate >= currentDateStr) {
    return { needed: false, missedDays: 0, missedUnits: 0, unit: config.unit, portion: null, label: '' };
  }

  // Count active weekdays between lastCompletedDate and today (exclusive of both)
  let missedDays = 0;
  const cursor = new Date(config.lastCompletedDate + 'T12:00:00Z');
  const target = new Date(currentDateStr + 'T12:00:00Z');

  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor < target) {
    const dayOfWeek = cursor.getUTCDay();
    if (config.activeWeekdays.includes(dayOfWeek)) {
      missedDays++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (missedDays === 0) {
    return { needed: false, missedDays: 0, missedUnits: 0, unit: config.unit, portion: null, label: '' };
  }

  // Cap catch-up units to 1 dailyAmount (or 1 extra portion) to never overwhelm
  const catchUpUnits = Math.min(missedDays * config.dailyAmount, config.dailyAmount);

  let portion: QuranPortion | null = null;
  try {
    if (config.unit === 'ayahs') {
      portion = calculateAyahPortion(config.currentPosition, catchUpUnits, config.profile, 'catch-up');
    } else if (config.unit === 'juz') {
      portion = calculateJuzPortion(config.currentPosition.juz || 1, catchUpUnits, config.profile, 'catch-up');
    } else if (config.unit === 'pages' && layoutPages && layoutPages.length > 0) {
      portion = calculatePagePortion(config.currentPosition.page || 1, catchUpUnits, layoutPages, config.profile, 'catch-up');
    }
  } catch {
    portion = null;
  }

  const label =
    config.unit === 'pages'
      ? `استدراك يسير: ${catchUpUnits} صفحة`
      : config.unit === 'juz'
        ? `استدراك يسير: ${catchUpUnits} جزء`
        : `استدراك يسير: ${catchUpUnits} آية`;

  return {
    needed: true,
    missedDays,
    missedUnits: catchUpUnits,
    unit: config.unit,
    portion,
    label,
  };
}
