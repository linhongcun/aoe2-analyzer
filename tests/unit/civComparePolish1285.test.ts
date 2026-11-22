import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { civFormationContent } from '../../src/data/civFormations';
import { CORE } from '../../src/data/core';
import { DATA_PATCH } from '../../src/data/sources';
import trees from '../../data/game/trees.json';
import { projectFormation, publishedFormations, type FormationView } from '../../src/domain/civFormations';
import { swapCompareCivilizations } from '../../src/domain/compare';
import { parseCompareFact } from '../../src/domain/compareFactFormat';
import { dedupeFormationClauses } from '../../src/domain/formationDedup';
import type { Trees } from '../../src/domain/types';

const catalog = { core: CORE, trees: trees as unknown as Trees };

function projectCivRoutes(civEn: string): FormationView[] {
  const content = civFormationContent.find((entry) => entry.civ === civEn);
  if (!content) return [];
  const routes = publishedFormations(content);
  return routes.map((route) => projectFormation(route, civEn, DATA_PATCH, catalog, routes, content.source));
}

describe('formationDedup (issue 1285)', () => {
  it('extracts exact shared clauses across current routes on real civ-formations data without emptying any field', () => {
    const counts: Record<string, number> = {};
    for (const entry of civFormationContent) {
      const views = projectCivRoutes(entry.civ);
      const originalReasons = new Map(
        views.filter((v): v is Extract<FormationView, { status: 'current' }> => v.status === 'current').map((v) => [v.route.id, v.route.reason]),
      );
      const res = dedupeFormationClauses(views);
      if (res.shared.length > 0) counts[entry.civ] = res.shared.length;
      for (const view of views) {
        if (view.status !== 'current') continue;
        expect(view.route.reason).toBe(originalReasons.get(view.route.id));
        const deduped = res.byRouteId[view.route.id];
        if (!deduped) continue;
        if (view.route.reason) expect((deduped.reason ?? '').length).toBeGreaterThan(0);
        if (view.route.presentation !== 'age-progression' && view.route.limitation) {
          expect((deduped.limitation ?? '').length).toBeGreaterThan(0);
        }
      }
    }
    expect(counts).toEqual({
      Teutons: 1,
      Franks: 2,
      Poles: 2,
      Mapuche: 5,
    });
  });

  it('preserves both distinct Franks shared clauses, tracks Poles subset route scope, and removes repeats from route cards', () => {
    const views = projectCivRoutes('Franks');
    const res = dedupeFormationClauses(views);
    expect(res.shared.map((item) => item.text)).toEqual([
      '免费磨坊科技只节省升级投入，不意味着无限补兵。',
      '免费磨坊科技不意味着无限补兵。',
    ]);
    for (const view of views) {
      if (view.status !== 'current') continue;
      const item = res.byRouteId[view.route.id];
      expect(item).toBeDefined();
      expect(item?.reason ?? '').not.toContain('免费磨坊科技只节省升级投入，不意味着无限补兵');
      expect(item?.limitation ?? '').not.toContain('免费磨坊科技不意味着无限补兵');
    }

    const polesViews = projectCivRoutes('Poles');
    const polesRes = dedupeFormationClauses(polesViews);
    expect(polesRes.shared.length).toBe(2);
    const trample = polesRes.shared.find((item) => item.text.includes('列克提克遗产'));
    expect(trample).toBeDefined();
    expect(trample?.allRoutes).toBe(false);
    expect(trample?.routeTitles.length).toBe(2);
    expect(trample?.routeTitles.some((title) => title.includes('骑士'))).toBe(false);
  });

  it('does not split semicolons inside parentheses and handles age-progression and non-current views safely', () => {
    const base = projectCivRoutes('Franks').find((v): v is Extract<FormationView, { status: 'current' }> => v.status === 'current')!;
    const routeA: Extract<FormationView, { status: 'current' }> = {
      ...base,
      route: {
        ...base.route,
        id: 'route-a',
        presentation: 'age-progression',
        reason: '说明甲（保留括号内分号；不可拆断）。公共前提说明用于多路线汇总。',
        limitation: '不可渲染的限制句不应被扫描。',
      },
    };
    const routeB: Extract<FormationView, { status: 'current' }> = {
      ...base,
      route: {
        ...base.route,
        id: 'route-b',
        presentation: undefined,
        reason: '说明乙；公共前提说明用于多路线汇总。',
        limitation: '不可渲染的限制句不应被扫描。',
      },
    };
    const historical: FormationView = { status: 'historical', route: routeB.route, source: null };
    const unverified: FormationView = { status: 'unverified', id: 'u1', source: null, pendingText: '待核实' };

    const res = dedupeFormationClauses([routeA, routeB, historical, unverified]);
    expect(res.shared).toEqual([
      {
        text: '公共前提说明用于多路线汇总。',
        routeTitles: [routeA.route.title, routeB.route.title],
        allRoutes: true,
      },
    ]);
    expect(res.byRouteId['route-a']?.reason).toBe('说明甲（保留括号内分号；不可拆断）。');
    expect(res.byRouteId['route-a']?.limitation).toBeUndefined();
    expect(res.byRouteId['route-b']?.reason).toBe('说明乙。');
    expect(res.byRouteId['route-b']?.limitation).toBe('不可渲染的限制句不应被扫描。');

    expect(dedupeFormationClauses([routeA, historical, unverified]).shared).toEqual([]);
  });
});

