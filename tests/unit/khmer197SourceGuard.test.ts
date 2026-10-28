/** Complete Khmer raw families are guarded independently from physical supply. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import sourceFixture from './fixtures/khmer197-source.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { gatherRate, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
type Cmd = { Type: number; A: number; B: number; C: number; D: number };
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
type RawTree = { civId: number; treeId: number; commands: Cmd[] };
type RawTeam = { civId: number; teamId: number; commands: Cmd[] };
type Physical = { civId: number; farms: { unit: number; type: number; class: number; workRate: number; capacity: number }[] };
type Data = EcoData & { khmerFarm?: Physical; khmerPrerequisites?: { civId: number; nodes: Record<string, RawTech> } };
type Row = EcoData['civEco'][string][number] & { name?: string; khmerTech?: RawTech; khmerTree?: RawTree; khmerTeam?: RawTeam };
const E = eco as unknown as Data;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const SOURCE: {
  khmerFarm: Physical;
  khmerPrerequisites: NonNullable<Data['khmerPrerequisites']>;
  tree: RawTree;
  team: RawTeam;
  techs: Record<string, RawTech>;
  names: Record<string, string>;
} = sourceFixture;

const fixture = (): Data => {
  const e = structuredClone(E);
  e.khmerFarm = structuredClone(SOURCE.khmerFarm) as Physical;
  e.khmerPrerequisites = structuredClone(SOURCE.khmerPrerequisites) as unknown as Data['khmerPrerequisites'];
  const original654 = e.civEco.Khmer!.find((r) => r.tech === 654)!;
  const original672 = e.civEco.Khmer!.find((r) => r.tech === 672)!;
  e.civEco.Khmer = [
    { source: 'tree', name: 'Tech tree', age: 1, effects: [], khmerTree: structuredClone(SOURCE.tree) },
    ...[638, 654, 657, 672].map((tech) => ({
      source: 'bonus',
      name: SOURCE.names[String(tech) as keyof typeof SOURCE.names],
      age: 1,
      tech,
      requires: [],
      effects: tech === 654 ? structuredClone(original654.effects) : tech === 672 ? structuredClone(original672.effects) : [],
      khmerTech: structuredClone(SOURCE.techs[String(tech) as keyof typeof SOURCE.techs]),
    })),
    { source: 'team', name: 'Team bonus', age: 1, effects: [], khmerTeam: structuredClone(SOURCE.team) },
  ] as Row[];
  return e;
};
const row = (e: Data, tech: number) => e.civEco.Khmer!.find((r) => r.tech === tech) as Row;
const ordinaryRate = (e: Data) => {
  const f = e.villager.tasks.farm!;
  return Math.min(0.4, f.carry / (f.carry / f.workRate + 14 / e.villager.speed));
};
const assertRejectedBonus = (e: Data) => {
  expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(false);
  expect(gatherRate(e, 'Khmer', 'farm', 7).rate).toBeCloseTo(ordinaryRate(e), 12);
};
describe('Khmer complete source, canonical empty rows and foreign markers', () => {
  it('the independent exact source fixture is accepted rather than rejecting every Khmer context', () => {
    const e = fixture();
    expect(simSupport(e, 'Khmer', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(gatherRate(e, 'Khmer', 'farm', 7).rate).toBeCloseTo(0.4, 12);
  });
  it.each<[string, (e: Data) => void]>([
    [
      'missing physical',
      (e) => {
        delete e.khmerFarm;
      },
    ],
    [
      'wrong civ',
      (e) => {
        e.khmerFarm!.civId = 27;
      },
    ],
    [
      'missing variant',
      (e) => {
        e.khmerFarm!.farms.pop();
      },
    ],
    [
      'duplicate variant',
      (e) => {
        e.khmerFarm!.farms.push(structuredClone(e.khmerFarm!.farms[0]!));
      },
    ],
    [
      'wrong unit',
      (e) => {
        e.khmerFarm!.farms[0]!.unit = 51;
      },
    ],
    [
      'wrong type',
      (e) => {
        e.khmerFarm!.farms[0]!.type = 70;
      },
    ],
    [
      'wrong class',
      (e) => {
        e.khmerFarm!.farms[0]!.class = 4;
      },
    ],
    [
      'wrong workRate',
      (e) => {
        e.khmerFarm!.farms[0]!.workRate = 0.5;
      },
    ],
    [
      'wrong capacity',
      (e) => {
        e.khmerFarm!.farms[0]!.capacity = 16;
      },
    ],
    [
      'NaN',
      (e) => {
        e.khmerFarm!.farms[0]!.workRate = Number.NaN;
      },
    ],
  ])('%s physical cannot claim the new farm model', (_name, mutate) => {
    const e = fixture();
    mutate(e);
    expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Khmer', 'farm', 7)).toEqual(gatherRate(e, 'Generic', 'farm', 7));
  });
  it.each<[string, (r: Row, e: Data) => void]>([
    [
      'raw companion',
      (r) => {
        r.khmerTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      },
    ],
    [
      'raw partial',
      (r) => {
        r.khmerTech!.commands.pop();
      },
    ],
    [
      'raw only unknown',
      (r) => {
        r.khmerTech!.commands = [{ Type: 999, A: -1, B: -1, C: -1, D: 1 }];
        r.effects = [];
      },
    ],
    [
      'raw duplicated farmer',
      (r) => {
        r.khmerTech!.commands[2] = structuredClone(r.khmerTech!.commands[1]!);
      },
    ],
    [
      'raw multiplier',
      (r) => {
        r.khmerTech!.commands[1]!.D = 0.96;
      },
    ],
    [
      'raw marker',
      (r) => {
        r.khmerTech!.commands[0]!.D = 9;
      },
    ],
    [
      'raw civ',
      (r) => {
        r.khmerTech!.civ = 27;
      },
    ],
    [
      'raw effect',
      (r) => {
        r.khmerTech!.effectId = 691;
      },
    ],
    [
      'raw site',
      (r) => {
        r.khmerTech!.researchLocation = 109;
      },
    ],
    [
      'raw cost',
      (r) => {
        r.khmerTech!.cost = [[0, 1, 1]];
      },
    ],
    [
      'raw requires',
      (r) => {
        r.khmerTech!.requires = [99999];
      },
    ],
    [
      'raw count',
      (r) => {
        r.khmerTech!.requiredCount = 1;
      },
    ],
    [
      'raw time',
      (r) => {
        r.khmerTech!.researchTime = 1;
      },
    ],
    [
      'missing raw',
      (r) => {
        delete r.khmerTech;
      },
    ],
    [
      'row source',
      (r) => {
        r.source = 'tree';
      },
    ],
    [
      'row name',
      (r) => {
        r.name = 'another family';
      },
    ],
    [
      'row age',
      (r) => {
        r.age = 2;
      },
    ],
    [
      'row requires',
      (r) => {
        r.requires = [99999];
      },
    ],
    [
      'row duplicate',
      (r, e) => {
        e.civEco.Khmer!.push(structuredClone(r));
      },
    ],
  ])('654 %s rejects the whole noWalk/.95 pair while retaining physical .4', (_name, mutate) => {
    const e = fixture();
    mutate(row(e, 654), e);
    assertRejectedBonus(e);
  });
  it.each<[string, (e: Data) => void]>([
    [
      'missing topology',
      (e) => {
        delete e.khmerPrerequisites;
      },
    ],
    [
      'missing incoming node',
      (e) => {
        delete e.khmerPrerequisites!.nodes[659];
      },
    ],
    [
      'extra node',
      (e) => {
        e.khmerPrerequisites!.nodes[99999] = structuredClone(e.khmerPrerequisites!.nodes[659]!);
      },
    ],
    [
      'civ identity',
      (e) => {
        e.khmerPrerequisites!.civId = 27;
      },
    ],
    [
      'node civ',
      (e) => {
        e.khmerPrerequisites!.nodes[659]!.civ = 28;
      },
    ],
    [
      'node effect',
      (e) => {
        e.khmerPrerequisites!.nodes[659]!.effectId = 690;
      },
    ],
    [
      'node requires',
      (e) => {
        e.khmerPrerequisites!.nodes[659]!.requires = [638];
      },
    ],
    [
      'node count',
      (e) => {
        e.khmerPrerequisites!.nodes[659]!.requiredCount = 2;
      },
    ],
    [
      'node unknown command',
      (e) => {
        e.khmerPrerequisites!.nodes[659]!.commands = [{ Type: 999, A: -1, B: -1, C: -1, D: 1 }];
      },
    ],
    [
      'Stable required age',
      (e) => {
        e.khmerPrerequisites!.nodes[25]!.requires = [667];
      },
    ],
    [
      'Range required age',
      (e) => {
        e.khmerPrerequisites!.nodes[147]!.requires = [667];
      },
    ],
    [
      'Market required age',
      (e) => {
        e.khmerPrerequisites!.nodes[148]!.requiredCount = 1;
      },
    ],
    [
      '638 wrong header',
      (e) => {
        row(e, 638).khmerTech!.civ = 27;
      },
    ],
    [
      '638 decoded extra',
      (e) => {
        row(e, 638).effects = [{ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 2 }];
      },
    ],
  ])('%s refuses prerequisite support independently of the farm bonus', (_name, mutate) => {
    const e = fixture();
    mutate(e);
    expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Khmer', 'wood')).toEqual(gatherRate(e, 'Generic', 'wood'));
    expect(gatherRate(e, 'Khmer', 'farm', 7).rate).toBeCloseTo(0.4, 12);
    const input = structuredClone(e);
    input.techs[101] = { ...input.techs[101]!, cost: {}, researchTime: 10 };
    const b = {
      ...buildOrders[0]!,
      id: 'bad-khmer638-age',
      target: { age: 2 as const, vils: 3 },
      steps: [
        { vils: 3, actions: [{ type: 'ageUp' as const, age: 2 as const }] },
        { vils: 3, phase: 'feudal' as const, actions: [] },
      ],
    };
    expect(simulateBuild(b, 'Khmer', input, ups, { autoHouses: false }).ageUps).toEqual([]);
  });
  it.each([657, 672])('missing mandatory canonical family%s does not masquerade as a valid whole654 counterfactual', (tech) => {
    const e = fixture();
    e.civEco.Khmer = e.civEco.Khmer!.filter((r) => r.tech !== tech);
    expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(false);
  });
  it.each(['tree', 'team'] as const)('complete%s raw survives empty decode and any unknown companion is rejected', (kind) => {
    const e = fixture();
    const r = e.civEco.Khmer!.find((x) => x.source === kind) as Row;
    const raw = kind === 'tree' ? r.khmerTree! : r.khmerTeam!;
    raw.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
    expect(simSupport(e, 'Khmer', buildOrders).supported).toBe(false);
  });
  it.each(['khmerTech', 'khmerTree', 'khmerTeam'] as const)('foreign %s marker with empty effects cannot bypass source support', (marker) => {
    const e = fixture();
    const tagged =
      marker === 'khmerTech'
        ? structuredClone(row(e, 654))
        : structuredClone(e.civEco.Khmer!.find((r) => r.source === (marker === 'khmerTree' ? 'tree' : 'team')) as Row);
    tagged.effects = [];
    tagged.source = 'bonus';
    e.civEco.Generic = [tagged];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'farm', 7)).toEqual(gatherRate(E, 'Generic', 'farm', 7));
  });
  it.each(['khmerTech', 'khmerTree', 'khmerTeam'] as const)('foreign %s field present as null is still refused even with empty effects', (marker) => {
    const e = fixture();
    const tagged = { source: 'bonus', age: 1, effects: [], [marker]: null } as unknown as Row;
    e.civEco.Generic = [tagged];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'farm', 7)).toEqual(gatherRate(E, 'Generic', 'farm', 7));
  });
  it('copied654 effects cannot enable noWalk or .95 in a foreign direct helper', () => {
    const e = fixture();
    e.civEco.Generic = [structuredClone(row(e, 654))];
    expect(simSupport(e, 'Generic', buildOrders).supported).toBe(false);
    expect(gatherRate(e, 'Generic', 'farm', 7)).toEqual(gatherRate(E, 'Generic', 'farm', 7));
  });
});
