import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import { PLAYER_CATALOG } from '../../src/data/players';
import { playerById, playerPath, playerRoutes } from '../../src/domain/playerCatalog.mjs';
import { search, type SearchItem } from '../../src/domain/search';
import { PAGE_META, canonicalMetaKey } from '../../src/domain/sharePage';
import { useSearchIndex } from '../../src/features/search/hooks';
import { PAGES } from '../../src/shared/nav/pageRegistry';
import { HOME_GROUPS } from '../../src/shared/nav/sections';

const PROFILES = [
  { id: 'hera', handle: 'Hera', fullName: 'Hamzah El-Baher', country: '加拿大', year: 2026 },
  { id: 'liereyy', handle: 'Liereyy', fullName: 'Kai Kallinger', country: '奥地利', year: 2021 },
  { id: 'theviper', handle: 'TheViper', fullName: 'Ørjan Larsen', country: '挪威', year: 2021 },
] as const;

if (PLAYER_CATALOG.status !== 'ready') throw new Error('#488 seeded player catalog must be ready');
const catalog = PLAYER_CATALOG.catalog;

let searchItems: SearchItem[];
function SearchProbe() {
  return createElement('script', { dangerouslySetInnerHTML: { __html: JSON.stringify(useSearchIndex()) } });
}
beforeAll(async () => {
  await loadCore();
  const html = renderToStaticMarkup(createElement(SearchProbe));
  searchItems = JSON.parse(html.slice('<script>'.length, -'</script>'.length));
});

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

  it('the validated catalog owns every published profile path and no unknown path', () => {
    expect(catalog.players.map((player) => player.id)).toEqual(PROFILES.map((profile) => profile.id));
    expect(playerRoutes(catalog)).toEqual(catalog.players.map(playerPath));
    expect(
      Object.keys(PAGE_META)
        .filter((path) => path.startsWith('/players/'))
        .sort(),
    ).toEqual(playerRoutes(catalog).sort());
    for (const profile of PROFILES) {
      const player = playerById(catalog, profile.id);
      expect(player).toMatchObject({ id: profile.id, handle: profile.handle, fullName: profile.fullName, country: profile.country });
      expect(player?.achievement.year).toBe(profile.year);
    }
    for (const id of ['unknown488', 'Hera', ':id', '%68era', 'hera/extra', '', undefined]) {
      expect(playerById(catalog, id), String(id)).toBeUndefined();
    }
  });

  it('unknown player metadata never becomes home metadata or a known profile through a fallback', () => {
    for (const path of ['/players/unknown488', '/players/Hera', '/players/:id', '/players/%68era']) {
      const key = canonicalMetaKey('/players/:id', path);
      expect(key, path).not.toBe('/');
      expect(playerRoutes(catalog), path).not.toContain(key);
      expect(PAGE_META[path], path).toBeUndefined();
    }
  });

  it('global search finds each exact handle and public full name at its catalog profile path', () => {
    for (const player of catalog.players) {
      const path = playerPath(player);
      expect(
        searchItems.filter((item) => item.href === path),
        path,
      ).toHaveLength(1);
      for (const name of [player.handle, player.fullName]) {
        expect(
          search(searchItems, name).some((item) => item.href === path),
          name,
        ).toBe(true);
      }
    }
    const directory = search(searchItems, '职业选手资料').find((item) => item.href === '/players');
    expect(directory).toBeDefined();
    expect(directory?.py).toBe('zhiyexuanshouziliao');
    expect(directory?.pyi).toBe('zyxszl');
  });
});