describe('parseCompareFact (issue 1285)', () => {
  it('parses all 56x4 = 224 civs.json fact cells cleanly without dangling parentheses', () => {
    expect(civs.length).toBe(56);
    for (const civ of civs) {
      for (const key of ['uu', 'ct', 'it', 'tb'] as const) {
        const raw = civ[key];
        const parsed = parseCompareFact(raw);
        expect(parsed.main.length, `${civ.en}.${key}`).toBeGreaterThan(0);
        if (key === 'ct' || key === 'it') {
          expect(parsed.en, `${civ.en}.${key} en`).toBeTruthy();
          expect(parsed.desc, `${civ.en}.${key} desc`).toBeTruthy();
        }
        if (key === 'uu') {
          expect(parsed.en, `${civ.en}.uu en`).toBeTruthy();
          expect(parsed.main.endsWith('）')).toBe(false);
        }
        if (key === 'tb') {
          expect(parsed.en).toBeUndefined();
          expect(parsed.desc).toBeUndefined();
          expect(parsed.main).toBe(raw.trim());
        }
      }
    }
  });

  it('handles nested parentheses, half-width pipes, and multi-unit english names', () => {
    const sicilians = civs.find((c) => c.en === 'Sicilians')!;
    const ct = parseCompareFact(sicilians.ct);
    expect(ct.main).toBe('第一次十字军东征');
    expect(ct.en).toBe('First Crusade');
    expect(ct.desc).toContain('最多生效 5 座');

    const franks = civs.find((c) => c.en === 'Franks')!;
    const uu = parseCompareFact(franks.uu);
    expect(uu.main).toBe('掷斧兵 (步兵)');
    expect(uu.en).toBe('Throwing Axeman (Infantry)');

    const halfPipe = parseCompareFact('示例科技 (测试效果 -20%)|Sample Tech');
    expect(halfPipe).toEqual({ main: '示例科技', en: 'Sample Tech', desc: '测试效果 -20%' });
  });
});

describe('swapCompareCivilizations (issue 1285)', () => {
  it('swaps a and b while preserving unknown params', () => {
    expect(swapCompareCivilizations('?a=Franks&b=Britons&x=1&flag=&x=2')).toBe('?a=Britons&b=Franks&x=1&flag=&x=2');
  });

  it('returns null when both civilizations are identical', () => {
    expect(swapCompareCivilizations('?a=Franks&b=Franks')).toBeNull();
  });

  it('normalizes single-side or invalid queries before swapping', () => {
    const swappedSingle = swapCompareCivilizations('?a=Jurchens');
    expect(swappedSingle).toContain('b=Jurchens');
    expect(swappedSingle).not.toContain('a=Jurchens');

    expect(swapCompareCivilizations('?a=InvalidCiv&b=Britons')).toBe('?a=Britons&b=Franks');
  });
});
