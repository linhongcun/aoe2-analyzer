import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import eco from '../../src/data/raw/eco';
import type { Trees } from '../../src/domain/types';
import { FishingGather } from '../../src/features/units/components/FishingGather';
import { fishingShipGatherBaseline, type FishingEcoSlice } from '../../src/features/units/fishingGather';
import UnitDetail from '../../src/features/units/components/UnitDetail';

const live = eco as unknown as FishingEcoSlice & {
  meta: { patch: string; tasks: string };
  fishingShip: { workRate: number; deepFishMultiplier: number; carry: number; unit: number };
  ecoTechs: Record<string, { effects: { kind?: string; attr: string; op: string; target: string; v: number }[] }>;
  units: Record<string, { class: number }>;
  buildings: Record<string, { en?: string; workRate?: number }>;
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
/** 取出 data-t="fishing-gather" 那一层 div，保留内部嵌套。 */
function blockOf(html: string) {
  const marker = html.indexOf('data-t="fishing-gather"');
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
const field = (html: string, scope: string, task: string, name: string) => {
  const root = blockOf(html).match(new RegExp(`<dl[^>]*data-t="${scope}"[^>]*>([\\s\\S]*?)<\\/dl>`))?.[1] ?? '';
  const row = root.match(new RegExp(`<div[^>]*data-task="${task}"[^>]*>([\\s\\S]*?)<\\/div>`))?.[1] ?? '';
  const cell = row.match(new RegExp(`<dd[^>]*data-field="${name}"[^>]*>([\\s\\S]*?)<\\/dd>`))?.[1] ?? '';
  return visible(cell);
};

beforeAll(async () => {
  state.core = await loadCore();
  state.trees = await loadTrees();
});

describe('issue 735 渔船基准采集只读 eco.json', () => {
  it('岸鱼、深海与刺网后对照跟 fishingShip / ecoTechs 65 一致', () => {
    const before = structuredClone(live);
    const data = fishingShipGatherBaseline();
    expect(live).toEqual(before);
    expect(data.shoreWorkRate).toBe(live.fishingShip.workRate);
    expect(data.deepMultiplier).toBe(live.fishingShip.deepFishMultiplier);
    expect(data.carry).toBe(live.fishingShip.carry);
    expect(data.shoreWorkRate).toBe(0.24);
    expect(data.deepMultiplier).toBe(1.75);
    expect(data.deepWorkRate).toBe(0.42);
    expect(data.carry).toBe(15);
    expect(data.gillnets).toEqual({ workMul: 1.1, carryAdd: 5 });
    expect(live.ecoTechs['65']!.effects.find((effect) => effect.attr === 'workRate')?.target).toBe('class:21');
    expect(live.units['13']!.class).toBe(21);
    expect(data.shoreAfter).toBe(0.264);
    expect(data.deepAfter).toBe(0.462);
    expect(data.carryAfter).toBe(20);
    expect(data.fishTrapWorkRate).toBeNull();
    expect(live.buildings['199']).not.toHaveProperty('workRate');
    expect(data.patch).toContain('188329');
    expect(data.patch).toContain('2026-10-28');
    expect(data.tasksNote).toContain('纯采集');
    expect(data.tasksNote).toContain('不含往返');
  });

  it('缺数字、类别对不上或效果形状变化时标待确认，且不改输入', () => {
    const source: FishingEcoSlice = {
      meta: { patch: '  ', tasks: '' },
      fishingShip: { unit: 13, workRate: Number.NaN, carry: 15, deepFishMultiplier: '1.75' },
      units: { '13': { class: 21 } },
      ecoTechs: { '65': { effects: [{ kind: 'attr', target: 'class:21', attr: 'workRate', op: 'mul', v: 1.1 }] } },
      buildings: { '199': {} },
    };
    const before = structuredClone(source);
    const data = fishingShipGatherBaseline(source);
    expect(source).toEqual(before);
    expect(data.patch).toBeNull();
    expect(data.tasksNote).toBeNull();
    expect(data.shoreWorkRate).toBeNull();
    expect(data.deepMultiplier).toBeNull();
    expect(data.deepWorkRate).toBeNull();
    expect(data.carry).toBe(15);
    expect(data.gillnets).toBeNull();
    expect(data.shoreAfter).toBeNull();
    expect(data.deepAfter).toBeNull();
    expect(data.carryAfter).toBeNull();
    expect(data.fishTrapWorkRate).toBeNull();
    expect(fishingShipGatherBaseline({ fishingShip: { unit: 83, workRate: 0.24, carry: 15, deepFishMultiplier: 1.75 } }).shoreWorkRate).toBeNull();
    const extra = structuredClone(live);
    extra.ecoTechs['65']!.effects.push({ kind: 'attr', attr: 'speed', op: 'mul', target: 'class:21', v: 1.05 });
    expect(fishingShipGatherBaseline(extra).gillnets).toBeNull();
    const wrongClass = structuredClone(live);
    wrongClass.units['13']!.class = 4;
    expect(fishingShipGatherBaseline(wrongClass).shoreAfter).toBeNull();
  });

  it('只在建筑记录带有 workRate 时展示养鱼场速率，不用岸鱼速率代替', () => {
    const withRate = structuredClone(live);
    withRate.buildings['199']!.workRate = 0.31;
    const data = fishingShipGatherBaseline(withRate);
    expect(data.fishTrapWorkRate).toBe(0.31);
    expect(data.shoreWorkRate).toBe(0.24);
    const textRate = structuredClone(live);
    (textRate.buildings['199'] as { workRate: unknown }).workRate = '0.31';
    expect(fishingShipGatherBaseline(textRate).fishTrapWorkRate).toBeNull();
  });

  it('对照数值跟随切片，不写死展示常数', () => {
    const source = structuredClone(live);
    source.fishingShip.workRate = 0.2;
    source.fishingShip.deepFishMultiplier = 2;
    source.fishingShip.carry = 10;
    source.ecoTechs['65']!.effects.find((effect) => effect.attr === 'workRate')!.v = 1.2;
    source.ecoTechs['65']!.effects.find((effect) => effect.attr === 'carry')!.v = 4;
    const data = fishingShipGatherBaseline(source);
    expect(data.shoreWorkRate).toBe(0.2);
    expect(data.deepWorkRate).toBe(0.4);
    expect(data.shoreAfter).toBe(0.24);
    expect(data.deepAfter).toBe(0.48);
    expect(data.carryAfter).toBe(14);
  });

  it('单位页只给渔船展示基准采集，并链到刺网', () => {
    const html = renderDetail(13);
    const block = blockOf(html);
    expect(block).toContain('纯采集，不含往返行走与放下资源');
    expect(block).toContain('188329');
    expect(block).toContain('不填推算值');
    expect(field(html, 'fishing-gather-base', 'shore', 'workRate')).toBe('0.24');
    expect(field(html, 'fishing-gather-base', 'deep-multiplier', 'multiplier')).toBe('×1.75');
    expect(field(html, 'fishing-gather-base', 'deep', 'workRate')).toBe('0.42');
    expect(field(html, 'fishing-gather-base', 'carry', 'carry')).toBe('15');
    expect(field(html, 'fishing-gather-after', 'shore', 'workRate')).toBe('0.264');
    expect(field(html, 'fishing-gather-after', 'deep', 'workRate')).toBe('0.462');
    expect(field(html, 'fishing-gather-after', 'carry', 'carry')).toBe('20');
    expect(visible(block.match(/data-task="trap"[\s\S]*?<\/dl>/)?.[0] ?? '')).toContain('待确认');
    expect(block).toContain('href="/tech/65"');
    expect(block).toContain('刺网');
    expect(blockOf(renderDetail(83))).toBe('');
    expect(blockOf(renderDetail(38))).toBe('');
    const pending = renderGather(13, { fishingShip: { unit: 13, carry: 15 }, buildings: { '199': {} } });
    expect(field(pending, 'fishing-gather-base', 'shore', 'workRate')).toBe('待确认');
    expect(field(pending, 'fishing-gather-base', 'carry', 'carry')).toBe('15');
    expect(visible(pending)).toContain('刺网对照待确认');
    expect(renderGather(83)).toBe('');
  });
});
