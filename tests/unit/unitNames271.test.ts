// issue 271：混兵情境单位名与全站一致；团战分工下拉同名可区分。Steve / Kent 验收由 v0300-271 e2e 覆盖；本文件守住显示期转换与下拉标签。
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, type Core } from '../../src/data';
import MIXED from '../../src/content/mixed-army.json';
import { unitOptionLabel } from '../../src/features/teamPlan/TeamPlan';
import type { ProductionContext } from '../../src/domain/production';

let core: Core;
let ctx: ProductionContext;
beforeAll(async () => {
  core = await loadCore();
  ctx = { core, trees: { t: {} } } as ProductionContext;
});

const badWagon = (t: string) => t.replace(/胡斯派战车/g, '').includes('战车');
const badCannon = (t: string) => t.replace(/火炮术/g, '').includes('火炮');
const KEEP_EXTERNAL = new Set(MIXED.sources.map((s) => s.title));

describe('#271 混兵情境文案', () => {
  it('Steam 链接不带语言参数', () => {
    expect(MIXED.sources.filter((s) => /[?&]l=/.test(s.url))).toEqual([]);
    expect(MIXED.sources.some((s) => s.url.includes('steamcommunity.com'))).toBe(true);
  });
  it('外部来源标题保留原样（含「受战车保护的火炮为何难以切入？」）', () => {
    expect(KEEP_EXTERNAL.has('受战车保护的火炮为何难以切入？')).toBe(true);
  });
  it('Arena 情境标题与敌军说明用站内名，不含单独的「战车」「火炮」', () => {
    const scenario = MIXED.scenarios.find((s) => s.id === 'arena-wagon-cannon')!;
    for (const t of [scenario.title, scenario.singleThreatNote, scenario.mixedThreatNote]) {
      expect(badWagon(t), t).toBe(false);
      expect(badCannon(t), t).toBe(false);
    }
    expect(scenario.title).toContain('胡斯派战车');
    expect(scenario.title).toContain('手推炮');
  });
  it('Arena 卡片正文（不含外部来源标题）没有单独的「战车」「火炮」', () => {
    for (const card of MIXED.cards.filter((c) => c.scenario === 'arena-wagon-cannon')) {
      const blob = JSON.stringify(card);
      expect(badWagon(blob), card.id).toBe(false);
      expect(badCannon(blob), card.id).toBe(false);
    }
  });
  it('界面敌军选项与表单标签已改名', () => {
    const src = readFileSync(new URL('../../src/features/mixedArmy/MixedArmy.tsx', import.meta.url), 'utf8');
    expect(src).toContain("wagons: '目前只见胡斯派战车'");
    expect(src).toContain("'wagons-cannon': '胡斯派战车与后排手推炮'");
    expect(src).toContain("'wagons-cannon-halberdiers': '胡斯派战车、后排手推炮与长戟兵'");
    expect(src).toContain('aria-label="已见前排单位形态"');
    expect(src).toContain('aria-label="已见后排攻城形态"');
    expect(src).not.toMatch(/目前只见战车'|战车与后排火炮|已见战车形态|已见后排火炮形态|已见胡斯派战车形态|已见后排手推炮形态/);
  });
});

describe('#271 团战分工下拉：同名单位可区分', () => {
  it('近卫军（759 兵营、41 城堡）标签不同且都含「近卫军」', () => {
    const a = core.unitById[759]!,
      b = core.unitById[41]!;
    const siblings = [a, b];
    const la = unitOptionLabel(ctx, a, siblings),
      lb = unitOptionLabel(ctx, b, siblings);
    expect(la).toContain('近卫军');
    expect(lb).toContain('近卫军');
    expect(la).not.toBe(lb);
    expect(la).toContain('兵营');
    expect(lb).toContain('城堡');
  });
  it('战车（1962 与 1759）标签不同', () => {
    const a = core.unitById[1962]!,
      b = core.unitById[1759]!;
    const siblings = [a, b];
    const la = unitOptionLabel(ctx, a, siblings),
      lb = unitOptionLabel(ctx, b, siblings);
    expect(la).toBe('战车（攻城武器厂）');
    expect(lb).toBe('战车（城堡）');
  });
  it('同组无重名时不加括号', () => {
    const u = core.unitById[36]!;
    expect(unitOptionLabel(ctx, u, [u])).toBe('手推炮');
  });
  it('任意同名组内标签互不相同', () => {
    const byZh = new Map<string, typeof core.units>();
    for (const u of core.units) {
      const list = byZh.get(u.zh) ?? [];
      list.push(u);
      byZh.set(u.zh, list);
    }
    for (const [, group] of byZh) {
      if (group.length < 2) continue;
      const labels = group.map((u) => unitOptionLabel(ctx, u, group));
      expect(new Set(labels).size, labels.join('|')).toBe(labels.length);
    }
  });
});
