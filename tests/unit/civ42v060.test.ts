// v0.6.0 #42 失败用例 — Kent（Steve 10/13 定的放开清单 + 白名单）
// 绿 = 已实现，保留防回退（注明「守护」）；红 = 本版要实现。
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import * as sim from '../../src/domain/buildSim';
import type { EcoData, UpgradeData } from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const bo = (id: string) => buildOrders.find((b) => b.id === id)!;
const run = (id: string, civ: string, e: EcoData = E) => sim.simulateBuild(bo(id), civ, e, ups, { walkTiles: 4 });
const without = (civ: string, ...techs: number[]) => {
  const e = structuredClone(E);
  e.civEco[civ] = e.civEco[civ]!.filter((r) => !techs.includes((r as { tech?: number }).tech as number));
  return e;
};
const noTree = (civ: string) => {
  const e = structuredClone(E);
  e.civEco[civ] = e.civEco[civ]!.filter((r) => (r as { name?: string }).name !== 'Tech tree');
  return e;
};
const feudal = (r: ReturnType<typeof run>) => r.ageUps.find((a) => a.age === 'feudal')!;
const castle = (r: ReturnType<typeof run>) => r.ageUps.find((a) => a.age === 'castle')!;
const start = (civ: string) => run('drush-fc', civ).steps[0]!.stock;
const G = () => start('Generic');

describe('#42 放开：开局资源（守护：main dd451de 已绿）', () => {
  it('波斯 +50 食物 +50 木头', () => expect([start('Persians').food - G().food, start('Persians').wood - G().wood]).toEqual([50, 50]));
  it('阿兹特克 +50 黄金', () => expect(start('Aztecs').gold - G().gold).toBe(50));
  it('图皮 食物/木头/石头各 +25', () => { const s = start('Tupi'), g = G(); expect([s.food - g.food, s.wood - g.wood, s.stone - g.stone]).toEqual([25, 25, 25]); });
  it('西西里 +100 石头', () => expect(start('Sicilians').stone - G().stone).toBe(100));
  it('埃塞俄比亚：871/587/588 生效（去掉后封建更晚）', () => expect(feudal(run('feudal-drush-18', 'Ethiopians')).reachAt).toBeLessThan(feudal(run('feudal-drush-18', 'Ethiopians', without('Ethiopians', 871, 587, 588))).reachAt));
  it('德拉威：开局 +200 木头', () => expect(start('Dravidians').wood - G().wood).toBe(200));
});

// 穆伊斯卡/勃艮第/越南/库曼在 dd451de 已生效，为守护
describe('#42 放开：升时代/经济科技时间与费用', () => {
  it('马来 634 升时代 ×0.6（守护）', () => expect(feudal(run('feudal-drush-18', 'Malay')).reachAt).toBeLessThan(feudal(run('feudal-drush-18', 'Malay', without('Malay', 634))).reachAt));
  it('意大利 升时代 −15%（守护）', () => expect(feudal(run('feudal-drush-18', 'Italians')).reachAt).toBeLessThan(feudal(run('feudal-drush-18', 'Italians', noTree('Italians'))).reachAt));
  it('穆伊斯卡 1367 升城堡黄金 −50%：去掉后结果必须不同', () => {
    const a = run('fast-castle-boom', 'Muisca'), b = run('fast-castle-boom', 'Muisca', without('Muisca', 1367));
    expect(JSON.stringify(a.steps.map((s) => s.stock))).not.toBe(JSON.stringify(b.steps.map((s) => s.stock)));
  });
  it('勃艮第 经济科技食物 −40%：去掉 Tech tree 后结果必须不同', () => {
    const r = buildOrders.map((b) => [JSON.stringify(run(b.id, 'Burgundians').steps.map((s) => s.stock)), JSON.stringify(sim.simulateBuild(b, 'Burgundians', noTree('Burgundians'), ups, { walkTiles: 4 }).steps.map((s) => s.stock))]);
    expect(r.some(([a, b]) => a !== b)).toBe(true);
  });
  it('越南 经济科技研究时间 −50%：去掉 Tech tree 后结果必须不同', () => {
    const r = buildOrders.map((b) => [JSON.stringify(sim.simulateBuild(b, 'Vietnamese', E, ups, { walkTiles: 4 }).steps.map((s) => s.doneAt)), JSON.stringify(sim.simulateBuild(b, 'Vietnamese', noTree('Vietnamese'), ups, { walkTiles: 4 }).steps.map((s) => s.doneAt))]);
    expect(r.some(([a, b]) => a !== b)).toBe(true);
  });
  it('哥特 343 织布机瞬间完成：drush-fc 去掉 343 后时间线必须不同', () => {
    expect(JSON.stringify(run('drush-fc', 'Goths').steps.map((s) => s.doneAt))).not.toBe(JSON.stringify(run('drush-fc', 'Goths', without('Goths', 343)).steps.map((s) => s.doneAt)));
  });
});

