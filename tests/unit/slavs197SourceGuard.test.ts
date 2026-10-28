/** #197 fixed-source and independent Slavic farm capability regression. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

type Cmd = { Type: number; A: number; B: number; C: number; D: number };
type RawTree = { civId: number; treeId: number; commands: Cmd[] };
type RawTech = {
  tech: number;
  civ: number;
  effectId: number;
  requiredCount: number;
  requires: number[];
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: Cmd[];
};
type Physical = { civId: number; farms: { unit: number; type: number; class: number; workRate: number; capacity: number }[] };
type Data = EcoData & { slavicFarm?: Physical };
type Row = EcoData['civEco'][string][number] & { slavicTree?: RawTree; slavicTech?: RawTech };
const E = eco as unknown as Data;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const PHYSICAL: Physical = {
  civId: 23,
  farms: [
    { unit: 50, type: 80, class: 49, workRate: 0.4, capacity: 15 },
    { unit: 1187, type: 80, class: 49, workRate: 0.4, capacity: 15 },
  ],
};
const TREE: RawTree = {
  civId: 23,
  treeId: 7,
  commands: [
    { Type: 102, A: -1, B: -1, C: -1, D: 15.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 51.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 54.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 63.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 64.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 201.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 244.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 279.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 252.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 439.0 },
    { Type: 5, A: 214, B: -1, C: 13, D: 1.2300000190734863 },
    { Type: 5, A: 259, B: -1, C: 13, D: 1.2300000190734863 },
    { Type: 102, A: -1, B: -1, C: -1, D: 188.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 265.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 237.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 85.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 436.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 437.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 380.0 },
    { Type: 103, A: 602, B: -1, C: 0, D: 0.0 },
    { Type: 101, A: 602, B: 0, C: 0, D: 0.0 },
    { Type: 101, A: 602, B: 3, C: 0, D: 0.0 },
    { Type: 103, A: 875, B: -1, C: 0, D: 0.0 },
    { Type: 101, A: 875, B: 0, C: 0, D: 0.0 },
    { Type: 101, A: 875, B: 3, C: 0, D: 0.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 376.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 373.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 608.0 },
    { Type: 5, A: 50, B: -1, C: 13, D: 1.149999976158142 },
    { Type: 5, A: 1187, B: -1, C: 13, D: 1.149999976158142 },
    { Type: 102, A: -1, B: -1, C: -1, D: 1138.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 1142.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 909.0 },
    { Type: 102, A: -1, B: -1, C: -1, D: 910.0 },
  ],
};
const TECHS: Record<number, RawTech> = {
  '510': {
    tech: 510,
    civ: 23,
    effectId: 566,
    requiredCount: 0,
    requires: [],
    researchLocation: -1,
    researchAt: [],
    researchTime: 0,
    cost: [],
    commands: [
      { Type: 5, A: -1, B: 18, C: 5, D: 1.2000000476837158 },
      { Type: 5, A: -1, B: 43, C: 5, D: 1.2000000476837158 },
      { Type: 5, A: 1811, B: -1, C: 5, D: 1.2000000476837158 },
      { Type: 5, A: 1826, B: -1, C: 5, D: 1.2000000476837158 },
      { Type: 5, A: 1827, B: -1, C: 5, D: 1.2000000476837158 },
    ],
  },
  '511': {
    tech: 511,
    civ: 23,
    effectId: 567,
    requiredCount: 0,
    requires: [],
    researchLocation: -1,
    researchAt: [],
    researchTime: 0,
    cost: [],
    commands: [
      { Type: 5, A: -1, B: 13, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: -1, B: 55, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1923, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1120, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1122, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1744, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1746, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1962, B: -1, C: 100, D: 0.8500000238418579 },
      { Type: 5, A: 1980, B: -1, C: 100, D: 0.8500000238418579 },
    ],
  },
  '721': {
    tech: 721,
    civ: 23,
    effectId: 758,
    requiredCount: 0,
    requires: [],
    researchLocation: -1,
    researchAt: [],
    researchTime: 0,
    cost: [],
    commands: [
      { Type: 10, A: 12, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 20, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 132, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 498, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 10, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 14, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 87, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 86, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 101, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 153, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 150, B: -1, C: 21, D: 5.0 },
      { Type: 10, A: 49, B: -1, C: 21, D: 5.0 },
    ],
  },
};

const farmRow = (e: Data) => e.civEco.Slavs!.find((r) => (r as Row).slavicTree) as Row;
const techRow = (e: Data, tech: number) => e.civEco.Slavs!.find((r) => r.tech === tech) as Row;
// Independent exact source fixture: runs against the OLD public API too; no missing module/import pseudo-red.
const fixture = (): Data => {
  const e: Data = structuredClone(E);
  e.slavicFarm = structuredClone(PHYSICAL);
  const farm = e.civEco.Slavs!.find((r) => r.source === 'tree' && r.effects.some((x) => x.target === 'task:farm')) as Row;
  farm.slavicTree = structuredClone(TREE);
  for (const id of [510, 511]) techRow(e, id).slavicTech = structuredClone(TECHS[id]!);
  e.civEco.Slavs = e.civEco.Slavs!.filter((r) => r.tech !== 721);
  e.civEco.Slavs.push({ source: 'team', tech: 721, age: 1, requires: [], effects: [], slavicTech: structuredClone(TECHS[721]!) } as Row);
  return e;
};
const stockBo: BuildOrder = {
  ...buildOrders[0]!,
  id: 'slavs-source-stock',
  target: { age: 2, vils: 4 },
  steps: [
    { vils: 3, actions: [{ type: 'gather', task: 'farm', count: 3 }] },
    { vils: 4, actions: [] },
  ],
};
const run = (e: Data, civ = 'Slavs') => {
  const input = structuredClone(e);
  input.villager.trainTime = 100;
  return simulateBuild(stockBo, civ, input, ups, { autoHouses: false, nearTiles: 2 });
};
const rateWithoutBonus = (e: Data) => {
  const b = e.villager.tasks.farm!;
  return Math.min(b.carry / (b.carry / b.workRate + 4 / e.villager.speed), 0.4);
};
const assertPhysicalStockWithoutBonus = (e: Data) => {
  const s = run(e).steps[1]!;
  expect(Math.abs(s.stock.food - (150 + 3 * rateWithoutBonus(e) * s.startAt))).toBeLessThanOrEqual(1.2);
  expect(s.stock).toMatchObject({ wood: 200, gold: 100, stone: 200 });
};

describe('#197 斯拉夫独立physical与可移除bonus完整来源', () => {
  it('完整fixture可用且当前真实supplier=.46，不能一律拒绝', () => {
    const e = fixture();
    expect(simSupport(e, 'Slavs', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(gatherRate(e, 'Slavs', 'farm', 2).rate).toBeCloseTo(0.46, 12);
    expect(techRow(e, 721)).toMatchObject({ source: 'team', effects: [], slavicTech: TECHS[721] });
  });
  it.each<[string, (e: Data) => void]>([
    [
      '缺physical',
      (e) => {
        delete e.slavicFarm;
      },
    ],
    [
      'physical错文明',
      (e) => {
        e.slavicFarm!.civId = 22;
      },
    ],
    [
      '缺一块供应对象',
      (e) => {
        e.slavicFarm!.farms.pop();
      },
    ],
    [
      '重复供应对象',
      (e) => {
        e.slavicFarm!.farms.push(structuredClone(e.slavicFarm!.farms[0]!));
      },
    ],
    [
      '供应对象id',
      (e) => {
        e.slavicFarm!.farms[0]!.unit = 51;
      },
    ],
    [
      '供应对象type',
      (e) => {
        e.slavicFarm!.farms[0]!.type = 70;
      },
    ],
    [
      '供应对象class',
      (e) => {
        e.slavicFarm!.farms[0]!.class = 4;
      },
    ],
    [
      '供应基础workRate',
      (e) => {
        e.slavicFarm!.farms[0]!.workRate = 0.5;
      },
    ],
    [
      '供应capacity',
      (e) => {
        e.slavicFarm!.farms[0]!.capacity = 16;
      },
    ],
    [
      '供应负数',
      (e) => {
        e.slavicFarm!.farms[1]!.workRate = -1;
      },
    ],
    [
      '供应NaN',
      (e) => {
        e.slavicFarm!.farms[1]!.workRate = Number.NaN;
      },
    ],
    [
      '供应无限',
      (e) => {
        e.slavicFarm!.farms[1]!.workRate = Number.POSITIVE_INFINITY;
      },
    ],
  ])('%s不启用任何新farm能力', (_name, mutate) => {
    const e = fixture();
    mutate(e);
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Slavs', 'farm', 2)).toEqual(gatherRate(e, 'Generic', 'farm', 2));
    expect(run(e).steps).toEqual(run(e, 'Generic').steps);
  });
  it.each<[string, (e: Data) => void]>([
    [
      '缺tree raw',
      (e) => {
        delete farmRow(e).slavicTree;
      },
    ],
    [
      'tree错civ',
      (e) => {
        farmRow(e).slavicTree!.civId = 22;
      },
    ],
    [
      'tree错effect',
      (e) => {
        farmRow(e).slavicTree!.treeId = 8;
      },
    ],
    [
      '缺female214',
      (e) => {
        const r = farmRow(e).slavicTree!;
        r.commands = r.commands.filter((c) => c.A !== 214);
      },
    ],
    [
      '缺male259',
      (e) => {
        const r = farmRow(e).slavicTree!;
        r.commands = r.commands.filter((c) => c.A !== 259);
      },
    ],
    [
      '缺farm1187',
      (e) => {
        const r = farmRow(e).slavicTree!;
        r.commands = r.commands.filter((c) => c.A !== 1187);
      },
    ],
    [
      '重复raw工作率',
      (e) => {
        const r = farmRow(e).slavicTree!;
        r.commands.push(structuredClone(r.commands.find((c) => c.A === 214)!));
      },
    ],
    [
      'raw倍率漂移',
      (e) => {
        farmRow(e).slavicTree!.commands.find((c) => c.A === 50)!.D = 1.2;
      },
    ],
    [
      'raw未知伴随',
      (e) => {
        farmRow(e).slavicTree!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      },
    ],
    [
      'raw unknown-only',
      (e) => {
        const r = farmRow(e);
        r.slavicTree!.commands = [{ Type: 999, A: -1, B: -1, C: -1, D: 1 }];
        r.effects = [];
      },
    ],
    [
      'decoded consumer漂移',
      (e) => {
        farmRow(e).effects.find((x) => x.target === 'task:farm')!.v = 2;
      },
    ],
    [
      'decoded supplier漂移',
      (e) => {
        farmRow(e).effects.find((x) => x.target === 'unit:50')!.v = 2;
      },
    ],
    [
      'decoded未知伴随',
      (e) => {
        farmRow(e).effects.push({ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 2 });
      },
    ],
  ])('%s整组bonus拒绝但保留独立physical=.4', (_name, mutate) => {
    const e = fixture();
    mutate(e);
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Slavs', 'farm', 2)).toEqual({ ...gatherRate(e, 'Generic', 'farm', 2), rate: rateWithoutBonus(e) });
    expect(gatherRate(e, 'Slavs', 'wood')).toEqual(gatherRate(e, 'Generic', 'wood'));
    assertPhysicalStockWithoutBonus(e);
  });
  it('whole bonus omission is legal, while physical omission then cancels the independent model', () => {
    const e = fixture();
    const bonus = farmRow(e);
    e.civEco.Slavs = e.civEco.Slavs!.filter((r) => r !== bonus);
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(true);
    expect(gatherRate(e, 'Slavs', 'farm', 2).rate).toBeCloseTo(0.4, 12);
    assertPhysicalStockWithoutBonus(e);
    delete e.slavicFarm;
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Slavs', 'farm', 2)).toEqual(gatherRate(e, 'Generic', 'farm', 2));
  });
  it.each([510, 511, 721])('raw规范tech%s缺上下文时不能因effects空或无当前作用而放行', (id) => {
    const e = fixture();
    delete techRow(e, id).slavicTech;
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Slavs', 'farm', 2).rate).toBeCloseTo(0.46, 12);
  });
  it.each([510, 511, 721])('raw规范tech%s的unknown-only仍被拒，farm独立组不丢失', (id) => {
    const e = fixture();
    const r = techRow(e, id);
    r.slavicTech!.commands = [{ Type: 999, A: -1, B: -1, C: -1, D: 1 }];
    r.effects = [];
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Slavs', 'farm', 2).rate).toBeCloseTo(0.46, 12);
  });
  it.each([510, 511, 721])('raw规范tech%s的wrongciv/site拒绝，不能扩大源族', (id) => {
    const e = fixture();
    const r = techRow(e, id);
    r.slavicTech!.civ = 22;
    r.slavicTech!.researchLocation = 109;
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Slavs', 'farm', 2).rate).toBeCloseTo(0.46, 12);
  });
  it('721不能伪装成普通bonus或把Type10当普通人口赠送', () => {
    const e = fixture();
    techRow(e, 721).source = 'bonus';
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(run(e).steps[0]!.pop).toEqual({ used: 4, cap: 5 });
  });
  it('copied rawtree to Generic is refused at row level in direct gatherRate too', () => {
    const e = fixture();
    e.civEco.Generic = [structuredClone(farmRow(e))];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'farm', 2)).toEqual(gatherRate(E, 'Generic', 'farm', 2));
  });
});

// Additional implementation-boundary checks requested after the original 99 turned green.
// Exact pre-format red drafts remain archived; the original sourceguard assertions above are unchanged.
describe('#197 Slavic implementation boundary checks', () => {
  it('noncanonical tree requires header is rejected as source drift', () => {
    const e = fixture();
    farmRow(e).requires = [99999];
    expect(simSupport(e, 'Slavs', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Slavs', 'farm', 2).rate).toBeCloseTo(rateWithoutBonus(e), 12);
    assertPhysicalStockWithoutBonus(e);
  });
  it('empty-effects foreign Slavic tree and tech markers are refused before effect iteration', () => {
    const e = fixture();
    e.civEco.Generic = [
      { ...structuredClone(farmRow(e)), effects: [] },
      { ...structuredClone(techRow(e, 721)), effects: [] },
    ];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'farm', 2)).toEqual(gatherRate(E, 'Generic', 'farm', 2));
  });
});
