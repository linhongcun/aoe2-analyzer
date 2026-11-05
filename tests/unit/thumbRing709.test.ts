import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { effectKey, effectParts, techAffects } from '../../src/domain/affects';
import { baseStats, simulate, simTechs } from '../../src/domain/simulator';
import SimPanel, { type SimPanelProps } from '../../src/shared/ui/sim/SimPanel';
import { ctx, tech, units, techById } from './helpers';

const t = tech('Thumb Ring');
const groups = () => techAffects(t, units, []);
const props = (id = 24, civ = 'Chinese', selected: number[] = [437]): SimPanelProps => {
  const u = units.find((row) => row.id === id)!;
  const sel = new Set(selected);
  return {
    civs: u.civs,
    minAge: u.age,
    civ,
    age: 4,
    sel,
    team: new Set(),
    cmp: '',
    avail: simTechs(ctx, u, civ),
    techById,
    rows: [['rof', '攻击间隔', 'rof']],
    base: baseStats(u),
    cur: simulate(ctx, u, civ, 4, sel, new Set()),
    cmpStats: null,
    civNotes: [],
    teamBonuses: [],
    go: () => {},
    setCmp: () => {},
  };
};
const render = (p: SimPanelProps) => renderToStaticMarkup(createElement(StaticRouter, { location: '/unit/24' }, createElement(SimPanel, p)));
const note = (html: string) =>
  html
    .match(/<p[^>]*data-t="thumb-ring-interval"[^>]*>([\s\S]*?)<\/p>/)?.[1]
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('#709 扳指的精确间隔投影', () => {
  it.each([
    [24, 0.176471],
    [474, 0.111111],
    [39, 0.111116],
    [73, 0.25],
    [559, 0.250002],
  ])('单位%i保留原始v=%s并按间隔投影', (id, v) => {
    const row = groups()
      .flatMap((g) => g.rows)
      .find((r) => r.units.some((u) => u.id === id))!;
    expect(row.effect).toContain('攻击间隔约 ×');
    expect(row.effect).toContain(`v:${v}`);
    expect(row.effect).not.toContain('攻击速度');
    const multiplier = row.effect.match(/攻击间隔约 ×([\d.]+)/);
    expect(multiplier).not.toBeNull();
    expect(Number(multiplier?.[1])).toBeCloseTo(1 / (1 + v), 5);
  });
  it('近似倍数相同的不同raw值不并组且显示键唯一', () => {
    const rows = groups().flatMap((g) => g.rows);
    expect(rows.find((r) => r.units.some((u) => u.id === 39))).not.toBe(rows.find((r) => r.units.some((u) => u.id === 474)));
    expect(rows.find((r) => r.units.some((u) => u.id === 73))).not.toBe(rows.find((r) => r.units.some((u) => u.id === 559)));
    for (const g of groups()) expect(new Set(g.rows.map((r) => r.effect)).size).toBe(g.rows.length);
  });
  it('不改变全局effectParts/effectKey和其他科技的默认口径', () => {
    expect(effectKey([{ s: 'rof', v: 0.176471 }])).toBe('攻击速度 +18%');
    expect(effectParts([{ s: 'rof', v: 0.25 }])[0]?.text).toBe('攻击速度 +25%');
    expect(
      techAffects(tech('Bloodlines'), units, [])
        .flatMap((g) => g.rows)
        .some((r) => r.effect === '生命值 +20'),
    ).toBe(true);
    const accuracyOnly = groups()
      .flatMap((g) => g.rows)
      .find((r) => r.units.some((u) => u.id === 6))!;
    expect(accuracyOnly.effect).not.toContain('攻击间隔');
    expect(accuracyOnly.effect).not.toContain('v:');
  });
});

describe('#709 仅解释实际已选扳指的单项变化', () => {
  it('中国弩手2.00至1.70与单项-0.30同屏并说明总差值不是单项归因', () => {
    const p = props();
    expect(p.base.rof).toBe(2);
    expect(p.cur.rof).toBeCloseTo(2 / (1 + 0.176471));
    const n = note(render(p));
    expect(n).toBeDefined();
    for (const text of ['2.00s', '1.70s', '-0.30s', 'v:0.176471', 'Δ = 基间隔 × (1/(1+v) − 1)', '总差值', '文明', '其他效果']) expect(n).toContain(text);
  });
  it('未选/不可用/accuracy-only不显示rof说明', () => {
    expect(note(render(props(24, 'Chinese', [])))).toBeUndefined();
    const unavailable = props();
    unavailable.avail = unavailable.avail.filter((x) => x.t.id !== 437);
    expect(note(render(unavailable))).toBeUndefined();
    expect(
      props(6)
        .avail.find((x) => x.t.id === 437)
        ?.ef?.some((e) => e.s === 'rof'),
    ).toBe(false);
    expect(note(render(props(6)))).toBeUndefined();
  });
  it('不同单位说明读取对应raw v，保留面板总差值的边界', () => {
    const p = props(39, 'Mongols');
    const v = p.avail.find((x) => x.t.id === 437)!.ef!.find((e) => e.s === 'rof')!.v;
    expect(v).toBe(0.111116);
    expect(note(render(p))).toContain('v:0.111116');
    expect(note(render(p))).toContain('总差值');
    for (const expected of ['2.00s', '1.80s', '-0.20s']) expect(note(render(p))).toContain(expected);
    // 只改变面板的聚合结果，扳指单项必须仍由基间隔和实际ef.v决定。
    p.cur = { ...p.cur, rof: 1.23 };
    for (const expected of ['2.00s', '1.80s', '-0.20s']) expect(note(render(p))).toContain(expected);
    expect(note(render(p))).not.toContain('1.23s');
  });
});
