import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  buildPrayerStatusSnapshot,
  calculateAstronomicalPrayerTimes,
  calculateHijriDate,
  DEFAULT_ATHAN_SETTINGS,
  evaluatePrayerScheduleStatus,
  parseHHMMToMinutes,
  resolveIqamahTimes,
  resolveDefaultCalculationMethodForLocation,
} from '../../src/shared/athan-calculator';
import {
  type FetchLike,
  parseMawaqitPayload,
  fetchMawaqitMosqueTimes,
} from '../../src/main/services/athan/location-mawaqit.service';
import { getPrayerIconDataUrl, PRAYER_ICON_SVGS } from '../../src/main/services/athan/prayer-icons';
import {
  createSoothingAthanWavBuffer,
  ensureLocalAthanAudioFile,
} from '../../src/main/services/athan/athan-audio-generator';
import { AthanService } from '../../src/main/services/athan/athan.service';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import type { AthanAlertPayload, AthanSettings } from '../../src/shared/types/athan';

test('Prayer Calculations: manual coordinates, custom Fajr/Isha angles, Asr Shafi vs Hanafi, and Sunnah times', () => {
  const date = new Date('2026-03-20T12:00:00Z'); // Equinox in Makkah
  const coords = {
    latitude: 21.4225,
    longitude: 39.8262,
    elevation: 277,
    timezone: 'Asia/Riyadh',
  };

  const standardSettings: AthanSettings = {
    ...DEFAULT_ATHAN_SETTINGS,
    calculationMethod: 'Makkah',
    asrMethod: 'standard',
  };
  const hanafiSettings: AthanSettings = {
    ...standardSettings,
    asrMethod: 'hanafi',
  };

  const standardTimes = calculateAstronomicalPrayerTimes(date, coords, standardSettings);
  const hanafiTimes = calculateAstronomicalPrayerTimes(date, coords, hanafiSettings);

  // Verify chronological ordering of the 6 primary times
  const fajrMin = parseHHMMToMinutes(standardTimes.fajr);
  const sunriseMin = parseHHMMToMinutes(standardTimes.sunrise);
  const dhuhrMin = parseHHMMToMinutes(standardTimes.dhuhr);
  const asrStandardMin = parseHHMMToMinutes(standardTimes.asr);
  const asrHanafiMin = parseHHMMToMinutes(hanafiTimes.asr);
  const maghribMin = parseHHMMToMinutes(standardTimes.maghrib);
  const ishaMin = parseHHMMToMinutes(standardTimes.isha);

  assert.ok(fajrMin < sunriseMin, 'Fajr must precede Sunrise');
  assert.ok(sunriseMin < dhuhrMin, 'Sunrise must precede Dhuhr');
  assert.ok(dhuhrMin < asrStandardMin, 'Dhuhr must precede Asr');
  assert.ok(asrStandardMin < maghribMin, 'Asr must precede Maghrib');
  assert.ok(maghribMin < ishaMin, 'Maghrib must precede Isha');

  // Hanafi Asr (2x shadow) must be significantly later than Shafi/Standard Asr (1x shadow)
  assert.ok(
    asrHanafiMin > asrStandardMin + 25,
    `Expected Hanafi Asr (${hanafiTimes.asr}) to be >25m later than Standard Asr (${standardTimes.asr})`
  );

  // Custom Fajr and Isha depression angles adjustment
  const custom15 = calculateAstronomicalPrayerTimes(date, coords, {
    ...standardSettings,
    calculationMethod: 'Custom',
    customFajrAngle: 15,
    customIshaAngle: 15,
  });
  const custom19 = calculateAstronomicalPrayerTimes(date, coords, {
    ...standardSettings,
    calculationMethod: 'Custom',
    customFajrAngle: 19.5,
    customIshaAngle: 19.5,
  });

  // Larger Fajr depression angle means earlier Fajr; larger Isha angle means later Isha
  assert.ok(
    parseHHMMToMinutes(custom19.fajr) < parseHHMMToMinutes(custom15.fajr),
    '19.5° Fajr angle must yield an earlier Fajr than 15°'
  );
  assert.ok(
    parseHHMMToMinutes(custom19.isha) > parseHHMMToMinutes(custom15.isha),
    '19.5° Isha angle must yield a later Isha than 15°'
  );

  // Optional Sunnah prayers: Duha (after sunrise), Midnight, and Tahajjud (last third of night)
  const duhaMin = parseHHMMToMinutes(standardTimes.duha);
  assert.equal(duhaMin - sunriseMin, DEFAULT_ATHAN_SETTINGS.sunnahPrayers.duhaOffsetMinutes);
  assert.ok(parseHHMMToMinutes(standardTimes.midnight) >= 0);
  assert.ok(parseHHMMToMinutes(standardTimes.lastThird) >= 0);
});

