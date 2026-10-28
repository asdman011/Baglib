/**
 * Baglib — Automatic Geolocation & Mawaqit Mosque Integration Service
 *
 * - Automatic Geolocation: IP-based / OS geolocation with seamless fallback to manual coordinates.
 * - Mawaqit Mosque Integration: Fetches real-time local mosque prayer times and Iqamah times
 *   from Mawaqit API / mosque page with graceful offline fallback.
 */

import type {
  CoordinatesConfig,
  MandatoryPrayerName,
  MawaqitMosqueData,
  PrayerName,
} from '../../../shared/types/athan';

export type FetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise< unknown>;
  text: () => Promise<string>;
}>;

const defaultFetch: FetchLike = async (url, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Detects user's coordinates via IP geolocation endpoints with automatic fallback.
 */
export async function detectAutomaticLocation(
  fetchFn: FetchLike = defaultFetch
): Promise<{ ok: boolean; location?: CoordinatesConfig; error?: string }> {
  const endpoints = [
    'https://ipapi.co/json/',
    'http://ip-api.com/json/?fields=status,country,city,lat,lon,timezone',
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchFn(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Baglib-Desktop/1.0',
        },
      });
      if (!response.ok) continue;
      const raw = (await response.json()) as Record<string, unknown>;
      const lat = typeof raw.latitude === 'number' ? raw.latitude : typeof raw.lat === 'number' ? raw.lat : NaN;
      const lon = typeof raw.longitude === 'number' ? raw.longitude : typeof raw.lon === 'number' ? raw.lon : NaN;

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const timezone =
          typeof raw.timezone === 'string' && raw.timezone.trim()
            ? raw.timezone.trim()
            : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const cityName = typeof raw.city === 'string' ? raw.city : undefined;
        const countryName =
          typeof raw.country_name === 'string'
            ? raw.country_name
            : typeof raw.country === 'string'
            ? raw.country
            : undefined;

        return {
          ok: true,
          location: {
            latitude: lat,
            longitude: lon,
            elevation: 0,
            timezone,
            cityName,
            countryName,
          },
        };
      }
    } catch {
      // Try next geolocation provider
    }
  }

  return {
    ok: false,
    error: 'Automatic geolocation unavailable while offline; using manual coordinates fallback.',
  };
}

function normalizeTimeToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':').map((n) => parseInt(n, 10));
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  if (/^[+-]?\d+$/.test(trimmed)) {
    return trimmed.startsWith('+') || trimmed.startsWith('-') ? trimmed : `+${trimmed}`;
  }
  return undefined;
}

/**
 * Parses Mawaqit API JSON payload or embedded `confData` object into `MawaqitMosqueData`.
 */
