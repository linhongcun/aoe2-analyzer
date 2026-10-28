/** Fixed DE185872 Georgian infrastructure and independently removable source groups. */
import type { BuildOrder } from './buildOrder';
import type { EcoData } from './buildSim';
import { roundHalfPrice } from './roundHalfPrice';

export interface GeorgianRawTech {
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
export interface GeorgianInfrastructure {
  civId: number;
  treeId: number;
  treeCommands: GeorgianRawTech['commands'];
  enable: GeorgianRawTech;
  buildingTech: GeorgianRawTech;
  cart: { unit: number; type: number; class: number; buildTech: number; trainAt: number[][]; trainTime: number; cost: number[][] };
  researchSites: Record<string, number[][]>;
}
type Row = EcoData['civEco'][string][number];
export interface GeorgianContext {
  infrastructure: GeorgianInfrastructure | null;
  start: boolean;
  church: boolean;
  elevation: boolean;
  reasons: string[];
}
export const GEORGIAN_START_NOTE = '开局已有1辆免费骡车，不占人口；原营地动作仍逐次新增付费骡车';
export const GEORGIAN_CART_NOTE = '伐木场、采矿场逐次改为付费骡车，每辆80木、20食物；行走距离固定，移动和自动复用未模拟';
export const GEORGIAN_ASSUMPTION =
  '起始免费骡车已作为完成实体和一种时代前置；每个原营地建造动作仍新增一辆付费骡车。浆果与农田科技仍用磨坊。施工沿用本站模型，未经当前客户端实测；教堂范围经济未纳入当前模板。';
export const GEORGIAN_CONTEXT_REASON = '格鲁吉亚骡车或加成缺少完整已核来源，未计入';
export const GEORGIAN_CHURCH_REASON = '强化教堂范围经济不在当前开局模型内，未计入';
const SOURCE_IDS = [925, 926, 934];
const CHURCHES = [30, 31, 32, 104, 1806];
const DISABLED_TECHS = [244, 373, 375, 376, 64, 380, 233, 319, 265, 437, 237, 219, 188, 182, 221, 904, 907, 909, 910];
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
  commands: GeorgianRawTech['commands'],
): GeorgianRawTech {
  return { tech, civ, effectId, requires, requiredCount, researchLocation: -1, researchAt: [], researchTime: 0, cost: [], commands };
}

