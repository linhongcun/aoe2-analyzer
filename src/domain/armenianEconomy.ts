/** Fixed DE185872 Armenian infrastructure and three independently removable bonus groups. */
import type { BuildOrder } from './buildOrder';
import type { EcoData } from './buildSim';
import { roundHalfPrice } from './roundHalfPrice';

export interface ArmenianRawTech {
  tech: number;
  civ: number;
  effectId: number;
  requiredCount: number;
  requires: number[];
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: { Type: number; A: number; B: number; C: number; D: number }[];
}
export interface ArmenianInfrastructure {
  civId: number;
  treeId: number;
  treeCommands: ArmenianRawTech['commands'];
  enable: ArmenianRawTech;
  buildingTech: ArmenianRawTech;
  cart: { unit: number; type: number; class: number; buildTech: number; trainAt: number[][]; trainTime: number; cost: number[][] };
  researchSites: Record<string, number[][]>;
}
type Row = EcoData['civEco'][string][number];
export interface ArmenianContext {
  infrastructure: ArmenianInfrastructure | null;
  discount: boolean;
  research: Row[] | null;
  relic: boolean;
  reasons: string[];
}
export const ARMENIAN_CART_NOTE = '伐木场、采矿场逐次改为付费骡车；行走距离固定，移动和自动复用未模拟';
export const ARMENIAN_RESEARCH_NOTE = '伐木、采矿科技增强仅在对应研究完成后计入';
export const ARMENIAN_ASSUMPTION =
  '每个原营地建造动作均新增一辆付费骡车，不假定移动或复用。浆果与农田科技仍用磨坊；骡车只算一种时代前置建筑。施工沿用本站模型，未经当前客户端实测。';
export const ARMENIAN_CONTEXT_REASON = '亚美尼亚骡车或经济科技缺少完整已核来源，未计入';
export const ARMENIAN_RESEARCH_IDS = [960, 961, 962, 963, 964, 965, 966] as const;
const RELIC_IDS = [949, 957];
const SOURCE_IDS = [949, 957, 958, ...ARMENIAN_RESEARCH_IDS];
const DISABLED_TECHS = [246, 37, 373, 376, 377, 608, 63, 80, 218, 85, 436, 437, 265, 428, 188, 320, 51, 12, 279, 221];
const SITES: Record<string, number[][]> = {
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
  55: [
    [584, 30],
    [1808, 30],
    [2556, 30],
  ],
  182: [
    [584, 75],
    [1808, 75],
    [2556, 75],
  ],
  278: [
    [584, 30],
    [1808, 30],
    [2556, 30],
  ],
  221: [
    [562, 100],
    [1808, 100],
    [2556, 100],
  ],
  279: [
    [584, 75],
    [1808, 75],
    [2556, 75],
  ],
};
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
const command = (Type: number, A: number, B: number, C: number, D: number) => ({ Type, A, B, C, D });
function rawTech(
  tech: number,
  effectId: number,
  civ: number,
  requires: number[],
  requiredCount: number,
  commands: ArmenianRawTech['commands'],
): ArmenianRawTech {
  return { tech, civ, effectId, requires, requiredCount, researchLocation: -1, researchAt: [], researchTime: 0, cost: [], commands };
}

/** All source checks happen before reading any cost, site or multiplier. */
export function armenianInfrastructure(eco: EcoData): ArmenianInfrastructure | null {
  const value = eco.armenianInfrastructure;
  if (!value) return null;
  const expected: ArmenianInfrastructure = {
    civId: 44,
    treeId: 925,
    treeCommands: [...DISABLED_TECHS.map((tech) => command(102, -1, -1, -1, tech)), command(8, 886, 12, -1, 1)],
    enable: rawTech(940, 944, 44, [], 0, [command(2, 1808, 1, -1, 0), command(2, 562, 0, -1, 0), command(2, 584, 0, -1, 0)]),
    buildingTech: rawTech(933, -1, -1, [], 1, []),
    cart: {
      unit: 1808,
      type: 80,
      class: 3,
      buildTech: 933,
      trainAt: [[118, 25]],
      trainTime: 25,
      cost: [
        [1, 80, 1],
        [0, 20, 1],
      ],
    },
    researchSites: SITES,
  };
  return equal(value, expected) &&
    equal(eco.buildings[1808]?.cost, { Food: 20, Wood: 80 }) &&
    eco.buildings[1808]?.buildTime === 25 &&
    eco.buildings[1808]?.class === 3
    ? value
    : null;
}

