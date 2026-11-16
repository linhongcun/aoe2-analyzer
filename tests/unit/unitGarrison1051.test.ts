import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  calculateGeneralGarrison,
  GENERAL_GARRISON_DATA,
  getGarrisonCandidates,
  readGeneralGarrison,
  type GeneralGarrisonContext,
} from '../../src/domain/garrisonGeneral';
import { unitGarrisonSummary } from '../../src/features/units/garrisonSummary';
import UnitGarrison from '../../src/features/units/components/UnitGarrison';
import * as garrison from '../../src/domain/garrisonGeneral';

let ctx: GeneralGarrisonContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const summary = (id = 24, civ = 'Koreans', data = GENERAL_GARRISON_DATA) => unitGarrisonSummary(ctx, id, civ, data);
const host = (id = 24, civ = 'Koreans', building = 235, data = GENERAL_GARRISON_DATA) => summary(id, civ, data).rows.find((r) => r.building.id === building)!;
const probe = { civ: 'Koreans', age: 3, techs: [], rows: [{ unitId: 24, count: '0', entry: 'enter' as const }] };

describe('#1051 unit → garrison summary', () => {
  it.each([
    [24, 'Koreans', 4, null],
    [5, 'Bohemians', 5, 4],
  ] as const)('单位 %i 摘要与唯一配置/URL重算一致', (id, civ, total, saturation) => {
    const rows = summary(id, civ).rows;
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      expect(row.result?.errors).toEqual([]);
      expect(row.config).toMatchObject({ civ, age: row.age, techs: [], rows: [{ unitId: id, count: String(row.result!.capacity), entry: 'enter' }] });
      const params = new URLSearchParams(row.href!.split('?')[1]);
      expect(params.get('tab')).toBe('garrison');
      expect(params.get('gv')).toBe('2');
      expect(params.get('gtechs')).toBe('');
      const decoded = readGeneralGarrison(params, row.building);
      expect(decoded).toEqual({ config: row.config, errors: [] });
      expect(calculateGeneralGarrison(ctx, row.building, decoded.config)).toEqual(row.result);
    }
    expect(host(id, civ).result).toMatchObject({ capacity: 5, totalProjectiles: total, maxProjectiles: 5, singleUnitSaturationAt: saturation });
    expect(host(id, civ).age).toBe(4);
  });

  it('Armenians93×109为时代1/真实0；逐对宿主时代和其他文明下限保持', () => {
    const tc = host(93, 'Armenians', 109);
    expect(tc.age).toBe(1);
    expect(tc.result).toMatchObject({ errors: [], totalProjectiles: 0 });
    expect(new URLSearchParams(tc.href!.split('?')[1]).get('age')).toBe('1');
    expect(host(93, 'Franks', 109).age).toBe(2);
    expect(host(93, 'Armenians', 82).age).toBe(3);
    expect(host(93, 'Armenians', 79).age).toBe(2);
    expect(host(77, 'Armenians', 109).age).toBe(2);
  });

  it('仅含外部进入宿主；未选文明/不可训练/无宿主不是同一空态', () => {
    expect(summary(24, '')).toEqual({ kind: 'select', rows: [] });
    expect(summary(24, 'Bulgarians')).toEqual({ kind: 'unavailable', rows: [] });
    expect(summary(280, 'Franks')).toEqual({ kind: 'hosts', rows: [] });
    expect(summary(24).rows.some((r) => r.building.id === 87)).toBe(false);
    const knight = host(38, 'Franks', 82).result!;
    expect(knight.extraProjectiles).toBe(0);
    expect(knight.totalProjectiles).toBe(knight.baseProjectiles);
    expect(host().config!.rows[0]!.unitId).toBe(24);
    expect(host(4, 'Koreans', 79).config!.rows[0]!.unitId).toBe(4);
    expect(summary(24).rows.find((r) => r.building.id === 236)?.result?.mode).toBe('cannon');
  });

  it.each([NaN, -1, 256, 1.5])('真实 API 无效容量 %s 返回默认0时不吞成无宿主', (capacity) => {
    const data = structuredClone(GENERAL_GARRISON_DATA);
    data.units[79]!.capacity = capacity;
    const result = calculateGeneralGarrison(ctx, ctx.core.buildingById[79]!, probe, data);
    expect(result).toMatchObject({ capacity: 0, rows: [] });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(host(24, 'Koreans', 79, data)).toMatchObject({ result: null, href: null, config: null });
  });

  it('真实有限0容量已处理单行，与未处理默认0不同', () => {
    const data = structuredClone(GENERAL_GARRISON_DATA);
    data.units[79]!.capacity = 0;
    const result = calculateGeneralGarrison(ctx, ctx.core.buildingById[79]!, probe, data);
    expect(result).toMatchObject({ capacity: 0, rows: [{ unitId: 24, countValue: 0, canEnter: false }] });
    expect(getGarrisonCandidates(ctx, ctx.core.buildingById[79]!, probe, data).some((r) => r.id === 24)).toBe(false);
    expect(host(24, 'Koreans', 79, data)).toBeUndefined();
  });

  it.each(['contribution', 'max', 'firepower'] as const)('真实 %s 未知仍保留可信满容量配置和同参链接', (field) => {
    const data = structuredClone(GENERAL_GARRISON_DATA);
    if (field === 'contribution') data.units[24]!.firepower = NaN;
    if (field === 'max') data.units[79]!.max = NaN;
    if (field === 'firepower') data.units[data.units[79]!.secondaryProjectile]!.attack = NaN;
    const row = host(24, 'Koreans', 79, data);
    expect(row.result).toMatchObject({ errors: [], capacity: 5, usedSlots: 5, totalProjectiles: null, extraProjectiles: null });
    if (field === 'max') expect(row.result!.mode).toBe('shelter');
    const decoded = readGeneralGarrison(new URLSearchParams(row.href!.split('?')[1]), row.building);
    expect(decoded).toEqual({ config: row.config, errors: [] });
    expect(calculateGeneralGarrison(ctx, row.building, decoded.config, data)).toEqual(row.result);
  });

  it('真实上下文前置错误不伪造可进入或空宿主', () => {
    const data = structuredClone(GENERAL_GARRISON_DATA);
    delete data.civs.Koreans;
    const rows = summary(24, 'Koreans', data).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.result === null && r.href === null)).toBe(true);
  });
});

