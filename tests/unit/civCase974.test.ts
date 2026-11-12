import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { catalogCivByRouteEn, civEnCasePath } from '../../src/domain/civRoute';
import BonusDetail from '../../src/features/bonuses/components/BonusDetail';
import CivDetail from '../../src/features/civs/components/CivDetail';
import { session } from '../../src/shared/utils/sticky';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EmptyTree: ComponentType<{ civEn: string }> = () => null;

function caseGroups(ids: readonly string[]): string[][] {
  const folded = new Map<string, Set<string>>();
  for (const id of ids) {
    const key = id.toLowerCase();
    const group = folded.get(key) ?? new Set<string>();
    group.add(id);
    folded.set(key, group);
  }
  return [...folded.values()].filter((group) => group.size > 1).map((group) => [...group].sort());
}

function archiveCivIds(): string[] {
  const ids: string[] = [];
  const dir = join(root, 'src/data/patches');
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    const patch = JSON.parse(readFileSync(join(dir, name), 'utf8')) as {
      archivedTargets?: { targetType?: string; targetId?: string | number; nameEn?: string }[];
      entries?: {
        targetType?: string;
        targetId?: string | number;
        civIds?: string[];
        affectedCivIds?: string[];
        relatedTargets?: { targetType?: string; targetId?: string | number }[];
      }[];
    };
    for (const target of patch.archivedTargets ?? []) {
      if (target.targetType !== 'civ') continue;
      ids.push(String(target.targetId));
      if (target.nameEn) ids.push(target.nameEn);
    }
    for (const entry of patch.entries ?? []) {
      if (entry.targetType === 'civ') ids.push(String(entry.targetId));
      ids.push(...(entry.civIds ?? []), ...(entry.affectedCivIds ?? []));
      for (const related of entry.relatedTargets ?? []) if (related.targetType === 'civ') ids.push(String(related.targetId));
    }
  }
  return ids;
}

function renderAt(entry: string | { pathname: string; search?: string; hash?: string }) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [entry] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/civ/:en/bonus/:idx', element: createElement(BonusDetail) }),
        createElement(Route, { path: '/civ/:en', element: createElement(CivDetail, { techTree: EmptyTree }) }),
      ),
    ),
  );
}

describe('#974 文明路由只差大小写时对齐到目录英文名', () => {
  it('先精确，再只认大小写；已是规范名或拼写不同都不跳', () => {
    expect(catalogCivByRouteEn(civs, 'Franks')?.en).toBe('Franks');
    expect(catalogCivByRouteEn(civs, 'franks')?.en).toBe('Franks');
    expect(catalogCivByRouteEn(civs, 'FRANKS')?.en).toBe('Franks');
    expect(catalogCivByRouteEn(civs, 'Tatars')?.en).toBe('Tatars');
    expect(catalogCivByRouteEn(civs, 'Tartars')).toBeUndefined();
    expect(civEnCasePath(civs, 'Franks')).toBeUndefined();
    expect(civEnCasePath(civs, 'franks')).toBe('/civ/Franks');
    expect(civEnCasePath(civs, 'FRANKS')).toBe('/civ/Franks');
    expect(civEnCasePath(civs, 'Tartars')).toBeUndefined();
    expect(civEnCasePath(civs, 'Franks', '/bonus/0')).toBeUndefined();
    expect(civEnCasePath(civs, 'franks', '/bonus/0')).toBe('/civ/Franks/bonus/0');
    expect(civEnCasePath(civs, 'FRANKS', '/bonus/team')).toBe('/civ/Franks/bonus/team');
    const both = [{ en: 'Franks' }, { en: 'franks' }];
    expect(catalogCivByRouteEn(both, 'franks')?.en).toBe('franks');
    expect(civEnCasePath(both, 'franks')).toBeUndefined();
    expect(civEnCasePath(both, 'FRANKS')).toBe('/civ/Franks');
    for (const civ of civs) {
      expect(civEnCasePath(civs, civ.en)).toBeUndefined();
      const lower = civ.en.toLowerCase();
      const upper = civ.en.toUpperCase();
      expect(civEnCasePath(civs, lower)).toBe(lower === civ.en ? undefined : `/civ/${civ.en}`);
      expect(civEnCasePath(civs, upper)).toBe(upper === civ.en ? undefined : `/civ/${civ.en}`);
    }
  });

  it('目录、文明史和补丁档案没有只差大小写的文明身份', () => {
    const catalog = civs.map((civ) => civ.en);
    const history = Object.keys(JSON.parse(readFileSync(join(root, 'src/features/civs/history.json'), 'utf8')) as Record<string, unknown>);
    const archives = archiveCivIds();
    expect(caseGroups(catalog)).toEqual([]);
    expect(caseGroups(history)).toEqual([]);
    expect(caseGroups(archives)).toEqual([]);
    const catalogFold = new Map(catalog.map((en) => [en.toLowerCase(), en]));
    const caseOnly = (ids: readonly string[]) => [
      ...new Set(
        ids.filter((id) => {
          const canonical = catalogFold.get(id.toLowerCase());
          return canonical !== undefined && canonical !== id;
        }),
      ),
    ];
    expect(caseOnly(archives)).toEqual([]);
    expect(caseOnly(history)).toEqual([]);
  });

  it('小写地址第一次渲染不写 lastCiv，也不画出历史空态', () => {
    session.lastCiv = 'Britons';
    const lower = renderAt({ pathname: '/civ/franks', search: '?tab=techtree', hash: '#patches' });
    expect(session.lastCiv).toBe('Britons');
    expect(lower).not.toContain('尚未收录该对象的更新历史');
    expect(lower).not.toContain('当前目录和历史档案均未找到此项。');
    expect(lower).not.toContain('正在加载更新历史');
    expect(lower).not.toContain('法兰克');

    const upperBonus = renderAt('/civ/FRANKS/bonus/0');
    expect(upperBonus).not.toContain('id="bonuses"');
    expect(upperBonus).not.toContain('尚未收录该对象的更新历史');
    expect(session.lastCiv).toBe('Britons');

    const canonical = renderAt('/civ/Franks');
    expect(canonical).toContain('法兰克');
    expect(canonical).not.toContain('尚未收录该对象的更新历史');
    expect(session.lastCiv).toBe('Britons');

    const missing = renderAt('/civ/Tartars');
    expect(missing).toContain('正在加载更新历史');
    expect(missing).not.toContain('鞑靼');
  });
});
