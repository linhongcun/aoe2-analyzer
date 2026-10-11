// #42 第一批：西班牙（tech 186 res 269「研发科技返金」+ tech 323/324/326 res 3 −20）
// 依据：#42 issuecomment-6106638881（已打开核对的 wiki 原文 + .dat），断言改自 Kent 草稿 issuecomment-6106620214 / 6106634330。
// 金额 20 与「完成时到账」来自 wiki（已核实）；res 269 = 300 如何换算成 20 金：未核实。
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simSupport as simSupportFn } from '../../src/domain/simSupport';
import { classifyCivEffect, simScope, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const bo = (id: string) => buildOrders.find((b) => b.id === id)!;
const sim = (id: string, civ: string, e = E) => simulateBuild(bo(id), civ, e, ups, { walkTiles: 4 });
const researchCount = (id: string) =>
  bo(id)
    .steps.flatMap((s) => s.actions)
    .filter((a) => a.type === 'research').length;
const st = (r: ReturnType<typeof sim>, n: number) => r.steps.find((x) => x.index === n)!;
const lastGold = (r: ReturnType<typeof sim>) => r.steps.at(-1)!.stock.gold;
const waitGold = (r: ReturnType<typeof sim>, i: number) =>
  r.steps[i]!.anomalies.filter((a) => a.type === 'resource_short' && (a as { resource?: string }).resource === 'gold').reduce(
    (s, a) => s + ((a as { waitSec?: number }).waitSec ?? 0),
    0,
  );

describe('#42 西班牙', () => {
  it('simSupport 为 true；波斯也已放开（#55）', () => {
    expect(simSupport(E, 'Spanish', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(simSupportFn('Spanish')).toBe(true);
    expect(simSupportFn('Persians')).toBe(true);
  });

  it('整条科技规则：西班牙每条 tech 的每个效果都已分类（handled / irrelevant 带原因）', () => {
    const scope = simScope(E, buildOrders);
    for (const r of E.civEco.Spanish!)
      for (const e of r.effects) {
        const c = classifyCivEffect(e, r as { source?: string; tech?: number }, scope);
        expect(['handled', 'irrelevant'], `${(r as { name?: string }).name} ${JSON.stringify(e)}`).toContain(c.kind);
        if (c.kind === 'irrelevant') expect(c.reason.length).toBeGreaterThan(0);
      }
  });

  it('每研发一个非时代科技 +20 金：feudal-drush-18 末步黄金 = 通用 + 20 × research 数', () => {
    const n = researchCount('feudal-drush-18');
    expect(n).toBe(2);
    expect(lastGold(sim('feudal-drush-18', 'Spanish')) - lastGold(sim('feudal-drush-18', 'Generic'))).toBe(20 * n);
  });

  it('升时代净 0 金，6 个开局的升时代时间和通用完全相同', () => {
    for (const b of buildOrders) {
      const s = sim(b.id, 'Spanish'),
        g = sim(b.id, 'Generic');
      expect(
        s.anomalies.filter((a) => a.type === 'timeout'),
        b.id,
      ).toEqual([]);
      expect(
        s.ageUps.map((a) => [a.age, a.clickAt, a.reachAt]),
        b.id,
      ).toEqual(g.ageUps.map((a) => [a.age, a.clickAt, a.reachAt]));
    }
  });

  it('maa-archers-18：#8 开始和 #7 完成比通用早 36.3s，#7 等金合计约 54.5s', () => {
    const s = sim('maa-archers-18', 'Spanish'),
      g = sim('maa-archers-18', 'Generic');
    expect(st(s, 8).startAt - st(g, 8).startAt).toBeCloseTo(-36.3, 0);
    expect(st(s, 7).doneAt! - st(g, 7).doneAt!).toBeCloseTo(-36.3, 0);
    expect(waitGold(s, s.steps.indexOf(st(s, 7)))).toBeCloseTo(54.5, 0);
  });

  it('drush-fc：返金不能记到研发之前，#8 开始和升时代时间等于通用', () => {
    const s = sim('drush-fc', 'Spanish'),
      g = sim('drush-fc', 'Generic');
    expect(st(s, 8).startAt).toBe(st(g, 8).startAt);
    expect(s.ageUps).toEqual(g.ageUps);
  });

  it('不再和通用完全相同（#43 前 Spanish ≡ Generic）', () => {
    expect(JSON.stringify(sim('fast-castle-boom', 'Spanish').steps.map((x) => x.stock))).not.toBe(
      JSON.stringify(sim('fast-castle-boom', 'Generic').steps.map((x) => x.stock)),
    );
  });
});
