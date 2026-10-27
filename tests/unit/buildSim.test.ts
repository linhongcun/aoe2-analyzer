import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import civs from '../../src/data/civs.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simSupport as simSupportFn } from '../../src/domain/simSupport';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { idleAnomaly, simSupport, simulateBuild, unhandledEffects, unknownCivEffects, WALK, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const sim = (bo: BuildOrder, civ = 'Britons', p = {}) => simulateBuild(bo, civ, E, ups, p);
const compact = (r: ReturnType<typeof sim>) => ({
  ageUps: r.ageUps,
  tcIdleTotal: r.tcIdleTotal,
  steps: r.steps.map(
    (s) =>
      `${s.index} v${s.vils} ${s.startAt}->${s.doneAt} (-${s.errSec.early}/+${s.errSec.late}) F${s.stock.food} W${s.stock.wood} G${s.stock.gold} S${s.stock.stone} pop ${s.pop.used}/${s.pop.cap}${s.anomalies.length ? ' ! ' + s.anomalies.map((a) => a.reasonZh).join(' | ') : ''}`,
  ),
});

describe('golden snapshots (Britons, default params)', () => {
  it.each(buildOrders.map((b) => [b.id, b] as const))('%s', (_id, bo) => {
    expect(compact(sim(bo))).toMatchSnapshot();
  });
});

describe('golden snapshots (Spanish, default params, #42)', () => {
  it.each(buildOrders.map((b) => [b.id, b] as const))('%s', (_id, bo) => {
    expect(compact(sim(bo, 'Spanish'))).toMatchSnapshot();
  });
});

describe('determinism & coverage', () => {
  it('same input -> identical output', () => {
    const bo = buildOrders[0]!;
    expect(JSON.stringify(sim(bo, 'Franks', { walkTiles: 7 }))).toBe(JSON.stringify(sim(bo, 'Franks', { walkTiles: 7 })));
  });
  it('all builds x all civs finish and reach the target age', () => {
    for (const bo of buildOrders)
      for (const c of civs) {
        const r = sim(bo, c.en);
        expect(
          r.anomalies.filter((a) => a.type === 'timeout'),
          `${bo.id} x ${c.en}`,
        ).toEqual([]);
        expect(r.ageUps.length, `${bo.id} x ${c.en}`).toBe(bo.target.age - 1);
      }
  }, 120_000);
  it('fields align with #3 draft', () => {
    const r = sim(buildOrders.find((b) => b.id === 'archers-19')!);
    expect(Object.keys(r)).toEqual(expect.arrayContaining(['buildId', 'civ', 'variant', 'params', 'ageUps', 'steps', 'model']));
    const s = r.steps[0]!;
    expect(Object.keys(s)).toEqual(expect.arrayContaining(['index', 'action', 'startAt', 'doneAt', 'errSec', 'stock', 'pop', 'villagers', 'anomalies']));
    expect(r.params.walkTiles).toBe(WALK.default);
    expect(r.model.assumptions.length).toBeGreaterThan(3);
  });
});

describe('walking distance & error band', () => {
  const bo = buildOrders.find((b) => b.id === 'fast-castle-boom')!;
  it('clamps to 1-10, presets 2/4/7, default 4', () => {
    expect(WALK.presets).toEqual({ near: 2, mid: 4, far: 7 });
    expect(sim(bo, 'Britons', { walkTiles: 99 }).params.walkTiles).toBe(10);
    expect(sim(bo, 'Britons', { walkTiles: 0 }).params.walkTiles).toBe(1);
  });
  it('farther wood -> later Castle; band is asymmetric and brackets the near/far runs', () => {
    const t = (d: number) => sim(bo, 'Britons', { walkTiles: d }).ageUps.find((a) => a.age === 'castle')!.reachAt;
    expect(t(2)).toBeLessThanOrEqual(t(4));
    expect(t(4)).toBeLessThanOrEqual(t(7));
    const r = sim(bo).ageUps.find((a) => a.age === 'castle')!;
    expect(r.errSec.early).toBeCloseTo(t(4) - t(2), 5);
    expect(r.errSec.late).toBeCloseTo(t(7) - t(4), 5);
    expect(r.errSec.early).not.toBe(r.errSec.late);
  });
});

describe('TC idle threshold (strictly > 2 s)', () => {
  it('1.9 s -> not an anomaly', () => expect(idleAnomaly(100, 101.9, 'food')).toBeNull());
  it('2.0 s -> not an anomaly', () => expect(idleAnomaly(100, 102, 'food')).toBeNull());
  it('2.1 s -> idle_tc with seconds', () =>
    expect(idleAnomaly(100, 102.1, 'pop')).toEqual({ type: 'idle_tc', waitSec: 2.1, from: 100, to: 102.1, reasonZh: '城镇中心闲置 约 2.1 秒（卡人口）' }));
});

