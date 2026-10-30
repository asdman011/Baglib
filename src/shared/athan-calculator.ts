/**
 * Baglib — Astronomical Prayer Times, Sunnah Times, Jama'ah Resolver & Hijri Calendar Engine
 *
 * Implements standard high-precision solar astronomy formulas:
 * - Julian Day & Solar Coordinates (Declination & Equation of Time)
 * - Solar Noon (Dhuhr), Horizon Altitude with Elevation Correction
 * - Custom & Preset Fajr/Isha Depression Angles
 * - Asr Shadow Ratio: Standard (Shafi'i, Maliki, Hanbali = 1x) vs Hanafi (= 2x)
 * - High-Latitude Night Portion Rules: Middle of the Night (1/2), One-Seventh (1/7), Angle-Based (angle/60)
 * - Optional Sunnah Times: Duha, Islamic Midnight, Tahajjud / Qiyam Al-Layl (Last Third of the Night)
 * - Custom Jama'ah / Iqamah JSON Preset & Offset Resolver
 * - Hijri Calendar Converter with +/- Day Adjustments
 */

import type {

  AthanSettings,
  CalculationMethodId,
  CalculationMethodPreset,
  CoordinatesConfig,
  DailyPrayerTimes,
  HighLatitudeRule,
  HijriDateInfo,
  JamaahPresetSchedule,
  MandatoryPrayerName,
  MawaqitMosqueData,
  NextPrayerInfo,
  ActivePrayerWindow,
  PrayerName,
  PrayerStatusSnapshot,
} from './types/athan';

export const CALCULATION_METHOD_PRESETS: Record<CalculationMethodId, CalculationMethodPreset> = {
  MWL: {
    id: 'MWL',
    nameEn: 'Muslim World League (MWL)',
    nameAr: 'رابطة العالم الإسلامي',
    fajrAngle: 18,
    ishaAngle: 17,
  },
  Makkah: {
    id: 'Makkah',
    nameEn: 'Umm Al-Qura University, Makkah',
    nameAr: 'جامعة أم القرى - مكة المكرمة',
    fajrAngle: 18.5,
    ishaAngle: 0,
    ishaIntervalMinutes: 90,
  },
  Egypt: {
    id: 'Egypt',
    nameEn: 'Egyptian General Authority of Survey',
    nameAr: 'الهيئة المصرية العامة للمساحة',
    fajrAngle: 19.5,
    ishaAngle: 17.5,
  },
  ISNA: {
    id: 'ISNA',
    nameEn: 'Islamic Society of North America (ISNA)',
    nameAr: 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)',
    fajrAngle: 15,
    ishaAngle: 15,
  },
  Karachi: {
    id: 'Karachi',
    nameEn: 'University of Islamic Sciences, Karachi',
    nameAr: 'جامعة العلوم الإسلامية بكراتشي',
    fajrAngle: 18,
    ishaAngle: 18,
  },
  Tehran: {
    id: 'Tehran',
    nameEn: 'Institute of Geophysics, Tehran',
    nameAr: 'معهد الجيوفيزياء بجامعة طهران',
    fajrAngle: 17.7,
    ishaAngle: 14,
    maghribAngle: 4.5,
  },
  Dubai: {
    id: 'Dubai',
    nameEn: 'Dubai / UAE',
    nameAr: 'دبي / الإمارات العربية المتحدة',
    fajrAngle: 18.2,
    ishaAngle: 18.2,
  },
  Kuwait: {
    id: 'Kuwait',
    nameEn: 'Ministry of Awqaf, Kuwait',
    nameAr: 'وزارة الأوقاف والشؤون الإسلامية - الكويت',
    fajrAngle: 18,
    ishaAngle: 17.5,
  },
  Qatar: {
    id: 'Qatar',
    nameEn: 'Calendar House, Qatar',
    nameAr: 'دار التقويم القطري',
    fajrAngle: 18,
    ishaAngle: 0,
    ishaIntervalMinutes: 90,
  },
  Singapore: {
    id: 'Singapore',
    nameEn: 'Majlis Ugama Islam Singapura (MUIS)',
    nameAr: 'المجلس الإسلامي بسنغافورة',
    fajrAngle: 20,
    ishaAngle: 18,
  },
  Turkey: {
    id: 'Turkey',
    nameEn: 'Presidency of Religious Affairs (Diyanet)',
    nameAr: 'رئاسة الشؤون الدينية التركية (ديانت)',
    fajrAngle: 18,
    ishaAngle: 17,
  },
  Custom: {
    id: 'Custom',
    nameEn: 'Custom Angles',
    nameAr: 'زوايا مخصصة',
    fajrAngle: 18,
    ishaAngle: 17,
  },
};

