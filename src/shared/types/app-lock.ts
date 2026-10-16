/**
 * Baglib — App Lock Security & OS Biometrics Types (KEY-149)
 *
 * Windows Hello (WinRT IUserConsentVerifierInterop) & macOS TouchID integration.
 */

export interface BiometricCapability {
  available: boolean;
  provider: 'Windows Hello' | 'Touch ID' | 'Biometric' | 'PIN';
  platform: string;
  status: string; // 'Available' | 'Unavailable' | 'DeviceNotPresent' | 'NotConfiguredForUser' | 'DisabledByPolicy' | 'DeviceBusy' | 'RetriesExhausted'
  error?: string;
}

export interface BiometricAuthResult {
  success: boolean;
  code: 'Verified' | 'Canceled' | 'Failed' | 'Unavailable' | 'Error' | 'Unsupported';
  provider: string;
  error?: string;
}

export interface AppLockConfig {
  enabled: boolean;
  biometricsEnabled: boolean;
  hasPin: boolean;
  lockTimeoutMinutes: number; // 0 = immediate, 5, 15, 30, 60
  lockPrivateShelvesOnly: boolean;
}

export interface AppLockState {
  isLocked: boolean;
  enabled: boolean;
  biometricsEnabled: boolean;
  hasPin: boolean;
  lastUnlockedTimestamp: number;
  reason?: 'app_launch' | 'idle_timeout' | 'private_shelf' | 'manual';
}
