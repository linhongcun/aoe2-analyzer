import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import type { Trees, Unit } from '../../src/domain/types';
import UnitDetail from '../../src/features/units/components/UnitDetail';

const state = vi.hoisted(() => ({ core: null as Core | null, trees: null as Trees | null }));
vi.mock('../../src/shared/utils/useCoreTrees', () => ({
  useCoreTrees: () => ({ core: { data: state.core, error: false }, trees: { data: state.trees, error: false } }),
}));
const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const render = (id = 38) => renderToStaticMarkup(createElement(StaticRouter, { location: `/unit/${id}` }, createElement(UnitDetail)));
const row = (html: string, pair = '358-38') => {
  const found = html.match(new RegExp(`<article[^>]*data-counter-pair="${pair}"[^>]*>([\\s\\S]*?)<\\/article>`))?.[1];
  expect(found, `实际UnitDetail应有${pair}参考行`).toBeDefined();
  return found ?? '';
};
const withUnits = (changes: Record<number, Unit | undefined>, check: () => void) => {
  const original = state.core!;
  const map = { ...original.unitById };
  for (const [id, value] of Object.entries(changes)) {
    if (value) map[Number(id)] = value;
    else delete map[Number(id)];
  }
  state.core = { ...original, unitById: map };
  const before = structuredClone(map);
  try {
    check();
    expect(map).toEqual(before);
  } finally {
    state.core = original;
  }
};
beforeAll(async () => {
  state.core = await loadCore();
  state.trees = await loadTrees();
});

