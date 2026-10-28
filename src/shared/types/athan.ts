/**
 * Baglib — Comprehensive Offline-First Athan & Prayer Times Domain Contracts
 */

export type MandatoryPrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export type OptionalPrayerName = 'duha' | 'midnight' | 'lastThird';
export type AllPrayerName = PrayerName | OptionalPrayerName;

export type CalculationMethodId =
  | 'MWL'
  | 'ISNA'
  | 'Egypt'
  | 'Makkah'
  | 'Karachi'
  | 'Tehran'
  | 'Dubai'
  | 'Kuwait'
  | 'Qatar'
  | 'Singapore'
  | 'Turkey'
  | 'Custom';

export type AsrJuristicMethod = 'standard' | 'hanafi';

export type HighLatitudeRule = 'none' | 'middleOfTheNight' | 'oneSeventh' | 'angleBased';

export type LocationSourceMode = 'manual' | 'auto' | 'mawaqit';

export interface CalculationMethodPreset {
  id: CalculationMethodId;
  nameEn: string;
  nameAr: string;
  fajrAngle: number;
  ishaAngle: number;
  ishaIntervalMinutes?: number; // e.g., 90 mins after Maghrib for Umm Al-Qura & Qatar
  maghribAngle?: number; // e.g., 4.5 deg for Tehran
}

export interface CoordinatesConfig {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  cityName?: string;
  countryName?: string;
}

export interface MawaqitConfig {
  enabled: boolean;
  mosqueIdOrSlug: string;
  mosqueName?: string;
  fallbackMode: 'auto' | 'manual';
}

export interface SunnahPrayersConfig {
  duha: boolean;
  tahajjud: boolean;
  midnight: boolean;
  duhaOffsetMinutes: number;
}

export interface AthanNotificationsConfig {
  enabled: boolean;
  preReminderEnabled: boolean;
  preReminderMinutes: number;
  modalDialogEnabled: boolean;
  enabledPrayers: Record<PrayerName, boolean>;
}

export interface AthanAudioConfig {
  enabled: boolean;
  volume: number; // 0.0 to 1.0
  muted: boolean;
  soundPreset: 'makkah-short' | 'madinah-short' | 'takbeer-only' | 'custom';
  customAudioPath?: string;
}

export interface AthanLocalizationConfig {
  forceArabicWidgets: boolean;
}

/**
 * Custom Jama'ah schedule JSON structure:
 * Values can be fixed "HH:mm" strings (e.g. "05:30", "13:15") or relative "+15" minute strings.
 */
export type JamaahPresetSchedule = Partial<Record<MandatoryPrayerName, string>>;

export interface AthanSettings {
  locationMode: LocationSourceMode;
  manualLocation: CoordinatesConfig;
  autoLocationCache?: CoordinatesConfig & { fetchedAt: string };
  mawaqit: MawaqitConfig;
  calculationMethod: CalculationMethodId;
  customFajrAngle: number;
  customIshaAngle: number;
  asrMethod: AsrJuristicMethod;
  highLatitudeRule: HighLatitudeRule;
  sunnahPrayers: SunnahPrayersConfig;
  adjustments: Record<PrayerName, number>;
  iqamahOffsets: Record<MandatoryPrayerName, number>;
  jamaahPresetJson: string;
  hijriAdjustmentDays: number;
  prayerWindowMinutes: number;
  notifications: AthanNotificationsConfig;
  audio: AthanAudioConfig;
  localization: AthanLocalizationConfig;
}

export interface DailyPrayerTimes {
  date: string; // YYYY-MM-DD
  fajr: string; // HH:mm
  sunrise: string; // HH:mm
  dhuhr: string; // HH:mm
  asr: string; // HH:mm
  maghrib: string; // HH:mm
  isha: string; // HH:mm
  duha?: string; // HH:mm
  midnight?: string; // HH:mm
  lastThird?: string; // HH:mm (Tahajjud / Qiyam Al-Layl)
  iqamah: Record<MandatoryPrayerName, string>; // HH:mm for each congregational prayer
}

export interface HijriDateInfo {
  day: number;
  month: number; // 1..12
  year: number;
  monthNameAr: string;
  monthNameEn: string;
  formattedAr: string;
  formattedEn: string;
  adjustmentDays: number;
}

export interface NextPrayerInfo {
  name: PrayerName;
  time: string; // HH:mm
  iqamahTime?: string; // HH:mm
  isTomorrow: boolean;
  remainingSeconds: number;
  countdownFormatted: string; // HH:mm:ss
}

export interface ActivePrayerWindow {
  prayer: PrayerName;
  enteredAt: string; // HH:mm
  iqamahTime?: string; // HH:mm
  elapsedMinutes: number;
  windowMinutes: number;
}

export interface PrayerStatusSnapshot {
  times: DailyPrayerTimes;
  nextPrayer: NextPrayerInfo;
  activeWindow: ActivePrayerWindow | null;
  hijriDate: HijriDateInfo;
  activeSource: LocationSourceMode;
  mawaqitConnected: boolean;
  fallbackActive: boolean;
  mosqueName?: string;
  locationLabel: string;
  coordinates: CoordinatesConfig;
  settings: AthanSettings;
}

export interface AthanAlertPayload {
  id: string;
  type: 'athan' | 'pre-reminder';
  prayer: PrayerName;
  scheduledTime: string;
  iqamahTime?: string;
  minutesRemaining?: number;
  timestamp: string;
}

export interface MawaqitMosqueData {
  uuid: string;
  name: string;
  slug?: string;
  latitude?: number;
  longitude?: number;
  times: Record<PrayerName, string>;
  iqamah: Partial<Record<MandatoryPrayerName, string>>;
  fetchedAt: string;
}

export interface AthanAPI {
  getState: () => Promise<PrayerStatusSnapshot>;
  updateSettings: (partial: Partial<AthanSettings>) => Promise<PrayerStatusSnapshot>;
  detectAutoLocation: () => Promise<{ ok: boolean; location?: CoordinatesConfig; error?: string; state: PrayerStatusSnapshot }>;
  syncMawaqit: (mosqueIdOrSlug?: string) => Promise<{ ok: boolean; mosque?: MawaqitMosqueData; error?: string; state: PrayerStatusSnapshot }>;
  triggerTestAlert: (prayer?: PrayerName, type?: 'athan' | 'pre-reminder') => Promise<AthanAlertPayload>;
  toggleMiniWidget: () => Promise<{ open: boolean }>;
  chooseRecording: () => Promise<PrayerStatusSnapshot | null>;
  onAlert: (callback: (alert: AthanAlertPayload) => void) => () => void;
  onStateChanged: (callback: (state: PrayerStatusSnapshot) => void) => () => void;
}