const markup = (overrides: Partial<Parameters<typeof UnitGarrison>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: '/' },
      createElement(UnitGarrison, {
        core: ctx.core,
        trees: ctx.trees,
        unitId: 24,
        civ: 'Koreans',
        error: false,
        pending: false,
        retry: vi.fn(),
        ...overrides,
      }),
    ),
  );

describe('#1051 重要渲染状态', () => {
  it('真实模型未知上限不冒充已确认庇护；无效容量保留待核实且不链接', () => {
    const data = structuredClone(GENERAL_GARRISON_DATA);
    data.units[79]!.max = NaN;
    const calculate = calculateGeneralGarrison;
    const spy = vi
      .spyOn(garrison, 'calculateGeneralGarrison')
      .mockImplementation((context, building, config) => calculate(context, building, config, data));
    try {
      const row = () => markup().match(/<li[^>]*data-host="79"[\s\S]*?<\/li>/u)![0];
      expect(row()).toContain('弹丸数待核实');
      expect(row()).toContain('/building/79?');
      expect(row()).not.toContain('可驻军');
      expect(row()).not.toContain('容量内无法达到');
      data.units[79]!.capacity = NaN;
      expect(row()).toContain('待核实，暂无法生成有效预览');
      expect(row()).not.toContain('/building/79?');
      expect(markup()).toContain('部分宿主待核实，列表尚不完整');
    } finally {
      spy.mockRestore();
    }
  });
  it('渲染理论口径、数字零、炮塔与未达上限；不把0当未知', () => {
    expect(markup()).toContain('理论弹丸数，尚未完成该版本客户端逐项对账');
    expect(markup()).toContain('容量内无法达到');
    expect(markup()).toContain('可驻军，驻军不增加弹丸');
    const zero = markup({ unitId: 93, civ: 'Armenians' });
    expect(zero).toContain('data-garrison-total="">0 箭');
    expect(zero).not.toContain('待核实');
  });
  it('未选/不可用/加载/失败均无旧数字或预览链接，空宿主保留章节', () => {
    for (const props of [{ civ: '' }, { civ: 'Bulgarians' }, { trees: null, pending: true }, { trees: null, error: true }]) {
      const html = markup(props);
      expect(html).not.toContain('/building/');
      expect(html).not.toContain('data-garrison-total');
    }
    expect(markup({ trees: null, error: true })).toContain('重试科技树');
    expect(markup({ unitId: 280, civ: 'Franks' })).toContain('没有可从外部进入的驻军建筑');
  });
});