describe('#708 固定基础类别贡献', () => {
  it.each([38, 283, 569, 8, 530])('入口%i都有两个时代与可核验类别值', (id) => {
    const before = structuredClone(state.core!.unitById);
    const html = render(id);
    expect(state.core!.unitById).toEqual(before);
    expect(html).toContain('aria-label="按时代类别加成对照"');
    expect(visible(html)).toContain('常规目录时代示例');
    expect(visible(html)).toContain('不是单次总伤害或胜负');
    const pairs =
      id === 8 || id === 530
        ? [
            ['7-8', '弓手', 3],
            ['6-8', '弓手', 4],
            ['6-530', '弓手', 4],
          ]
        : [
            ['358-38', '骑兵', 22],
            ['329-38', '骑兵', 9],
            ['359-283', '骑兵', 32],
            ['330-283', '骑兵', 18],
            ['359-569', '骑兵', 32],
            ['330-569', '骑兵', 18],
          ];
    for (const [pair, category, value] of pairs) {
      const text = visible(row(html, String(pair)));
      expect(text).toContain(`${category}攻击加成 ${value}`);
      expect(text).toContain(`目标${category}类护甲 0`);
      expect(text).toContain(`该类别贡献 ${value}`);
    }
    expect(html).toContain('城堡时代');
    expect(html).toContain('帝王时代');
  });

  it('283与569独立读取护甲，变异改变对应贡献且输入不变', () => {
    const target = structuredClone(state.core!.unitById[283]!);
    const attacker = { ...state.core!.unitById[359]!, zh: '变异攻方' };
    target.zh = '变异目标';
    target.armc.find(([name]) => name === '骑兵')![1] = 5;
    const before = structuredClone(target);
    withUnits({ 283: target, 359: attacker }, () => {
      const html = render();
      expect(visible(row(html, '359-283'))).toContain('变异攻方 对 变异目标');
      expect(visible(row(html, '359-283'))).toContain('该类别贡献 27');
      expect(visible(row(html, '359-569'))).toContain('该类别贡献 32');
      expect(target).toEqual(before);
    });
  });

  it.each([
    [0, 0, 0],
    [22, 30, 0],
    [-3, 0, -3],
    [-3, 4, -3],
    [-3, -4, 1],
    [0, -2, 2],
  ])('单类%j对护甲%j贡献%j，不套总伤害最低1', (attack, armor, damage) => {
    const a = structuredClone(state.core!.unitById[358]!);
    const d = structuredClone(state.core!.unitById[38]!);
    a.atks.find(([name]) => name === '骑兵')![1] = attack;
    d.armc.find(([name]) => name === '骑兵')![1] = armor;
    withUnits({ 358: a, 38: d }, () => {
      const text = visible(row(render()));
      expect(text).toContain(`骑兵攻击加成 ${attack}`);
      expect(text).toContain(`目标骑兵类护甲 ${armor}`);
      expect(text).toContain(`该类别贡献 ${damage}`);
    });
  });

  it.each(['missing-unit', 'missing-array', 'malformed', 'duplicate', 'nan', 'infinity'])('%s不伪造数值', (kind) => {
    const a = structuredClone(state.core!.unitById[358]!);
    if (kind === 'missing-array') (a as unknown as Record<string, unknown>).atks = undefined;
    if (kind === 'malformed') (a.atks as unknown[]).push(['骑兵']);
    if (kind === 'duplicate') a.atks.push(['骑兵', 99]);
    if (kind === 'nan') a.atks.find(([name]) => name === '骑兵')![1] = NaN;
    if (kind === 'infinity') a.atks.find(([name]) => name === '骑兵')![1] = Infinity;
    withUnits({ 358: kind === 'missing-unit' ? undefined : a }, () => {
      const html = row(render());
      expect(visible(html)).toContain('数据待确认');
      expect(html).not.toContain('<dl');
    });
  });

  it('有效攻击无类别与目标无匹配类别分开，均不补0', () => {
    const a = structuredClone(state.core!.unitById[358]!);
    a.atks = a.atks.filter(([name]) => name !== '骑兵');
    withUnits({ 358: a }, () => {
      const html = row(render());
      expect(visible(html)).toContain('无该类加成');
      expect(html).not.toContain('<dl');
    });
    const d = structuredClone(state.core!.unitById[283]!);
    d.armc = d.armc.filter(([name]) => name !== '骑兵');
    withUnits({ 283: d }, () => {
      const html = row(render(), '359-283');
      expect(visible(html)).toContain('不匹配，不参与该类别伤害');
      expect(html).not.toContain('<dl');
    });
    withUnits({ 283: undefined }, () => expect(visible(row(render(), '359-283'))).toContain('数据待确认'));
  });

  it.each(['missing-array', 'malformed', 'duplicate', 'nan', 'infinity'])('目标%s独立待确认', (kind) => {
    const d = structuredClone(state.core!.unitById[283]!);
    if (kind === 'missing-array') (d as unknown as Record<string, unknown>).armc = undefined;
    if (kind === 'malformed') (d.armc as unknown[]).push(['骑兵']);
    if (kind === 'duplicate') d.armc.push(['骑兵', 99]);
    if (kind === 'nan') d.armc.find(([name]) => name === '骑兵')![1] = NaN;
    if (kind === 'infinity') d.armc.find(([name]) => name === '骑兵')![1] = Infinity;
    withUnits({ 283: d }, () => {
      const html = row(render(), '359-283');
      expect(visible(html)).toContain('数据待确认');
      expect(html).not.toContain('<dl');
    });
  });

  it('有效空攻击数组优先无加成，不补攻击0或伪造目标匹配', () => {
    const a = { ...state.core!.unitById[358]!, atks: [] };
    const d = { ...state.core!.unitById[38]!, armc: [] };
    withUnits({ 358: a, 38: d }, () => {
      const html = row(render());
      expect(visible(html)).toContain('无该类加成');
      expect(html).not.toContain('<dl');
    });
  });

  it('坏目标数据先于有效空攻击数组，不能掩盖为无加成', () => {
    const a = { ...state.core!.unitById[359]!, atks: [] };
    const d = structuredClone(state.core!.unitById[283]!);
    (d as unknown as Record<string, unknown>).armc = undefined;
    withUnits({ 359: a, 283: d }, () => {
      const html = row(render(), '359-283');
      expect(visible(html)).toContain('数据待确认');
      expect(html).not.toContain('<dl');
    });
  });

  it('其它单位无模块，不扩全库或657', () => {
    expect(render(280)).not.toContain('aria-label="按时代类别加成对照"');
  });
});