function expectedSource(tech: number): { age: number; raw: ArmenianRawTech; effects: Row['effects'] } | null {
  if (tech === 949)
    return {
      age: 1,
      raw: rawTech(949, 951, 44, [107], 1, [command(1, 234, 0, -1, 1), command(7, 1118, 104, 1, 0)]),
      effects: [{ kind: 'res', res: 234, label: null, op: 'set', v: 1 } as Row['effects'][number]],
    };
  if (tech === 957)
    return {
      age: 1,
      raw: rawTech(957, 952, 44, [], 1, [command(1, 234, 0, -1, 1), command(1, 283, 0, -1, 1), command(7, 285, 104, 1, 0), command(1, 283, 0, -1, 0)]),
      effects: [234, 283, 283].map((res, index) => ({ kind: 'res', res, label: null, op: 'set', v: index === 2 ? 0 : 1 })) as Row['effects'],
    };
  if (tech === 958)
    return {
      age: 1,
      raw: rawTech(958, 953, 44, [], 0, [command(5, 1808, -1, 100, 0.75)]),
      effects: [{ kind: 'attr', target: 'unit:1808', attr: 'cost', op: 'mul', v: 0.75 }],
    };
  const rule: Record<number, [number, number, number, string, number[], number]> = {
    960: [202, 2, 956, 'wood', [218, 123], 1.06667],
    961: [203, 3, 956, 'wood', [218, 123], 1.06667],
    962: [221, 4, 957, 'wood', [218, 123], 1.03636],
    963: [55, 2, 958, 'gold', [581, 579], 1.05217],
    964: [182, 3, 958, 'gold', [581, 579], 1.05217],
    965: [278, 2, 959, 'stone', [124, 220], 1.05217],
    966: [279, 3, 959, 'stone', [124, 220], 1.05217],
  };
  const entry = rule[tech];
  if (!entry) return null;
  const [trigger, age, effect, task, targets, value] = entry;
  return {
    age,
    raw: rawTech(
      tech,
      effect,
      44,
      [trigger],
      1,
      targets.map((target) => command(5, target, -1, 13, Math.fround(value))),
    ),
    effects: [{ kind: 'attr', target: 'task:' + task, attr: 'workRate', op: 'mul', v: value }],
  };
}