/**
 * Resolves the recommended calculation method preset for a given location
 * using country names, timezones, city names, and coordinate boundaries.
 */
export function resolveDefaultCalculationMethodForLocation(
  coords?: Partial<CoordinatesConfig> | null
): CalculationMethodId {
  if (!coords) return 'MWL';

  const tz = (coords.timezone || '').toLowerCase();
  const country = (coords.countryName || '').toLowerCase();
  const city = (coords.cityName || '').toLowerCase();

  // 1. Egypt (Egyptian General Authority of Survey / الهيئة المصرية العامة للمساحة)
  if (
    country.includes('egypt') ||
    country.includes('مصر') ||
    tz.includes('cairo') ||
    city.includes('cairo') ||
    city.includes('alexandria') ||
    city.includes('giza') ||
    city.includes('القاهرة') ||
    city.includes('الإسكندرية')
  ) {
    return 'Egypt';
  }

  // 2. Saudi Arabia (Umm Al-Qura / جامعة أم القرى)
  if (
    country.includes('saudi') ||
    country.includes('سعودي') ||
    country === 'sa' ||
    tz.includes('riyadh') ||
    city.includes('makkah') ||
    city.includes('mecca') ||
    city.includes('medina') ||
    city.includes('madinah') ||
    city.includes('riyadh') ||
    city.includes('jeddah') ||
    city.includes('مكة') ||
    city.includes('المدينة') ||
    city.includes('الرياض')
  ) {
    return 'Makkah';
  }

  // 3. United Arab Emirates (Dubai / دبي)
  if (
    country.includes('united arab emirates') ||
    country.includes('emirates') ||
    country.includes('uae') ||
    country.includes('إمارات') ||
    tz.includes('dubai') ||
    city.includes('dubai') ||
    city.includes('abu dhabi') ||
    city.includes('sharjah') ||
    city.includes('دبي') ||
    city.includes('أبوظبي')
  ) {
    return 'Dubai';
  }

  // 4. Qatar (Calendar House / دار التقويم القطري)
  if (
    country.includes('qatar') ||
    country.includes('قطر') ||
    tz.includes('qatar') ||
    city.includes('doha') ||
    city.includes('الدوحة')
  ) {
    return 'Qatar';
  }

  // 5. Kuwait (Ministry of Awqaf / وزارة الأوقاف - الكويت)
  if (
    country.includes('kuwait') ||
    country.includes('كويت') ||
    tz.includes('kuwait') ||
    city.includes('الكويت')
  ) {
    return 'Kuwait';
  }

  // 6. Turkey (Diyanet / رئاسة الشؤون الدينية التركية)
  if (
    country.includes('turkey') ||
    country.includes('türkiye') ||
    country.includes('تركيا') ||
    tz.includes('istanbul') ||
    city.includes('istanbul') ||
    city.includes('ankara')
  ) {
    return 'Turkey';
  }

  // 7. Singapore / Malaysia / Indonesia / Brunei (MUIS / المجلس الإسلامي بسنغافورة)
  if (
    country.includes('singapore') ||
    country.includes('malaysia') ||
    country.includes('indonesia') ||
    country.includes('brunei') ||
    country.includes('سنغافورة') ||
    country.includes('ماليزيا') ||
    country.includes('إندونيسيا') ||
    tz.includes('singapore') ||
    tz.includes('kuala_lumpur') ||
    tz.includes('jakarta')
  ) {
    return 'Singapore';
  }

  // 8. Pakistan / India / Bangladesh / Afghanistan (University of Islamic Sciences, Karachi)
  if (
    country.includes('pakistan') ||
    country.includes('india') ||
    country.includes('bangladesh') ||
    country.includes('afghanistan') ||
    country.includes('باكستان') ||
    country.includes('الهند') ||
    country.includes('بنغلاديش') ||
    tz.includes('karachi') ||
    tz.includes('kolkata') ||
    tz.includes('calcutta') ||
    tz.includes('dhaka') ||
    tz.includes('kabul')
  ) {
    return 'Karachi';
  }

  // 9. North America (ISNA / الجمعية الإسلامية لأمريكا الشمالية)
  if (
    country.includes('united states') ||
    country.includes('usa') ||
    country.includes('canada') ||
    country.includes('أمريكا') ||
    country.includes('كندا') ||
    tz.startsWith('america/')
  ) {
    return 'ISNA';
  }

  // 10. Iran (Institute of Geophysics, Tehran)
  if (
    country.includes('iran') ||
    country.includes('إيران') ||
    tz.includes('tehran') ||
    city.includes('tehran')
  ) {
    return 'Tehran';
  }

  // 11. Coordinate-based bounding boxes fallback
  const lat = coords.latitude;
  const lng = coords.longitude;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    // Egypt: 21.9°N to 32.0°N, 24.5°E to 37.0°E
    if (lat >= 21.9 && lat <= 32.0 && lng >= 24.5 && lng <= 37.0) {
      return 'Egypt';
    }
    // Arabian Peninsula (Saudi Arabia): 16.0°N to 32.5°N, 34.5°E to 55.7°E
    if (lat >= 16.0 && lat <= 32.5 && lng >= 34.5 && lng <= 55.7) {
      return 'Makkah';
    }
    // North America: 24.0°N to 72.0°N, -170.0°W to -50.0°W
    if (lat >= 24.0 && lat <= 72.0 && lng >= -170.0 && lng <= -50.0) {
      return 'ISNA';
    }
    // South Asia: 6.0°N to 37.0°N, 60.0°E to 98.0°E
    if (lat >= 6.0 && lat <= 37.0 && lng >= 60.0 && lng <= 98.0) {
      return 'Karachi';
    }
  }

  return 'MWL';
}

