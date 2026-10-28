/**
 * Baglib Main Process — Astronomical Prayer Time & Hijri Calculator Module
 */

export {
  CALCULATION_METHOD_PRESETS,
  HIJRI_MONTHS_AR,
  HIJRI_MONTHS_EN,
  PRAYER_LABELS,
  DEFAULT_ATHAN_SETTINGS,
  julianDate,
  sunPosition,
  resolveTimezoneOffsetHours,
  formatHoursToHHMM,
  parseHHMMToMinutes,
  addMinutesToHHMM,
  nightPortion,
  resolveIqamahTimes,
  calculateAstronomicalPrayerTimes,
  calculateHijriDate,
  formatCountdownSeconds,
  evaluatePrayerScheduleStatus,
  buildPrayerStatusSnapshot,
} from '../../../shared/athan-calculator';
