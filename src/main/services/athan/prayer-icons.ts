/**
 * Baglib — Customized Prayer Notification Icons
 *
 * Provides prayer-specific SVG icons and Electron NativeImage instances
 * for Fajr (dawn horizon), Sunrise (rising sun), Dhuhr (zenith sun),
 * Asr (afternoon sun), Maghrib (setting sun), and Isha (crescent moon & stars).
 */

import type { PrayerName } from '../../../shared/types/athan';

export const PRAYER_ICON_SVGS: Record<PrayerName, string> = {
  fajr: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#0f172a"/>
    <path d="M10 46 H54" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
    <path d="M18 46 A14 14 0 0 1 46 46" fill="#0284c7" opacity="0.85"/>
    <path d="M32 18 V26 M20 24 L25 29 M44 24 L39 29" stroke="#7dd3fc" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  sunrise: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#1e293b"/>
    <path d="M10 46 H54" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="38" r="12" fill="#f59e0b"/>
    <path d="M32 14 V22 M16 24 L21 29 M48 24 L43 29" stroke="#fde68a" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  dhuhr: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#0284c7"/>
    <circle cx="32" cy="32" r="13" fill="#fde047"/>
    <path d="M32 10 V15 M32 49 V54 M10 32 H15 M49 32 H54 M17 17 L21 21 M43 43 L47 47 M47 17 L43 21 M21 43 L17 47" stroke="#fef08a" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  asr: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#7c2d12"/>
    <circle cx="28" cy="30" r="12" fill="#fb923c"/>
    <path d="M12 48 H52" stroke="#fdba74" stroke-width="3" stroke-linecap="round"/>
    <path d="M28 12 V16 M12 30 H16 M42 30 H48" stroke="#fed7aa" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  maghrib: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#31102f"/>
    <path d="M10 44 H54" stroke="#f43f5e" stroke-width="3" stroke-linecap="round"/>
    <path d="M18 44 A14 14 0 0 1 46 44" fill="#e11d48"/>
    <path d="M16 50 H48" stroke="#fda4af" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  isha: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="16" fill="#090d16"/>
    <path d="M38 16 A16 16 0 1 0 50 40 A13 13 0 1 1 38 16 Z" fill="#818cf8"/>
    <circle cx="22" cy="22" r="2" fill="#e0e7ff"/>
    <circle cx="46" cy="20" r="1.5" fill="#e0e7ff"/>
  </svg>`,
};

export function getPrayerIconDataUrl(prayer: PrayerName): string {
  const svg = PRAYER_ICON_SVGS[prayer] || PRAYER_ICON_SVGS.fajr;
  const base64 = Buffer.from(svg, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