test('Prayer Calculations: high-latitude correction rules prevent NaN/extreme times in northern summer', () => {
  const summerSolstice = new Date('2026-06-21T12:00:00Z');
  const osloCoords = {
    latitude: 59.9139,
    longitude: 10.7522,
    elevation: 23,
    timezone: 'Europe/Oslo',
  };

  for (const rule of ['angleBased', 'middleOfTheNight', 'oneSeventh'] as const) {
    const times = calculateAstronomicalPrayerTimes(summerSolstice, osloCoords, {
      ...DEFAULT_ATHAN_SETTINGS,
      calculationMethod: 'MWL',
      highLatitudeRule: rule,
    });

    const fajrMin = parseHHMMToMinutes(times.fajr);
    const sunriseMin = parseHHMMToMinutes(times.sunrise);
    const maghribMin = parseHHMMToMinutes(times.maghrib);
    const ishaMin = parseHHMMToMinutes(times.isha);

    assert.ok(fajrMin > 0 && fajrMin < sunriseMin, `Valid Fajr under ${rule}`);
    assert.ok(ishaMin !== maghribMin, `Valid Isha under ${rule}`);
  }
});

test('Hijri Date & Jamaah Preset Resolution: supports +/- day adjustments and JSON presets', () => {
  const refDate = new Date('2026-03-01T12:00:00Z');
  const h0 = calculateHijriDate(refDate, 0);
  const hPlus1 = calculateHijriDate(refDate, 1);
  const hMinus1 = calculateHijriDate(refDate, -1);

  assert.notEqual(h0.formattedAr, hPlus1.formattedAr);
  assert.notEqual(h0.formattedEn, hMinus1.formattedEn);
  assert.equal(hPlus1.adjustmentDays, 1);

  const athanTimes = {
    fajr: '05:00',
    dhuhr: '12:15',
    asr: '15:40',
    maghrib: '18:10',
    isha: '19:40',
  };

  const iqamah = resolveIqamahTimes(
    athanTimes,
    {
      fajr: 20,
      dhuhr: 15,
      asr: 15,
      maghrib: 10,
      isha: 15,
    },
    JSON.stringify({
      fajr: '05:30',
      isha: '+25',
    })
  );

  assert.equal(iqamah.fajr, '05:30', 'Fixed JSON time overrides offset');
  assert.equal(iqamah.dhuhr, '12:30', 'Manual offset +15m applied');
  assert.equal(iqamah.isha, '20:05', 'JSON relative offset +25m applied');
});

