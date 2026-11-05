export interface CourseraAccount { organizationId: string; learner: string; key: string; secret: string }
export interface CourseProgress {
  id: string;
  name: string;
  type: string;
  program: string;
  progress: number;
  completed: boolean;
  lastActivity: string | null;
  url: string | null;
}
export interface CourseSnapshot { importedAt: string; learner: string; organizationId: string; courses: CourseProgress[] }
export interface CoursesAPI {
  /** Credentials never come back to the page, only whether they are stored. */
  account(): Promise<{ saved: boolean; organizationId: string; learner: string; secureStorage: boolean }>;
  saveAccount(account: CourseraAccount): Promise<void>;
  forget(): Promise<void>;
  importProgress(): Promise<CourseSnapshot>;
  snapshot(): Promise<CourseSnapshot | null>;
}

export function validAccount(value: unknown): CourseraAccount {
  const account = value as Record<string, unknown>;
  const field = (name: string, pattern: RegExp) => {
    const item = account?.[name];
    if (typeof item !== 'string' || !pattern.test(item.trim())) throw new Error('invalid-request');
    return item.trim();
  };
  return { organizationId: field('organizationId', /^[\w-]{1,100}$/u), learner: field('learner', /^[^\s]{1,320}$/u), key: field('key', /^[\x21-\x7e]{1,500}$/u), secret: field('secret', /^[\x21-\x7e]{1,500}$/u) };
}
