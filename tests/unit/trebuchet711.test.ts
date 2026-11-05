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
const render = (id = 331) => renderToStaticMarkup(createElement(StaticRouter, { location: `/unit/${id}` }, createElement(UnitDetail)));
const states = (html: string) => {
  const section = html.match(/<section[^>]*aria-label="打包与展开"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  expect(section, '真实UnitDetail应有两态区').toBeDefined();
  return visible(section ?? '');
};

beforeAll(async () => {
  state.core = await loadCore();
  state.trees = await loadTrees();
});

describe('#711 两态展示而非新战斗模型', () => {
  it('331明确区分可否攻击、移动、射程与待确认耗时', () => {
    const text = states(render());
    for (const item of [
      '打包态',
      '可移动，不能攻击',
      '移动速度 0.8',
      '近战护甲 2',
      '穿刺护甲 8',
      '展开态',
      '可攻击，固定位置',
      '攻击力 200',
      '射程 16',
      '最小射程 4',
      '攻击间隔 10s',
      '展开／打包耗时：待确认',
    ])
      expect(text).toContain(item);
    expect(text).not.toContain('50s');
  });

  it('状态数值随目录输入改变，既有输入不被修改', () => {
    const original = state.core!;
    const unit = { ...original.unitById[331]!, spd: 1.23, ma: 6, pa: 9, atk: 211, rng: 17, minr: 5, rof: 12 } as Unit;
    const before = structuredClone(unit);
    state.core = { ...original, unitById: { ...original.unitById, 331: unit } };
    try {
      const text = states(render());
      for (const item of ['移动速度 1.23', '近战护甲 6', '穿刺护甲 9', '攻击力 211', '射程 17', '最小射程 5', '攻击间隔 12s']) expect(text).toContain(item);
      expect(unit).toEqual(before);
    } finally {
      state.core = original;
    }
  });

  it('非331没有状态特例，也不改生成的歧义说明', () => {
    const html = render(1258);
    expect(html).not.toContain('aria-label="打包与展开"');
    expect(html).not.toContain('不模拟两态切换');
    expect(state.core!.unitById[331]!.desc).toContain('组装后才能移动，拆装后即可攻击');
  });
});
