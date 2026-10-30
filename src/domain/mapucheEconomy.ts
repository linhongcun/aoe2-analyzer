/** Fixed DE188329 Mapuche economy; added settlement train entries are not selected by current templates. */
import type { BuildOrder } from './buildOrder';
import type { EcoData, EffectRow } from './buildSim';
import type { Mods } from './buildSimEffects';
import type { JurchenRawTech } from './jurchenEconomy';

export type MapucheRawTech = JurchenRawTech;
interface PopulationSource {
  type: number;
  amount: number;
  flag: number;
}
export interface MapucheInfrastructure {
  civId: number;
  treeId: number;
  treeCommands: MapucheRawTech['commands'];
  enable: MapucheRawTech;
  buildingTech: MapucheRawTech;
  settlements: {
    unit: number;
    type: number;
    class: number;
    trainAt: number[][];
    trainTime: number;
    cost: number[][];
    workRate: number;
    populationSource: PopulationSource;
  }[];
  researchSites: Record<string, number[][]>;
  farmTech: MapucheRawTech;
  marketRequirement: MapucheRawTech;
  ageRequirement: MapucheRawTech;
  startingScout: { resource: number; unit: number; populationSource: PopulationSource };
  baseTrain93: { unit: number; trainAt: number[][]; trainTime: number };
}
export interface MapucheContext {
  infrastructure: MapucheInfrastructure | null;
  admitted: Map<number, EffectRow>;
  complete: boolean;
  reasons: string[];
}
export const MAPUCHE_SOURCE_REASON = '马普切聚落、采果或训练地点缺少完整已核来源，未计入';
export const MAPUCHE_OPENING_NOTE = '营地逐次改为付费聚落；采果交仓额外食物按连续收入估算';
export const MAPUCHE_TRAIN_NOTE = '当前方案沿原兵营训练长矛兵；聚落军事生产未使用';
export const MAPUCHE_CAVALRY_NOTE = '马普切无马厩；侦察骑兵、骑士方案仅供通用模板经济估算';
export const MAPUCHE_MILITIA_NOTE = '马普切无民兵系；民兵、武士方案仅供通用模板经济估算';
export const MAPUCHE_MODEL_NOTE =
  '原磨坊、伐木场和采矿场动作逐次新建聚落，每座125木、40秒基础工期，完成后提供5人口及研究地点；不合并或自动复用。采果额外食物共用原携带量和往返时间，不改变工作速率；有限浆果、逐笔交仓取整、移动与战斗未模拟，未经当前客户端逐帧实测。';
