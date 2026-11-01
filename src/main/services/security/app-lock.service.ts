import { errorMessage } from '../../../shared/errors';
/**
 * Baglib — App Lock Security & OS Biometrics Service (KEY-149)
 *
 * Implements Koodo Reader biometric integration & Master PIN security:
 * - Windows Hello via PowerShell WinRT & IUserConsentVerifierInterop (binding to HWND)
 * - macOS Touch ID via Electron systemPreferences
 * - Master PIN fallback with PBKDF2 (SHA-512, 100k rounds) & constant-time comparison
 * - Configurable auto-lock timeout & private shelf isolation
 */

import crypto from 'crypto';
import { execFile } from 'child_process';
import { systemPreferences, BrowserWindow } from 'electron';
import { settingsRepository, ISettingsRepository } from '../../database/repositories/settings.repository';
import type {
  BiometricCapability,
  BiometricAuthResult,
  AppLockConfig,
  AppLockState,
} from '../../../shared/types/app-lock';

const SETTING_LOCK_CONFIG = 'app_lock:config';
const SETTING_PIN_HASH = 'app_lock:pin_hash';
const SETTING_PIN_SALT = 'app_lock:pin_salt';

const DEFAULT_CONFIG: AppLockConfig = {
  enabled: false,
  biometricsEnabled: true,
  hasPin: false,
  lockTimeoutMinutes: 15,
  lockPrivateShelvesOnly: false,
};

export class AppLockSecurityService {
  private isLocked: boolean = false;
  private lockReason?: 'app_launch' | 'idle_timeout' | 'private_shelf' | 'manual';
  private lastUnlockedTimestamp: number = Date.now();

  constructor(private readonly settings: ISettingsRepository = settingsRepository) {
    const config = this.getLockConfig();
    // If lock is enabled, start locked
    this.isLocked = config.enabled;
  }

  /**
   * Resolves native 64-bit HWND window handle for Windows Hello dialog binding.
   */
  private getWindowHandleValue(win?: BrowserWindow | null): string {
    if (!win || typeof win.getNativeWindowHandle !== 'function') {
      return '';
    }
    try {
      const handle = win.getNativeWindowHandle();
      if (!Buffer.isBuffer(handle) || handle.length === 0) {
        return '';
      }
      if (handle.length >= 8 && typeof handle.readBigUInt64LE === 'function') {
        return handle.readBigUInt64LE(0).toString();
      }
      return handle.readUInt32LE(0).toString();
    } catch {
      return '';
    }
  }