export const HIJRI_MONTHS_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

export const HIJRI_MONTHS_EN = [
  'Muharram',
  'Safar',
  'Rabi al-Awwal',
  'Rabi al-Thani',
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  'Shaban',
  'Ramadan',
  'Shawwal',
  'Dhu al-Qadah',
  'Dhu al-Hijjah',
];

export const PRAYER_LABELS: Record<PrayerName, { ar: string; en: string }> = {
  fajr: { ar: 'الفجر', en: 'Fajr' },
  sunrise: { ar: 'الشروق', en: 'Sunrise' },
  dhuhr: { ar: 'الظهر', en: 'Dhuhr' },
  asr: { ar: 'العصر', en: 'Asr' },
  maghrib: { ar: 'المغرب', en: 'Maghrib' },
  isha: { ar: 'العشاء', en: 'Isha' },
};

export const DEFAULT_ATHAN_SETTINGS: AthanSettings = {
  locationMode: 'manual',
  manualLocation: {
    latitude: 21.4225,
    longitude: 39.8262,
    elevation: 277,
    timezone: 'Asia/Riyadh',
    cityName: 'Makkah',
    countryName: 'Saudi Arabia',
  },
  mawaqit: {
    enabled: false,
    mosqueIdOrSlug: '',
    mosqueName: '',
    fallbackMode: 'manual',
  },
  calculationMethod: 'Makkah',
  customFajrAngle: 18.5,
  customIshaAngle: 17,
  asrMethod: 'standard',
  highLatitudeRule: 'angleBased',
  sunnahPrayers: {
    duha: true,
    tahajjud: true,
    midnight: true,
    duhaOffsetMinutes: 20,
  },
  adjustments: {
    fajr: 0,
    sunrise: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0,
  },
  iqamahOffsets: {
    fajr: 20,
    dhuhr: 15,
    asr: 15,
    maghrib: 10,
    isha: 15,
  },
  jamaahPresetJson: '',
  hijriAdjustmentDays: 0,
  prayerWindowMinutes: 20,
  notifications: {
    enabled: true,
    preReminderEnabled: true,
    preReminderMinutes: 15,
    modalDialogEnabled: true,
    enabledPrayers: {
      fajr: true,
      sunrise: false,
      dhuhr: true,
      asr: true,
      maghrib: true,
      isha: true,
    },
  },
  audio: {
    enabled: true,
    volume: 0.8,
    muted: false,
    soundPreset: 'makkah-short',
  },
  localization: {
    forceArabicWidgets: false,
  },
};

// Trigonometric degree helpers
const dtr = (deg: number): number => (deg * Math.PI) / 180;
const rtd = (rad: number): number => (rad * 180) / Math.PI;
const dsin = (deg: number): number => Math.sin(dtr(deg));
const dcos = (deg: number): number => Math.cos(dtr(deg));
const dtan = (deg: number): number => Math.tan(dtr(deg));

