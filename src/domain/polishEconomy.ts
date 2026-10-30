/** Fixed DE188329 Folwark infrastructure and stone co-production. Farm adjacency is not an input. */
import type { BuildOrder } from './buildOrder';
import type { EcoData, EffectRow } from './buildSim';
import type { JurchenRawTech } from './jurchenEconomy';

export type PolishRawTech = JurchenRawTech;
export interface PolishInfrastructure {
  civId: number;
  treeId: number;
  treeCommands: PolishRawTech['commands'];
  enable: PolishRawTech;
  upgrades: PolishRawTech[];
  buildingTech: PolishRawTech;
  folwarks: {
    unit: number;
    type: number;
    class: number;
    buildTech: number;
    trainAt: number[][];
    trainTime: number;
    cost: number[][];
    workRate: number;
    populationSource: { type: number; amount: number; flag: number };
  }[];
  researchSites: Record<string, number[][]>;
  farmTech: PolishRawTech;
  marketRequirement: PolishRawTech;
  ageRequirement: PolishRawTech;
  ageNode: PolishRawTech;
}
export interface PolishContext {
  infrastructure: PolishInfrastructure | null;
  admitted: Map<number, EffectRow>;
  complete: boolean;
  reasons: string[];
}
export const POLISH_SOURCE_REASON = '波兰大庄园或采石产金缺少完整已核来源，未计入';
export const POLISH_OPENING_NOTE = '磨坊逐次改为大庄园，建成提供5人口；农田即时收获未计入';
export const POLISH_STONE_NOTE = '采石兼产黄金按连续收入估算；当前8个模板均无采石分工';
export const POLISH_FARM_NOTE = '当前模板未指定农田与大庄园的邻接，不计农田即时收获';
export const POLISH_MODEL_NOTE =
  '原磨坊动作逐次新建大庄园，每座100木、40秒基础工期，建成后提供5人口及磨坊前置、研究地点；不合并或自动复用。当前模板未指定农田邻接，不计农田即时收获，普通农田采集不变；有限粮、耗尽、续种和预取时序未模拟。采石额外黄金按有效石料收入比例连续计入，共用携带量和往返时间；不模拟逐笔交仓取整，未经当前客户端逐帧实测。';
