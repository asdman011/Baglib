export interface CorpusSectionStatus {
  available: boolean;
  directory?: string | null;
  file?: string | null;
  skipReason: string | null;
  copiedFiles?: number;
}

export interface CorpusCleanupReport {
  copiesDeleted: boolean;
  originalsUnchanged: boolean;
  verifiedFiles: number;
}

export interface ThrowawayCorpusHandle {
  targetDir: string;
  sourceUserDataDir: string;
  quran: CorpusSectionStatus;
  poetry: CorpusSectionStatus;
  sunnah: CorpusSectionStatus;
  readonly cleanedUp: boolean;
  cleanup: () => CorpusCleanupReport;
}

export function defaultUserDataDir(): string;
export function hashFileReadOnly(filePath: string): string;
export function copyAndVerifyReadOnly(sourcePath: string, destPath: string): string;
export function setupThrowawayCorpus(options: {
  targetDir: string;
  sourceUserDataDir?: string;
  copyQuran?: boolean;
  copyPoetry?: boolean;
  linkSunnah?: boolean;
  includeMushafLayout?: boolean;
  sunnahCorpusFile?: string;
}): ThrowawayCorpusHandle;