export function parseMawaqitPayload(
  raw: Record<string, unknown>,
  fallbackIdOrSlug: string
): MawaqitMosqueData | null {
  if (!raw || typeof raw !== 'object') return null;

  const timesArray = Array.isArray(raw.times) ? raw.times : [];
  const iqamaArray = Array.isArray(raw.iqama) ? raw.iqama : [];

  // Mawaqit `times` array is typically [fajr, dhuhr, asr, maghrib, isha] or 6-element [fajr, sunrise, dhuhr, asr, maghrib, isha]
  let fajr: string | undefined;
  let sunrise: string | undefined;
  let dhuhr: string | undefined;
  let asr: string | undefined;
  let maghrib: string | undefined;
  let isha: string | undefined;

  if (timesArray.length >= 6) {
    fajr = normalizeTimeToken(timesArray[0]);
    sunrise = normalizeTimeToken(timesArray[1]);
    dhuhr = normalizeTimeToken(timesArray[2]);
    asr = normalizeTimeToken(timesArray[3]);
    maghrib = normalizeTimeToken(timesArray[4]);
    isha = normalizeTimeToken(timesArray[5]);
  } else if (timesArray.length === 5) {
    fajr = normalizeTimeToken(timesArray[0]);
    sunrise = normalizeTimeToken(raw.shuruq || raw.sunrise || '06:00');
    dhuhr = normalizeTimeToken(timesArray[1]);
    asr = normalizeTimeToken(timesArray[2]);
    maghrib = normalizeTimeToken(timesArray[3]);
    isha = normalizeTimeToken(timesArray[4]);
  } else if (raw.fajr && raw.dhuhr && raw.asr && raw.maghrib && raw.isha) {
    fajr = normalizeTimeToken(raw.fajr);
    sunrise = normalizeTimeToken(raw.sunrise || raw.shuruq || '06:00');
    dhuhr = normalizeTimeToken(raw.dhuhr);
    asr = normalizeTimeToken(raw.asr);
    maghrib = normalizeTimeToken(raw.maghrib);
    isha = normalizeTimeToken(raw.isha);
  }

  if (!fajr || !dhuhr || !asr || !maghrib || !isha) {
    return null;
  }

  const iqamah: Partial<Record<MandatoryPrayerName, string>> = {};
  const mandatoryOrder: MandatoryPrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  if (iqamaArray.length >= 5) {
    mandatoryOrder.forEach((p, idx) => {
      const token = normalizeTimeToken(iqamaArray[idx]);
      if (token) iqamah[p] = token;
    });
  } else if (raw.iqamah && typeof raw.iqamah === 'object') {
    const iqObj = raw.iqamah as Record<string, unknown>;
    for (const p of mandatoryOrder) {
      const token = normalizeTimeToken(iqObj[p]);
      if (token) iqamah[p] = token;
    }
  }

  const times: Record<PrayerName, string> = {
    fajr,
    sunrise: sunrise || '06:00',
    dhuhr,
    asr,
    maghrib,
    isha,
  };

  return {
    uuid: typeof raw.uuid === 'string' && raw.uuid ? raw.uuid : fallbackIdOrSlug,
    name: typeof raw.name === 'string' && raw.name ? raw.name : fallbackIdOrSlug,
    slug: typeof raw.slug === 'string' ? raw.slug : fallbackIdOrSlug,
    latitude: typeof raw.latitude === 'number' ? raw.latitude : undefined,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : undefined,
    times,
    iqamah,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetches live mosque prayer & Iqamah times from Mawaqit by mosque UUID, slug, or search term.
 * Never throws; returns `{ ok: false, error }` when offline or unreachable so caller can fall back gracefully.
 */
export async function fetchMawaqitMosqueTimes(
  mosqueIdOrSlug: string,
  fetchFn: FetchLike = defaultFetch
): Promise<{ ok: boolean; mosque?: MawaqitMosqueData; error?: string }> {
  const cleaned = (mosqueIdOrSlug || '').trim();
  if (!cleaned) {
    return { ok: false, error: 'Mosque ID or slug is empty' };
  }

  // 1. Try Mawaqit JSON API endpoint
  const apiUrls = [
    `https://mawaqit.net/api/2.0/mosque/search?word=${encodeURIComponent(cleaned)}`,
    `https://mawaqit.net/en/${encodeURIComponent(cleaned)}`,
  ];

  for (const url of apiUrls) {
    try {
      const response = await fetchFn(url, {
        headers: {
          Accept: 'application/json, text/html',
          'User-Agent': 'Baglib-Desktop/1.0',
        },
      });
      if (!response.ok) continue;

      if (url.includes('/api/2.0/mosque/search')) {
        const json = await response.json();
        const first = Array.isArray(json) ? json[0] : json;
        if (first && typeof first === 'object') {
          const parsed = parseMawaqitPayload(first as Record<string, unknown>, cleaned);
          if (parsed) return { ok: true, mosque: parsed };
        }
      } else {
        const html = await response.text();
        const confMatch = /let\s+confData\s*=\s*(\{[\s\S]*?\});/.exec(html);
        if (confMatch && confMatch[1]) {
          const confObj = JSON.parse(confMatch[1]) as Record<string, unknown>;
          const parsed = parseMawaqitPayload(confObj, cleaned);
          if (parsed) return { ok: true, mosque: parsed };
        }
      }
    } catch {
      // Continue to fallback
    }
  }

  return {
    ok: false,
    error: 'Mawaqit mosque service unreachable or offline; falling back to local astronomical calculation.',
  };
}
