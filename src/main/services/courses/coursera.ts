import type { CourseProgress, CourseraAccount, CourseSnapshot } from '../../../shared/courses';

/** Coursera's API is for Business, Campus and Government organisations. See the KEY-257 feature doc. */
export const COURSERA_API = 'https://api.coursera.com';
const PAGE = 100;
const MAX_PAGES = 200;

interface Report {
  id: string; contentId: string; contentType: string; contentName?: string; contentSlug?: string; programName?: string;
  externalId?: string; email?: string; overallProgress?: number; isCompleted?: boolean; lastActivityAt?: number;
}

const courseUrl = (report: Report): string | null => {
  if (!report.contentSlug) return null;
  if (report.contentType === 'Course') return `https://www.coursera.org/learn/${encodeURIComponent(report.contentSlug)}`;
  if (report.contentType === 'Specialization') return `https://www.coursera.org/specializations/${encodeURIComponent(report.contentSlug)}`;
  return null;
};

export function toProgress(report: Report): CourseProgress {
  return {
    id: report.id,
    name: report.contentName || report.contentId,
    type: report.contentType,
    program: report.programName ?? '',
    progress: Math.max(0, Math.min(100, Number(report.overallProgress) || 0)),
    completed: report.isCompleted === true,
    lastActivity: report.lastActivityAt ? new Date(report.lastActivityAt).toISOString() : null,
    url: courseUrl(report),
  };
}

export class CourseraClient {
  constructor(private base = COURSERA_API, private request: typeof fetch = fetch) {}

  private async token(account: CourseraAccount): Promise<string> {
    const response = await this.request(`${this.base}/oauth2/client_credentials/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${account.key}:${account.secret}`).toString('base64')}` },
      body: 'grant_type=client_credentials',
    });
    if (response.status === 401 || response.status === 403) throw new Error('coursera-denied');
    if (!response.ok) throw new Error('coursera-unavailable');
    const body = await response.json() as { access_token?: string };
    if (!body.access_token) throw new Error('coursera-unavailable');
    return body.access_token;
  }

  /** Reads the organisation's enrollment report page by page and keeps only this learner's rows. */
  async progress(account: CourseraAccount): Promise<CourseSnapshot> {
    const token = await this.token(account);
    const learner = account.learner.toLowerCase();
    const courses: CourseProgress[] = [];
    let start: string | undefined = '0';
    for (let page = 0; start !== undefined && page < MAX_PAGES; page++) {
      const url = `${this.base}/ent/api/businesses.v1/${encodeURIComponent(account.organizationId)}/enrollmentReports?start=${encodeURIComponent(start)}&limit=${PAGE}&includeS12n=true`;
      const response = await this.request(url, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401 || response.status === 403) throw new Error('coursera-denied');
      if (!response.ok) throw new Error('coursera-unavailable');
      const body = await response.json() as { elements?: Report[]; paging?: { next?: string | number } };
      for (const report of body.elements ?? []) {
        if ([report.externalId, report.email].some(value => value?.toLowerCase() === learner)) courses.push(toProgress(report));
      }
      start = body.paging?.next === undefined ? undefined : String(body.paging.next);
    }
    return { importedAt: new Date().toISOString(), learner: account.learner, organizationId: account.organizationId, courses };
  }
}