const IDS = [1381, 1382, 1405, 1406, 1407];
const TRAIN_TARGETS = [93, 358, 359, 7, 6, 1155];
const DISABLED = [
  192, 166, 156, 175, 204, 435, 188, 82, 373, 85, 218, 265, 39, 428, 254, 209, 80, 436, 81, 221, 25, 320, 716, 316, 875, 1138, 1142, 222, 207, 217, 264, 237,
  437, 215, 255, 201, 194, 380, 233, 230, 15, 140, 63, 910, 375, 244, 37, 376,
];
const command = (Type: number, A: number, B: number, C: number, D: number) => ({ Type, A, B, C, D });
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value;
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const raw = (tech: number, civ: number, effectId: number, requires: number[], requiredCount: number, commands: MapucheRawTech['commands']): MapucheRawTech => ({
  tech,
  civ,
  effectId,
  requires,
  requiredCount,
  researchLocation: -1,
  researchAt: [],
  researchTime: 0,
  cost: [],
  commands,
});
const SITES = {
  14: [
    [68, 20],
    [2556, 20],
  ],
  22: [[109, 25]],
  199: [[103, 30]],
  202: [
    [562, 25],
    [1808, 25],
    [2556, 25],
  ],
  203: [
    [562, 50],
    [1808, 50],
    [2556, 50],
  ],
};
const EXPECTED_INFRASTRUCTURE: MapucheInfrastructure = {
  civId: 58,
  treeId: 1361,
  treeCommands: [
    ...DISABLED.map((id) => command(102, -1, -1, -1, id)),
    ...[68, 562, 584, 74].map((id) => command(2, id, 0, -1, 0)),
    command(102, -1, -1, -1, 121),
    ...[1353, 1350, 1351, 1352, 1402, 528, 378, 913].map((id) => command(8, id, 12, -1, 1)),
  ],
  enable: raw(1353, -1, 1353, [104], 1, [command(2, 2556, 1, -1, 0)]),
  buildingTech: raw(1357, -1, -1, [], 1, []),
  settlements: [2556, 2558, 2560].map((unit) => ({
    unit,
    type: 80,
    class: 3,
    trainAt: [[118, 40]],
    trainTime: 40,
    cost: [[1, 125, 1]],
    workRate: 1,
    populationSource: { type: 4, amount: 5, flag: 4 },
  })),
  researchSites: SITES,
  farmTech: raw(216, -1, 205, [110, 638, 1357], 1, [command(2, 50, 1, -1, 0), command(2, 1187, 1, -1, 0)]),
  marketRequirement: raw(666, -1, -1, [110, 638, 1357], 1, []),
  ageRequirement: raw(659, -1, -1, [120, 638, 1357], 1, []),
  startingScout: { resource: 263, unit: 2550, populationSource: { type: 4, amount: 1, flag: 0 } },
  baseTrain93: {
    unit: 93,
    trainAt: [
      [12, 22],
      [1665, 22],
    ],
    trainTime: 22,
  },
};
function infrastructure(eco: EcoData): MapucheInfrastructure | null {
  const value = eco.mapucheInfrastructure;
  return value &&
    equal(value, EXPECTED_INFRASTRUCTURE) &&
    equal(eco.buildings[2556]?.cost, { Wood: 125 }) &&
    eco.buildings[2556]?.buildTime === 40 &&
    eco.buildings[2556]?.class === 3 &&
    equal(eco.units[93]?.at, [12, 1665]) &&
    eco.units[93]?.trainTime === 22
    ? value
    : null;
}
function source(id: number) {
  if (id === 1381)
    return {
      age: 1,
      raw: raw(id, 58, id, [], 0, [command(1, 215, 1, -1, 25), command(1, 33, 0, -1, 29)]),
      effects: [
        { kind: 'res', res: 215, op: 'add', v: 25 },
        { kind: 'res', res: 33, op: 'set', v: 29 },
      ],
    };
  if (id === 1382) {
    const commands = [
      command(8, 197, 4, 1, 2556),
      command(8, 197, 11, 1, 18414),
      command(8, 429, 4, 1, 2556),
      command(8, 429, 11, 1, 18414),
      ...[98, 655].flatMap((tech) => [command(8, tech, 4, 1, 2556), command(8, tech, 5, 1, 6), command(8, tech, 11, 1, 18300)]),
      ...[7, 6, 1155, 93, 358, 359].flatMap((unit) => [
        command(5, unit, -1, 158, 32767),
        command(0, unit, -1, 42, 2556),
        ...(unit === 7 || unit === 6 || unit === 1155 ? [command(0, unit, -1, 43, 1)] : []),
        command(0, unit, -1, 58, unit === 7 || unit === 6 || unit === 1155 ? 16420 : 16421),
      ]),
    ];
    return { age: 1, raw: raw(id, 58, id, [104], 1, commands), effects: [] };
  }
  if (![1405, 1406, 1407].includes(id)) return null;
  const age = id - 1403,
    value = [2.15, 0.75, 0.6202][age - 2]!;
  return {
    age,
    raw: raw(
      id,
      58,
      id,
      [99 + age, 1382],
      2,
      TRAIN_TARGETS.map((unit) => command(5, unit, -1, 101, Math.fround(value))),
    ),
    effects: TRAIN_TARGETS.map((unit) => ({ kind: 'attr', target: 'unit:' + unit, attr: 'trainTime', op: 'mul', v: value })),
  };
}
const validRow = (row: EffectRow) => {
  const expected = source(row.tech ?? -1);
  return (
    !!expected &&
    Array.isArray(row.effects) &&
    row.source === 'bonus' &&
    row.age === expected.age &&
    equal(row.requires, expected.raw.requires) &&
    equal(row.mapucheTech, expected.raw) &&
    equal(
      row.effects.map((e) => Object.fromEntries(Object.entries(e).filter(([key]) => key !== 'label'))),
      expected.effects,
    )
  );
};
export const hasMapucheMarker = (row: EffectRow) => 'mapucheTech' in row || IDS.includes(row.tech ?? -1);
export function mapucheContext(eco: EcoData): MapucheContext {
  const physical = infrastructure(eco),
    rows = eco.civEco.Mapuche ?? [],
    admitted = new Map<number, EffectRow>();
  for (const id of IDS) {
    const matches = rows.filter((row) => row.tech === id);
    if (matches.length === 1 && validRow(matches[0]!)) admitted.set(id, matches[0]!);
  }
  const complete = !!physical && admitted.size === IDS.length && rows.every((row) => !('mapucheTech' in row) || IDS.includes(row.tech ?? -1));
  return { infrastructure: physical, admitted, complete, reasons: complete ? [] : [MAPUCHE_SOURCE_REASON] };
}
export function mapucheRowAllowed(row: EffectRow, civ?: string, context?: MapucheContext): boolean {
  return !hasMapucheMarker(row) || (civ === 'Mapuche' && !!context?.infrastructure && context.admitted.get(row.tech ?? -1) === row);
}
export function mapucheRowClass(
  row: EffectRow,
  civ?: string,
  context?: MapucheContext,
): { kind: 'handled' } | { kind: 'irrelevant'; reason: string } | { kind: 'unhandled'; reason: string } | null {
  if (!hasMapucheMarker(row)) return null;
  if (!mapucheRowAllowed(row, civ, context)) return { kind: 'unhandled', reason: MAPUCHE_SOURCE_REASON };
  return row.tech === 1381 ? { kind: 'handled' } : { kind: 'irrelevant', reason: MAPUCHE_TRAIN_NOTE };
}
export function mapucheBuildOrder(order: BuildOrder, civ: string, eco: EcoData): BuildOrder {
  if (civ !== 'Mapuche' || !mapucheContext(eco).infrastructure) return order;
  let changed = false;
  const steps = order.steps.map((step) => {
    const actions = step.actions.map((action) => {
      if (action.type !== 'build' || ![68, 562, 584].includes(action.building)) return action;
      changed = true;
      return { ...action, building: 2556 };
    });
    const note = step.note?.replace(/磨坊|伐木场|采矿场|金矿营地/g, '聚落');
    if (note !== step.note) changed = true;
    return { ...step, actions, ...(note !== undefined ? { note } : {}) };
  });
  return changed ? { ...order, steps } : order;
}
export function mapucheResearchSites(eco: EcoData, tech: number, scope?: { mapuche?: MapucheContext }): readonly number[] {
  const context = scope?.mapuche ?? mapucheContext(eco);
  if (!context.infrastructure) return [eco.techs[tech]?.at ?? -1];
  return (
    context.infrastructure.researchSites[tech]?.map(([site]) => site!).filter((site) => ![68, 562, 584, 1808].includes(site)) ?? [eco.techs[tech]?.at ?? -1]
  );
}
export const mapucheForagerFood = (mods: Mods, task: string, rate: number) => (task === 'berries' ? rate * mods.foragerFood : 0);
export function mapucheNotes(eco: EcoData, boId?: string): string[] {
  if (!mapucheContext(eco).complete) return [];
  return [
    MAPUCHE_OPENING_NOTE,
    ...(['scouts-18', 'fast-castle-knights'].includes(boId ?? '') ? [MAPUCHE_CAVALRY_NOTE] : []),
    ...(['drush-fc', 'feudal-drush-18', 'maa-archers-18'].includes(boId ?? '') ? [MAPUCHE_MILITIA_NOTE] : []),
  ];
}