function rowValid(row: Row): boolean {
  const expected = expectedSource(row.tech ?? -1);
  return (
    !!expected &&
    row.source === 'bonus' &&
    row.age === expected.age &&
    equal(row.requires, expected.raw.requires) &&
    equal(row.armenianTech, expected.raw) &&
    equal(row.effects, expected.effects)
  );
}
/** A whole omitted bonus is a valid issue 317 counterfactual; a partial/malformed group is not. */
function group(rows: Row[], ids: readonly number[]): Row[] | null {
  const found = rows.filter((row) => ids.includes(row.tech ?? -1));
  if (!found.length) return [];
  return found.length === ids.length && ids.every((id) => found.filter((row) => row.tech === id).length === 1) && found.every(rowValid) ? found : null;
}
export function armenianContext(eco: EcoData): ArmenianContext {
  const rows = eco.civEco.Armenians ?? [];
  const infrastructure = armenianInfrastructure(eco);
  const discount = group(rows, [958]);
  const research = group(rows, ARMENIAN_RESEARCH_IDS);
  const relic = group(rows, RELIC_IDS);
  const knownRows = rows.every((row) => SOURCE_IDS.includes(row.tech ?? -1));
  return {
    infrastructure,
    discount: discount !== null && discount.length === 1,
    research,
    relic: relic !== null,
    reasons: !knownRows || !infrastructure || discount === null || research === null || relic === null ? [ARMENIAN_CONTEXT_REASON] : [],
  };
}
export function armenianRowClass(row: Row, civ: string | undefined, context: ArmenianContext | undefined, buildings: ReadonlySet<number>) {
  if (civ === 'Armenians' && !SOURCE_IDS.includes(row.tech ?? -1)) return { kind: 'unhandled' as const, reason: ARMENIAN_CONTEXT_REASON };
  if (!row.armenianTech && !(civ === 'Armenians' && SOURCE_IDS.includes(row.tech ?? -1))) return null;
  if (civ !== 'Armenians' || !context?.infrastructure || !rowValid(row)) return { kind: 'unhandled' as const, reason: ARMENIAN_CONTEXT_REASON };
  if (ARMENIAN_RESEARCH_IDS.includes(row.tech as (typeof ARMENIAN_RESEARCH_IDS)[number])) {
    if (!context.research) return { kind: 'unhandled' as const, reason: ARMENIAN_CONTEXT_REASON };
    if ((row.requires ?? []).some((tech) => DISABLED_TECHS.includes(tech)))
      return { kind: 'irrelevant' as const, reason: '前置科技在亚美尼亚科技树中不可用，当前开局不触发' };
    return { kind: 'handled' as const };
  }
  if (RELIC_IDS.includes(row.tech ?? -1))
    return context.relic && ![104, 1806, 1118].some((id) => buildings.has(id))
      ? { kind: 'irrelevant' as const, reason: '当前开局不建强化教堂或产生圣物，非村民奖励不计入' }
      : { kind: 'unhandled' as const, reason: '强化教堂与圣物经济不在当前开局模型内，未计入' };
  return context.discount ? { kind: 'handled' as const } : { kind: 'unhandled' as const, reason: ARMENIAN_CONTEXT_REASON };
}

export function armenianResearchSites(context: ArmenianContext | undefined, tech: number): number[] | null {
  if (!context?.infrastructure) return null;
  if (DISABLED_TECHS.includes(tech)) return [];
  const locations = context.infrastructure.researchSites[tech];
  return locations ? locations.map(([building]) => building!).filter((building) => ![562, 584, 2556].includes(building)) : null;
}
export function armenianResearchBonus(context: ArmenianContext | undefined, tech: number, age: number, applied: ReadonlySet<number>): Row[] {
  if (!context?.infrastructure || !context.research || DISABLED_TECHS.includes(tech)) return [];
  return context.research.filter((row) => row.requires?.[0] === tech && row.age <= age && !applied.has(row.tech!));
}
export function armenianSiteName(ids: readonly number[]): string {
  const names: Record<number, string> = { 1808: '骡车', 68: '磨坊', 103: '铁匠铺', 109: '城镇中心' };
  return ids.map((id) => names[id] ?? '研究建筑').join('或');
}

/** One physical plan for execution and presentation; the original data and all other civilizations stay untouched. */
export function armenianBuildOrder(order: BuildOrder, civ: string, eco: EcoData): BuildOrder {
  if (civ !== 'Armenians' || !armenianInfrastructure(eco)) return order;
  const context = armenianContext(eco);
  const discount = context.discount ? eco.civEco.Armenians!.find((row) => row.tech === 958)!.effects[0]!.v! : 1;
  const cart = eco.buildings[1808]!;
  const fee = `每辆骡车按${roundHalfPrice((cart.cost.Wood ?? 0) * discount)}木、${roundHalfPrice((cart.cost.Food ?? 0) * discount)}食物计费。`;
  let changed = false;
  const steps = order.steps.map((step) => {
    let local = false;
    const actions = step.actions.map((action) => {
      if (action.type !== 'build' || ![562, 584].includes(action.building)) return action;
      local = true;
      return { ...action, building: 1808 };
    });
    const adapted = step.note
      ?.replace(/((?:\d+|一|两|二|三|四|五|六|七|八|九|十)\s*)座(?=伐木场|采矿场|金矿营地)/g, '$1辆')
      .replace(/伐木场|采矿场|金矿营地/g, '骡车');
    const note = local ? `${adapted ?? ''}${fee}` : adapted;
    if (!local && note === step.note) return step;
    changed = true;
    return { ...step, actions, ...(note !== undefined ? { note } : {}) };
  });
  return changed ? { ...order, steps } : order;
}