  /**
   * Generates WinRT PowerShell script for Windows Hello availability check or verification.
   */
  private getWindowsHelloScript(mode: 'check' | 'verify', message = '', hwnd = ''): string {
    const escapedMessage = message.replace(/'/g, "''");
    const escapedHwnd = String(hwnd || '').replace(/'/g, "''");

    return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Invoke-WinRtAsync {
  param(
    [Parameter(Mandatory = $true)] $Operation,
    [Parameter(Mandatory = $true)] [Type[]] $ResultTypes
  )
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.IsGenericMethodDefinition -and
      $_.GetGenericArguments().Count -eq $ResultTypes.Count -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1

  if (-not $method) {
    throw 'Unable to bridge Windows Runtime async operation.'
  }
  $genericMethod = $method.MakeGenericMethod($ResultTypes)
  $task = $genericMethod.Invoke($null, @($Operation))
  return $task.GetAwaiter().GetResult()
}

function Request-WindowsHelloVerification {
  param(
    [Parameter(Mandatory = $true)] [string] $Message,
    [string] $Hwnd
  )
  $isWindowInteropSupported = [Environment]::OSVersion.Version.Build -ge 22000 -and -not [string]::IsNullOrWhiteSpace($Hwnd)
  if (-not $isWindowInteropSupported) {
    return Invoke-WinRtAsync -Operation ($verifier::RequestVerificationAsync($Message)) -ResultTypes @([Windows.Security.Credentials.UI.UserConsentVerificationResult])
  }

  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace BaglibSecurityInterop
{
    [ComImport]
    [Guid("39E050C3-4E74-441A-8DC0-B81104DF949C")]
    [InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
    public interface IUserConsentVerifierInterop
    {
        [return: MarshalAs(UnmanagedType.IInspectable)]
        object RequestVerificationForWindowAsync(
            IntPtr appWindow,
            [MarshalAs(UnmanagedType.HString)] string message,
            [In] ref Guid riid);
    }

    public static class UserConsentVerifierInteropHelper
    {
        public static object RequestVerificationForWindow(object activationFactory, long hwnd, string message, Guid riid)
        {
            IntPtr ptr = IntPtr.Zero;
            try
            {
                ptr = Marshal.GetIUnknownForObject(activationFactory);
                var interop = (IUserConsentVerifierInterop)Marshal.GetTypedObjectForIUnknown(ptr, typeof(IUserConsentVerifierInterop));
                return interop.RequestVerificationForWindowAsync(new IntPtr(hwnd), message, ref riid);
            }
            finally
            {
                if (ptr != IntPtr.Zero)
                {
                    Marshal.Release(ptr);
                }
            }
        }
    }
}
"@
  $activationFactory = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeMarshal]::GetActivationFactory($verifier)
  $asyncOperationGuid = [Guid]::Parse('fd596ffd-2318-558f-9dbe-d21df43764a5')
  $operation = [BaglibSecurityInterop.UserConsentVerifierInteropHelper]::RequestVerificationForWindow($activationFactory, [Int64]::Parse($Hwnd), $Message, $asyncOperationGuid)
  return Invoke-WinRtAsync -Operation $operation -ResultTypes @([Windows.Security.Credentials.UI.UserConsentVerificationResult])
}

$verifier = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
$availability = Invoke-WinRtAsync -Operation ($verifier::CheckAvailabilityAsync()) -ResultTypes @([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])

if ('${mode}' -eq 'check') {
  [Console]::Out.Write((@{
    available = ($availability.ToString() -eq 'Available')
    status = $availability.ToString()
  } | ConvertTo-Json -Compress))
  exit 0
}

if ($availability.ToString() -ne 'Available') {
  [Console]::Out.Write((@{
    success = $false
    code = 'Unavailable'
    status = $availability.ToString()
  } | ConvertTo-Json -Compress))
  exit 0
}

try {
  $result = Request-WindowsHelloVerification -Message '${escapedMessage}' -Hwnd '${escapedHwnd}'
  [Console]::Out.Write((@{
    success = ($result.ToString() -eq 'Verified')
    code = $result.ToString()
    status = $availability.ToString()
  } | ConvertTo-Json -Compress))
} catch {
  [Console]::Out.Write((@{
    success = $false
    code = 'Error'
    status = $_.Exception.Message
  } | ConvertTo-Json -Compress))
}
`.trim();
  }

  /**
   * Executes a PowerShell script safely using UTF-16LE base64 encoding.
   */
  private runPowerShell(script: string, timeoutMs: number = 60000): Promise<string> {
    return new Promise((resolve, reject) => {
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Sta',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          encoded,
        ],
        {
          windowsHide: true,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve((stdout || '').trim());
        }
      );
    });
  }

  /**
   * Checks if native biometrics (Windows Hello or Touch ID) are available on this machine.
   */
  async getBiometricCapability(): Promise<BiometricCapability> {
    if (process.platform === 'darwin') {
      const available =
        typeof (systemPreferences)?.canPromptTouchID === 'function' &&
        (systemPreferences).canPromptTouchID();
      return {
        available: !!available,
        provider: 'Touch ID',
        platform: process.platform,
        status: available ? 'Available' : 'Unavailable',
      };
    }

    if (process.platform === 'win32') {
      try {
        const output = await this.runPowerShell(this.getWindowsHelloScript('check'));
        const parsed = output ? JSON.parse(output) : {};
        return {
          available: !!parsed.available,
          provider: 'Windows Hello',
          platform: process.platform,
          status: parsed.status || 'Unavailable',
        };
      } catch (err: unknown) {
        return {
          available: false,
          provider: 'Windows Hello',
          platform: process.platform,
          status: 'Error',
          error: errorMessage(err) || String(err),
        };
      }
    }

    return {
      available: false,
      provider: 'Biometric',
      platform: process.platform,
      status: 'Unsupported',
    };
  }

  /**
   * Prompts user with native OS biometric dialog (Windows Hello or Touch ID).
   */
  async promptBiometricAuth(
    promptMessage = 'Baglib Library Authentication',
    owningWindow?: BrowserWindow | null
  ): Promise<BiometricAuthResult> {
    if (process.platform === 'darwin') {
      try {
        if (typeof (systemPreferences)?.promptTouchID === 'function') {
          await (systemPreferences).promptTouchID(promptMessage);
          this.unlock();
          return { success: true, code: 'Verified', provider: 'Touch ID' };
        }
      } catch (err: unknown) {
        const msg = String(errorMessage(err) || err);
        return {
          success: false,
          code: /cancel/i.test(msg) ? 'Canceled' : 'Failed',
          provider: 'Touch ID',
          error: msg,
        };
      }
    }

    if (process.platform === 'win32') {
      try {
        const hwnd = this.getWindowHandleValue(owningWindow);
        const output = await this.runPowerShell(
          this.getWindowsHelloScript('verify', promptMessage, hwnd),
          120000
        );
        const parsed = output ? JSON.parse(output) : {};
        if (parsed.success) {
          this.unlock();
          return { success: true, code: 'Verified', provider: 'Windows Hello' };
        }
        return {
          success: false,
          code: parsed.code === 'Canceled' ? 'Canceled' : 'Failed',
          provider: 'Windows Hello',
          error: parsed.status,
        };
      } catch (err: unknown) {
        return {
          success: false,
          code: 'Error',
          provider: 'Windows Hello',
          error: errorMessage(err) || String(err),
        };
      }
    }

    return {
      success: false,
      code: 'Unsupported',
      provider: 'Biometric',
    };
  }

  // --------------------------------------------------------------------------
  // Master PIN Management (PBKDF2 SHA-512)
  // --------------------------------------------------------------------------

  setMasterPin(pin: string): boolean {
    if (!pin || pin.length < 4) {
      throw new Error('Master PIN must be at least 4 digits');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(pin, salt, 100000, 64, 'sha512').toString('hex');

    this.settings.set(SETTING_PIN_SALT, salt);
    this.settings.set(SETTING_PIN_HASH, hash);

    const config = this.getLockConfig();
    config.hasPin = true;
    this.settings.set(SETTING_LOCK_CONFIG, config);
    return true;
  }

  verifyMasterPin(pin: string): boolean {
    const salt = this.settings.get<string>(SETTING_PIN_SALT);
    const storedHash = this.settings.get<string>(SETTING_PIN_HASH);
    if (!salt || !storedHash) return false;

    const hash = crypto.pbkdf2Sync(pin, salt, 100000, 64, 'sha512').toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');

    if (hashBuf.length !== storedBuf.length) return false;
    const isValid = crypto.timingSafeEqual(hashBuf, storedBuf);
    if (isValid) {
      this.unlock();
    }
    return isValid;
  }

  clearMasterPin(): boolean {
    this.settings.delete(SETTING_PIN_SALT);
    this.settings.delete(SETTING_PIN_HASH);
    const config = this.getLockConfig();
    config.hasPin = false;
    this.settings.set(SETTING_LOCK_CONFIG, config);
    return true;
  }

  // --------------------------------------------------------------------------
  // Lock Configuration & Session State
  // --------------------------------------------------------------------------

  getLockConfig(): AppLockConfig {
    const stored = this.settings.get<AppLockConfig>(SETTING_LOCK_CONFIG);
    const hasPinStored = !!this.settings.get<string>(SETTING_PIN_HASH);
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      hasPin: hasPinStored,
    };
  }

  setLockConfig(partialConfig: Partial<AppLockConfig>): AppLockConfig {
    const current = this.getLockConfig();
    const updated: AppLockConfig = {
      ...current,
      ...partialConfig,
      hasPin: !!this.settings.get<string>(SETTING_PIN_HASH),
    };
    this.settings.set(SETTING_LOCK_CONFIG, updated);
    return updated;
  }

  getLockState(): AppLockState {
    const config = this.getLockConfig();
    const locked = config.enabled ? this.isLocked : false;
    return {
      isLocked: locked,
      reason: locked ? this.lockReason : undefined,
      enabled: config.enabled,
      biometricsEnabled: config.biometricsEnabled,
      hasPin: config.hasPin,
      lastUnlockedTimestamp: this.lastUnlockedTimestamp,
    };
  }

  unlock(): AppLockState {
    this.isLocked = false;
    this.lockReason = undefined;
    this.lastUnlockedTimestamp = Date.now();
    return this.getLockState();
  }

  lock(reason: 'app_launch' | 'idle_timeout' | 'private_shelf' | 'manual' = 'manual'): AppLockState {
    const config = this.getLockConfig();
    this.lockReason = reason;
    if (config.enabled) {
      this.isLocked = true;
    }
    return this.getLockState();
  }

  /**
   * Checks whether idle timeout threshold has elapsed since last user activity.
   */
  checkIdleTimeout(): boolean {
    const config = this.getLockConfig();
    if (!config.enabled || config.lockTimeoutMinutes <= 0) return false;
    const elapsedMinutes = (Date.now() - this.lastUnlockedTimestamp) / (60 * 1000);
    if (elapsedMinutes >= config.lockTimeoutMinutes) {
      this.lock('idle_timeout');
      return true;
    }
    return false;
  }
}

let appLockSecurityServiceInstance: AppLockSecurityService | null = null;

// Created on first use: the constructor reads settings, which do not exist until migrations have run.
export function getAppLockSecurityService(): AppLockSecurityService {
  if (!appLockSecurityServiceInstance) {
    appLockSecurityServiceInstance = new AppLockSecurityService();
  }
  return appLockSecurityServiceInstance;
}
