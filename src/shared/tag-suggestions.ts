import type { TagWithCount } from './types/tag';

export function tagSearchKey(value: string): string {
  return value.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function suggestTags(tags: TagWithCount[], selected: string[], query: string, limit = 8): TagWithCount[] {
  const selectedKeys = new Set(selected.map(value => value.trim().toLowerCase()));
  const search = tagSearchKey(query);
  const rank = (name: string) => {
    const key = tagSearchKey(name);
    return key === search ? 0 : key.startsWith(search) ? 1 : 2;
  };
  return tags.filter(tag => !selectedKeys.has(tag.name.trim().toLowerCase()) && (!search || tagSearchKey(tag.name).includes(search)))
    .sort((first, second) => (search ? rank(first.name) - rank(second.name) : 0) || second.workCount - first.workCount || first.name.localeCompare(second.name))
    .slice(0, limit);
}