describe('#42 放开：其他', () => {
  it('库曼 664 靶场/马厩 −75 木：有靶场或马厩的开局里，去掉 664 后结果必须不同', () => {
    const r = buildOrders.map((b) => [JSON.stringify(sim.simulateBuild(b, 'Cumans', E, ups, { walkTiles: 4 }).steps.map((s) => s.stock)), JSON.stringify(sim.simulateBuild(b, 'Cumans', without('Cumans', 664), ups, { walkTiles: 4 }).steps.map((s) => s.stock))]);
    expect(r.some(([a, b]) => a !== b)).toBe(true);
  });
  // 波斯 409（.dat）：109 ×1.05、71 ×1.10；升封建 130s、升城堡 160s、村民 25s（.dat）
  it('波斯 409（守护）：升封建研发 130 / 1.05 = 123.81 s', () => { const f = feudal(run('fast-castle-boom', 'Persians')); expect(Math.abs(f.reachAt - f.clickAt - 130 / 1.05)).toBeLessThanOrEqual(0.1 + 1e-9); /* 模拟步长 TICK=0.1s */ });
  it('波斯 409（守护）：升城堡研发（封建 TC 71）160 / 1.10 = 145.45 s', () => { const c = castle(run('fast-castle-boom', 'Persians')); expect(Math.abs(c.reachAt - c.clickAt - 160 / 1.1)).toBeLessThanOrEqual(0.1 + 1e-9); });
  it('波斯 409（守护）：造村民变快（去掉 409 后点封建更晚，25/1.05 = 23.81 s）', () => expect(feudal(run('feudal-drush-18', 'Persians')).clickAt).toBeLessThan(feudal(run('feudal-drush-18', 'Persians', without('Persians', 409))).clickAt));
  it('丹麦 1494 交食物 +5%（守护）', () => expect(feudal(run('fast-castle-boom', 'Danes')).reachAt).toBeLessThan(feudal(run('fast-castle-boom', 'Danes', without('Danes', 1494))).reachAt));
  it('马来升级时代 ×0.6：到封建早于不列颠（#42 正文回归，守护）', () => expect(feudal(run('fast-castle-boom', 'Malay')).reachAt).toBeLessThan(feudal(run('fast-castle-boom', 'Britons')).reachAt));
});

// 白名单：留 v0.7.0，必须仍被 unhandledEffects 报出且带原因（不能被悄悄标成 handled/irrelevant）
const DEFERRED: Record<string, string[]> = {
  送村民: ['Bengalis', 'Wei'],
  边采集边产: ['Portuguese', 'Shu', 'Varangians'],
  资源总量与狩猎: ['Tatars', 'Mayans', 'Jurchens', 'Malians', 'Sicilians'],
  其他: ['Khmer', 'Chinese', 'Slavs', 'Romans'],
};
describe('#42 白名单（v0.7.0）：仍置灰且写明原因', () => {
  for (const [g, civs] of Object.entries(DEFERRED))
    it.each(civs)(`${g}：%s simSupport=false 且有原因`, (civ) => {
      const r = sim.simSupport(E, civ, buildOrders);
      expect(r.supported).toBe(false);
      expect(r.reasons.length).toBeGreaterThan(0);
    });
  it('放开清单里的文明（不在白名单的）simSupport=true', () => {
    for (const c of ['Persians', 'Aztecs', 'Tupi', 'Ethiopians', 'Dravidians', 'Malay', 'Italians', 'Muisca', 'Burgundians', 'Vietnamese', 'Cumans', 'Danes'])
      expect(sim.simSupport(E, c, buildOrders).reasons, c).toEqual([]);
  });
  it('未知效果要报错：unhandledEffects 检查保留（#42 正文回归）', () => {
    const e = structuredClone(E);
    e.civEco.Danes!.push({ source: 'bonus', tech: -1, name: 'probe', age: 1, requires: [], effects: [{ kind: 'res', res: 9999, op: 'add', v: 1 }] } as never);
    expect(sim.unhandledEffects(e, 'Danes').length).toBeGreaterThan(0);
    expect(sim.unknownCivEffects(E, buildOrders)).toEqual([]);
  });
});
