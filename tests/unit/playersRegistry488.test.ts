import { describe, expect, it } from 'vitest';
import { PAGE_META, canonicalMetaKey } from '../../src/domain/sharePage';
import { PAGES } from '../../src/shared/nav/pageRegistry';
import { HOME_GROUPS } from '../../src/shared/nav/sections';

const PROFILES = [
  { id: 'hera', handle: 'Hera', fullName: 'Hamzah El-Baher', country: '加拿大', year: 2026 },
  { id: 'liereyy', handle: 'Liereyy', fullName: 'Kai Kallinger', country: '奥地利', year: 2021 },
  { id: 'theviper', handle: 'TheViper', fullName: 'Ørjan Larsen', country: '挪威', year: 2021 },
] as const;

describe('#488 player registry and generated profile metadata', () => {
  it('first-red: the directory is a real secondary reference entry with one detail template', () => {
    const directory = PAGES.find((page) => page.path === '/players');
    expect(directory).toMatchObject({ kind: 'page', lane: 'secondary', group: 'reference' });
    expect(directory?.label).toMatch(/选手/);
    const detail = PAGES.filter((page) => page.path === '/players/:id');
    expect(detail).toHaveLength(1);
    expect(detail[0]).toMatchObject({ kind: 'detail', entry: 'none' });
    expect(detail[0]?.entryReason).toMatch(/目录|列表/);
    expect(detail[0]?.metaTitle).toBeUndefined();
    expect(HOME_GROUPS.find((group) => group.key === 'reference')?.sections.map((section) => section.path)).toContain('/players');
  });

  it('first-red: generated metadata has the directory and every real profile, without a literal parameter page', () => {
    expect(PAGE_META['/players']?.title).toMatch(/选手/);
    for (const profile of PROFILES) {
      const path = `/players/${profile.id}`;
      const meta = PAGE_META[path];
      expect(meta?.title, path).toContain(profile.handle);
      expect(meta?.description, path).toContain(profile.fullName);
      expect(meta?.description, path).toContain(profile.country);
      expect(meta?.description, path).toContain(String(profile.year));
      expect(canonicalMetaKey('/players/:id', path), path).toBe(path);
    }
    expect(PAGE_META['/players/:id']).toBeUndefined();
    expect(PAGE_META['/players/unknown488']).toBeUndefined();
  });
});