test('Mawaqit Integration & Offline Fallback: parses Mawaqit data and falls back gracefully when offline', async () => {
  const sampleMawaqitJson = {
    uuid: 'mosque-makkah-1',
    name: 'Masjid Al-Haram Test',
    latitude: 21.4225,
    longitude: 39.8262,
    times: ['04:55', '12:20', '15:45', '18:15', '19:45'],
    shuruq: '06:12',
    iqama: ['+20', '+15', '+15', '+10', '20:05'],
  };

  const parsed = parseMawaqitPayload(sampleMawaqitJson, 'masjid-haram');
  assert.ok(parsed);
  assert.equal(parsed.name, 'Masjid Al-Haram Test');
  assert.equal(parsed.times.fajr, '04:55');
  assert.equal(parsed.times.sunrise, '06:12');
  assert.equal(parsed.iqamah.fajr, '+20');
  assert.equal(parsed.iqamah.isha, '20:05');

  // Verify snapshot uses Mawaqit when connected and resolves +20 Iqamah to 05:15
  const mawaqitSettings: AthanSettings = {
    ...DEFAULT_ATHAN_SETTINGS,
    locationMode: 'mawaqit',
    mawaqit: {
      enabled: true,
      mosqueIdOrSlug: 'masjid-haram',
      fallbackMode: 'manual',
    },
  };

  const connectedSnapshot = buildPrayerStatusSnapshot(
    mawaqitSettings,
    new Date('2026-03-20T10:00:00Z'),
    parsed
  );
  assert.equal(connectedSnapshot.activeSource, 'mawaqit');
  assert.equal(connectedSnapshot.mawaqitConnected, true);
  assert.equal(connectedSnapshot.fallbackActive, false);
  assert.equal(connectedSnapshot.times.fajr, '04:55');
  assert.equal(connectedSnapshot.times.iqamah.fajr, '05:15');
  assert.equal(connectedSnapshot.times.iqamah.isha, '20:05');

  // Simulate offline / unreachable Mawaqit endpoint
  const offlineResult = await fetchMawaqitMosqueTimes('masjid-haram', async () => {
    throw new Error('Network disconnected');
  });
  assert.equal(offlineResult.ok, false);

  // Verify snapshot gracefully falls back to astronomical calculations without crashing
  const fallbackSnapshot = buildPrayerStatusSnapshot(
    mawaqitSettings,
    new Date('2026-03-20T10:00:00Z'),
    null
  );
  assert.equal(fallbackSnapshot.activeSource, 'manual');
  assert.equal(fallbackSnapshot.mawaqitConnected, false);
  assert.equal(fallbackSnapshot.fallbackActive, true);
  assert.ok(parseHHMMToMinutes(fallbackSnapshot.times.fajr) > 0);
});

