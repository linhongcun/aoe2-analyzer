import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadCore } from '../../src/data';
import { search, type SearchItem } from '../../src/domain/search';
import { suggestRoutes } from '../../src/domain/routeSuggestions';
import { fitToolLinks } from '../../src/domain/teamFit';
import { useSearchIndex } from '../../src/features/search/hooks';
import { PAGES } from '../../src/shared/nav/pageRegistry';
import { ALL, HOME_GROUPS } from '../../src/shared/nav/sections';

function SearchProbe() {
  return createElement('script', { dangerouslySetInnerHTML: { __html: JSON.stringify(useSearchIndex()) } });
}

describe('团队单一入口（#890）', () => {
  it('首页、导航和搜索只登记一个团队入口，另外两套仍可直达', () => {
    const fit = PAGES.find((page) => page.key === 'team-fit');
    const bonuses = PAGES.find((page) => page.key === 'team-bonuses');
    const plan = PAGES.find((page) => page.key === 'team-plan');
    expect(fit).toMatchObject({ path: '/team-fit', lane: 'secondary', group: 'planning', label: '团队', component: 'TeamFit' });
    expect(bonuses).toMatchObject({ path: '/team-bonuses', kind: 'page', component: 'TeamBonuses', entry: 'none' });
    expect(plan).toMatchObject({ path: '/team-plan', kind: 'page', component: 'TeamPlan', entry: 'none', omitShareSearch: true });
    expect(bonuses?.lane).toBeUndefined();
    expect(plan?.lane).toBeUndefined();
    const paths = ALL.map((section) => section.path);
    expect(paths.filter((path) => path === '/team-fit')).toEqual(['/team-fit']);
    expect(paths).not.toContain('/team-bonuses');
    expect(paths).not.toContain('/team-plan');
    for (const group of HOME_GROUPS) {
      const groupPaths = group.sections.map((section) => section.path);
      expect(groupPaths.filter((path) => path === '/team-fit').length).toBe(group.key === 'planning' ? 1 : 0);
      expect(groupPaths).not.toContain('/team-bonuses');
      expect(groupPaths).not.toContain('/team-plan');
    }
    expect(PAGES.find((page) => page.key === 'matchup')).toMatchObject({
      label: '对局助手',
      desc: '快攻指南、类型反制，以及侦察、混兵和城堡前置',
    });
    expect(PAGES.find((page) => page.key === 'events')).toMatchObject({ kind: 'redirect', redirectTo: '/' });
    const compare = readFileSync('src/features/compare/components/Compare.tsx', 'utf8');
    expect(compare).toContain('查看这两个文明的团队加成来源');
    expect(compare).toContain('/team-bonuses?');
  });

  it('搜索别名进入团队入口，搭配仍关联加成与分工', async () => {
    await loadCore();
    const html = renderToStaticMarkup(createElement(SearchProbe));
    const items: SearchItem[] = JSON.parse(html.slice('<script>'.length, -'</script>'.length));
    const teamPages = items.filter((item) => item.kind === 'page' && ['/team-fit', '/team-bonuses', '/team-plan'].includes(item.href));
    expect(teamPages.map((item) => item.href)).toEqual(['/team-fit']);
    expect(teamPages[0]).toMatchObject({ zh: '团队', py: 'tuandui', pyi: 'td' });
    for (const query of ['团队', '文明搭配', '团队加成', '团战分工', '队伍加成', 'td']) {
      expect(
        search(items, query).some((item) => item.href === '/team-fit'),
        query,
      ).toBe(true);
      expect(
        search(items, query).some((item) => item.href === '/team-bonuses' || item.href === '/team-plan'),
        query,
      ).toBe(false);
    }
    const links = fitToolLinks({ candidate: 'Franks', mates: ['Britons'] });
    expect(links?.bonuses.startsWith('/team-bonuses?')).toBe(true);
    expect(links?.plan?.startsWith('/team-plan?')).toBe(true);
    const suggestions = suggestRoutes('/team-' + 'x'.repeat(40), ALL);
    expect(suggestions.map((item) => item.label)).toEqual(['团队']);
    expect(suggestions.map((item) => item.path)).toEqual(['/team-fit']);
  });
});
