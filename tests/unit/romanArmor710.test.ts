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

describe('#710 审阅发现的未知资格与顺序操作边界', () => {
  it('缺科技树键是待确认，不可声称无法研究', async () => {
    const core = await loadCore(),
      trees = await loadTrees(),
      b = civBonuses(civByEn('Romans')!)[1]!;
    const missing = structuredClone(trees);
    for (const block of missing.t.Romans!) block[3] = block[3].filter((c) => !(c[2] === 't' && c[3] === 74));
    const r = romanArmor(b, core.units, core.techs, missing)!;
    expect(r.unavailable.map((t) => t.id)).not.toContain(74);
    expect(r.rows.some((row) => row.t.id === 74)).toBe(false);
    const noTree = structuredClone(trees);
    delete noTree.t.Romans;
    expect(romanArmor(b, core.units, core.techs, noTree)?.unavailable).toEqual([]);
  });
  it('真实普通效果变异跟随；累计按add/mul/set逐项应用', async () => {
    const core = await loadCore(),
      trees = await loadTrees(),
      b = civBonuses(civByEn('Romans')!)[1]!;
    const scale = core.techById[74]!.en,
      chain = core.techById[76]!.en;
    const savedScale = TECH_EFFECTS[scale]!,
      savedChain = TECH_EFFECTS[chain]!;
    try {
      TECH_EFFECTS[scale] = [
        [
          () => true,
          [
            { s: 'ma', op: 'add', v: 3 },
            { s: 'pa', op: 'add', v: 4 },
          ],
        ],
      ];
      TECH_EFFECTS[chain] = [
        [
          () => true,
          [
            { s: 'ma', op: 'mul', v: 2 },
            { s: 'pa', op: 'set', v: 10 },
          ],
        ],
      ];
      const r = romanArmor(b, core.units, core.techs, trees)!;
      const row = r.rows.find((r) => r.t.id === 74 && r.units.some((u) => u.id === 1793))!;
      expect(row.normal).toEqual({ ma: 3, pa: 4 });
      expect(row.roman).toEqual({ ma: 4, pa: 5 });
      expect(r.example?.stages.map((s) => [s.ma, s.pa])).toEqual([
        [2, 2],
        [6, 7],
        [13, 11],
      ]);
    } finally {
      TECH_EFFECTS[scale] = savedScale;
      TECH_EFFECTS[chain] = savedChain;
    }
  });
});

it('#710 来源/归属或普通规则缺失不给可信数字；累计不退成缺锁甲的两阶段', async () => {
  const core = await loadCore(),
    trees = await loadTrees(),
    b = civBonuses(civByEn('Romans')!)[1]!;
  for (const bad of [
    { ...b, src: 'text' as const },
    { ...b, idx: 0 },
  ]) {
    const r = romanArmor(bad, core.units, core.techs, trees)!;
    expect(r.rows).toEqual([]);
    expect(r.unavailable).toEqual([]);
    expect(r.example).toBeNull();
  }
  const missing = romanArmor(
    b,
    core.units,
    core.techs.filter((t) => t.id !== 76),
    trees,
  )!;
  expect(missing.rows.some((r) => r.t.id === 74)).toBe(true);
  expect(missing.example).toBeNull();
  const name = core.techById[74]!.en,
    saved = TECH_EFFECTS[name]!;
  try {
    delete TECH_EFFECTS[name];
    const r = romanArmor(b, core.units, core.techs, trees)!;
    expect(r.rows.some((r) => r.t.id === 74)).toBe(false);
    expect(r.unavailable.some((t) => t.id === 74)).toBe(false);
    expect(r.example).toBeNull();
  } finally {
    TECH_EFFECTS[name] = saved;
  }
});

it('#710 fresh仅为文本一致性审计，false仍保留有效DAT贡献', async () => {
  const core = await loadCore(),
    trees = await loadTrees(),
    b = civBonuses(civByEn('Romans')!)[1]!;
  expect(romanArmor({ ...b, fresh: false }, core.units, core.techs, trees)).toEqual(romanArmor(b, core.units, core.techs, trees));
});
