import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import eco from '../../src/data/raw/eco';
import type { Trees } from '../../src/domain/types';
import { FishingGather } from '../../src/features/units/components/FishingGather';
import {
  FISHING_LINES_TECH_ID,
  GILLNETS_TECH_ID,
  fishingShipGatherBaseline,
  formatCarryValue,
  formatGatherRate,
  splitPatchSource,
  type FishingEcoSlice,
} from '../../src/features/units/fishingGather';
import UnitDetail from '../../src/features/units/components/UnitDetail';

const live = eco as unknown as FishingEcoSlice & {
  meta: { patch: string };
  fishingShip: { workRate: number; deepFishMultiplier: number; fishTrapMultiplier: number; carry: number; unit: number };
  ecoTechs: Record<string, { effects: { kind?: string; attr: string; op: string; target: string; v: number }[] }>;
  units: Record<string, { class: number }>;
};
const state = vi.hoisted(() => ({ core: null as Core | null, trees: null as Trees | null }));
vi.mock('../../src/shared/utils/useCoreTrees', () => ({
  useCoreTrees: () => ({ core: { data: state.core, error: false }, trees: { data: state.trees, error: false } }),
}));
const visible = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const renderDetail = (id: number) => renderToStaticMarkup(createElement(StaticRouter, { location: `/unit/${id}` }, createElement(UnitDetail)));
const renderGather = (unitId: number, source?: FishingEcoSlice) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: '/unit/13' }, createElement(FishingGather, { unitId, source })));

/** 取出 data-t="fishing-gather" 或指定卡片的完整 div，保留内部嵌套。 */
function divByDataT(html: string, key: string) {
  const marker = html.indexOf(`data-t="${key}"`);
  if (marker < 0) return '';
  const open = html.lastIndexOf('<div', marker);
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = open;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(html))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open, match.index + match[0].length);
  }
  return '';
}

const tierField = (html: string, scope: string, task: string, name: string) => {
  const card = divByDataT(html, scope);
  const row = card.match(new RegExp(`<div[^>]*data-task="${task}"[^>]*>([\\s\\S]*?)<\\/div>`))?.[1] ?? '';
  const cell = row.match(new RegExp(`<dd[^>]*data-field="${name}"[^>]*>([\\s\\S]*?)<\\/dd>`))?.[1] ?? '';
  return visible(cell);
};

