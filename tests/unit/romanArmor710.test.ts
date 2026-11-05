import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import BonusDetail from '../../src/features/bonuses/components/BonusDetail';
const render = (location = '/civ/Romans/bonus/1') =>
  renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location },
      createElement(Routes, null, createElement(Route, { path: '/civ/:en/bonus/:idx', element: createElement(BonusDetail) })),
    ),
  );
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
beforeAll(async () => {
  await loadCore();
  await loadTrees();
});
describe('#710 罗马条件护甲现有页面验收', () => {
  it('Romans-1显示每项贡献与合法累计而非内部命令', () => {
    const html = render();
    expect(html).toContain('aria-label="步兵护甲科技对照"');
    for (const id of [74, 76]) expect(html).toContain(`data-armor-tech="${id}"`);
    for (const stage of ['base', 'scale', 'chain']) expect(html).toContain(`data-armor-stage="${stage}"`);
    expect(text(html)).toContain('罗马无法研究步兵钢甲，本例不计入');
    expect(html).not.toContain('data-armor-tech="77"');
  });
  it('相邻bonus与其它文明不挂专属对照', () => {
    for (const path of ['/civ/Romans/bonus/0', '/civ/Britons/bonus/1']) expect(render(path)).not.toContain('aria-label="步兵护甲科技对照"');
  });
});

import { civByEn } from '../../src/data';
import { civBonuses } from '../../src/domain/civBonus';
import { romanArmor } from '../../src/features/bonuses/romanArmor710';
import { TECH_EFFECTS } from '../../src/domain/effects';
describe('#710 护甲投影来源与闭包', () => {
  it('真实单项/对象/前置累计、Plate不可用，全部输入不变', async () => {
    const core = await loadCore(),
      trees = await loadTrees(),
      b = civBonuses(civByEn('Romans')!)[1]!;
    const snapshot = structuredClone({ units: core.units, techs: core.techs, trees });
    const result = romanArmor(b, core.units, core.techs, trees)!;
    expect(result.rows.map((r) => r.t.id)).toEqual([74, 76]);
    for (const row of result.rows) {
      expect(row.normal).toEqual({ ma: 1, pa: 1 });
      expect(row.roman).toEqual({ ma: 2, pa: 2 });
      expect(row.units.map((u) => u.id)).toEqual([74, 75, 77, 93, 358, 359, 1793]);
    }
    expect(result.unavailable.map((t) => t.id)).toContain(77);
    expect(result.example?.u.id).toBe(1793);
    expect(result.example?.stages.map((s) => [s.t?.id ?? null, s.ma, s.pa])).toEqual([
      [null, 2, 2],
      [74, 4, 4],
      [76, 6, 6],
    ]);
    expect({ units: core.units, techs: core.techs, trees }).toEqual(snapshot);
  });
  it('按真实pred/树与catalog交集；不把隐藏Plate当可用', async () => {
    const core = await loadCore(),
      trees = await loadTrees(),
      b = civBonuses(civByEn('Romans')!)[1]!;
    const units = structuredClone(core.units),
      tree = structuredClone(trees);
    units.find((u) => u.id === 74)!.civs = [];
    for (const block of tree.t.Romans!) for (const c of block[3]) if (c[2] === 'u' && c[3] === 75) c[4] = 0;
    const r = romanArmor(b, units, core.techs, tree)!;
    expect(r.rows[0]!.units.map((u) => u.id)).toEqual([77, 93, 358, 359, 1793]);
    const noExtra = { ...b, techFx: b.techFx.map(([n, x]) => [n, { ...x, pred: () => false }] as (typeof b.techFx)[number]) };
    expect(romanArmor(noExtra, core.units, core.techs, trees)?.rows).toEqual([]);
  });
  it('变化读取基础护甲/extra贡献一次，前置缺失不展示非法累计', async () => {
    const core = await loadCore(),
      trees = await loadTrees(),
      b = civBonuses(civByEn('Romans')!)[1]!;
    const units = structuredClone(core.units);
    units.find((u) => u.id === 1793)!.ma = 9;
    expect(romanArmor(b, units, core.techs, trees)?.example?.stages.map((s) => s.ma)).toEqual([9, 11, 13]);
    const doubled = { ...b, techFx: b.techFx.map(([n, x]) => [n, { ...x, fx: x.fx.map((e) => ({ ...e, v: e.v * 2 })) }] as (typeof b.techFx)[number]) };
    expect(romanArmor(doubled, core.units, core.techs, trees)?.rows[0]!.roman).toEqual({ ma: 3, pa: 3 });
    const noScale = { ...b, techFx: b.techFx.filter(([n]) => n !== core.techById[74]!.en) };
    expect(romanArmor(noScale, core.units, core.techs, trees)?.example).toBeNull();
    expect(TECH_EFFECTS[core.techById[74]!.en]).toBeDefined();
  });
});