describe('hand-computed resource shortfall', () => {
  // 3 个开局村民全部吃羊（近 = 2 格），不再造村民，立即点封建（500 食物）。
  // 起始食物 200 -> 缺口 300。
  // 单人收入 = 10 ÷ (10 ÷ 0.33 + 2x2 ÷ 0.8) = 10 ÷ 35.3030 = 0.283262/秒；3 人 = 0.849785/秒。
  // 每 0.1 秒入账 0.0849785，需 ⌈300 ÷ 0.0849785⌉ = 3531 个步长 -> 第 353.1 秒付清，等待 353.1 秒；
  // 研究 130 秒 -> 483.1 秒到达封建。
  const bo: BuildOrder = {
    id: 'hand-case',
    name: { zh: '手算', en: 'hand' },
    style: 'other',
    civs: [],
    map: 'test',
    difficulty: 'beginner',
    target: { age: 2, vils: 3 },
    summary: 's',
    sources: [],
    license: 'test',
    review: { status: 'draft' },
    steps: [
      {
        vils: 3,
        phase: 'feudal-click',
        actions: [
          { type: 'gather', task: 'sheep', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
    ],
  };
  it('food short 300, waits 353.1 s, Feudal at 483.1 s', () => {
    // 无文明加成、不自动补房；手算用例只验资源等待，去掉前置建筑条件（前置另有护栏用例）
    const r = simulateBuild(bo, 'Generic', { ...E, ageReq: undefined }, ups, { autoHouses: false });
    const a = r.steps[0]!.anomalies.find((x) => x.type === 'resource_short')!;
    expect(a).toMatchObject({ resource: 'food', shortfall: 300, from: 0, waitSec: 353.1, reasonZh: '食物差 300（等待 约 353.1 秒）' });
    expect(r.ageUps[0]).toMatchObject({ age: 'feudal', clickAt: 353.1, reachAt: 483.1 });
    expect(r.steps[0]!.anomalies.some((x) => x.type === 'idle_tc')).toBe(false);
  });
});

describe('civ economy bonuses (vs Generic = no bonuses)', () => {
  it('Britons shepherds work faster -> more food than Generic', () => {
    const b = buildOrders.find((x) => x.id === 'archers-19')!;
    expect(sim(b, 'Britons').steps[6]!.stock.food).toBeGreaterThan(sim(b, 'Generic').steps[6]!.stock.food);
  });
  const bo = buildOrders.find((b) => b.id === 'archers-19')!;
  it('Chinese: start with 6 villagers and -200 food / -50 wood', () => {
    const s = sim(bo, 'Chinese').steps[0]!;
    expect(s.stock).toMatchObject({ food: 0, wood: 150 });
    expect(s.pop.used).toBe(7);
  });
  it('Mayans start with 4 villagers (Generic 3); pop = villagers + scout', () => {
    const vils = (civ: string) => Object.values(sim(bo, civ).steps[0]!.villagers).reduce((a, b) => a + b, 0);
    expect(vils('Mayans')).toBe(4);
    expect(vils('Generic')).toBe(3);
    expect(sim(bo, 'Mayans').steps[0]!.pop.used).toBe(5);
  });
  it('Celts lumberjacks +15% -> more wood at Feudal click than Generic', () => {
    const i = bo.steps.findIndex((s) => s.phase === 'feudal-click');
    expect(sim(bo, 'Celts').steps[i]!.stock.wood).toBeGreaterThan(sim(bo, 'Generic').steps[i]!.stock.wood);
  });
  it('Franks foragers +15% -> more food at Feudal click than a no-bonus baseline', () => {
    const fc = buildOrders.find((b) => b.id === 'fast-castle-boom')!;
    const i = fc.steps.findIndex((s) => s.phase === 'feudal-click');
    expect(sim(fc, 'Franks').steps[i]!.stock.food).toBeGreaterThan(sim(fc, 'Generic').steps[i]!.stock.food);
  });
  it('Hindustanis cheaper villagers -> more food banked at Feudal click', () => {
    const i = bo.steps.findIndex((s) => s.phase === 'feudal-click');
    expect(sim(bo, 'Hindustanis').steps[i]!.stock.food).toBeGreaterThan(sim(bo, 'Generic').steps[i]!.stock.food);
  });
});

describe('pop_block with missing houses', () => {
  const HOUSE = 70;
  const withoutHouses = (bo: BuildOrder): BuildOrder => ({
    ...bo,
    steps: bo.steps.map((s) => ({ ...s, actions: s.actions.filter((a) => !(a.type === 'build' && a.building === HOUSE)) })),
  });
  it('autoHouses off + no house builds -> pop_block anomaly (卡人口)', () => {
    const bo = withoutHouses(buildOrders.find((b) => b.id === 'fast-castle-boom')!);
    const pb = sim(bo, 'Britons', { autoHouses: false }).anomalies.filter((a) => a.type === 'pop_block');
    expect(pb.length).toBeGreaterThan(0);
    expect(pb[0]!.waitSec).toBeGreaterThan(0);
    expect(pb[0]!.reasonZh).toContain('卡人口');
  });
  it('造兵被人口卡住直到超时：从阻塞开始记 pop_block，且早于 timeout（scouts-18 × house=0）', () => {
    const bo = buildOrders.find((b) => b.id === 'scouts-18')!;
    const r = sim(bo, 'Britons', { autoHouses: false });
    const pb = r.anomalies.find((a) => a.type === 'pop_block');
    const to = r.anomalies.find((a) => a.type === 'timeout');
    expect(pb).toBeDefined();
    expect(to).toBeDefined();
    expect(pb!.from).toBeLessThan(to!.from);
    expect(pb!.reasonZh).toContain('卡人口');
    const step = r.steps.find((s) => s.anomalies.includes(pb!))!;
    expect(step.action).toBe('train');
  });
});

describe('end-to-end idle_tc', () => {
  it('fast-castle-boom x Britons (default params) -> idle_tc > 2 s; raising the threshold hides it', () => {
    const bo = buildOrders.find((b) => b.id === 'fast-castle-boom')!;
    const idle = sim(bo).anomalies.filter((a) => a.type === 'idle_tc');
    expect(idle.length).toBeGreaterThan(0);
    expect(idle[0]!.waitSec).toBeGreaterThan(2);
    expect(sim(bo, 'Britons', { idleThreshold: 50 }).anomalies.some((a) => a.type === 'idle_tc')).toBe(false);
  });
});

describe('#42 P0 buildSim 文明加成不得静默忽略', () => {
  const fcb = buildOrders.find((b) => b.id === 'fast-castle-boom')!;
  const feudal = (civ: string, e: EcoData = E) => simulateBuild(fcb, civ, e, ups, { walkTiles: 4 }).ageUps.find((a) => a.age === 'feudal')!.reachAt;
  const castle = (civ: string, e: EcoData = E) => simulateBuild(fcb, civ, e, ups, { walkTiles: 4 }).ageUps.find((a) => a.age === 'castle')!.reachAt;
  const without = (civ: string, tech: number): EcoData => {
    const e = structuredClone(E);
    e.civEco[civ] = e.civEco[civ]!.filter((r) => (r as { tech?: number }).tech !== tech);
    return e;
  };
  it('丹麦人交食物 +5%（1494 / res 299）：到封建早于现状 673.5 秒', () => expect(feudal('Danes')).toBeLessThan(673.5));
  it('去掉 1494 后到封建应更慢（加成确实生效）', () => expect(feudal('Danes', without('Danes', 1494))).toBeGreaterThan(feudal('Danes')));
  it('马来升级时代时间 ×0.6（634）：到封建早于不列颠', () => expect(feudal('Malay')).toBeLessThan(feudal('Britons')));
  it('意大利升级时代 −15%、穆伊斯卡进城堡黄金 −50%：到城堡时库存比通用多', () => {
    const end = (civ: string) => simulateBuild(fcb, civ, E, ups, { walkTiles: 4 }).steps.at(-1)!.stock;
    const g = end('Generic');
    expect(end('Italians').food - g.food).toBeGreaterThanOrEqual(Math.round(500 * 0.15) + Math.round(800 * 0.15) - 2);
    expect(end('Muisca').gold - g.gold).toBe(100);
    expect(castle('Italians')).toBeLessThanOrEqual(castle('Generic'));
  });
  it('初始资源：波斯 +50 食 +50 木只算一次；阿兹特克 +50 金；埃塞俄比亚开局 +100 食 +100 金', () => {
    const s0 = (civ: string) => simulateBuild(fcb, civ, E, ups).steps[0]!.stock;
    const g = s0('Generic');
    expect(s0('Persians').food - g.food).toBe(50);
    expect(s0('Persians').wood - g.wood).toBe(50);
    expect(s0('Aztecs').gold - g.gold).toBe(50);
    expect(s0('Ethiopians').gold - g.gold).toBe(100);
  });
  it('未知效果类型要报错而不是跳过', () => {
    const e = structuredClone(E);
    e.civEco.Danes!.push({ source: 'bonus', tech: -1, name: 'probe', age: 1, requires: [], effects: [{ kind: 'res', res: 9999, op: 'add', v: 1 }] } as never);
    expect(unhandledEffects(e, 'Danes').some((x) => x.kind === 'unknown')).toBe(true);
    expect(unknownCivEffects(e, buildOrders)).toEqual(['Danes tech -1: res res 9999 add 1']);
  });
  it('真实 eco.json：没有未分类的效果（bo:check 同一检查）', () => expect(unknownCivEffects(E, buildOrders)).toEqual([]));
  it('simSupport：已支持和待核实文明集合，魏按197第八批迁入', () => {
    for (const c of ['Danes', 'Malay', 'Britons', 'Generic', 'Persians', 'Portuguese', 'Shu', 'Malians', 'Tatars', 'Mayans', 'Sicilians', 'Wei'])
      expect(simSupport(E, c, buildOrders), c).toEqual({ supported: true, reasons: [] });
    for (const c of ['Chinese', 'Romans', 'Slavs', 'Mapuche', 'Jurchens', 'Khmer']) expect(simSupport(E, c, buildOrders).supported, c).toBe(false);
  });
  it('按 tech 整条判定：鞑靼704混入未知伴随时两半均不生效（去掉704结果相同）', () => {
    const e = structuredClone(E);
    e.civEco.Tatars!.find((row) => (row as { tech?: number }).tech === 704)!.effects.push({ kind: 'res', res: 9999, op: 'add', v: 1 });
    expect(simulateBuild(fcb, 'Tatars', e, ups, { walkTiles: 4 }).ageUps).toEqual(
      simulateBuild(fcb, 'Tatars', without('Tatars', 704), ups, { walkTiles: 4 }).ageUps,
    );
    expect(feudal('Tatars')).toBeLessThan(700);
  });
  it('按 tech 整条判定：混入一条未实现效果，整条 tech 都不生效', () => {
    const e = structuredClone(E);
    const malay = e.civEco.Malay!.find((r) => (r as { tech?: number }).tech === 634)!;
    malay.effects.push({ kind: 'res', res: 267, op: 'add', v: 1 });
    expect(feudal('Malay', e)).toBe(feudal('Malay', without('Malay', 634)));
    expect(simSupport(e, 'Malay', buildOrders).supported).toBe(false);
  });
  // Kent 草稿（#43 comment 6106496636）
  it('高棉 fast-castle-boom 距离 4：食物不是瓶颈（只缺木）', () => {
    const r = simulateBuild(fcb, 'Khmer', E, ups, { walkTiles: 4 });
    expect(r.steps.flatMap((s) => s.anomalies.filter((a) => a.type === 'resource_short').map((a) => (a as { resource?: string }).resource))).not.toContain(
      'food',
    );
  });
  it.todo('高棉：农田为瓶颈的开局里，去掉 654 必须让结果变慢（证明后再把高棉放出来）');
  // 波斯 TC 工作速度（409：黑暗 109 ×1.05、封建 71 ×1.10、城堡 141 ×1.15）：村民训练与升时代研究都按当前城镇中心计
  const researchDur = (civ: string, age: 'feudal' | 'castle', e: EcoData = E) => {
    const a = simulateBuild(fcb, civ, e, ups, { walkTiles: 4 }).ageUps.find((x) => x.age === age)!;
    return a.reachAt - a.clickAt;
  };
  it('波斯封建研究：黑暗 TC ×1.05，130 ÷ 1.05 ≈ 123.81 秒（误差不超过一个 0.1 秒步长）', () =>
    expect(Math.abs(researchDur('Persians', 'feudal') - 130 / 1.05)).toBeLessThanOrEqual(0.1 + 1e-9));
  it('波斯城堡研究：封建 TC ×1.10，160 ÷ 1.10 ≈ 145.45 秒（不是黑暗 TC 的 ×1.05）', () =>
    expect(Math.abs(researchDur('Persians', 'castle') - 160 / 1.1)).toBeLessThanOrEqual(0.1 + 1e-9));
  it('波斯封建研究快于不列颠（130 秒）', () => expect(researchDur('Persians', 'feudal')).toBeLessThan(researchDur('Britons', 'feudal')));
  it('波斯村民训练也按当前城镇中心加速（去掉 409 则第 9 名村民更晚）', () => {
    const at = (e: EcoData) => simulateBuild(fcb, 'Persians', e, ups, { walkTiles: 4 }).steps.find((s) => s.vils === 9)!.startAt;
    expect(at(E)).toBeLessThan(at(without('Persians', 409)));
  });
  it('src/domain/simSupport 导出 (civId) => boolean', () => {
    expect(simSupportFn('Danes')).toBe(true);
    expect(simSupportFn('Persians')).toBe(true);
    expect(simSupportFn('Khmer')).toBe(false);
    expect(simSupportFn('Chinese')).toBe(false);
  });
});
