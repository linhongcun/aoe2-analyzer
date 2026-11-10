import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import { search, type SearchItem } from '../../src/domain/search';
import { useSearchIndex } from '../../src/features/search/hooks';
import { LAZY_COMPONENTS, PAGES } from '../../src/shared/nav/pageRegistry';
import { ALL, HOME_GROUPS } from '../../src/shared/nav/sections';
// @ts-expect-error catalog is a native Node module without a declaration.
import { schemaFileFor } from '../../scripts/content-schema-catalog.mjs';

function SearchProbe() {
  return createElement('script', { dangerouslySetInnerHTML: { __html: JSON.stringify(useSearchIndex()) } });
}

describe('移除赛事公告与职业选手（#891）', () => {
  it('旧地址只回到首页，不再登记为可浏览产品', () => {
    for (const key of ['events', 'players', 'player-detail']) {
      const page = PAGES.find((entry) => entry.key === key);
      expect(page, key).toMatchObject({ kind: 'redirect', redirectTo: '/', entry: 'none' });
      expect(page?.lane).toBeUndefined();
      expect(page?.component).toBeUndefined();
      expect(page?.label).toBeUndefined();
    }
    expect(PAGES.find((page) => page.key === 'events')?.path).toBe('/events');
    expect(PAGES.find((page) => page.key === 'players')?.path).toBe('/players');
    expect(PAGES.find((page) => page.key === 'player-detail')?.path).toBe('/players/:id');
    expect([...LAZY_COMPONENTS]).not.toContain('Events');
    expect([...LAZY_COMPONENTS]).not.toContain('Players');
    expect([...LAZY_COMPONENTS]).not.toContain('PlayerDetail');
    const paths = ALL.map((section) => section.path);
    expect(paths).not.toContain('/events');
    expect(paths).not.toContain('/players');
    for (const group of HOME_GROUPS) {
      const groupPaths = group.sections.map((section) => section.path);
      expect(groupPaths).not.toContain('/events');
      expect(groupPaths).not.toContain('/players');
    }
    expect(PAGES.find((page) => page.key === 'matchup')?.component).toBe('Matchup');
    expect(PAGES.find((page) => page.key === 'ladder')?.path).toBe('/ladder');
    expect(PAGES.find((page) => page.key === 'team-bonuses')?.path).toBe('/team-bonuses');
    expect(PAGES.find((page) => page.key === 'game-guide')?.component).toBe('GameGuide');
  });

  it('搜索、文明页和专属数据链不再指向这两项', async () => {
    await loadCore();
    const html = renderToStaticMarkup(createElement(SearchProbe));
    const items: SearchItem[] = JSON.parse(html.slice('<script>'.length, -'</script>'.length));
    expect(items.filter((item) => item.href === '/events' || item.href.startsWith('/players'))).toEqual([]);
    for (const query of ['赛事公告', 'saishigonggao', '职业选手资料', 'Hera', 'TheViper']) {
      expect(search(items, query).filter((item) => item.href === '/events' || item.href.startsWith('/players'))).toEqual([]);
    }
    const civ = readFileSync('src/features/civs/components/CivDetail.tsx', 'utf8');
    expect(civ).not.toContain('CivProfessionalView');
    expect(civ).not.toContain('职业资料');
    expect(civ).toContain('历史与更新');
    for (const file of [
      'src/content/events.json',
      'src/content/players.json',
      'src/data/events.ts',
      'src/data/players.ts',
      'src/domain/eventCatalog.mjs',
      'src/domain/playerCatalog.mjs',
      'src/features/events/Events.tsx',
      'src/features/players/Players.tsx',
    ])
      expect(existsSync(file), file).toBe(false);
    expect(schemaFileFor('src/content/events.json')).toBeNull();
    expect(schemaFileFor('src/content/players.json')).toBeNull();
    expect(schemaFileFor('src/content/glossary.json')).toBe('content-glossary.json');
    expect(schemaFileFor('src/content/game-guide.json')).toBe('content-game-guide.json');
  });
});
