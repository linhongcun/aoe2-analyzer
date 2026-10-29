/** Independent canonical source fixture; only existing public APIs are imported before implementation. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import raw from './fixtures/jurchens197-source.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import {
  classifyCivEffect,
  civSimNotes,
  gatherRate,
  simScope,
  simSupport,
  simulateBuild,
  type EcoData,
  type EffectRow,
  type UpgradeData,
} from '../../src/domain/buildSim';
type Raw = Omit<(typeof raw)['993'], 'requires' | 'researchAt' | 'cost'> & { requires: number[]; researchAt: number[][]; cost: number[][] };
type Row = EffectRow & { jurchenTech?: Raw };
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const SOURCE_REASON = /女真.*(来源|上下文)/;
const NOTE = '按资源不耗尽估算，尸体腐烂与耗尽未模拟，不腐烂收益未计入';
const row = (e: EcoData, id: 993 | 995) => e.civEco.Jurchens!.find((r) => r.tech === id)! as Row;
const fixture = () => {
  const e = structuredClone(E);
  for (const id of [993, 995] as const) row(e, id).jurchenTech = structuredClone(raw[String(id) as '993' | '995']);
  return e;
};
const without = (e: EcoData, id: number) => {
  const copy = structuredClone(e);
  copy.civEco.Jurchens = copy.civEco.Jurchens!.filter((r) => r.tech !== id);
  return copy;
};
const rejected = (e: EcoData) => {
  const state = simSupport(e, 'Jurchens', buildOrders);
  expect(state.supported).toBe(false);
  expect(state.reasons.join('；')).toMatch(SOURCE_REASON);
};
const mutations: [string, (r: Row) => void][] = [
  [
    'missing raw',
    (r) => {
      delete r.jurchenTech;
    },
  ],
  [
    'wrong civ',
    (r) => {
      r.jurchenTech!.civ = 51;
    },
  ],
  [
    'wrong raw tech',
    (r) => {
      r.jurchenTech!.tech = 994;
    },
  ],
  [
    'wrong effect',
    (r) => {
      r.jurchenTech!.effectId = 994;
    },
  ],
  [
    'wrong required count',
    (r) => {
      r.jurchenTech!.requiredCount = 1;
    },
  ],
  [
    'wrong prerequisite',
    (r) => {
      r.jurchenTech!.requires = [101];
    },
  ],
  [
    'research location',
    (r) => {
      r.jurchenTech!.researchLocation = 209;
    },
  ],
  [
    'research sites',
    (r) => {
      r.jurchenTech!.researchAt = [[209, 0]];
    },
  ],
  [
    'research time',
    (r) => {
      r.jurchenTech!.researchTime = 1;
    },
  ],
  [
    'research fee',
    (r) => {
      r.jurchenTech!.cost = [[1, 5, 1]];
    },
  ],
  [
    'unknown raw companion',
    (r) => {
      r.jurchenTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
    },
  ],
  [
    'unknown-only raw',
    (r) => {
      r.jurchenTech!.commands = [{ Type: 999, A: -1, B: -1, C: -1, D: 1 }];
      r.effects = [];
    },
  ],
  [
    'missing decoded command',
    (r) => {
      r.effects.pop();
    },
  ],
  [
    'extra decoded command',
    (r) => {
      r.effects.push({ kind: 'res', res: 91, op: 'add', v: 1000 });
    },
  ],
  [
    'decoded nonfinite',
    (r) => {
      r.effects[0]!.v = Number.NaN;
    },
  ],
  [
    'wrong source',
    (r) => {
      r.source = 'team';
    },
  ],
  [
    'wrong age',
    (r) => {
      r.age = 2;
    },
  ],
  [
    'wrong decoded prerequisites',
    (r) => {
      r.requires = [101];
    },
  ],
];
describe('Jurchen complete source gate without fabricated corpse income', () => {
  it('generated real source supports the documented existing model', () => {
    expect(simSupport(E, 'Jurchens', buildOrders)).toEqual({ supported: true, reasons: [] });
    for (const id of [993, 995] as const) expect(row(E, id).jurchenTech).toEqual(raw[String(id) as '993' | '995']);
  });
  it('independent exact source is accepted and993 is explicitly outside the decay-free model', () => {
    const e = fixture(),
      r = row(e, 993);
    expect(simSupport(e, 'Jurchens', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(classifyCivEffect(r.effects[0]!, r, simScope(e, buildOrders, 'Jurchens')).kind).toBe('irrelevant');
    expect(civSimNotes(e, 'Jurchens', 'scouts-18')).toEqual([NOTE]);
  });
  for (const id of [993, 995] as const) {
    it.each(mutations)(`${id} %s cannot authorize this civilization`, (_name, mutate) => {
      const e = fixture();
      mutate(row(e, id));
      rejected(e);
    });
    it(`${id} duplicate source rows fail closed`, () => {
      const e = fixture();
      e.civEco.Jurchens!.push(structuredClone(row(e, id)));
      rejected(e);
    });
    it(`${id} whole removal is an omitted-group counterfactual with incomplete selector source`, () => {
      rejected(without(fixture(), id));
    });
    it(`${id} markers moved to another civilization cannot grant source admission`, () => {
      const e = fixture();
      e.civEco.Generic = [structuredClone(row(e, id))];
      expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    });
  }
  it('raw or decoded995 order changes cannot silently change ordered application', () => {
    for (const layer of ['raw', 'decoded'] as const) {
      const e = fixture(),
        r = row(e, 995);
      if (layer === 'raw') r.jurchenTech!.commands.reverse();
      else r.effects.reverse();
      rejected(e);
    }
  });
  it('all gather tasks and distances have no extra yield from993', () => {
    const full = fixture(),
      off = without(full, 993);
    for (const task of Object.keys(full.villager.tasks))
      for (const distance of [0, 2, 7]) expect(gatherRate(full, 'Jurchens', task, distance)).toEqual(gatherRate(off, 'Jurchens', task, distance));
  });
  it.each(buildOrders)('$id has identical numeric timeline when the no-decay row is removed', (bo) => {
    const full = fixture(),
      off = without(full, 993);
    const numbers = (v: unknown): unknown =>
      typeof v === 'number'
        ? v
        : Array.isArray(v)
          ? v.map(numbers)
          : v && typeof v === 'object'
            ? Object.fromEntries(
                Object.entries(v)
                  .filter(([key]) => key !== 'assumptions')
                  .map(([key, value]) => [key, numbers(value)]),
              )
            : v;
    expect(numbers(simulateBuild(bo, 'Jurchens', full, ups))).toEqual(numbers(simulateBuild(bo, 'Jurchens', off, ups)));
  });
});

/** Synthetic ample stock and housing isolate legal Castle University research, not ordinary starting gifts. */
const researchProbe = (research = true): BuildOrder => ({
  id: 'jurchens197-masonry-source-probe',
  name: { zh: '女真石工术来源核对', en: 'Jurchen masonry source probe' },
  style: 'other',
  civs: [],
  map: 'test',
  difficulty: 'beginner',
  target: { age: 3, vils: 30 },
  summary: 'Controlled legal research; synthetic initial stock and population capacity only.',
  sources: [],
  license: 'test',
  review: { status: 'draft' },
  steps: [
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: 3 },
        { type: 'build', building: 68 },
      ],
    },
    { vils: 3, actions: [{ type: 'build', building: 562 }] },
    { vils: 3, phase: 'feudal-click', actions: [{ type: 'ageUp', age: 2 }] },
    { vils: 3, phase: 'feudal', actions: [{ type: 'build', building: 103 }] },
    { vils: 3, actions: [{ type: 'build', building: 84 }] },
    { vils: 3, phase: 'castle-click', actions: [{ type: 'ageUp', age: 3 }] },
    { vils: 3, phase: 'castle', actions: [{ type: 'build', building: 209 }] },
    ...(research ? [{ vils: 10, actions: [{ type: 'research' as const, tech: 50 }] }] : []),
    { vils: 30, actions: [] },
  ],
});
const researchRun = (e: EcoData, research = true) => {
  const data = structuredClone(e);
  data.civEco.Jurchens!.push({
    source: 'bonus',
    age: 1,
    effects: [
      { kind: 'res', res: 91, op: 'add', v: 10000 },
      { kind: 'res', res: 92, op: 'add', v: 10000 },
      { kind: 'res', res: 94, op: 'add', v: 10000 },
      { kind: 'res', res: 4, op: 'add', v: 100 },
    ],
  });
  return simulateBuild(researchProbe(research), 'Jurchens', data, ups, { autoHouses: false });
};
const researchStep = (tl: ReturnType<typeof researchRun>) => tl.steps.find((s) => s.entity?.kind === 'tech' && s.entity.id === '50')!;
const roundTick = (n: number) => Math.round(n * 10) / 10;
describe('Jurchen995 legal controlled research charges and completion clocks', () => {
  it('Masonry pays44Wood/150Food, completes nominal25s, and saves131Wood at the same later actual clock', () => {
    const full = fixture(),
      off = without(full, 995);
    const counted = researchRun(full),
      ordinary = researchRun(off),
      noResearch = researchRun(full, false);
    const c = researchStep(counted),
      o = researchStep(ordinary);
    expect(counted.anomalies.some((a) => a.type === 'timeout')).toBe(false);
    expect(counted.ageUps.find((a) => a.age === 'castle')!.reachAt).toBeLessThan(c.researchAt!);
    expect(counted.buildingsDone.find((b) => b.building === 209)!.at).toBeLessThanOrEqual(c.researchAt!);
    expect(c.researchAt).toBe(o.researchAt);
    expect(c.doneAt).toBe(roundTick(c.researchAt! + 25 - 0.1));
    expect(o.doneAt).toBe(roundTick(o.researchAt! + 50 - 0.1));
    expect(roundTick(o.doneAt - c.doneAt)).toBe(25);
    const last = counted.steps.at(-1)!,
      base = ordinary.steps.at(-1)!,
      skip = noResearch.steps.at(-1)!;
    expect(last.startAt).toBe(base.startAt);
    expect(last.startAt).toBe(skip.startAt);
    expect(last.startAt).toBeGreaterThan(o.doneAt);
    expect(skip.stock.wood - last.stock.wood).toBe(44);
    expect(skip.stock.wood - base.stock.wood).toBe(175);
    expect(last.stock.wood - base.stock.wood).toBe(131);
    expect(skip.stock.food - last.stock.food).toBe(150);
    expect(last.stock.food).toBe(base.stock.food);
  });
  it.each(['missing raw', 'unknown companion', 'decoded companion'])('995 %s applies no partial discount or research speed', (kind) => {
    const e = fixture(),
      r = row(e, 995);
    if (kind === 'missing raw') delete r.jurchenTech;
    else if (kind === 'unknown companion') r.jurchenTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
    else r.effects.push({ kind: 'techCost', tech: 50, res: 1, op: 'add', v: -100 });
    const invalid = researchRun(e),
      ordinary = researchRun(without(fixture(), 995));
    const a = researchStep(invalid),
      b = researchStep(ordinary);
    expect(a.researchAt).toBe(b.researchAt);
    expect(a.doneAt).toBe(b.doneAt);
    expect(invalid.steps.at(-1)!.stock).toEqual(ordinary.steps.at(-1)!.stock);
  });
});