test('Notifications, Active Prayer Window & Local Audio: triggers alerts, icons, and active prayer banner', () => {
  // 1. Verify prayer icons exist for all prayers and encode to valid SVG data URLs
  for (const prayer of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
    assert.ok(PRAYER_ICON_SVGS[prayer].includes('<svg'));
    const dataUrl = getPrayerIconDataUrl(prayer);
    assert.ok(dataUrl.startsWith('data:image/svg+xml;base64,'));
  }

  // 2. Verify local WAV audio buffer generation and file persistence
  const wavBuf = createSoothingAthanWavBuffer();
  assert.equal(wavBuf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wavBuf.toString('ascii', 8, 12), 'WAVE');
  const tmpAudioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-athan-audio-'));
  const filePath = ensureLocalAthanAudioFile(tmpAudioDir);
  assert.ok(fs.existsSync(filePath));
  fs.rmSync(tmpAudioDir, { recursive: true, force: true });

  // 3. Verify Active Prayer Window ("Time for [X] Prayer") and Next Prayer countdown
  const daily = calculateAstronomicalPrayerTimes(
    new Date('2026-03-20T12:00:00Z'),
    DEFAULT_ATHAN_SETTINGS.manualLocation,
    DEFAULT_ATHAN_SETTINGS
  );
  const [asrH, asrM] = daily.asr.split(':').map(Number);

  // Construct a Date whose local hours/minutes are 5 minutes after Asr
  const nowDuringAsrWindow = new Date(2026, 2, 20, asrH, asrM + 5, 0);
  const { nextPrayer, activeWindow } = evaluatePrayerScheduleStatus(
    nowDuringAsrWindow,
    daily,
    20
  );
  assert.ok(activeWindow, 'Active prayer window should be active 5m after Asr');
  assert.equal(activeWindow.prayer, 'asr');
  assert.equal(activeWindow.elapsedMinutes, 5);
  assert.equal(activeWindow.windowMinutes, 20);
  assert.equal(nextPrayer.name, 'maghrib');
  assert.match(nextPrayer.countdownFormatted, /^\d{2}:\d{2}:\d{2}$/);

  // 4. Verify AthanService SQLite persistence, pre-prayer reminders, and test alert emission
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const settingsRepo = new SqliteSettingsRepository(db);

  const notificationsShown: Array<{ title: string; body: string; prayer: string; type: string }> = [];
  const broadcastedAlerts: AthanAlertPayload[] = [];

  let simulatedClock = new Date(2026, 2, 20, asrH, asrM, 0);
  const service = new AthanService(
    settingsRepo,
    () => simulatedClock,
    undefined,
    {
      showNotification: (opts) => notificationsShown.push(opts),
      broadcastAlert: (alert) => broadcastedAlerts.push(alert),
      broadcastState: () => {},
    }
  );

  const updatedState = service.updateSettings({
    asrMethod: 'hanafi',
    localization: {
      forceArabicWidgets: true,
    },
  });
  assert.equal(updatedState.settings.asrMethod, 'hanafi');
  assert.equal(updatedState.settings.localization.forceArabicWidgets, true);

  // Trigger test alert with forceArabicWidgets = true
  const alert = service.triggerTestAlert('asr', 'athan');
  assert.equal(broadcastedAlerts.length, 1);
  assert.equal(alert.prayer, 'asr');
  assert.equal(notificationsShown.length, 1);
  assert.ok(notificationsShown[0].title.includes('حان الآن وقت صلاة العصر'));

  // Test pre-prayer reminder (15m before Maghrib)
  const [magH, magM] = updatedState.times.maghrib.split(':').map(Number);
  const magTotalMins = magH * 60 + magM - 15;
  simulatedClock = new Date(`2026-03-20T${String(Math.floor(magTotalMins / 60)).padStart(2, '0')}:${String(magTotalMins % 60).padStart(2, '0')}:00+03:00`);
  const dueAlerts = service.checkReminders();
  assert.equal(dueAlerts.length, 1);
  assert.equal(dueAlerts[0].type, 'pre-reminder');
  assert.equal(dueAlerts[0].prayer, 'maghrib');

  db.close();
});

test('scheduled Athan uses the configured timezone and audio remains independent of desktop notifications', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
  let clock = new Date('2026-10-26T00:00:00Z');
  const alerts: AthanAlertPayload[] = [];
  let notifications = 0;
  const service = new AthanService(new SqliteSettingsRepository(db), () => clock, undefined, {
    broadcastAlert: alert => alerts.push(alert), broadcastState: () => {}, showNotification: () => notifications++,
  });
  const state = service.updateSettings({ manualLocation: { ...DEFAULT_ATHAN_SETTINGS.manualLocation, timezone: 'Asia/Tokyo' }, notifications: { ...DEFAULT_ATHAN_SETTINGS.notifications, enabled: false } });
  clock = new Date(`2026-10-26T${state.times.asr}:00+09:00`);
  assert.equal(service.checkReminders()[0]?.prayer, 'asr');
  assert.equal(service.checkReminders().length, 0, 'same minute never repeats the alert');
  assert.equal(alerts.length, 1);
  assert.equal(notifications, 0);
  const snapshot = service.getState();
  assert.equal(snapshot.activeWindow?.prayer, 'asr');
  db.close();
});