const darccot = (x: number): number => rtd(Math.atan(1 / x));

function fixAngle(a: number): number {
  const b = a - 360 * Math.floor(a / 360);
  return b < 0 ? b + 360 : b;
}

function fixHour(a: number): number {
  const b = a - 24 * Math.floor(a / 24);
  return b < 0 ? b + 24 : b;
}

/**
 * Computes Julian Date from Gregorian Year, Month (1-12), Day (1-31).
 */
export function julianDate(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
}

/**
 * Computes Sun's declination (deg) and Equation of Time (hours) for a given Julian Date.
 */
export function sunPosition(jd: number): { declination: number; equation: number } {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = rtd(Math.atan2(dcos(e) * dsin(L), dcos(L))) / 15;
  const eqt = q / 15 - fixHour(RA);
  const decl = rtd(Math.asin(dsin(e) * dsin(L)));
  return { declination: decl, equation: eqt };
}

/**
 * Computes the timezone offset in hours (e.g. +3 for Asia/Riyadh) for a given date and IANA timezone.
 */
export function resolveTimezoneOffsetHours(date: Date, timezone?: string): number {
  if (timezone) {
    // Support explicit numeric offsets like "+03:00", "UTC+3", "+3"
    const numericMatch = timezone.trim().match(/^(?:UTC|GMT)?([+-]\d{1,2})(?::?(\d{2}))?$/i);
    if (numericMatch) {
      const sign = numericMatch[1].startsWith('-') ? -1 : 1;
      const hrs = Math.abs(parseInt(numericMatch[1], 10));
      const mins = numericMatch[2] ? parseInt(numericMatch[2], 10) : 0;
      return sign * (hrs + mins / 60);
    }
    try {
      const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
      return (tzDate.getTime() - utcDate.getTime()) / 3_600_000;
    } catch {
      // Fallback to local system timezone offset
    }
  }
  return -date.getTimezoneOffset() / 60;
}

/** Wall-clock parts in the configured prayer location, independent of the host. */
export function prayerClock(date: Date, timezone: string) {
  const wall = new Date(date.getTime() + resolveTimezoneOffsetHours(date, timezone) * 3_600_000);
  return { year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1, day: wall.getUTCDate(), hour: wall.getUTCHours(), minute: wall.getUTCMinutes(), second: wall.getUTCSeconds() };
}

/**
 * Formats fractional hours (0..24) as "HH:mm", applying minute adjustments.
 */