const tierSub = (html: string, scope: string) => {
  const card = divByDataT(html, scope);
  return visible(card.match(/<p[^>]*data-t="tier-sub"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
};

const multiplierField = (html: string, task: string) => {
  const block = divByDataT(html, 'fishing-gather');
  const row = block.match(new RegExp(`<div[^>]*data-task="${task}"[^>]*>([\\s\\S]*?)<\\/div>`))?.[1] ?? '';
  const cell = row.match(/<dd[^>]*data-field="multiplier"[^>]*>([\s\S]*?)<\/dd>/)?.[1] ?? '';
  return visible(cell);
};

beforeAll(async () => {
  state.core = await loadCore();
  state.trees = await loadTrees();
});

describe('issue 735 / 1327 渔船基准采集：三档升级路径与养鱼场倍率', () => {
  it('基准、钓线后、刺网后三档与养鱼场精确域值跟 eco.json 一致，且不修改输入', () => {
    const before = structuredClone(live);
    const data = fishingShipGatherBaseline();
    expect(live).toEqual(before);

    expect(live.units['13']!.class).toBe(21);
    expect(live.ecoTechs[FISHING_LINES_TECH_ID]!.effects.find((effect) => effect.attr === 'workRate')?.target).toBe('class:21');
    expect(live.ecoTechs[GILLNETS_TECH_ID]!.effects.find((effect) => effect.attr === 'workRate')?.target).toBe('class:21');

    expect(data.deepMultiplier).toBe(1.75);
    expect(data.fishTrapMultiplier).toBe(1.45);
    expect(data.fishingLines).toEqual({ workMul: 1.1, carryAdd: 5 });
    expect(data.gillnets).toEqual({ workMul: 1.1, carryAdd: 5 });

    expect(data.base).toEqual({
      shoreWorkRate: 0.24,
      deepWorkRate: 0.42,
      fishTrapWorkRate: 0.348,
      carry: 15,
    });
    expect(data.afterFishingLines).toEqual({
      shoreWorkRate: 0.264,
      deepWorkRate: 0.462,
      fishTrapWorkRate: 0.3828,
      carry: 20,
    });
    // 域层保留未经四舍五入的 0.42108 供测试核对
    expect(data.afterGillnets).toEqual({
      shoreWorkRate: 0.2904,
      deepWorkRate: 0.5082,
      fishTrapWorkRate: 0.42108,
      carry: 25,
    });
    expect(data.patch).toContain('188329');
    expect(data.patch).toContain('2026-10-28');
  });

  it('格式化辅助：四位小数、整数携带量、-0 规整与版本日期拆分', () => {
    expect(formatGatherRate(0.24)).toBe('0.2400');
    expect(formatGatherRate(0.42108)).toBe('0.4211');
    expect(formatGatherRate(0)).toBe('0.0000');
    expect(formatGatherRate(-0)).toBe('0.0000');
    expect(formatCarryValue(15)).toBe('15');
    expect(formatCarryValue(-0)).toBe('0');
    expect(splitPatchSource('DE Update 188329 (2026-10-28)')).toEqual({ label: 'DE Update 188329', date: '（2026-10-28）' });
    expect(splitPatchSource('DE Update 188329（2026-10-28）')).toEqual({ label: 'DE Update 188329', date: '（2026-10-28）' });
    expect(splitPatchSource('DE Update 188329')).toEqual({ label: 'DE Update 188329', date: null });
  });

  it('仅养鱼场倍率缺失时，仅三档养鱼场速率与养鱼场倍率待确认', () => {
    const source = structuredClone(live);
    delete (source.fishingShip as { fishTrapMultiplier?: unknown }).fishTrapMultiplier;
    const data = fishingShipGatherBaseline(source);
    expect(data.fishTrapMultiplier).toBeNull();
    expect(data.base.fishTrapWorkRate).toBeNull();
    expect(data.afterFishingLines.fishTrapWorkRate).toBeNull();
    expect(data.afterGillnets.fishTrapWorkRate).toBeNull();
    expect(data.base.shoreWorkRate).toBe(0.24);
    expect(data.base.deepWorkRate).toBe(0.42);
    expect(data.afterGillnets.shoreWorkRate).toBe(0.2904);
    expect(data.afterGillnets.deepWorkRate).toBe(0.5082);
    expect(data.afterGillnets.carry).toBe(25);

    const html = renderGather(13, source);
    expect(tierField(html, 'fishing-gather-base', 'trap', 'workRate')).toBe('待确认');
    expect(tierField(html, 'fishing-gather-lines', 'trap', 'workRate')).toBe('待确认');
    expect(tierField(html, 'fishing-gather-gillnets', 'trap', 'workRate')).toBe('待确认');
    expect(tierField(html, 'fishing-gather-gillnets', 'deep', 'workRate')).toBe('0.5082');
    expect(multiplierField(html, 'deep-multiplier')).toBe('×1.75');
    expect(multiplierField(html, 'trap-multiplier')).toBe('待确认');
    expect(visible(html)).toContain('养鱼场倍率待确认，暂无法给出养鱼场速率。');
  });

  it('仅深海倍率缺失时，仅影响深海鱼速率与深海倍率', () => {
    const source = structuredClone(live);
    delete (source.fishingShip as { deepFishMultiplier?: unknown }).deepFishMultiplier;
    const html = renderGather(13, source);
    expect(tierField(html, 'fishing-gather-base', 'deep', 'workRate')).toBe('待确认');
    expect(tierField(html, 'fishing-gather-gillnets', 'deep', 'workRate')).toBe('待确认');
    expect(tierField(html, 'fishing-gather-gillnets', 'trap', 'workRate')).toBe('0.4211');
    expect(multiplierField(html, 'deep-multiplier')).toBe('待确认');
    expect(multiplierField(html, 'trap-multiplier')).toBe('×1.45');
    expect(visible(html)).toContain('深海倍率待确认，暂无法给出深海鱼速率。');
  });

  it('仅刺网效果异常时，保留基准与钓线后，刺网后标待确认并给提示', () => {
    const source = structuredClone(live);
    source.ecoTechs['65']!.effects.push({ kind: 'attr', attr: 'speed', op: 'mul', target: 'class:21', v: 1.05 });
    const data = fishingShipGatherBaseline(source);
    expect(data.fishingLines).toEqual({ workMul: 1.1, carryAdd: 5 });
    expect(data.gillnets).toBeNull();
    expect(data.afterFishingLines.shoreWorkRate).toBe(0.264);
    expect(data.afterFishingLines.fishTrapWorkRate).toBe(0.3828);
    expect(data.afterGillnets).toEqual({ shoreWorkRate: null, deepWorkRate: null, fishTrapWorkRate: null, carry: null });

    const html = renderGather(13, source);
    expect(tierSub(html, 'fishing-gather-lines')).toBe('已计入钓线');
    expect(tierSub(html, 'fishing-gather-gillnets')).toBe('含钓线，刺网效果待确认');
    expect(tierField(html, 'fishing-gather-lines', 'shore', 'workRate')).toBe('0.2640');
    expect(tierField(html, 'fishing-gather-gillnets', 'shore', 'workRate')).toBe('待确认');
    expect(tierField(html, 'fishing-gather-gillnets', 'carry', 'carry')).toBe('待确认');
    expect(visible(html)).toContain('刺网的科技效果待确认，暂无法给出刺网后的数值。');
  });

  it('钓线效果异常时，即使刺网数据正常也级联阻断钓线后和刺网后', () => {
    const source = structuredClone(live);
    delete source.ecoTechs['906'];
    const data = fishingShipGatherBaseline(source);
    expect(data.fishingLines).toBeNull();
    expect(data.gillnets).toEqual({ workMul: 1.1, carryAdd: 5 });
    expect(data.base.shoreWorkRate).toBe(0.24);
    expect(data.afterFishingLines).toEqual({ shoreWorkRate: null, deepWorkRate: null, fishTrapWorkRate: null, carry: null });
    expect(data.afterGillnets).toEqual({ shoreWorkRate: null, deepWorkRate: null, fishTrapWorkRate: null, carry: null });

    const html = renderGather(13, source);
    expect(tierSub(html, 'fishing-gather-lines')).toBe('钓线效果待确认');
    expect(tierSub(html, 'fishing-gather-gillnets')).toBe('前置钓线效果待确认');
    expect(tierField(html, 'fishing-gather-base', 'shore', 'workRate')).toBe('0.2400');
    expect(tierField(html, 'fishing-gather-lines', 'shore', 'workRate')).toBe('待确认');
    expect(tierField(html, 'fishing-gather-gillnets', 'shore', 'workRate')).toBe('待确认');
    expect(visible(html)).toContain('钓线的科技效果待确认，暂无法给出钓线后和刺网后的数值。');
  });

  it('非法值、类别不符、负值与错误单位 ID 防御回落，且不修改输入', () => {
    const source: FishingEcoSlice = {
      meta: { patch: '  ' },
      fishingShip: { unit: 13, workRate: Number.NaN, carry: 15, deepFishMultiplier: '1.75', fishTrapMultiplier: -1.45 },
      units: { '13': { class: 21 } },
      ecoTechs: {
        '906': { effects: [{ kind: 'attr', target: 'class:21', attr: 'workRate', op: 'mul', v: 1.1 }] },
        '65': { effects: [{ kind: 'attr', target: 'class:21', attr: 'workRate', op: 'mul', v: 1.1 }] },
      },
    };
    const before = structuredClone(source);
    const data = fishingShipGatherBaseline(source);
    expect(source).toEqual(before);
    expect(data.patch).toBeNull();
    expect(data.base).toEqual({ shoreWorkRate: null, deepWorkRate: null, fishTrapWorkRate: null, carry: 15 });
    expect(data.deepMultiplier).toBeNull();
    expect(data.fishTrapMultiplier).toBeNull();
    expect(data.fishingLines).toBeNull();
    expect(data.gillnets).toBeNull();
    expect(data.afterFishingLines.carry).toBeNull();
    expect(data.afterGillnets.carry).toBeNull();

    expect(
      fishingShipGatherBaseline({ fishingShip: { unit: 83, workRate: 0.24, carry: 15, deepFishMultiplier: 1.75, fishTrapMultiplier: 1.45 } }).base
        .shoreWorkRate,
    ).toBeNull();

    const wrongClass = structuredClone(live);
    wrongClass.units['13']!.class = 4;
    expect(fishingShipGatherBaseline(wrongClass).afterFishingLines.shoreWorkRate).toBeNull();
    expect(fishingShipGatherBaseline(wrongClass).afterGillnets.shoreWorkRate).toBeNull();

    const html = renderGather(13, source);
    expect(tierSub(html, 'fishing-gather-gillnets')).toBe('钓线和刺网效果待确认');
    expect(visible(html)).toContain('钓线和刺网的科技效果待确认，暂无法给出钓线后和刺网后的数值。');
    expect(visible(html)).toContain('版本待确认');
  });

  it('区分已知数值零与待确认', () => {
    const source = structuredClone(live);
    source.fishingShip.workRate = 0;
    source.fishingShip.carry = 0;
    source.fishingShip.deepFishMultiplier = 0;
    source.fishingShip.fishTrapMultiplier = 0;
    const html = renderGather(13, source);
    expect(tierField(html, 'fishing-gather-base', 'shore', 'workRate')).toBe('0.0000');
    expect(tierField(html, 'fishing-gather-base', 'deep', 'workRate')).toBe('0.0000');
    expect(tierField(html, 'fishing-gather-base', 'trap', 'workRate')).toBe('0.0000');
    expect(tierField(html, 'fishing-gather-base', 'carry', 'carry')).toBe('0 食物');
    expect(multiplierField(html, 'deep-multiplier')).toBe('×0');
    expect(multiplierField(html, 'trap-multiplier')).toBe('×0');
    expect(html).not.toContain('待确认');
  });

  it('三档数值动态跟随输入切片，不写死展示常数', () => {
    const source = structuredClone(live);
    source.fishingShip.workRate = 0.2;
    source.fishingShip.deepFishMultiplier = 2;
    source.fishingShip.fishTrapMultiplier = 1.5;
    source.fishingShip.carry = 10;
    source.ecoTechs['906']!.effects.find((effect) => effect.attr === 'workRate')!.v = 1.25;
    source.ecoTechs['906']!.effects.find((effect) => effect.attr === 'carry')!.v = 3;
    source.ecoTechs['65']!.effects.find((effect) => effect.attr === 'workRate')!.v = 1.2;
    source.ecoTechs['65']!.effects.find((effect) => effect.attr === 'carry')!.v = 4;
    const data = fishingShipGatherBaseline(source);
    expect(data.base).toEqual({ shoreWorkRate: 0.2, deepWorkRate: 0.4, fishTrapWorkRate: 0.3, carry: 10 });
    expect(data.afterFishingLines).toEqual({ shoreWorkRate: 0.25, deepWorkRate: 0.5, fishTrapWorkRate: 0.375, carry: 13 });
    expect(data.afterGillnets).toEqual({ shoreWorkRate: 0.3, deepWorkRate: 0.6, fishTrapWorkRate: 0.45, carry: 17 });
  });

  it('单位页仅在渔船展示三档基准采集、版本来源与钓线/刺网入口', () => {
    const html = renderDetail(13);
    const block = divByDataT(html, 'fishing-gather');
    expect(block).toContain('理论工作速率，以食物 / 游戏秒计，不含往返、上交、等待和文明加成。');
    expect(block).toContain('DE Update 188329');
    expect(block).toContain('<wbr/>');
    expect(block).toContain('（2026-10-28）');
    expect(block).not.toContain('待确认');

    expect(tierField(html, 'fishing-gather-base', 'shore', 'workRate')).toBe('0.2400');
    expect(tierField(html, 'fishing-gather-base', 'deep', 'workRate')).toBe('0.4200');
    expect(tierField(html, 'fishing-gather-base', 'trap', 'workRate')).toBe('0.3480');
    expect(tierField(html, 'fishing-gather-base', 'carry', 'carry')).toBe('15 食物');

    expect(tierField(html, 'fishing-gather-lines', 'shore', 'workRate')).toBe('0.2640');
    expect(tierField(html, 'fishing-gather-lines', 'deep', 'workRate')).toBe('0.4620');
    expect(tierField(html, 'fishing-gather-lines', 'trap', 'workRate')).toBe('0.3828');
    expect(tierField(html, 'fishing-gather-lines', 'carry', 'carry')).toBe('20 食物');

    expect(tierField(html, 'fishing-gather-gillnets', 'shore', 'workRate')).toBe('0.2904');
    expect(tierField(html, 'fishing-gather-gillnets', 'deep', 'workRate')).toBe('0.5082');
    expect(tierField(html, 'fishing-gather-gillnets', 'trap', 'workRate')).toBe('0.4211');
    expect(tierField(html, 'fishing-gather-gillnets', 'carry', 'carry')).toBe('25 食物');

    expect(multiplierField(html, 'deep-multiplier')).toBe('×1.75');
    expect(multiplierField(html, 'trap-multiplier')).toBe('×1.45');

    const linesLink = block.indexOf('href="/tech/906"');
    const gillnetsLink = block.indexOf('href="/tech/65"');
    expect(linesLink).toBeGreaterThan(-1);
    expect(gillnetsLink).toBeGreaterThan(linesLink);
    expect(block).toContain('钓线');
    expect(block).toContain('刺网');

    // 不含日期的版本文案原样回退包在 .num.nw 内
    const plainPatch = renderGather(13, { ...structuredClone(live), meta: { patch: 'DE Update 188329' } });
    expect(plainPatch).toContain('<span class="num nw">DE Update 188329</span>');
    expect(plainPatch).not.toContain('<wbr/>');

    expect(divByDataT(renderDetail(83), 'fishing-gather')).toBe('');
    expect(divByDataT(renderDetail(38), 'fishing-gather')).toBe('');
    expect(renderGather(83)).toBe('');
  });
});
