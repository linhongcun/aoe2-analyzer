import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder, Step } from '../../src/domain/buildOrder';
import { civSimNotes, gatherRate, simSupport, simulateBuild, type BuildTimeline, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { gatherModel } from '../../src/domain/realCost';
import { validateDocument } from '../../scripts/content-schema.mjs';

interface RawCommand {
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
  commands: RawCommand[];
}
interface RawTech {
  id: number;
  effect: number;
  requiredCount: number;
  researchLocations: { location: number; time: number }[];
  cost: number[][];
  commands: RawCommand[];
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
type Row = EcoData['civEco'][string][number] & { spawn?: Spawn };
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const source = JSON.parse(readFileSync(new URL('../../docs/design/wei197-source.json', import.meta.url), 'utf8')) as {
  techClosure: Record<string, RawTech>;
  civTechs: RawTech[];
};
const rewardIds = Array.from({ length: 16 }, (_, i) => 1039 + i);
const rows = (e: EcoData) => e.civEco.Wei! as Row[];
const row = (e: EcoData, tech = 1039) => rows(e).find((r) => r.tech === tech)!;
// Explicit synthetic fixture projected from pinned raw evidence, NOT actual generated E.
// Existing dat_source cache-v8 filters negative ResearchAt/cost slots; retain its exact shape.
const projected = (): EcoData => {
  const e = structuredClone(E);
  for (const id of rewardIds) {
    const t = source.techClosure[id]!;
    row(e, id).spawn = {
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
const run = (bo: BuildOrder, e = E, autoHouses = false, civ = 'Wei') => simulateBuild(bo, civ, e, ups, { autoHouses, walkTiles: 2, nearTiles: 2 });
const probe = (steps: Step[], vils = 4): BuildOrder => ({
  id: 'wei197-research-probe',
  name: { zh: '魏研究核对', en: 'Wei research probe' },
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
const setup = (techs = [202], time = 1): EcoData => {
  const e = projected();
  e.ageReq = undefined;
  e.techs[101] = { ...e.techs[101]!, cost: {}, researchTime: 0.1 };
  for (const tech of techs) e.techs[tech] = { ...e.techs[tech]!, cost: {}, researchTime: time };
  return e;
};
const researchProbe = (techs = [202], vils = 4, workers = 0): BuildOrder =>
  probe(
    [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'gold', count: 3 },
          { type: 'ageUp', age: 2 },
        ],
      },
      { vils: 3, phase: 'feudal', actions: techs.map((tech) => ({ type: 'research', tech })) },
      { vils, actions: workers ? [{ type: 'gather', task: 'gold', count: workers }] : [] },
    ],
    vils,
  );
const noRewards = (e: EcoData) => ({ ...e, civEco: { ...e.civEco, Wei: [] } });
const modelNote = '满住房仍计入赠送';

describe('#197 魏真实研究完成赠村民', () => {
  it('actual E must contain all16 generated spawn contexts; fixture is not substituted for exporter', () => {
    for (const id of rewardIds) expect(row(E, id).spawn, String(id)).toEqual(row(projected(), id).spawn);
  });
  it('pinned16 source one-to-one mapping includes906 and retains raw two-command order', () => {
    expect(rewardIds.map((id) => row(E, id).requires)).toEqual(
      [202, 203, 221, 14, 13, 12, 55, 182, 278, 279, 213, 249, 65, 48, 15, 906].map((id) => [id, 639]),
    );
    for (const id of rewardIds) {
      expect(row(projected(), id).spawn).toEqual({
        effectId: 1039,
        requiredCount: 2,
        researchLocation: -1,
        researchAt: [],
        researchTime: 0,
        cost: [],
        commands: [
          { Type: 1, A: 234, B: 0, C: -1, D: 1 },
          { Type: 7, A: 83, B: 109, C: 1, D: 0 },
        ],
      });
      expect(row(E, id).effects).toEqual([{ kind: 'res', label: null, res: 234, op: 'set', v: 1 }]);
    }
  });
  it('complete projected source makes Wei supported without globally allowing res234', () => {
    expect(simSupport(projected(), 'Wei', buildOrders)).toEqual({ supported: true, reasons: [] });
    const e = projected();
    e.civEco.Bengalis = structuredClone(e.civEco.Wei!);
    expect(simSupport(e, 'Bengalis', buildOrders).supported).toBe(false);
    expect(events(run(researchProbe(), e, false, 'Bengalis'))).toEqual([]);
  });
  it.each([
    ['feudal-drush-18', 1, 602.1],
    ['hybrid-fish-18', 0, null],
    ['maa-archers-18', 1, 686.5],
    ['scouts-18', 2, 667.2],
    ['archers-19', 1, 609.4],
    ['fast-castle-boom', 3, 761.3],
    ['fast-castle-knights', 2, 761.3],
    ['drush-fc', 2, 1050.8],
  ] as const)('actual %s yields%s free events and preserves first completion%s', (id, count, firstAt) => {
    const tl = simulateBuild(
      buildOrders.find((bo) => bo.id === id)!,
      'Wei',
      E,
      ups,
    );
    expect(events(tl)).toHaveLength(count);
    if (firstAt !== null) expect(events(tl)[0]!.at).toBe(firstAt);
    const expected = new Set(
      buildOrders
        .find((bo) => bo.id === id)!
        .steps.flatMap((s) => s.actions.flatMap((a) => (a.type === 'research' && rewardIds.some((id) => row(E, id).requires?.[0] === a.tech) ? [a.tech] : []))),
    );
    expect(new Set(events(tl).map((e) => e.trigger))).toEqual(expected);
    expect(events(tl).every((e) => e.count === 1 && e.at > 0)).toBe(true);
  });
  it('completion1.1 precedes observer1.2; free birth costs0 and in-flight paid birth survives target', () => {
    const tl = run(researchProbe(), setup());
    expect(tl.steps[1]).toMatchObject({ researchAt: 0.2, doneAt: 1.1 });
    expect(events(tl)).toEqual([{ at: 1.1, tech: 1039, trigger: 202, count: 1, step: 1, pop: { used: 5, cap: 5 }, task: null }]);
    expect(tl.steps[2]).toMatchObject({ startAt: 1.2, pop: { used: 5, cap: 5 }, stock: { food: 150, wood: 200, stone: 200 }, villagers: { idle: 1, gold: 3 } });
    expect(tl.villagerEvents).toEqual([{ from: 0.1, to: 25.1, step: 2 }]);
    expect(events(tl).some((e) => e.at === tl.steps[1]!.researchAt)).toBe(false);
  });
  it('free worker follows remaining task and gathers in same completion tick, no50food charge', () => {
    const e = setup();
    const tl = run(researchProbe([202], 4, 2), e);
    const r = gatherRate(e, 'Generic', 'gold', 2).rate;
    expect(tl.steps[2]).toMatchObject({ startAt: 1.2, stock: { food: 150, gold: Math.floor(100 + r * (3 * 1.2 + 0.1)) }, villagers: { gold: 4, idle: 0 } });
    expect(events(tl)[0]!.task).toBe('gold');
    expect(tl.villagerEvents).toHaveLength(1);
  });
  it('before/after observer pins stock50 and gold131 independently of whole research step', () => {
    const e = setup();
    e.techs[202]!.cost = structuredClone(E.techs[202]!.cost);
    const bo = researchProbe([202], 5);
    bo.steps.splice(2, 0, { vils: 3, actions: [] }, { vils: 4, actions: [{ type: 'gather', task: 'gold', count: 1 }] });
    const tl = run(bo, e);
    expect(tl.steps[2]).toMatchObject({ startAt: 0.3, pop: { used: 4 }, stock: { food: 50 } });
    expect(tl.steps[3]).toMatchObject({ startAt: 1.2, pop: { used: 5 }, stock: { food: 50, gold: 101 }, villagers: { gold: 4 } });
    expect(tl.steps[4]).toMatchObject({ startAt: 25.2, pop: { used: 6, cap: 5 }, stock: { food: 50, gold: 131 }, villagers: { gold: 4, idle: 1 } });
    expect(tl.villagerEvents).toEqual([{ from: 0.1, to: 25.1, step: 3 }]);
  });
  it('zero food at completion does not block or charge the free villager', () => {
    const e = setup();
    e.techs[202]!.cost = { Food: 150 };
    const tl = run(researchProbe(), e);
    expect(events(tl)).toHaveLength(1);
    expect(tl.steps[2]).toMatchObject({ startAt: 1.2, stock: { food: 0 }, pop: { used: 5, cap: 5 } });
    expect(tl.villagerEvents).toEqual([{ from: 0.1, to: 25.1, step: 2 }]);
  });
  it.each([213, 249])('TCtech%s grants at its own completed research and resumes paid TC training', (tech) => {
    const e = setup([tech]);
    const bo = researchProbe([tech], 6);
    const expected =
      tech === 213
        ? { from: 0.1, paidEnd: 25.1, completed: 26.1, nextBirth: 51.1, observer: 51.2 }
        : { from: 0.3, paidEnd: 25.3, completed: 26.3, nextBirth: 51.3, observer: 51.4 };
    if (tech === 249) {
      e.techs[102] = { ...e.techs[102]!, cost: {}, researchTime: 0.1 };
      bo.steps.splice(1, 0, { vils: 3, phase: 'feudal', actions: [{ type: 'ageUp', age: 3 }] });
      bo.steps[2]!.phase = 'castle';
    }
    const tl = run(bo, e, true);
    expect(events(tl)).toHaveLength(1);
    expect(events(tl)[0]).toMatchObject({ at: expected.completed, trigger: tech, tech: tech === 213 ? 1049 : 1050, count: 1 });
    expect(tl.villagerEvents?.map((e) => [e.from, e.to])).toEqual([
      [expected.from, expected.paidEnd],
      [expected.completed, expected.nextBirth],
    ]);
    expect(tl.steps.at(-1)).toMatchObject({ startAt: expected.observer, pop: { used: 7 } });
  });
  it('same tick two nonTC completions and paid birth remain three distinct events', () => {
    const tl = run(researchProbe([202, 14], 6), setup([202, 14], 25));
    expect(events(tl).map((e) => [e.at, e.trigger, e.count])).toEqual([
      [25.1, 14, 1],
      [25.1, 202, 1],
    ]);
    expect(tl.villagerEvents).toEqual([{ from: 0.1, to: 25.1, step: 1 }]);
    expect(tl.steps[2]).toMatchObject({ startAt: 25.2, pop: { used: 7, cap: 5 }, villagers: { idle: 3 } });
  });
  it.each([false, true])('fullhousing model autoHouses%s grants immediately; ordinary training obeys existing gates', (auto) => {
    const tl = run(researchProbe([202], 5), setup([202], 25), auto);
    expect(events(tl).map((e) => [e.at, e.count])).toEqual([[25.1, 1]]);
    expect(tl.steps[2]).toMatchObject({ startAt: 25.2, pop: { used: 6 } });
    expect(tl.villagerEvents).toHaveLength(1);
    if (!auto) {
      expect(tl.steps[2]!.pop.cap).toBe(5);
      expect(tl.housePaidAt).toEqual([]);
    } else expect(tl.housePaidAt.length).toBeGreaterThan(0);
    expect(tl.model.assumptions.join(' ')).toContain(modelNote);
  });
  it('two extra completedTCs do not multiply one capped grant', () => {
    const e = setup([202], 2);
    e.buildings[109] = { ...e.buildings[109]!, cost: {}, buildTime: 0 };
    const bo = researchProbe();
    bo.steps[1]!.actions.unshift({ type: 'build', building: 109, count: 2 });
    const tl = run(bo, e);
    expect(tl.buildingsDone).toEqual([
      { building: 109, at: 0.2 },
      { building: 109, at: 0.2 },
    ]);
    expect(events(tl)).toHaveLength(1);
    expect(events(tl)[0]).toMatchObject({ at: 2.1, count: 1, pop: { cap: 15, used: 5 } });
    expect(tl.steps[2]!.startAt).toBe(2.2);
  });
  it('quantity comes from raw Type7.C and never from resource234 or TC count', () => {
    const e = setup();
    row(e).spawn!.commands[1]!.C = 2;
    const tl = run(researchProbe([202], 5, 2), e);
    expect(events(tl)).toHaveLength(1);
    expect(events(tl)[0]).toMatchObject({ count: 2, at: 1.1, pop: { used: 6 } });
    expect(tl.steps[2]).toMatchObject({ startAt: 1.2, villagers: { gold: 5 } });
  });
  it('repeat economic research and zero-time completions grant once per source reward', () => {
    const e = setup([202], 0);
    const tl = run(researchProbe([202, 202]), e);
    expect(events(tl).map((e) => [e.at, e.tech, e.count])).toEqual([[0.2, 1039, 1]]);
    expect(tl.villagerEvents).toHaveLength(1);
  });
  it.each([22, 199])('research%s is not an economic reward trigger', (tech) => {
    const e = setup([tech], 0);
    const tl = run(researchProbe([tech], 3), e);
    expect(events(tl)).toEqual([]);
    expect(tl.steps[0]!.pop.used).toBe(4);
    expect(tl.steps[0]!.stock).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
  });
  it('age/start and unit upgrade never grant; current model starts normal3 villagers', () => {
    const e = setup();
    const tl = run(
      probe(
        [
          { vils: 3, actions: [{ type: 'ageUp', age: 2 }] },
          { vils: 3, phase: 'feudal', actions: [{ type: 'upgrade', unit: 75 }] },
          { vils: 3, actions: [] },
        ],
        3,
      ),
      e,
    );
    expect(events(tl)).toEqual([]);
    expect(tl.steps[0]).toMatchObject({ pop: { used: 4 }, stock: { food: 200, wood: 200, gold: 100, stone: 200 } });
  });
  it('research202 reward is before whole archers step completion; boom203 final reward remains visible', () => {
    const archers = run(
      buildOrders.find((b) => b.id === 'archers-19')!,
      E,
      true,
    );
    const ev = events(archers).find((e) => e.trigger === 202);
    expect(ev).toBeDefined();
    expect(ev!.at).toBeLessThan(archers.steps[ev!.step]!.doneAt);
    const boom = run(
      buildOrders.find((b) => b.id === 'fast-castle-boom')!,
      E,
      true,
    );
    expect(events(boom).filter((e) => e.trigger === 203)).toHaveLength(1);
  });
  it('notes disclose spawn/housing abstraction and independent realCost stays outside scope', () => {
    expect(civSimNotes(projected(), 'Wei').join(' ')).toContain('研究完成');
    expect(run(researchProbe(), setup()).model.assumptions.join(' ')).toContain(modelNote);
    expect(gatherModel(2, 'Wei').rate).toEqual(gatherModel(2).rate);
    expect(gatherModel(2, 'Wei').applied).toEqual([]);
  });
});

describe('#197 魏完整family、未知命令与schema守护', () => {
  const cases: [string, (e: EcoData) => void][] = [
    [
      'missing-metadata',
      (e) => {
        delete row(e).spawn;
      },
    ],
    [
      'missing-family-row',
      (e) => {
        e.civEco.Wei = rows(e).filter((r) => r.tech !== 1054);
      },
    ],
    [
      'duplicate-row',
      (e) => {
        rows(e).push(structuredClone(row(e)));
      },
    ],
    [
      'duplicate-whole-family',
      (e) => {
        rows(e).push(...structuredClone(rows(e).filter((r) => rewardIds.includes(r.tech ?? -1))));
      },
    ],
    [
      'wrong-tech',
      (e) => {
        row(e).tech = 9999;
      },
    ],
    [
      'wrong-source',
      (e) => {
        row(e).source = 'tree';
      },
    ],
    [
      'wrong-age',
      (e) => {
        row(e).age = 1;
      },
    ],
    [
      'wrong-trigger',
      (e) => {
        row(e).requires = [22, 639];
      },
    ],
    [
      'wrong-condition-order',
      (e) => {
        row(e).requires = [639, 202];
      },
    ],
    [
      'missing639',
      (e) => {
        row(e).requires = [202];
      },
    ],
    [
      'wrong-required-count',
      (e) => {
        row(e).spawn!.requiredCount = 1;
      },
    ],
    [
      'wrong-effect',
      (e) => {
        row(e).spawn!.effectId = 1040;
      },
    ],
    [
      'manual-location',
      (e) => {
        row(e).spawn!.researchLocation = 109;
      },
    ],
    [
      'manual-researchAt',
      (e) => {
        row(e).spawn!.researchAt = [[109, 0]];
      },
    ],
    [
      'nonzero-time',
      (e) => {
        row(e).spawn!.researchTime = 1;
      },
    ],
    [
      'nonempty-cost',
      (e) => {
        row(e).spawn!.cost = [[0, 1, 1]];
      },
    ],
    [
      'unknown-raw-command',
      (e) => {
        row(e).spawn!.commands.push({ Type: 999, A: 0, B: 0, C: 0, D: 0 });
      },
    ],
    [
      'reordered-commands',
      (e) => {
        row(e).spawn!.commands.reverse();
      },
    ],
    [
      'missing-spawn-command',
      (e) => {
        row(e).spawn!.commands.pop();
      },
    ],
    [
      'wrong-spawn-target',
      (e) => {
        row(e).spawn!.commands[1]!.A = 84;
      },
    ],
    [
      'wrong-building-target',
      (e) => {
        row(e).spawn!.commands[1]!.B = 70;
      },
    ],
    [
      'invalid-cap',
      (e) => {
        row(e).spawn!.commands[0]!.D = 2;
      },
    ],
    [
      'wrong-cap-operation',
      (e) => {
        row(e).spawn!.commands[0]!.B = 1;
      },
    ],
    [
      'wrong-spawn-mode',
      (e) => {
        row(e).spawn!.commands[1]!.D = 1;
      },
    ],
    [
      'zero-count',
      (e) => {
        row(e).spawn!.commands[1]!.C = 0;
      },
    ],
    [
      'fraction-count',
      (e) => {
        row(e).spawn!.commands[1]!.C = 1.5;
      },
    ],
    [
      'negative-count',
      (e) => {
        row(e).spawn!.commands[1]!.C = -1;
      },
    ],
    [
      'infinite-count',
      (e) => {
        row(e).spawn!.commands[1]!.C = Infinity;
      },
    ],
    [
      'nan-count',
      (e) => {
        row(e).spawn!.commands[1]!.C = NaN;
      },
    ],
    [
      'decoded-unknown-companion',
      (e) => {
        row(e).effects.push({ kind: 'res', res: 92, op: 'add', v: 999 });
      },
    ],
    [
      'decoded-cap-mismatch',
      (e) => {
        row(e).effects[0]!.v = 2;
      },
    ],
  ];
  it.each(cases)('%s fails support and atomically removes entire reward family', (_, change) => {
    const e = setup();
    change(e);
    expect(simSupport(e, 'Wei', buildOrders).supported).toBe(false);
    const tl = run(researchProbe(), e);
    expect(events(tl)).toEqual([]);
    expect(tl.steps).toEqual(run(researchProbe(), noRewards(e)).steps);
    expect(civSimNotes(e, 'Wei').join(' ')).not.toContain('经济研究完成时赠送村民');
  });
  it('strict eco schema accepts complete projected metadata and rejects extra/missing/wrong primitive fields', () => {
    expect(validateDocument('src/data/eco.json', projected()).valid).toBe(true);
    for (const field of ['effectId', 'requiredCount', 'researchLocation', 'researchAt', 'researchTime', 'cost', 'commands']) {
      const e = projected();
      delete (row(e).spawn as unknown as Record<string, unknown>)[field];
      expect(validateDocument('src/data/eco.json', e).valid, field).toBe(false);
    }
    const e = projected();
    (row(e).spawn as unknown as Record<string, unknown>).inventedDefault = true;
    expect(validateDocument('src/data/eco.json', e).valid).toBe(false);
    const wrong = projected();
    (row(wrong).spawn!.commands[0] as unknown as Record<string, unknown>).Type = '1';
    expect(validateDocument('src/data/eco.json', wrong).valid).toBe(false);
  });
  it('unknown raw commands remain structurally preserved for runtime rejection', () => {
    const e = projected();
    row(e).spawn!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
    expect(validateDocument('src/data/eco.json', e).valid).toBe(true);
    expect(simSupport(e, 'Wei', buildOrders).supported).toBe(false);
  });
});
