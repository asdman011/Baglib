import { validStudyTarget } from './study-notes';

export const MAX_DEEP_LINK_LENGTH = 4096;
/** Untrusted OS input is decoded once and may only name an existing study target kind. */
export function parseDeepLink(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > MAX_DEEP_LINK_LENGTH || !/^baglib:/iu.test(url)) return null;
  try {
    const target = decodeURIComponent(url.replace(/^baglib:(?:\/\/)?/iu, ''));
    if (/[\u0000-\u001f\u007f]/u.test(target)) return null;
    return validStudyTarget(target) ? target : null;
  } catch { return null; }
}

/** The dev app path is resolved by the caller; normal dev/harness runs must never alter OS registration. */
export function protocolRegistrationArgs(packaged: boolean, optIn: string | undefined, executable: string, appPath: string | undefined): [string] | [string, string, string[]] | null {
  if (packaged) return ['baglib'];
  return optIn === '1' && appPath ? ['baglib', executable, [appPath]] : null;
}