const IDS = [793, 794, 795, 796, 805];
const FOLWARKS = [1734, 1711, 1720];
const MILLS = [68, 129, 130, 131];
const DISABLED_BEFORE = [436, 265, 428, 80, 219, 244, 373, 375, 376, 380, 51, 85, 239, 320, 319, 439, 233, 182, 221, 15, 429, 875, 1138, 1142];
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
const raw = (tech: number, civ: number, effectId: number, requires: number[], requiredCount: number, commands: PolishRawTech['commands']): PolishRawTech => ({
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
function source(id: number): { age: number; raw: PolishRawTech; effects: EffectRow['effects'] } | null {
  if (id === 793)
    return {
      age: 1,
      raw: raw(id, 38, 816, [], 0, [
        ...MILLS.map((unit) => command(3, unit, 1734, -1, 0)),
        command(1, 237, 0, 36, Math.fround(0.1)),
        command(1, 238, 0, -1, 0),
        command(1, 239, 0, -1, 68),
      ]),
      effects: [
        { kind: 'res', res: 237, op: 'set', v: 0.1 },
        { kind: 'res', res: 238, op: 'set', v: 0 },
        { kind: 'res', res: 239, op: 'set', v: 68 },
      ],
    };
  if (id === 794 || id === 795)
    return {
      age: id - 792,
      raw: raw(
        id,
        38,
        id + 24,
        [id - 693, 793],
        2,
        [...MILLS, 1734, ...(id === 795 ? [1711] : [])].map((unit) => command(3, unit, id === 794 ? 1711 : 1720, -1, 0)),
      ),
      effects: [],
    };
  if (id === 796)
    return {
      age: 4,
      raw: raw(id, 38, 820, [103, 793], 2, [
        ...[...MILLS, ...FOLWARKS].flatMap((unit) => [command(4, unit, -1, 8, 1025), command(4, unit, -1, 8, 769)]),
        ...[...MILLS, ...FOLWARKS].flatMap((unit) => [command(4, unit, -1, 48, 1), command(4, unit, -1, 49, 1)]),
      ]),
      effects: [],
    };
  if (id === 805)
    return {
      age: 1,
      raw: raw(id, 38, 827, [], 0, [command(1, 241, -1, -1, Math.fround(33.3333)), command(1, 33, 0, -1, 13)]),
      effects: [
        { kind: 'res', res: 241, op: 'set', v: 33.333302 },
        { kind: 'res', res: 33, op: 'set', v: 13 },
      ],
    };
  return null;
}
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
const EXPECTED: PolishInfrastructure = {
  civId: 38,
  treeId: 801,
  treeCommands: [
    ...DISABLED_BEFORE.map((id) => command(102, -1, -1, -1, id)),
    ...[435, 254, 786].map((id) => command(101, id, 0, 2, 0.5)),
    ...[909, 910, 192, 218].map((id) => command(102, -1, -1, -1, id)),
    ...[1450, 1451].map((id) => command(8, id, 12, -1, 1)),
  ],
  enable: source(793)!.raw,
  upgrades: [794, 795, 796].map((id) => source(id)!.raw),
  buildingTech: raw(110, -1, 110, [], 1, []),
  folwarks: FOLWARKS.map((unit) => ({
    unit,
    type: 80,
    class: 3,
    buildTech: 110,
    trainAt: [[118, 40]],
    trainTime: 40,
    cost: [[1, 100, 1]],
    workRate: 1,
    populationSource: { type: 4, amount: 5, flag: 4 },
  })),
  researchSites: SITES,
  farmTech: raw(216, -1, 205, [110, 638, 1357], 1, [command(2, 50, 1, -1, 0), command(2, 1187, 1, -1, 0)]),
  marketRequirement: raw(666, -1, -1, [110, 638, 1357], 1, []),
  ageRequirement: raw(659, -1, -1, [120, 638, 1357], 1, []),
  ageNode: raw(120, -1, 120, [110, 258, 1221, 122, 282, 1358], 2, []),
};
function infrastructure(eco: EcoData): PolishInfrastructure | null {
  const value = eco.polesInfrastructure;
  return value &&
    equal(value, EXPECTED) &&
    FOLWARKS.every(
      (id) =>
        (id !== 1734 && !eco.buildings[id]) ||
        (equal(eco.buildings[id]?.cost, { Wood: 100 }) && eco.buildings[id]?.buildTime === 40 && eco.buildings[id]?.class === 3),
    )
    ? value
    : null;
}
const validRow = (row: EffectRow): boolean => {
  const expected = source(row.tech ?? -1);
  return (
    !!expected &&
    row.source === 'bonus' &&
    row.age === expected.age &&
    equal(row.requires, expected.raw.requires) &&
    equal(row.polesTech, expected.raw) &&
    Array.isArray(row.effects) &&
    equal(
      row.effects.map((effect) => Object.fromEntries(Object.entries(effect).filter(([key]) => key !== 'label'))),
      expected.effects,
    )
  );
};
export const hasPolishMarker = (row: EffectRow): boolean =>
  'polesTech' in row || IDS.includes(row.tech ?? -1) || row.effects?.some((effect) => effect.kind === 'res' && [237, 238, 239, 241].includes(effect.res ?? -1));
export function polishContext(eco: EcoData): PolishContext {
  const physical = infrastructure(eco),
    rows = eco.civEco.Poles ?? [],
    admitted = new Map<number, EffectRow>();
  for (const id of IDS) {
    const matches = rows.filter((row) => row.tech === id || row.polesTech?.tech === id);
    if (matches.length === 1 && validRow(matches[0]!)) admitted.set(id, matches[0]!);
  }
  const known = rows.every((row) => !hasPolishMarker(row) || admitted.get(row.tech ?? -1) === row);
  const complete = !!physical && admitted.size === IDS.length && known;
  return { infrastructure: physical, admitted, complete, reasons: complete ? [] : [POLISH_SOURCE_REASON] };
}
export function polishRowAllowed(row: EffectRow, civ?: string, context?: PolishContext): boolean {
  return !hasPolishMarker(row) || (civ === 'Poles' && !!context?.infrastructure && context.admitted.get(row.tech ?? -1) === row);
}
export function polishRowClass(row: EffectRow, civ?: string, context?: PolishContext) {
  if (!hasPolishMarker(row)) return null;
  if (!polishRowAllowed(row, civ, context)) return { kind: 'unhandled' as const, reason: POLISH_SOURCE_REASON };
  if (row.tech === 793) return { kind: 'irrelevant' as const, reason: POLISH_FARM_NOTE };
  if (row.tech === 796) return { kind: 'irrelevant' as const, reason: '大庄园帝王时代战斗属性不影响开局经济' };
  return { kind: 'handled' as const };
}
/** Preserve every explicit paid mill action and its age; do not invent farm adjacency. */
export function polishBuildOrder(order: BuildOrder, civ: string, eco: EcoData): BuildOrder {
  const context = civ === 'Poles' ? polishContext(eco) : undefined;
  if (!context?.infrastructure || !context.admitted.has(793)) return order;
  let age = 1,
    changed = false;
  const steps = order.steps.map((step) => {
    if (step.phase && ['feudal', 'castle', 'imperial'].includes(step.phase))
      age = { feudal: 2, castle: 3, imperial: 4 }[step.phase as 'feudal' | 'castle' | 'imperial'];
    const actions = step.actions.map((action) => {
      if (action.type !== 'build' || !MILLS.includes(action.building)) return action;
      changed = true;
      return { ...action, building: context.infrastructure!.folwarks[Math.min(age, 3) - 1]!.unit };
    });
    const note = step.note?.replace(/磨坊/g, '大庄园');
    if (note !== step.note) changed = true;
    return { ...step, actions, ...(note !== undefined ? { note } : {}) };
  });
  return changed ? { ...order, steps } : order;
}
export function polishResearchSites(eco: EcoData, tech: number, scope?: { poles?: PolishContext }): readonly number[] {
  const context = scope?.poles ?? polishContext(eco);
  if (!context.infrastructure) return [eco.techs[tech]?.at ?? -1];
  const locations = context.infrastructure.researchSites[tech];
  if (!locations) return [eco.techs[tech]?.at ?? -1];
  return locations.flatMap(([site]) =>
    site === 68
      ? context.admitted.has(793)
        ? context.infrastructure!.folwarks.map((farm) => farm.unit)
        : MILLS
      : site === 1808 || site === 2556
        ? []
        : [site!],
  );
}
export function polishBuildingReady(context: PolishContext | undefined, id: number, built: ReadonlyMap<number, number>): boolean {
  return (
    !context?.infrastructure ||
    ![50, 1187, 84, 116, 137].includes(id) ||
    (context.admitted.has(793) ? context.infrastructure.folwarks.map(({ unit }) => unit) : MILLS).some((unit) => (built.get(unit) ?? 0) > 0)
  );
}
export function polishBuildingPopulation(context: PolishContext | undefined, id: number): number {
  return context?.admitted.has(793) ? (context.infrastructure?.folwarks.find(({ unit }) => unit === id)?.populationSource.amount ?? 0) : 0;
}
export function polishBuildingTime(context: PolishContext | undefined, id: number): number | undefined {
  return context?.infrastructure?.folwarks.find(({ unit }) => unit === id)?.trainTime;
}
export function polishBuildingCost(context: PolishContext | undefined, id: number): { Wood: number } | undefined {
  const physical = context?.infrastructure?.folwarks.find(({ unit }) => unit === id);
  return physical ? { Wood: physical.cost.find(([resource]) => resource === 1)![1]! } : undefined;
}
export function polishStoneGold(context: PolishContext | undefined, task: string, rate: number): number {
  const row = context?.complete ? context.admitted.get(805) : undefined;
  const percentage = row?.effects.find((effect) => effect.kind === 'res' && effect.res === 241)?.v;
  return task === 'stone' && percentage !== undefined ? (rate * percentage) / 100 : 0;
}
export function polishNotes(eco: EcoData, boId?: string): string[] {
  return polishContext(eco).complete ? [...(boId === 'hybrid-fish-18' ? [] : [POLISH_OPENING_NOTE]), POLISH_FARM_NOTE, POLISH_STONE_NOTE] : [];
}
