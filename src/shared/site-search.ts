/** Each address is the site's own search page, checked by hand on 2026-11-02. Baglib fetches nothing from these sites. */
export const SITE_SEARCHES = [
  { id: 'islamweb', group: 'islamic', url: (query: string) => `https://www.islamweb.net/ar/index.php?page=websearch&stxt=${query}` },
  { id: 'islamqa', group: 'islamic', url: (query: string, lang: 'ar' | 'en') => `https://islamqa.info/${lang}/search?q=${query}` },
  { id: 'islamway', group: 'islamic', url: (query: string, lang: 'ar' | 'en') => `https://${lang}.islamway.net/search?q=${query}` },
  { id: 'core', group: 'research', url: (query: string) => `https://core.ac.uk/search?q=${query}` },
  { id: 'jstor', group: 'research', url: (query: string) => `https://www.jstor.org/action/doBasicSearch?Query=${query}` },
  { id: 'pmc', group: 'research', url: (query: string) => `https://pmc.ncbi.nlm.nih.gov/search/?term=${query}` },
  { id: 'sciencedirect', group: 'research', url: (query: string) => `https://www.sciencedirect.com/search?qs=${query}` },
] as const;

export type SiteSearchId = typeof SITE_SEARCHES[number]['id'];

export function siteSearchUrl(site: typeof SITE_SEARCHES[number], query: string, lang: 'ar' | 'en'): string {
  return site.url(encodeURIComponent(query.trim()), lang);
}
