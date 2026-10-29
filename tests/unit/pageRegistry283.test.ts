import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGE_META } from '../../src/domain/sharePage';
import { LAZY_COMPONENTS, PAGES, PLACEMENT_ALLOWLIST, hasEntryPlacement } from '../../src/shared/nav/pageRegistry';
import { HOME_GROUPS, WIKI, sectionOf } from '../../src/shared/nav/sections';
import { PLAYER_CATALOG } from '../../src/data/players';
import { playerRoutes } from '../../src/domain/playerCatalog.mjs';

const allow = new Set<string>(PLACEMENT_ALLOWLIST);
if (PLAYER_CATALOG.status !== 'ready') throw new Error('Verified player catalog required for generated-page membership');
const playerPaths = new Set(playerRoutes(PLAYER_CATALOG.catalog));
const generated = (path: string) => playerPaths.has(path) || /^\/(unit|tech|building|civ|tree|builds|glossary|patches)\//.test(path);

describe('页面登记表 #283', () => {
  it('选手生成路径只接受目录中的真实成员', () => {
    for (const path of playerPaths) expect(generated(path)).toBe(true);
    for (const path of ['/players/unknown', '/players/:id', '/players/hera/extra', '/players/Hera']) expect(generated(path)).toBe(false);
  });
  it('每条登记都有路由，路由表只从登记表生成', () => {
    const routes = readFileSync('src/app/routes.tsx', 'utf8');
    const paths = PAGES.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(routes).toContain('PAGE_REGISTRY.map');
    expect(routes).toContain('path="*"');
    expect(routes).not.toMatch(/path="\/[a-z]/);
    for (const page of PAGES) {
      expect(page.component || page.redirectTo || page.redirectDefaultTree, page.key).toBeTruthy();
    }
  });

  it('懒加载组件和登记表里的 component 一一对应', () => {
    const binding = readFileSync('src/app/pageRegistry.tsx', 'utf8');
    const used = new Set(PAGES.flatMap((page) => (page.component && page.component !== 'Home' ? [page.component] : [])));
    expect([...used].sort()).toEqual([...LAZY_COMPONENTS].sort());
    for (const id of LAZY_COMPONENTS) expect(binding, id).toContain(`${id}: lazy(`);
    expect(binding).toContain("component === 'Home'");
  });

  it('每条要么有首页或导航位置，要么写明 entry: none 的原因；已知缺口在允许清单', () => {
    expect([...PLACEMENT_ALLOWLIST]).toEqual(['market', 'eco-payoff', 'about-data']);
    for (const page of PAGES) {
      if (allow.has(page.key)) continue;
      expect(hasEntryPlacement(page), `${page.key} 缺少入口或 entry: 'none' 的原因`).toBe(true);
    }
    const about = PAGES.find((page) => page.key === 'about-data');
    expect(about?.lane).toBeUndefined();
    expect(about?.entry).not.toBe('none');
    expect(sectionOf('/about-data')).toBeUndefined();
  });

  it('静态元数据和登记表一一对应，动态条目仍由数据生成', () => {
    const declared = PAGES.filter((page) => page.metaTitle);
    for (const page of declared) {
      expect(PAGE_META[page.path]?.title, page.path).toBe(page.metaTitle);
      expect(PAGE_META[page.path]?.description, page.path).toBe(page.metaDescription);
    }
    const declaredPaths = new Set(declared.map((page) => page.path));
    for (const path of Object.keys(PAGE_META)) {
      if (generated(path)) continue;
      expect(declaredPaths.has(path), path).toBe(true);
    }
    const script = readFileSync('scripts/page_metadata.mjs', 'utf8');
    expect(script).toContain('pageRegistry.ts');
    expect(script).not.toContain("'/market':");
  });

  it('首页从分组派生，不再手写页面 key 数组', () => {
    const home = readFileSync('src/features/home/components/Home.tsx', 'utf8');
    expect(home).toContain('HOME_GROUPS.map');
    expect(home).not.toMatch(/\[(?:\s*'[/a-z0-9-]+'\s*,){2,}\s*'[/a-z0-9-]+'\s*\]/);
    const economy = HOME_GROUPS.find((group) => group.key === 'economy')!;
    expect(economy.sections.map((section) => section.path)).toEqual(expect.arrayContaining(['/market', '/eco-payoff']));
    expect(WIKI.filter((section) => !section.hideNav).map((section) => section.key)).toEqual(['civs', 'units', 'buildings', 'techs', 'tree']);
  });
});
