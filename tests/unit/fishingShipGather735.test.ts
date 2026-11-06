import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import eco from '../../src/data/raw/eco';
import type { Trees } from '../../src/domain/types';
import { FishingShipGather } from '../../src/features/units/components/FishingShipGather';
import UnitDetail from '../../src/features/units/components/UnitDetail';
import { fishingShipGatherBaseline, roundGather, type FishingEcoSlice } from '../../src/features/units/fishingShipGather';

const live = eco as unknown as {
  meta: { patch: string; tasks: string };
  fishingShip: { workRate: number; carry: number; deepFishMultiplier: number };
  ecoTechs: Record<string, { effects: { attr: string; op: string; target: string; v: number }[] }>;
  units: Record<string, { class: number }>;
  buildings: Record<string, { en?: string; workRate?: number; carry?: number }>;
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
  renderToStaticMarkup(createElement(StaticRouter, { location: '/unit/13' }, createElement(FishingShipGather, { unitId, source })));
const section = (html: string) => html.match(/<section[^>]*aria-label="基准采集"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? '';
const field = (html: string, contrast: string, task: string, name: string) => {
  const table = section(html).match(new RegExp(`<table[^>]*data-contrast="${contrast}"[^>]*>([\\s\\S]*?)<\\/table>`))?.[1] ?? '';
  const row = table.match(new RegExp(`<tr[^>]*data-task="${task}"[^>]*>([\\s\\S]*?)<\\/tr>`))?.[1] ?? '';
  const cell = row.match(new RegExp(`<span[^>]*data-field="${name}"[^>]*>([\\s\\S]*?)<\\/span>`))?.[1] ?? '';
  return visible(cell);
};

beforeAll(async () => {
  state.core = await loadCore();
  state.trees = await loadTrees();
});

describe('#735 渔船基准采集只读 eco.json', () => {
  it('岸鱼、深海倍率和刺网对照与 fishingShip / ecoTechs 65 一致', () => {
    const data = fishingShipGatherBaseline();
    const shore = live.fishingShip.workRate;
    const multiplier = live.fishingShip.deepFishMultiplier;
    const carry = live.fishingShip.carry;
    expect(data.shore).toEqual({ workRate: shore, carry, multiplier: null });
    expect(data.shore.workRate).toBe(0.24);
    expect(data.deep.multiplier).toBe(1.75);
    expect(data.deep.multiplier).toBe(multiplier);
    expect(data.deep.workRate).toBe(roundGather(shore * multiplier));
    expect(data.deep.workRate).toBe(0.42);
    expect(data.deep.carry).toBe(15);
    expect(data.deep.carry).toBe(carry);
    expect(live.units['13']!.class).toBe(21);
    expect(live.ecoTechs['65']!.effects).toEqual([
      expect.objectContaining({ attr: 'workRate', op: 'mul', target: 'class:21', v: 1.1 }),
      expect.objectContaining({ attr: 'carry', op: 'add', target: 'class:21', v: 5 }),
    ]);
    expect(data.gillnets.applied).toBe(true);
    expect(data.gillnets.techId).toBe('65');
    expect(data.gillnets.shore.workRate).toBe(0.264);
    expect(data.gillnets.shore.carry).toBe(20);
    expect(data.gillnets.deep.workRate).toBe(0.462);
    expect(data.gillnets.deep.carry).toBe(20);
    expect(data.gillnets.deep.multiplier).toBe(1.75);
    expect(data.fishTrap).toEqual({ workRate: null, carry: null, multiplier: null });
    expect(data.gillnets.fishTrap).toEqual({ workRate: null, carry: null, multiplier: null });
    expect(live.buildings['199']?.en).toBe('Fish Trap');
    expect(live.buildings['199']?.workRate).toBeUndefined();
    expect(data.patch).toContain('188329');
    expect(data.patch).toContain('2026-10-28');
    expect(data.tasksNote).toContain('纯采集');
    expect(data.tasksNote).toContain('不含往返');
  });

  it('缺字段、类别对不上或出现未识别效果时不编造数字，且不改输入', () => {
    const source: FishingEcoSlice = {
      meta: { patch: '  ', tasks: '' },
      fishingShip: { unit: 13, workRate: Number.NaN, carry: 15, deepFishMultiplier: 1.75 },
      units: { '13': { class: 21 } },
      buildings: { '199': { en: 'Fish Trap', workRate: 0.5 } },
      ecoTechs: {
        '65': {
          effects: [
            { kind: 'attr', target: 'class:21', attr: 'workRate', op: 'mul', v: 1.1 },
            { kind: 'attr', target: 'class:21', attr: 'carry', op: 'add', v: 5 },
          ],
        },
      },
    };
    const before = structuredClone(source);
    const pending = fishingShipGatherBaseline(source);
    expect(source).toEqual(before);
    expect(pending.patch).toBeNull();
    expect(pending.tasksNote).toBeNull();
    expect(pending.shore.workRate).toBeNull();
    expect(pending.deep.workRate).toBeNull();
    expect(pending.gillnets.shore.workRate).toBeNull();
    expect(pending.gillnets.shore.carry).toBe(20);
    expect(pending.fishTrap.workRate).toBe(0.5);
    expect(pending.gillnets.fishTrap.workRate).toBeNull();

    const mismatched = fishingShipGatherBaseline({
      ...source,
      fishingShip: { unit: 13, workRate: 0.24, carry: 15, deepFishMultiplier: 1.75 },
      units: { '13': { class: 22 } },
    });
    expect(mismatched.shore.workRate).toBe(0.24);
    expect(mismatched.gillnets.applied).toBe(false);
    expect(mismatched.gillnets.shore.workRate).toBeNull();
    expect(mismatched.gillnets.deep.workRate).toBeNull();

    const extra = fishingShipGatherBaseline({
      ...source,
      fishingShip: { unit: 13, workRate: 0.24, carry: 15, deepFishMultiplier: 1.75 },
      ecoTechs: { '65': { effects: [{ kind: 'attr', target: 'class:21', attr: 'speed', op: 'mul', v: 1.1 }] } },
    });
    expect(extra.gillnets.applied).toBe(false);
    expect(extra.gillnets.shore).toEqual({ workRate: null, carry: null, multiplier: null });
    expect(fishingShipGatherBaseline({}).shore).toEqual({ workRate: null, carry: null, multiplier: null });
  });

  it('单位页只给渔船展示基准表，并链到刺网', () => {
    const html = renderDetail(13);
    const block = section(html);
    expect(block).toContain('纯采集，不含往返行走与放下资源');
    expect(block).toContain('188329');
    expect(block).toContain('eco.json meta / fishingShip');
    expect(block).toContain('meta');
    expect(block).toContain('养鱼场采集速率没有单独字段');
    expect(field(html, 'baseline', 'shore', 'workRate')).toBe('0.24');
    expect(field(html, 'baseline', 'deep', 'multiplier')).toBe('×1.75');
    expect(field(html, 'baseline', 'deep', 'workRate')).toBe('0.42');
    expect(field(html, 'baseline', 'deep', 'carry')).toBe('15');
    expect(field(html, 'baseline', 'fishTrap', 'workRate')).toBe('待确认');
    expect(field(html, 'gillnets', 'shore', 'workRate')).toBe('0.264');
    expect(field(html, 'gillnets', 'deep', 'workRate')).toBe('0.462');
    expect(field(html, 'gillnets', 'shore', 'carry')).toBe('20');
    expect(field(html, 'gillnets', 'fishTrap', 'workRate')).toBe('待确认');
    expect(block).toContain('href="/tech/65"');
    expect(block).toContain('刺网');
    expect(visible(block)).not.toContain('水图');
    expect(visible(block)).not.toContain('开局');
    expect(section(renderDetail(83))).not.toContain('岸鱼');
    expect(section(renderDetail(38))).toBe('');
    const pending = renderGather(13, { fishingShip: { workRate: 0.24, carry: 15 } });
    expect(field(pending, 'baseline', 'shore', 'workRate')).toBe('0.24');
    expect(field(pending, 'baseline', 'deep', 'workRate')).toBe('待确认');
    expect(field(pending, 'gillnets', 'shore', 'workRate')).toBe('待确认');
    expect(renderGather(83)).toBe('');
  });
});
