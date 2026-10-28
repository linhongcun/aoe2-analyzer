import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Step } from '../../src/domain/buildOrder';
import { civSimNotes, simSupport, simulateBuild, type BuildTimeline, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { buildView } from '../../src/features/builds/timelineModel';
import { validateDocument } from '../../scripts/content-schema.mjs';

interface Command {
  Type: number;
  A: number;
  B: number;
  C: number;
  D: number;
}
interface Spawn {
  effectId: number;
  requiredCount: number;
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: Command[];
}
interface RawTech {
  effect: number;
  requiredCount: number;
  researchLocations: { location: number; time: number }[];
  cost: number[][];
  commands: Command[];
}
interface BonusEvent {
  at: number;
  tech: number;
  trigger: number;
  count: number;
  step: number;
  pop: { used: number; cap: number };
  task: string | null;
}
type Row = EcoData['civEco'][string][number] & { ageSpawn?: Spawn };
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const source = JSON.parse(readFileSync(new URL('../../docs/design/bengalis197-source.json', import.meta.url), 'utf8')) as {
  techClosure: Record<string, RawTech>;
};
const ids = [847, 848, 849, 873];
const rows = (e: EcoData) => e.civEco.Bengalis! as Row[];
const row = (e: EcoData, tech = 847) => rows(e).find((r) => r.tech === tech)!;
// Explicit projected fixture from freshly parsed pinned evidence; never substituted for actual generated E.
const projected = (): EcoData => {
  const e = structuredClone(E);
  for (const id of ids) {
    const t = source.techClosure[id]!;
    row(e, id).ageSpawn = {
      effectId: t.effect,
      requiredCount: t.requiredCount,
      researchLocation: Math.max(...t.researchLocations.map((l) => l.location), -1),
      researchAt: t.researchLocations.filter((l) => l.location >= 0).map((l) => [l.location, l.time]),
      researchTime: Math.max(...t.researchLocations.map((l) => l.time), 0),
      cost: t.cost.filter((c) => c[0]! >= 0 && c[1]),
      commands: structuredClone(t.commands),
    };
  }
  return e;
};
const events = (tl: BuildTimeline) => (tl as BuildTimeline & { bonusVillagerEvents?: BonusEvent[] }).bonusVillagerEvents ?? [];
const run = (bo: BuildOrder, e = E, autoHouses = false, civ = 'Bengalis') => simulateBuild(bo, civ, e, ups, { autoHouses, walkTiles: 2, nearTiles: 2 });
const probe = (steps: Step[], vils = 3): BuildOrder => ({
  id: 'bengalis197-age-probe',
  name: { zh: '孟加拉时代核对', en: 'Bengali age probe' },
  style: 'other',
  civs: [],
  map: 'test',
  difficulty: 'beginner',
  target: { age: 2, vils },
  summary: 'test',
  sources: [],
  license: 'test',
  review: { status: 'draft' },
  steps,
});
const setup = (time = 1): EcoData => {
  const e = projected();
  e.ageReq = undefined;
  for (const id of [101, 102, 103]) e.techs[id] = { ...e.techs[id]!, cost: {}, researchTime: time };
  e.techs[202] = { ...e.techs[202]!, cost: {}, researchTime: 1 };
  return e;
};
const ageProbe = (lastStep = true) =>
  probe(
    [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'gold', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      ...(lastStep ? [{ vils: 5, phase: 'feudal' as const, actions: [] }] : []),
    ],
    lastStep ? 5 : 3,
  );

describe('#197 孟加拉实际到达时代赠村', () => {
  it('actual exporter must contain all four contexts instead of relying on the projected fixture', () => {
    for (const id of ids) expect(row(E, id).ageSpawn, String(id)).toEqual(row(projected(), id).ageSpawn);
  });
  it('projected source has exact distinct cap0/C2 commands and includes special-start298 separately', () => {
    expect(ids.map((id) => row(projected(), id).requires)).toEqual([
      [101, 639],
      [102, 639],
      [103, 639],
      [298, 639],
    ]);
    for (const id of ids)
      expect(row(projected(), id).ageSpawn).toEqual({
        effectId: 866,
        requiredCount: 2,
        researchLocation: -1,
        researchAt: [],
        researchTime: 0,
        cost: [],
        commands: [
          { Type: 1, A: 234, B: 0, C: -1, D: 0 },
          { Type: 7, A: 83, B: 109, C: 2, D: 0 },
        ],
      });
  });
  it('the existing shared structural schema accepts actual projected ageSpawn input', () => {
    expect(validateDocument('src/data/eco.json', projected()).valid).toBe(true);
  });
  it('complete projected family supports only Bengalis without globally allowing resource234', () => {
    expect(simSupport(projected(), 'Bengalis', buildOrders)).toEqual({ supported: true, reasons: [] });
    const e = projected();
    e.civEco.Georgians = structuredClone(e.civEco.Bengalis!);
    expect(simSupport(e, 'Georgians', buildOrders).supported).toBe(false);
    expect(events(run(ageProbe(), e, false, 'Georgians'))).toEqual([]);
  });
  it.each(buildOrders.map((bo) => [bo.id, bo] as const))('actual %s grants2 per actual reached age, and no economic research grant', (_id, bo) => {
    const tl = simulateBuild(bo, 'Bengalis', E, ups);
    expect(events(tl)).toHaveLength(tl.ageUps.length);
    expect(events(tl).map((event) => event.at)).toEqual(tl.ageUps.map((age) => age.reachAt));
    expect(events(tl).every((event) => event.count === 2 && [101, 102, 103].includes(event.trigger))).toBe(true);
    expect(events(tl).some((event) => event.tech === 873 || event.at === 0)).toBe(false);
  });
  it('normalstart has exactly3villagers/no special873 and ordinary research never gives an age reward', () => {
    const tl = run(probe([{ vils: 3, actions: [{ type: 'research', tech: 202 }] }]), setup());
    expect(events(tl)).toEqual([]);
    expect(tl.steps[0]).toMatchObject({ stock: { food: 200, wood: 200, gold: 100, stone: 200 }, pop: { used: 4, cap: 5 } });
    expect(tl.villagerEvents).toEqual([]);
  });
  it('completion1.0 grants2 free; observer records arrival1.0, no50food charge or TC training interval', () => {
    const tl = run(ageProbe(), setup());
    expect(tl.ageUps[0]).toMatchObject({ clickAt: 0, reachAt: 1 });
    expect(events(tl)).toEqual([{ at: 1, tech: 847, trigger: 101, count: 2, step: 0, pop: { used: 6, cap: 5 }, task: null }]);
    expect(tl.steps[1]).toMatchObject({ startAt: 1, stock: { food: 200 }, pop: { used: 6, cap: 5 }, villagers: { gold: 3, idle: 2 } });
    expect(tl.villagerEvents).toEqual([]);
  });
  it('last step can itself be ageUp: actual arrival view is5villagers/pop6/5 without a later snapshot', () => {
    const tl = run(ageProbe(false), setup());
    expect(tl.steps).toHaveLength(1);
    expect(tl.steps[0]!.pop).toEqual({ used: 4, cap: 5 });
    expect(events(tl)[0]).toMatchObject({ at: 1, count: 2, pop: { used: 6, cap: 5 } });
    expect(buildView(tl, (name) => name).ages[0]).toMatchObject({ reachAt: 1, vils: 5, pop: { used: 6, cap: 5 } });
  });
  it('already completed3TCs produce6free, not Wei cap1, no paid-food queue', () => {
    const e = setup();
    e.buildings[109] = { ...e.buildings[109]!, cost: {}, buildTime: 0 };
    const bo = ageProbe(false);
    bo.steps[0]!.actions.unshift({ type: 'build', building: 109, count: 2 });
    const tl = run(bo, e);
    expect(tl.buildingsDone.map((b) => b.at)).toEqual([0, 0]);
    expect(events(tl)).toEqual([{ at: 1, tech: 847, trigger: 101, count: 6, step: 0, pop: { used: 10, cap: 15 }, task: null }]);
    expect(buildView(tl, (name) => name).ages[0]).toMatchObject({ vils: 9, pop: { used: 10, cap: 15 } });
    expect(tl.villagerEvents).toEqual([]);
  });
  it('TC still under construction at arrival is excluded and its later completion does not catch up', () => {
    const e = setup();
    e.buildings[109] = { ...e.buildings[109]!, cost: {}, buildTime: 2 };
    const bo = ageProbe(false);
    bo.steps[0]!.actions.unshift({ type: 'build', building: 109 });
    const tl = run(bo, e);
    expect(tl.buildingsDone[0]!.at).toBeGreaterThan(1);
    expect(events(tl).map((event) => [event.at, event.count])).toEqual([[1, 2]]);
  });
  it.each([false, true])('full housing autoHouses%s still gives2, with explicit client-untested model disclosure', (auto) => {
    const tl = run(ageProbe(), setup(), auto);
    expect(events(tl).map((event) => [event.at, event.count])).toEqual([[1, 2]]);
    expect(tl.model.assumptions.join(' ')).toContain('满住房仍计入赠送');
    expect(tl.model.assumptions.join(' ')).toContain('未经当前版本客户端实测');
  });
  it('zero food at completion does not block a free age reward', () => {
    const e = setup();
    e.techs[101]!.cost = { Food: 200 };
    const tl = run(ageProbe(), e);
    expect(events(tl)[0]).toMatchObject({ at: 1, count: 2 });
    expect(tl.steps[1]!.stock.food).toBe(0);
    expect(tl.villagerEvents).toEqual([]);
  });
  it('all three normal ages fire their own source once; special873 never joins them', () => {
    const bo = probe([
      { vils: 3, actions: [{ type: 'ageUp', age: 2 }] },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] },
      { vils: 3, phase: 'castle', actions: [{ type: 'ageUp', age: 4 }] },
    ]);
    const tl = run(bo, setup());
    expect(events(tl).map((event) => [event.tech, event.trigger, event.count])).toEqual([
      [847, 101, 2],
      [848, 102, 2],
      [849, 103, 2],
    ]);
    expect(events(tl).map((event) => event.at)).toEqual(tl.ageUps.map((age) => age.reachAt));
  });
  it('repeating the same age completion never duplicates a source reward', () => {
    const bo = probe([
      { vils: 3, actions: [{ type: 'ageUp', age: 2 }] },
      { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 2 }] },
    ]);
    expect(events(run(bo, setup())).map((event) => event.tech)).toEqual([847]);
  });
  it('only knight template carries the data-verified unavailable-unit warning', () => {
    expect(civSimNotes(projected(), 'Bengalis', 'fast-castle-knights').join(' ')).toContain('孟加拉没有骑士');
    for (const id of ['scouts-18', 'archers-19', 'fast-castle-boom']) expect(civSimNotes(projected(), 'Bengalis', id).join(' ')).not.toContain('没有骑士');
  });
});

