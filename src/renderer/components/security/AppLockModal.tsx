import { errorMessage } from '../../../shared/errors';
/**
 * Baglib — App Lock & OS Biometrics Security Modal (KEY-149)
 *
 * Implements Koodo Reader security architecture:
 * - Windows Hello & macOS Touch ID biometric authentication
 * - Master PIN fallback with PBKDF2 verification
 * - Configurable inactivity timeouts and private shelf isolation
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  Lock,
  Unlock,
  Key,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { translations } from '../../translations';
import type {
  BiometricCapability,
  AppLockConfig,
  AppLockState,
} from '../../../shared/types/app-lock';

interface AppLockModalProps {
  isOpen: boolean;
  isLockScreen?: boolean; // True if blocking UI until unlocked
  onClose: () => void;
  onUnlocked?: () => void;
  lang: 'ar' | 'en';
}

export const AppLockModal: React.FC<AppLockModalProps> = ({
  isOpen,
  isLockScreen = false,
  onClose,
  onUnlocked,
  lang,
}) => {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  const [config, setConfig] = useState<AppLockConfig>({
    enabled: false,
    biometricsEnabled: true,
    hasPin: false,
    lockTimeoutMinutes: 15,
    lockPrivateShelvesOnly: false,
  });

  const [biometricCapability, setBiometricCapability] = useState<BiometricCapability | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [authenticating, setAuthenticating] = useState(false);

  const loadSecurityState = async () => {
    try {
      if ((window).electronAPI?.appLock) {
        const [loadedConfig, cap] = await Promise.all([
          (window).electronAPI.appLock.getLockConfig(),
          (window).electronAPI.appLock.getBiometricCapability(),
        ]);
        setConfig(loadedConfig);
        setBiometricCapability(cap);
      }
    } catch (err) {
      console.error('Failed to load security state:', err);
    }
  };

  const [previousLockVisibility, setPreviousLockVisibility] = useState<readonly unknown[] | null>(null);
  const inputsLockVisibility = [isOpen, isLockScreen];
  if (previousLockVisibility === null || inputsLockVisibility.some((value, index) => !Object.is(value, previousLockVisibility[index]))) {
    setPreviousLockVisibility(inputsLockVisibility);
    if (isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      setPinInput('');
      setPinConfirmInput('');
      setIsSettingPin(false);
    }
  }
  useEffect(() => {
    if (isOpen) {
      let alive = true;
      const security = window.electronAPI.appLock;
      void Promise.all([security.getLockConfig(), security.getBiometricCapability()]).then(([loadedConfig, capability]) => {
        if (!alive) return;
        setConfig(loadedConfig); setBiometricCapability(capability);
        if (isLockScreen && capability.available) void handleBiometricPrompt(capability);
      }).catch(console.warn);
      return () => { alive = false; };


    }
  }, [isOpen, isLockScreen]);

  if (!isOpen) return null;

  async function handleBiometricPrompt(capability: BiometricCapability | null = biometricCapability) {
    if (!capability?.available && isLockScreen) return;
    setAuthenticating(true);
    setErrorMsg('');
    try {
      const res = await (window).electronAPI.appLock.promptBiometricAuth(
        t.securityModalTitle
      );
      if (res && res.success) {
        setSuccessMsg(t.securityUnlockedToast);
        setTimeout(() => {
          if (onUnlocked) onUnlocked();
          onClose();
        }, 300);
      } else if (res && res.code === 'Canceled') {
        // User canceled prompt, keep modal open for PIN entry
      } else {
        setErrorMsg(res?.error || t.securityPinInvalid);
      }
    } catch (err: unknown) {
      setErrorMsg(errorMessage(err) || 'Biometric auth failed');
    } finally {
      setAuthenticating(false);
    }
  }

  const handleUnlockWithPin = async () => {
    if (!pinInput) return;
    setErrorMsg('');
    try {
      const isValid = await (window).electronAPI.appLock.verifyMasterPin(pinInput);
      if (isValid) {
        setSuccessMsg(t.securityUnlockedToast);
        setTimeout(() => {
          if (onUnlocked) onUnlocked();
          onClose();
        }, 300);
      } else {
        setErrorMsg(t.securityPinInvalid);
      }
    } catch (err: unknown) {
      setErrorMsg(errorMessage(err) || t.securityPinInvalid);
    }
  };

  const handleSavePin = async () => {
    if (pinInput.length < 4) {
      setErrorMsg('PIN must be at least 4 digits');
      return;
    }
    if (pinInput !== pinConfirmInput) {
      setErrorMsg(t.securityPinMismatch);
      return;
    }
    setErrorMsg('');
    try {
      await (window).electronAPI.appLock.setMasterPin(pinInput);
      setSuccessMsg(t.securityPinSaved);
      setIsSettingPin(false);
      setPinInput('');
      setPinConfirmInput('');
      loadSecurityState();
    } catch (err: unknown) {
      setErrorMsg(errorMessage(err) || 'Failed to set PIN');
    }
  };

  const handleClearPin = async () => {
    try {
      await (window).electronAPI.appLock.clearMasterPin();
      setSuccessMsg(t.securityPinRemoved);
      loadSecurityState();
    } catch (err: unknown) {
      setErrorMsg(errorMessage(err) || 'Failed to remove PIN');
    }
  };

  const handleToggleAppLock = async (enabled: boolean) => {
    try {
      const updated = await (window).electronAPI.appLock.setLockConfig({ enabled });
      setConfig(updated);
    } catch (err) {
      console.error('Failed to toggle app lock:', err);
    }
  };

  const handleToggleBiometrics = async (biometricsEnabled: boolean) => {
    try {
      const updated = await (window).electronAPI.appLock.setLockConfig({
        biometricsEnabled,
      });
      setConfig(updated);
    } catch (err) {
      console.error('Failed to toggle biometrics:', err);
    }
  };

  const handleTimeoutChange = async (minutes: number) => {
    try {
      const updated = await (window).electronAPI.appLock.setLockConfig({
        lockTimeoutMinutes: minutes,
      });
      setConfig(updated);
    } catch (err) {
      console.error('Failed to update timeout:', err);
    }
  };

  const handleTogglePrivateShelves = async (lockPrivateShelvesOnly: boolean) => {
    try {
      const updated = await (window).electronAPI.appLock.setLockConfig({
        lockPrivateShelvesOnly,
      });
      setConfig(updated);
    } catch (err) {
      console.error('Failed to update private shelf lock:', err);
    }
  };

  const handleLockNow = async () => {
    try {
      await (window).electronAPI.appLock.lock('manual');
      onClose();
    } catch (err) {
      console.error('Failed to lock app:', err);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in ${
        isLockScreen ? 'cursor-default' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={t.securityModalTitle}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 sm:px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                {t.securityModalTitle}
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                {t.securityModalDesc}
              </p>
            </div>
          </div>
          {!isLockScreen && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label={t.close}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-xl text-red-700 dark:text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {isLockScreen ? (
            /* Lock Screen Authentication View */
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Lock className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mb-1">
                  {t.securityEnterPin}
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {biometricCapability?.available
                    ? `${biometricCapability.provider} • Master PIN`
                    : 'Master PIN'}
                </p>
              </div>

              {/* Biometrics Trigger Button */}
              {biometricCapability?.available && config.biometricsEnabled && (
                <div>
                  <button
                    onClick={() => { void handleBiometricPrompt(); }}
                    disabled={authenticating}
                    className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-md transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    <Fingerprint className="w-5 h-5" />
                    <span>
                      {authenticating ? 'Authenticating...' : t.securityPromptBiometricBtn}
                    </span>
                  </button>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-zinc-800" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white dark:bg-zinc-900 px-2 text-gray-400">
                        {isRtl ? 'أو عبر رمز PIN' : 'Or with PIN'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* PIN Input */}
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlockWithPin()}
                    placeholder={t.securityPinPlaceholder}
                    maxLength={16}
                    autoFocus
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 rounded-xl text-center text-lg tracking-widest font-mono text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 end-0 px-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={handleUnlockWithPin}
                  disabled={!pinInput}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 hover:bg-gray-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 text-white rounded-xl font-medium transition-colors disabled:opacity-40"
                >
                  <Unlock className="w-4 h-4" />
                  <span>{t.securityUnlockBtn}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Settings View */
            <div className="space-y-5">
              {/* Enable App Lock Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-indigo-500" />
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                      {t.securityAppLockEnabled}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-zinc-400">
                      {config.enabled ? 'Lock enabled' : 'Lock disabled'}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => handleToggleAppLock(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                </label>
              </div>

              {/* Native OS Biometrics Setting */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40">
                <div className="flex items-center gap-3">
                  <Fingerprint className="w-5 h-5 text-indigo-500" />
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                      {t.securityBiometricsEnabled}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-zinc-400">
                      {biometricCapability?.available ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {biometricCapability.provider}: {t.securityBiometricAvailable}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          {t.securityBiometricUnavailable}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!biometricCapability?.available}
                    checked={config.biometricsEnabled && !!biometricCapability?.available}
                    onChange={(e) => handleToggleBiometrics(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 disabled:opacity-40" />
                </label>
              </div>

              {/* Master PIN Section */}
              <div className="p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-indigo-500" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                        Master PIN
                      </div>
                      <div className="text-xs text-gray-500 dark:text-zinc-400">
                        {config.hasPin ? 'PIN configured' : 'No PIN set'}
                      </div>
                    </div>
                  </div>
                  {isSettingPin ? (
                    <button
                      onClick={() => setIsSettingPin(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  ) : config.hasPin ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsSettingPin(true)}
                        className="px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg"
                      >
                        {t.securityChangePinBtn}
                      </button>
                      <button
                        onClick={handleClearPin}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg"
                      >
                        {t.securityClearPinBtn}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsSettingPin(true)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                    >
                      {t.securitySetPinBtn}
                    </button>
                  )}
                </div>

                {isSettingPin && (
                  <div className="pt-3 border-t border-gray-200 dark:border-zinc-700/60 space-y-2">
                    <input
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder={t.securityPinPlaceholder}
                      maxLength={16}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                    />
                    <input
                      type="password"
                      value={pinConfirmInput}
                      onChange={(e) => setPinConfirmInput(e.target.value)}
                      placeholder={t.securityPinConfirmPlaceholder}
                      maxLength={16}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-zinc-100"
                    />
                    <button
                      onClick={handleSavePin}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium"
                    >
                      Save Master PIN
                    </button>
                  </div>
                )}
              </div>

              {/* Inactivity Timeout */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-indigo-500" />
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                      {t.securityTimeoutLabel}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-zinc-400">
                      {config.lockTimeoutMinutes === 0
                        ? t.securityTimeoutImmediate
                        : `${config.lockTimeoutMinutes} ${t.securityTimeoutMinutes}`}
                    </div>
                  </div>
                </div>
                <select
                  value={config.lockTimeoutMinutes}
                  onChange={(e) => handleTimeoutChange(Number(e.target.value))}
                  className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-xs text-gray-900 dark:text-zinc-100"
                >
                  <option value={0}>{t.securityTimeoutImmediate}</option>
                  <option value={5}>5 {t.securityTimeoutMinutes}</option>
                  <option value={15}>15 {t.securityTimeoutMinutes}</option>
                  <option value={30}>30 {t.securityTimeoutMinutes}</option>
                  <option value={60}>60 {t.securityTimeoutMinutes}</option>
                </select>
              </div>

              {/* Lock Private Shelves Only */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/40">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                    {t.securityPrivateShelvesOnly}
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.lockPrivateShelvesOnly}
                    onChange={(e) => handleTogglePrivateShelves(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                </label>
              </div>

              {/* Lock App Now Button */}
              {config.enabled && (
                <button
                  onClick={handleLockNow}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  <span>{t.securityLockNowBtn}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