/** Infrastructure survives a whole omission of the starting-cart bonus. */
export function georgianInfrastructure(eco: EcoData): GeorgianInfrastructure | null {
  const value = eco.georgianInfrastructure;
  if (!value) return null;
  const expected: GeorgianInfrastructure = {
    civId: 45,
    treeId: 927,
    treeCommands: DISABLED_TECHS.map((tech) => command(102, -1, -1, -1, tech)),
    enable: rawTech(932, 944, 45, [], 0, [command(2, 1808, 1, -1, 0), command(2, 562, 0, -1, 0), command(2, 584, 0, -1, 0)]),
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

function expectedSource(tech: number): { raw: GeorgianRawTech; effects: Row['effects'] } | null {
  if (tech === 925)
    return {
      raw: rawTech(925, 937, 45, [639, 307], 2, [command(1, 234, 0, -1, 1), command(7, 1808, 619, 1, 0)]),
      effects: [{ kind: 'res', res: 234, label: null, op: 'set', v: 1 } as Row['effects'][number]],
    };
  if (tech === 926)
    return {
      raw: rawTech(926, 938, 45, [104], 1, [command(1, 272, 1, -1, 0), command(1, 273, 1, -1, Math.fround(-0.15))]),
      effects: [
        { kind: 'res', res: 272, label: null, op: 'add', v: 0 } as Row['effects'][number],
        { kind: 'res', res: 273, label: null, op: 'add', v: -0.15 } as Row['effects'][number],
      ],
    };
  if (tech === 934)
    return {
      raw: rawTech(934, 939, 45, [], 0, [command(1, 33, 0, -1, 9)]),
      effects: [{ kind: 'res', res: 33, label: null, op: 'set', v: 9 } as Row['effects'][number]],
    };
  return null;
}
function rowValid(row: Row): boolean {
  const expected = expectedSource(row.tech ?? -1);
  return (
    !!expected &&
    row.source === 'bonus' &&
    row.age === 1 &&
    equal(row.requires, expected.raw.requires) &&
    equal(row.georgianTech, expected.raw) &&
    equal(row.effects, expected.effects)
  );
}
/** Absent is a legitimate counterfactual; malformed existing or duplicate rows are rejected. */
function group(rows: Row[], tech: number): Row[] | null {
  const found = rows.filter((row) => row.tech === tech);
  return !found.length || (found.length === 1 && rowValid(found[0]!)) ? found : null;
}
export function georgianContext(eco: EcoData): GeorgianContext {
  const rows = eco.civEco.Georgians ?? [];
  const infrastructure = georgianInfrastructure(eco);
  const start = group(rows, 925),
    elevation = group(rows, 926),
    church = group(rows, 934);
  const knownRows = rows.every((row) => SOURCE_IDS.includes(row.tech ?? -1) || (row.source === 'team' && row.tech === undefined && !row.georgianTech));
  return {
    infrastructure,
    start: !!infrastructure && start !== null && start.length === 1,
    elevation: elevation !== null,
    church: church !== null,
    reasons: !knownRows || !infrastructure || start === null || elevation === null || church === null ? [GEORGIAN_CONTEXT_REASON] : [],
  };
}
export function georgianHasChurch(buildings: ReadonlySet<number>): boolean {
  return CHURCHES.some((building) => buildings.has(building));
}
export function georgianRowClass(row: Row, civ: string | undefined, context: GeorgianContext | undefined, buildings: ReadonlySet<number>) {
  if (civ === 'Georgians' && row.source !== 'team' && !SOURCE_IDS.includes(row.tech ?? -1))
    return { kind: 'unhandled' as const, reason: GEORGIAN_CONTEXT_REASON };
  if (!row.georgianTech && !(civ === 'Georgians' && SOURCE_IDS.includes(row.tech ?? -1))) return null;
  if (civ !== 'Georgians' || !context?.infrastructure || !rowValid(row)) return { kind: 'unhandled' as const, reason: GEORGIAN_CONTEXT_REASON };
  if (row.tech === 925) return context.start ? { kind: 'handled' as const } : { kind: 'unhandled' as const, reason: GEORGIAN_CONTEXT_REASON };
  if (row.tech === 926)
    return context.elevation
      ? { kind: 'irrelevant' as const, reason: '当前开局不模拟山地作战，不影响经济计算' }
      : { kind: 'unhandled' as const, reason: GEORGIAN_CONTEXT_REASON };
  return context.church && !georgianHasChurch(buildings)
    ? { kind: 'irrelevant' as const, reason: '当前开局不建强化教堂，范围经济不触发' }
    : { kind: 'unhandled' as const, reason: GEORGIAN_CHURCH_REASON };
}
export function georgianResearchSites(context: GeorgianContext | undefined, tech: number): number[] | null {
  if (!context?.infrastructure) return null;
  if (DISABLED_TECHS.includes(tech)) return [];
  const locations = context.infrastructure.researchSites[tech];
  return locations ? locations.map(([building]) => building!).filter((building) => ![562, 584, 2556].includes(building)) : null;
}

/** Physical projection retains every explicit paid action, separate from the starting grant. */
export function georgianBuildOrder(order: BuildOrder, civ: string, eco: EcoData): BuildOrder {
  if (civ !== 'Georgians' || !georgianInfrastructure(eco)) return order;
  const cart = eco.buildings[1808]!;
  const fee = `每辆骡车按${roundHalfPrice(cart.cost.Wood ?? 0)}木、${roundHalfPrice(cart.cost.Food ?? 0)}食物计费。`;
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