test('Calculation Method Auto-Resolver: maps regions and coordinates to regional authority presets', () => {
  // Egypt (Cairo / Africa/Cairo)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'Egypt', timezone: 'Africa/Cairo', cityName: 'Cairo' }),
    'Egypt'
  );
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ timezone: 'Africa/Cairo' }),
    'Egypt'
  );
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'مصر' }),
    'Egypt'
  );

  // Saudi Arabia (Makkah / Asia/Riyadh)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'Saudi Arabia', timezone: 'Asia/Riyadh' }),
    'Makkah'
  );

  // UAE (Dubai)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'United Arab Emirates', timezone: 'Asia/Dubai' }),
    'Dubai'
  );

  // Qatar
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'Qatar', timezone: 'Asia/Qatar' }),
    'Qatar'
  );

  // Kuwait
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'Kuwait', timezone: 'Asia/Kuwait' }),
    'Kuwait'
  );

  // Turkey (Diyanet)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'Turkey', timezone: 'Europe/Istanbul' }),
    'Turkey'
  );

  // Singapore / Malaysia (MUIS)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'Singapore', timezone: 'Asia/Singapore' }),
    'Singapore'
  );

  // Pakistan / India (Karachi)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'Pakistan', timezone: 'Asia/Karachi' }),
    'Karachi'
  );

  // North America (ISNA)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'United States', timezone: 'America/New_York' }),
    'ISNA'
  );

  // Iran (Tehran)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'Iran', timezone: 'Asia/Tehran' }),
    'Tehran'
  );

  // Geographic bounding box fallback (e.g. lat/lng in Egypt without country name)
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ latitude: 30.0626, longitude: 31.2497 }),
    'Egypt'
  );

  // Default fallback for general Europe/unmapped
  assert.equal(
    resolveDefaultCalculationMethodForLocation({ countryName: 'United Kingdom', timezone: 'Europe/London' }),
    'MWL'
  );
  assert.equal(resolveDefaultCalculationMethodForLocation(null), 'MWL');
});

test('AthanService: auto-detecting Cairo automatically adopts Egypt method, resolving 12m/5m discrepancies', async () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
  const repo = new SqliteSettingsRepository(db);

  const mockCairoFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: 'success',
      country: 'Egypt',
      country_name: 'Egypt',
      city: 'Cairo',
      lat: 30.06263,
      lon: 31.24967,
      timezone: 'Africa/Cairo',
    }),
    text: async () => '',
  });

  const now = new Date('2026-10-28T07:00:00Z');
  const service = new AthanService(repo, () => now, mockCairoFetch);

  // Initial settings without location detection
  const initial = service.getSettings();
  assert.equal(initial.calculationMethod, 'Makkah', 'Initial Makkah default for Makkah coords');

  // Trigger auto-location detection for Cairo
  const result = await service.detectAutoLocation();
  assert.ok(result.ok);
  assert.equal(result.location?.cityName, 'Cairo');

  // State should now automatically use 'Egypt' calculation method!
  const state = service.getState();
  assert.equal(state.settings.calculationMethod, 'Egypt', 'Auto-detected Cairo adopts Egypt method');
  assert.equal(state.times.fajr, '05:38', 'Fajr matches official Egyptian Survey (05:38, not 05:43)');
  assert.equal(state.times.isha, '19:30', 'Isha matches official Egyptian Survey (19:30, not 19:42)');
  assert.equal(state.times.sunrise, '07:06');
  assert.equal(state.times.dhuhr, '12:39');

  // Manual minute adjustments: verify fine-tuning offsets work as expected
  const adjustedState = service.updateSettings({
    adjustments: {
      ...state.settings.adjustments,
      asr: -1,
      maghrib: -1,
    },
  });
  assert.equal(adjustedState.times.asr, '15:47', 'Asr offset by -1 min yields 15:47');
  assert.equal(adjustedState.times.maghrib, '18:11', 'Maghrib offset by -1 min yields 18:11');

  // Explicit user override: if user explicitly sets calculationMethod, methodConfiguredByUser prevents overwrite
  service.updateSettings({
    calculationMethod: 'ISNA',
    methodConfiguredByUser: true,
  });
  assert.equal(service.getSettings().calculationMethod, 'ISNA');

  // Re-detecting auto-location should NOT overwrite user's explicit choice
  await service.detectAutoLocation();
  assert.equal(service.getSettings().calculationMethod, 'ISNA', 'Preserves explicit user choice');

  db.close();
});
