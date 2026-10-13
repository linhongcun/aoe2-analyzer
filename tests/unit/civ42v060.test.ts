// v0.6.0 #42（不含匈奴）失败用例 — Kent
// 口径：Steve 在 #42 的产品口径评论（#109 范围）：#42 表中「和开局相关」的加成全部生效；
// unhandledEffects 对所有文明运行、未列白名单即失败；4 条回归用例转绿。匈奴本版不做（出处未齐）。
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import * as sim from '../../src/domain/buildSim';
import type { EcoData, UpgradeData } from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const feudal = (civ: string, e: EcoData = E) =>
  sim.simulateBuild(buildOrders.find((b) => b.id === 'fast-castle-boom')!, civ, e, ups, { walkTiles: 4 }).ageUps.find((a) => a.age === 'feudal')!.reachAt;

describe('#42 正文 4 条回归用例（原样保留）', () => {
  it('丹麦人交食物 +5%：到封建早于 673.5 秒', () => expect(feudal('Danes')).toBeLessThan(673.5));
  it('去掉 1494 后到封建应更慢', () => {
    const e = structuredClone(E);
    e.civEco.Danes = e.civEco.Danes!.filter((r) => (r as { tech?: number }).tech !== 1494);
    expect(feudal('Danes', e)).toBeGreaterThan(feudal('Danes'));
  });
  it('未知效果类型要报错而不是跳过', () => {
    const e = structuredClone(E);
    e.civEco.Danes!.push({ source: 'bonus', tech: -1, name: 'probe', age: 1, requires: [], effects: [{ kind: 'res', res: 9999, op: 'add', v: 1 }] } as never);
    expect(sim.unhandledEffects(e, 'Danes').length).toBeGreaterThan(0);
  });
  it('马来升级时代 ×0.6：到封建早于不列颠', () => expect(feudal('Malay')).toBeLessThan(feudal('Britons')));
});

// #42 表里「和开局相关」的文明（去掉匈奴）。每一个都必须被开局模拟完整支持：
// 不能再有 kind=unhandled（影响开局但未实现）或 kind=unknown 的效果。
const TABLE_CIVS = [
  'Danes', 'Malay', 'Italians', 'Muisca', 'Burgundians', 'Vietnamese', 'Goths', 'Persians', 'Aztecs', 'Tupi',
  'Sicilians', 'Ethiopians', 'Dravidians', 'Bengalis', 'Wei', 'Portuguese', 'Shu', 'Varangians', 'Slavs',
  'Chinese', 'Tatars', 'Mayans', 'Jurchens', 'Malians', 'Khmer', 'Romans',
];

describe('#42 表中开局相关加成全部生效（不含匈奴）', () => {
  it('表中文明都存在于 eco.json（防止拼错 id 导致假绿）', () => {
    for (const c of TABLE_CIVS) expect(E.civEco[c], c).toBeDefined();
  });
  it.each(TABLE_CIVS)('%s：unhandledEffects 为空', (civ) => {
    expect(sim.unhandledEffects(E, civ, buildOrders).map((x) => `${x.effect}（${x.reason}）`)).toEqual([]);
  });
  it.each(TABLE_CIVS)('%s：simSupport 为 true', (civ) => {
    expect(sim.simSupport(E, civ, buildOrders).reasons).toEqual([]);
  });
  it('匈奴本版不做，但必须在白名单里写明原因（出处未齐）', () => {
    const r = sim.simSupport(E, 'Huns', buildOrders);
    expect(r.supported).toBe(false);
    expect(r.reasons.join('')).toMatch(/出处/);
  });
  it('所有文明都没有未分类效果（unknownCivEffects 为空）', () => {
    expect(sim.unknownCivEffects(E, buildOrders)).toEqual([]);
  });
});
