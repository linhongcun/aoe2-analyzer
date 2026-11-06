import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import eco from '../../src/data/raw/eco';
import type { Trees } from '../../src/domain/types';
import { VillagerGather } from '../../src/features/units/components/VillagerGather';
import { formatGatherNumber, villagerGatherBaseline, type VillagerEcoSlice } from '../../src/features/units/villagerGather';
import UnitDetail from '../../src/features/units/components/UnitDetail';

const live = eco as unknown as {
  meta: { patch: string; tasks: string };
  villager: {
    tasks: Record<string, { workRate: number; carry: number }>;
    female: Record<string, { workRate: number; carry: number }>;
  };
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
const renderGather = (unitId: number, source?: VillagerEcoSlice) =>
  renderToStaticMarkup(createElement(StaticRouter, { location: '/unit/83' }, createElement(VillagerGather, { unitId, source })));
const section = (html: string) => html.match(/<section[^>]*aria-label="基准采集"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? '';
const field = (html: string, task: string, name: string) => {
  const row = section(html).match(new RegExp(`<tr[^>]*data-task="${task}"[^>]*>([\\s\\S]*?)<\\/tr>`))?.[1] ?? '';
  const cell = row.match(new RegExp(`<td[^>]*data-field="${name}"[^>]*>([\\s\\S]*?)<\\/td>`))?.[1] ?? '';
  return visible(cell);
};

beforeAll(async () => {
  state.core = await loadCore();
  state.trees = await loadTrees();
});

describe('#730 村民基准采集只读 eco.json', () => {
  it('主要任务速率和携带量与 villager.tasks 一致', () => {
    const data = villagerGatherBaseline();
    const examples: Record<string, [number, number]> = {
      wood: [0.39, 10],
      farm: [0.53, 10],
      gold: [0.38, 10],
      stone: [0.36, 10],
      berries: [0.31, 10],
      hunt: [0.41, 35],
      sheep: [0.33, 10],
      fish: [0.43, 10],
      build: [1, 10],
    };
    expect(data.rows.map((row) => row.key)).toEqual(Object.keys(examples));
    for (const [key, [rate, carry]] of Object.entries(examples)) {
      const row = data.rows.find((item) => item.key === key);
      expect(row?.workRate).toBe(live.villager.tasks[key]!.workRate);
      expect(row?.carry).toBe(live.villager.tasks[key]!.carry);
      expect(row?.workRate).toBe(rate);
      expect(row?.carry).toBe(carry);
      expect(row?.femaleWorkRate).toBe(live.villager.female[key]!.workRate);
      expect(row?.femaleCarry).toBe(live.villager.female[key]!.carry);
    }
    expect(data.femaleSame).toBe(true);
    expect(data.patch).toContain('188329');
    expect(data.patch).toContain('2026-10-28');
    expect(data.tasksNote).toContain('纯采集');
    expect(data.tasksNote).toContain('不含往返');
    expect(data.rows.find((row) => row.key === 'wood')?.label).toBe('伐木');
    expect(data.rows.find((row) => row.key === 'hunt')?.label).toBe('狩猎');
  });

  it('缺数字、未知任务和非数字都标待确认，且不改输入', () => {
    const source: VillagerEcoSlice = {
      meta: { patch: '  ', tasks: '' },
      villager: {
        tasks: { wood: { workRate: Number.NaN, carry: 10 }, relic: { workRate: 0.2, carry: '5' } },
        female: { wood: { workRate: 0.39, carry: 10 } },
      },
    };
    const before = structuredClone(source);
    const data = villagerGatherBaseline(source);
    expect(source).toEqual(before);
    expect(data.patch).toBeNull();
    expect(data.tasksNote).toBeNull();
    expect(data.femaleSame).toBe(false);
    expect(data.rows.map((row) => row.key)).toEqual(['wood', 'relic']);
    expect(data.rows[0]).toMatchObject({ label: '伐木', workRate: null, carry: 10, femaleWorkRate: 0.39, femaleCarry: 10 });
    expect(data.rows[1]).toMatchObject({ label: '待确认', workRate: 0.2, carry: null, femaleWorkRate: null, femaleCarry: null });
    expect(villagerGatherBaseline({ villager: {} }).rows).toEqual([]);
    expect(formatGatherNumber(0.39)).toBe('0.39');
    expect(formatGatherNumber(1)).toBe('1');
  });

  it('单位页只给村民展示基准表，并链到含往返的工具', () => {
    const html = renderDetail(83);
    const block = section(html);
    expect(block).toContain('纯采集，不含往返行走与放下资源');
    expect(block).toContain('188329');
    expect(block).toContain('女村民各任务形态的基准速率与携带量与上表相同');
    expect(block).toContain('建造一行沿用同一 workRate 字段');
    expect(block).not.toContain('有效速率');
    expect(field(html, 'wood', 'workRate')).toBe('0.39');
    expect(field(html, 'farm', 'workRate')).toBe('0.53');
    expect(field(html, 'gold', 'workRate')).toBe('0.38');
    expect(field(html, 'hunt', 'carry')).toBe('35');
    expect(block).toContain('href="/production"');
    expect(block).toContain('href="/eco-payoff"');
    expect(visible(html)).toContain('采集时间');
    expect(section(renderDetail(38))).toBe('');
    const pending = renderGather(83, { villager: { tasks: { wood: { carry: 10 } }, female: { wood: { workRate: 0.39 } } } });
    expect(field(pending, 'wood', 'workRate')).toBe('待确认');
    expect(field(pending, 'wood', 'femaleWorkRate')).toBe('0.39');
    expect(field(pending, 'wood', 'femaleCarry')).toBe('待确认');
    expect(renderGather(293)).toBe('');
  });
});