describe('#197 孟加拉整族拒绝守护', () => {
  const mutations: [string, (e: EcoData) => void][] = [
    [
      'missing',
      (e) =>
        rows(e).splice(
          rows(e).findIndex((r) => r.tech === 848),
          1,
        ),
    ],
    ['duplicate', (e) => rows(e).push(structuredClone(row(e)))],
    [
      'missing metadata',
      (e) => {
        delete row(e).ageSpawn;
      },
    ],
    [
      'wrong source',
      (e) => {
        row(e).source = 'team';
      },
    ],
    [
      'wrong age',
      (e) => {
        row(e).age = 3;
      },
    ],
    [
      'wrong id',
      (e) => {
        row(e).tech = 1847;
      },
    ],
    [
      'wrong prerequisite',
      (e) => {
        row(e).requires = [101, 638];
      },
    ],
    [
      'wrong GS prerequisite',
      (e) => {
        row(e, 873).requires = [101, 639];
      },
    ],
    [
      'wrong effect',
      (e) => {
        row(e).ageSpawn!.effectId = 1039;
      },
    ],
    [
      'wrong required count',
      (e) => {
        row(e).ageSpawn!.requiredCount = 1;
      },
    ],
    [
      'manual location',
      (e) => {
        row(e).ageSpawn!.researchLocation = 109;
      },
    ],
    [
      'manual researchAt',
      (e) => {
        row(e).ageSpawn!.researchAt = [[109, 1]];
      },
    ],
    [
      'manual time',
      (e) => {
        row(e).ageSpawn!.researchTime = 1;
      },
    ],
    [
      'manual cost',
      (e) => {
        row(e).ageSpawn!.cost = [[0, 50, 1]];
      },
    ],
    [
      'unknown companion',
      (e) => {
        row(e).ageSpawn!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      },
    ],
    [
      'reordered raw commands',
      (e) => {
        row(e).ageSpawn!.commands.reverse();
      },
    ],
    [
      'Wei cap1',
      (e) => {
        row(e).ageSpawn!.commands[0]!.D = 1;
      },
    ],
    [
      'wrong cap target',
      (e) => {
        row(e).ageSpawn!.commands[0]!.A = 235;
      },
    ],
    [
      'wrong generated unit',
      (e) => {
        row(e).ageSpawn!.commands[1]!.A = 448;
      },
    ],
    [
      'wrong generated building',
      (e) => {
        row(e).ageSpawn!.commands[1]!.B = 71;
      },
    ],
    [
      'wrong quantity3',
      (e) => {
        row(e).ageSpawn!.commands[1]!.C = 3;
      },
    ],
    [
      'nonfinite quantity',
      (e) => {
        row(e).ageSpawn!.commands[1]!.C = NaN;
      },
    ],
    [
      'fractional quantity',
      (e) => {
        row(e).ageSpawn!.commands[1]!.C = 1.5;
      },
    ],
    [
      'wrong mode',
      (e) => {
        row(e).ageSpawn!.commands[1]!.D = 1;
      },
    ],
    [
      'decoded effects drift',
      (e) => {
        row(e).effects[0]!.v = 1;
      },
    ],
  ];
  it.each(mutations)('%s refuses entire family and prevents all gifts', (_name, mutate) => {
    const e = setup();
    mutate(e);
    expect(simSupport(e, 'Bengalis', buildOrders).supported).toBe(false);
    expect(events(run(ageProbe(false), e))).toEqual([]);
  });
  it('pasting the existing full Wei16 family into Bengalis still refuses and gives no Bengali rewards', () => {
    const e = projected();
    e.civEco.Bengalis = structuredClone(e.civEco.Wei!);
    expect(simSupport(e, 'Bengalis', buildOrders).supported).toBe(false);
    expect(events(run(ageProbe(false), e))).toEqual([]);
  });
  it('pasting Wei events into a relabeled Bengali view retains the protected old planned-count fallback', () => {
    const tl = simulateBuild(
      buildOrders.find((bo) => bo.id === 'fast-castle-knights')!,
      'Wei',
      E,
      ups,
    );
    expect(buildView({ ...tl, civ: 'Bengalis' }, (name) => name)).toEqual(buildView({ ...tl, civ: 'Generic' }, (name) => name));
  });
});