export function formatHoursToHHMM(hours: number, adjustMinutes = 0): string {
  const totalMinutes = Math.round(fixHour(hours) * 60) + Math.round(adjustMinutes);
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Parses "HH:mm" string into minutes since midnight (0..1439).
 */
export function parseHHMMToMinutes(timeStr: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec((timeStr || '').trim());
  if (!match) return 0;
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return h * 60 + m;
}

/**
 * Adds minutes to an "HH:mm" string and returns normalized "HH:mm".
 */
export function addMinutesToHHMM(timeStr: string, deltaMinutes: number): string {
  const base = parseHHMMToMinutes(timeStr);
  const total = ((base + Math.round(deltaMinutes)) % 1440 + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Computes the night portion fraction for High-Latitude adjustments.
 */
export function nightPortion(angle: number, rule: HighLatitudeRule): number {
  if (rule === 'middleOfTheNight') return 1 / 2;
  if (rule === 'oneSeventh') return 1 / 7;
  if (rule === 'angleBased') return angle / 60;
  return 0;
}

/**
 * Resolves Iqamah / Jama'ah times from Athan times, manual offsets, and optional JSON preset schedule.
 */
export function resolveIqamahTimes(
  athanTimes: Record<MandatoryPrayerName, string>,
  iqamahOffsets: Record<MandatoryPrayerName, number>,
  jamaahPresetJson?: string,
  mawaqitIqamah?: Partial<Record<MandatoryPrayerName, string>>
): Record<MandatoryPrayerName, string> {
  let preset: JamaahPresetSchedule = {};
  if (jamaahPresetJson && jamaahPresetJson.trim()) {
    try {
      const parsed = JSON.parse(jamaahPresetJson);
      if (parsed && typeof parsed === 'object') {
        preset = parsed as JamaahPresetSchedule;
      }
    } catch {
      // Ignore malformed JSON and use standard offsets
    }
  }

  const mandatory: MandatoryPrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const result = {} as Record<MandatoryPrayerName, string>;

  for (const prayer of mandatory) {
    // 1. Check Mawaqit override if provided
    const mwVal = mawaqitIqamah?.[prayer];
    if (mwVal && /^\d{1,2}:\d{2}$/.test(mwVal.trim())) {
      result[prayer] = mwVal.trim().padStart(5, '0');
      continue;
    }
    if (mwVal && /^[+-]?\d+$/.test(mwVal.trim())) {
      result[prayer] = addMinutesToHHMM(athanTimes[prayer], parseInt(mwVal.trim(), 10));
      continue;
    }

    // 2. Check custom JSON preset schedule
    const presetVal = preset[prayer];
    if (typeof presetVal === 'string' && presetVal.trim()) {
      const clean = presetVal.trim();
      if (/^\d{1,2}:\d{2}$/.test(clean)) {
        const [h, m] = clean.split(':').map((x) => parseInt(x, 10));
        result[prayer] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        continue;
      }
      if (/^[+-]\d+$/.test(clean)) {
        result[prayer] = addMinutesToHHMM(athanTimes[prayer], parseInt(clean, 10));
        continue;
      }
    }

    // 3. Default offset in minutes after Athan
    const offset = Number.isFinite(iqamahOffsets?.[prayer]) ? iqamahOffsets[prayer] : 15;
    result[prayer] = addMinutesToHHMM(athanTimes[prayer], offset);
  }

  return result;
}

/**
 * Computes astronomical prayer times for a specific date, coordinates, and calculation settings.
 */
export function calculateAstronomicalPrayerTimes(
  date: Date,
  coords: CoordinatesConfig,
  settings: AthanSettings
): DailyPrayerTimes {
  const { year, month, day } = prayerClock(date, coords.timezone);
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const lat = Number.isFinite(coords.latitude) ? Math.max(-89.9, Math.min(89.9, coords.latitude)) : 21.4225;
  const lng = Number.isFinite(coords.longitude) ? Math.max(-180, Math.min(180, coords.longitude)) : 39.8262;
  const elv = Number.isFinite(coords.elevation) ? Math.max(0, coords.elevation) : 0;
  const tz = resolveTimezoneOffsetHours(date, coords.timezone);

  const jd = julianDate(year, month, day) - lng / (15 * 24);
  const { declination: decl, equation: eqt } = sunPosition(jd + 0.5);

  const preset = CALCULATION_METHOD_PRESETS[settings.calculationMethod] || CALCULATION_METHOD_PRESETS.MWL;
  const fajrAngle =
    settings.calculationMethod === 'Custom'
      ? Math.max(10, Math.min(25, settings.customFajrAngle || 18))
      : preset.fajrAngle;
  const ishaAngle =
    settings.calculationMethod === 'Custom'
      ? Math.max(10, Math.min(25, settings.customIshaAngle || 17))
      : preset.ishaAngle;

  // Solar Noon (Dhuhr) in local hours
  const transit = 12 + tz - lng / 15 - eqt;

  // Horizon depression angle for Sunrise/Sunset including elevation correction
  const horizonAngle = 0.833 + 0.0347 * Math.sqrt(elv);

  // Hour angle helper: returns hours from transit or NaN if sun never reaches angle at high latitude
  const computeHourAngle = (angle: number): number => {
    const num = -dsin(angle) - dsin(lat) * dsin(decl);
    const den = dcos(lat) * dcos(decl);
    if (Math.abs(den) < 1e-9) return NaN;
    const ratio = num / den;
    if (ratio < -1 || ratio > 1) return NaN;
    return rtd(Math.acos(ratio)) / 15;
  };

  // Sunrise & Sunset
  const sunriseDiff = computeHourAngle(horizonAngle);
  const safeSunriseDiff = Number.isNaN(sunriseDiff) ? 6 : sunriseDiff;
  const sunriseHours = transit - safeSunriseDiff;
  const sunsetHours = transit + safeSunriseDiff;

  // Night duration (Sunset to Sunrise)
  const nightDuration = fixHour(sunriseHours - sunsetHours);

  // Fajr
  const fajrDiff = computeHourAngle(fajrAngle);
  let fajrHours = Number.isNaN(fajrDiff) ? NaN : transit - fajrDiff;
  if (settings.highLatitudeRule !== 'none') {
    const maxFajrPortion = nightPortion(fajrAngle, settings.highLatitudeRule) * nightDuration;
    if (Number.isNaN(fajrHours) || sunriseHours - fajrHours > maxFajrPortion) {
      fajrHours = sunriseHours - maxFajrPortion;
    }
  } else if (Number.isNaN(fajrHours)) {
    fajrHours = sunriseHours - (fajrAngle / 60) * nightDuration;
  }

  // Asr: shadow ratio s = 1 (Standard: Shafi'i, Maliki, Hanbali) or s = 2 (Hanafi)
  const shadowFactor: number = settings.asrMethod === 'hanafi' ? 2 : 1;
  const asrAltitude = darccot(shadowFactor + dtan(Math.abs(lat - decl)));
  const asrDiff = computeHourAngle(-asrAltitude);
  const safeAsrDiff = Number.isNaN(asrDiff) ? safeSunriseDiff * 0.5 : asrDiff;
  const asrHours = transit + safeAsrDiff;

  // Maghrib
  let maghribHours = sunsetHours;
  if (preset.maghribAngle && preset.maghribAngle > 0) {
    const maghribDiff = computeHourAngle(preset.maghribAngle);
    if (!Number.isNaN(maghribDiff)) {
      maghribHours = transit + maghribDiff;
    }
  }

  // Isha
  let ishaHours: number;
  if (preset.ishaIntervalMinutes && settings.calculationMethod !== 'Custom') {
    ishaHours = maghribHours + preset.ishaIntervalMinutes / 60;
  } else {
    const ishaDiff = computeHourAngle(ishaAngle);
    ishaHours = Number.isNaN(ishaDiff) ? NaN : transit + ishaDiff;
    if (settings.highLatitudeRule !== 'none') {
      const maxIshaPortion = nightPortion(ishaAngle, settings.highLatitudeRule) * nightDuration;
      if (Number.isNaN(ishaHours) || ishaHours - sunsetHours > maxIshaPortion) {
        ishaHours = sunsetHours + maxIshaPortion;
      }
    } else if (Number.isNaN(ishaHours)) {
      ishaHours = sunsetHours + (ishaAngle / 60) * nightDuration;
    }
  }

  // Apply manual adjustments (+/- minutes)
  const adj = settings.adjustments || { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  const fajr = formatHoursToHHMM(fajrHours, adj.fajr || 0);
  const sunrise = formatHoursToHHMM(sunriseHours, adj.sunrise || 0);
  const dhuhr = formatHoursToHHMM(transit, adj.dhuhr || 0);
  const asr = formatHoursToHHMM(asrHours, adj.asr || 0);
  const maghrib = formatHoursToHHMM(maghribHours, adj.maghrib || 0);
  const isha = formatHoursToHHMM(ishaHours, adj.isha || 0);

  // Optional Sunnah Times
  // 1. Duha: calculable after sunrise (default +20 mins)
  const duhaOffset = Number.isFinite(settings.sunnahPrayers?.duhaOffsetMinutes)
    ? Math.max(10, Math.min(120, settings.sunnahPrayers.duhaOffsetMinutes))
    : 20;
  const duha = addMinutesToHHMM(sunrise, duhaOffset);

  // 2. Night span from Maghrib/Sunset to Fajr for Islamic Midnight and Tahajjud (Last Third of the Night)
  const maghribMins = parseHHMMToMinutes(maghrib);
  const fajrMins = parseHHMMToMinutes(fajr);
  const nightSpanMinutes = ((fajrMins - maghribMins) % 1440 + 1440) % 1440;
  const midnight = addMinutesToHHMM(maghrib, Math.round(nightSpanMinutes / 2));
  const lastThird = addMinutesToHHMM(maghrib, Math.round((nightSpanMinutes * 2) / 3));

  const iqamah = resolveIqamahTimes(
    { fajr, dhuhr, asr, maghrib, isha },
    settings.iqamahOffsets,
    settings.jamaahPresetJson
  );

  return {
    date: dateStr,
    fajr,
    sunrise,
    dhuhr,
    asr,
    maghrib,
    isha,
    duha,
    midnight,
    lastThird,
    iqamah,
  };
}

/**
 * Computes Hijri Date with +/- day adjustment using Umm al-Qura / Islamic calendar with tabular fallback.
 */
export function calculateHijriDate(date: Date, adjustmentDays = 0): HijriDateInfo {
  const adjusted = new Date(date.getTime() + Math.round(adjustmentDays) * 86_400_000);

  let day = 1;
  let month = 1;
  let year = 1448;

  try {
    const formatter = new Intl.DateTimeFormat('en-TN-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(adjusted);
    const dPart = parts.find((p) => p.type === 'day')?.value;
    const mPart = parts.find((p) => p.type === 'month')?.value;
    const yPart = parts.find((p) => p.type === 'year')?.value;
    if (dPart && mPart && yPart) {
      day = parseInt(dPart, 10);
      month = Math.max(1, Math.min(12, parseInt(mPart, 10)));
      year = parseInt(yPart, 10);
    }
  } catch {
    // Tabular Kuwaiti Hijri fallback if Intl islamic-umalqura is unavailable
    const jd = julianDate(adjusted.getFullYear(), adjusted.getMonth() + 1, adjusted.getDate());
    const l = Math.floor(jd) - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    const l2 = l - 10631 * n + 354;
    const j =
      Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
      Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
    const l3 =
      l2 -
      Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
      Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
      29;
    month = Math.max(1, Math.min(12, Math.floor((24 * l3) / 709)));
    day = l3 - Math.floor((709 * month) / 24);
    year = 30 * n + j - 30;
  }

  const monthNameAr = HIJRI_MONTHS_AR[month - 1] || HIJRI_MONTHS_AR[0];
  const monthNameEn = HIJRI_MONTHS_EN[month - 1] || HIJRI_MONTHS_EN[0];
  const arDigits = (num: number) =>
    String(num).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

  return {
    day,
    month,
    year,
    monthNameAr,
    monthNameEn,
    formattedAr: `${arDigits(day)} ${monthNameAr} ${arDigits(year)} هـ`,
    formattedEn: `${day} ${monthNameEn} ${year} AH`,
    adjustmentDays,
  };
}

/**
 * Formats a countdown in seconds as "HH:mm:ss".
 */
export function formatCountdownSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Computes Next Prayer & Active Prayer Window status for a given `now` timestamp and `DailyPrayerTimes`.
 */
export function evaluatePrayerScheduleStatus(
  now: Date,
  times: DailyPrayerTimes,
  prayerWindowMinutes = 20,
  timezone?: string
): { nextPrayer: NextPrayerInfo; activeWindow: ActivePrayerWindow | null } {
  const clock = timezone ? prayerClock(now, timezone) : { hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds() };
  const currentSeconds = clock.hour * 3600 + clock.minute * 60 + clock.second;
  const order: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

  let nextPrayer: NextPrayerInfo | null = null;
  let activeWindow: ActivePrayerWindow | null = null;
  const windowSecs = Math.max(1, prayerWindowMinutes) * 60;

  for (const name of order) {
    const timeStr = times[name];
    const pSeconds = parseHHMMToMinutes(timeStr) * 60;
    const iqamahTime = name !== 'sunrise' ? times.iqamah[name as MandatoryPrayerName] : undefined;

    // Check if we are currently inside this prayer's active window [pSeconds, pSeconds + windowSecs]
    if (name !== 'sunrise' && currentSeconds >= pSeconds && currentSeconds < pSeconds + windowSecs) {
      activeWindow = {
        prayer: name,
        enteredAt: timeStr,
        iqamahTime,
        elapsedMinutes: Math.floor((currentSeconds - pSeconds) / 60),
        windowMinutes: prayerWindowMinutes,
      };
    }

    if (nextPrayer === null && pSeconds > currentSeconds) {
      const remainingSeconds = pSeconds - currentSeconds;
      nextPrayer = {
        name,
        time: timeStr,
        iqamahTime,
        isTomorrow: false,
        remainingSeconds,
        countdownFormatted: formatCountdownSeconds(remainingSeconds),
      };
    }
  }

  // If all today's prayers have passed, next prayer is tomorrow's Fajr
  if (!nextPrayer) {
    const fajrSeconds = parseHHMMToMinutes(times.fajr) * 60;
    const remainingSeconds = 86_400 - currentSeconds + fajrSeconds;
    nextPrayer = {
      name: 'fajr',
      time: times.fajr,
      iqamahTime: times.iqamah.fajr,
      isTomorrow: true,
      remainingSeconds,
      countdownFormatted: formatCountdownSeconds(remainingSeconds),
    };
  }

  return { nextPrayer, activeWindow };
}

/**
 * Builds a complete `PrayerStatusSnapshot` from settings, optional Mawaqit data, and current time.
 */
export function buildPrayerStatusSnapshot(
  settings: AthanSettings,
  now = new Date(),
  mawaqitData?: MawaqitMosqueData | null
): PrayerStatusSnapshot {
  let activeSource = settings.locationMode;
  let mawaqitConnected = false;
  let fallbackActive = false;

  // Determine effective coordinates
  let coordinates: CoordinatesConfig = settings.manualLocation;
  if (settings.locationMode === 'auto') {
    if (settings.autoLocationCache) {
      coordinates = settings.autoLocationCache;
    } else {
      activeSource = 'manual';
      fallbackActive = true;
    }
  } else if (settings.locationMode === 'mawaqit') {
    if (mawaqitData && mawaqitData.times && mawaqitData.times.fajr) {
      mawaqitConnected = true;
      if (mawaqitData.latitude !== undefined && mawaqitData.longitude !== undefined) {
        coordinates = {
          ...settings.manualLocation,
          latitude: mawaqitData.latitude,
          longitude: mawaqitData.longitude,
          cityName: mawaqitData.name,
        };
      }
    } else {
      // Seamless fallback to automatic or manual coordinates when Mawaqit is offline/unavailable
      fallbackActive = true;
      if (settings.mawaqit.fallbackMode === 'auto' && settings.autoLocationCache) {
        activeSource = 'auto';
        coordinates = settings.autoLocationCache;
      } else {
        activeSource = 'manual';
        coordinates = settings.manualLocation;
      }
    }
  }

  // Compute baseline astronomical times
  const astroTimes = calculateAstronomicalPrayerTimes(now, coordinates, settings);

  // If connected to Mawaqit, overlay Mawaqit Athan & Iqamah times
  let times: DailyPrayerTimes = astroTimes;
  if (mawaqitConnected && mawaqitData) {
    const mwAthan = {
      fajr: mawaqitData.times.fajr || astroTimes.fajr,
      sunrise: mawaqitData.times.sunrise || astroTimes.sunrise,
      dhuhr: mawaqitData.times.dhuhr || astroTimes.dhuhr,
      asr: mawaqitData.times.asr || astroTimes.asr,
      maghrib: mawaqitData.times.maghrib || astroTimes.maghrib,
      isha: mawaqitData.times.isha || astroTimes.isha,
    };
    const iqamah = resolveIqamahTimes(
      {
        fajr: mwAthan.fajr,
        dhuhr: mwAthan.dhuhr,
        asr: mwAthan.asr,
        maghrib: mwAthan.maghrib,
        isha: mwAthan.isha,
      },
      settings.iqamahOffsets,
      settings.jamaahPresetJson,
      mawaqitData.iqamah
    );
    const duhaOffset = settings.sunnahPrayers?.duhaOffsetMinutes || 20;
    const maghribMins = parseHHMMToMinutes(mwAthan.maghrib);
    const fajrMins = parseHHMMToMinutes(mwAthan.fajr);
    const nightSpan = ((fajrMins - maghribMins) % 1440 + 1440) % 1440;
    times = {
      date: astroTimes.date,
      ...mwAthan,
      duha: addMinutesToHHMM(mwAthan.sunrise, duhaOffset),
      midnight: addMinutesToHHMM(mwAthan.maghrib, Math.round(nightSpan / 2)),
      lastThird: addMinutesToHHMM(mwAthan.maghrib, Math.round((nightSpan * 2) / 3)),
      iqamah,
    };
  }

  const { nextPrayer, activeWindow } = evaluatePrayerScheduleStatus(
    now,
    times,
    settings.prayerWindowMinutes,
    coordinates.timezone
  );
  const hijriDate = calculateHijriDate(now, settings.hijriAdjustmentDays);

  const locationLabel =
    mawaqitConnected && mawaqitData?.name
      ? mawaqitData.name
      : coordinates.cityName
      ? `${coordinates.cityName}${coordinates.countryName ? `, ${coordinates.countryName}` : ''}`
      : `${coordinates.latitude.toFixed(4)}°, ${coordinates.longitude.toFixed(4)}°`;

  return {
    times,
    nextPrayer,
    activeWindow,
    hijriDate,
    activeSource,
    mawaqitConnected,
    fallbackActive,
    mosqueName: mawaqitConnected ? mawaqitData?.name : settings.mawaqit.mosqueName,
    locationLabel,
    coordinates,
    settings,
  };
}
