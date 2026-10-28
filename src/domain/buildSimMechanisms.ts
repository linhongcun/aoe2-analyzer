/** Declarative extension points for opening mechanics; source guards remain explicit and fail closed. */
import type { BuildOrder } from './buildOrder';
import type { EcoData, EffectRow, SimParams } from './buildSim';
import type { simScope } from './buildSimCoverage';
import type { Mods, RowApplication } from './buildSimEffects';
import { TC_BY_AGE } from './buildSimEffects';
import { CONSTRUCTION_DATA } from '../data/construction';
import * as rules from './buildSimCivRules';
import { weiRewardFamily, WEI_SPAWN_ASSUMPTION, WEI_KNIGHT_TEMPLATE_NOTE } from './weiEconomy';
import { bengaliRewardFamily, BENGALI_SPAWN_ASSUMPTION, BENGALI_KNIGHT_TEMPLATE_NOTE } from './bengaliEconomy';
import { armenianContext, armenianBuildOrder, ARMENIAN_RESEARCH_IDS, ARMENIAN_ASSUMPTION, ARMENIAN_RESEARCH_NOTE } from './armenianEconomy';
import { georgianContext, georgianBuildOrder, GEORGIAN_ASSUMPTION } from './georgianEconomy';
import { slavicContext, slavicFarmRate, slavicHasFarmAssignment, SLAVIC_FARM_NOTE, SLAVIC_FARM_DETAIL, SLAVIC_TEAM_NOTE } from './slavicEconomy';
import { khmerContext, khmerRowClass, khmerFarmRate, khmerBuildingReady, khmerNotes, khmerHasFarmAssignment, KHMER_FARM_DETAIL } from './khmerEconomy';
export interface MechanismContext {
  sicilianRows?: EffectRow[];
  sicilianBuildings?: EcoData['buildings'];
  slavs?: ReturnType<typeof slavicContext>;
  khmer?: ReturnType<typeof khmerContext>;
  weiRewards: ReturnType<typeof weiRewardFamily>;
  bengaliRewards?: ReturnType<typeof bengaliRewardFamily>;
  armenians?: ReturnType<typeof armenianContext>;
  georgians?: ReturnType<typeof georgianContext>;
}
type Scope = ReturnType<typeof simScope>;
type Assumptions = { eco: EcoData; bo: BuildOrder; params: SimParams; scope: () => Scope };
interface CivMechanism {
  context?: (eco: EcoData) => Partial<MechanismContext>;
  atomicGather?: boolean;
  teamRowAllowed?: (row: EffectRow, scope: Scope, unique: boolean) => boolean;
  freeResearchOnce?: boolean;
  bonusVillagerEvents?: boolean;
  prepare?: (order: BuildOrder, civ: string, eco: EcoData) => BuildOrder;
  deferAgeTechs?: readonly number[];
  farmNoWalk?: (scope: Scope) => boolean;
  farmRate?: (scope: Scope, average: number) => number;
  buildingTime?: (scope: Scope, eco: EcoData, mods: Mods, id: number, age: number, fallback: number) => number | undefined;
  buildingReady?: (scope: Scope, id: number, age: number, built: ReadonlyMap<number, number>) => boolean;
  researchSites?: (eco: EcoData, tech: number) => readonly number[];
  prerequisiteCiv?: (scope: Scope, civ: string) => string;
  assumptions?: (input: Assumptions) => string[];
}
const knightNote = (bo: BuildOrder, note: string) => (bo.id === 'fast-castle-knights' ? [note] : []);
/** Numbers are source identities, not copied gameplay multipliers: actual values still come from eco. */
export const CIV_MECHANISMS: Readonly<Record<string, CivMechanism>> = {
  Portuguese: { assumptions: () => [rules.FORAGER_WOOD_ASSUMPTION] },
  Shu: { assumptions: () => [rules.LUMBER_FOOD_ASSUMPTION, rules.SHU_KNIGHT_TEMPLATE_NOTE] },
  Malians: { assumptions: () => [rules.MALIAN_GOLD_ASSUMPTION] },
  Varangians: { assumptions: () => [rules.VARANGIAN_GOLD_ASSUMPTION] },
  Tatars: { atomicGather: true, assumptions: () => [rules.TATAR_SHEPHERD_ASSUMPTION] },
  Mayans: {
    atomicGather: true,
    teamRowAllowed: (row, scope, unique) => row.source !== 'team' || (unique && rules.hasMayanWallContext(row, scope)),
    assumptions: () => [rules.MAYAN_RESOURCE_ASSUMPTION, rules.MAYAN_CAVALRY_TEMPLATE_NOTE],
  },
  Franks: { freeResearchOnce: true },
  Sicilians: {
    context: (eco) => ({ sicilianRows: eco.civEco.Sicilians ?? [], sicilianBuildings: eco.buildings }),
    atomicGather: true,
    buildingTime: (scope, eco, mods, id, age, fallback) => {
      if (!rules.sicilianGroupOk(scope, 770)) return undefined;
      if (id === 109) {
        const form = CONSTRUCTION_DATA.buildings[109]!.forms[age - 1]!;
        return CONSTRUCTION_DATA.civs.Sicilians!.units[form]!.time * (mods.timeMul['unit:' + form] ?? 1);
      }
      return (eco.buildings[id]?.buildTime ?? fallback) * (mods.timeMul['unit:' + id] ?? 1) * (mods.timeMul['class:' + eco.buildings[id]?.class] ?? 1);
    },
    assumptions: ({ scope }) => [
      ...(rules.sicilianGroupOk(scope(), 770) ? [rules.SICILIAN_CONSTRUCTION_ASSUMPTION] : []),
      ...(rules.sicilianGroupOk(scope(), 772) ? [rules.SICILIAN_FARM_ASSUMPTION] : []),
    ],
  },
  Wei: {
    context: (eco) => ({ weiRewards: weiRewardFamily(eco.civEco.Wei) }),
    bonusVillagerEvents: true,
    assumptions: ({ eco, bo }) => (weiRewardFamily(eco.civEco.Wei) ? [WEI_SPAWN_ASSUMPTION, ...knightNote(bo, WEI_KNIGHT_TEMPLATE_NOTE)] : []),
  },
  Bengalis: {
    context: (eco) => ({ bengaliRewards: bengaliRewardFamily(eco.civEco.Bengalis) }),
    bonusVillagerEvents: true,
    assumptions: ({ eco, bo }) => (bengaliRewardFamily(eco.civEco.Bengalis) ? [BENGALI_SPAWN_ASSUMPTION, ...knightNote(bo, BENGALI_KNIGHT_TEMPLATE_NOTE)] : []),
  },
  Armenians: {
    context: (eco) => ({ armenians: armenianContext(eco) }),
    prepare: armenianBuildOrder,
    deferAgeTechs: ARMENIAN_RESEARCH_IDS,
    assumptions: ({ eco }) => (armenianContext(eco).infrastructure ? [ARMENIAN_ASSUMPTION, ARMENIAN_RESEARCH_NOTE] : []),
  },
  Georgians: {
    context: (eco) => ({ georgians: georgianContext(eco) }),
    prepare: georgianBuildOrder,
    assumptions: ({ eco }) => {
      const context = georgianContext(eco);
      return context.infrastructure
        ? [context.start ? GEORGIAN_ASSUMPTION : GEORGIAN_ASSUMPTION.replace('起始免费骡车已作为完成实体和一种时代前置；', '未应用起始免费骡车；')]
        : [];
    },
  },
  Slavs: {
    context: (eco) => ({ slavs: slavicContext(eco) }),
    atomicGather: true,
    farmRate: (scope, average) => slavicFarmRate(scope.slavs, average),
    assumptions: ({ eco, bo, params }) => [
      ...(slavicContext(eco).physical && slavicHasFarmAssignment(bo) ? [SLAVIC_FARM_NOTE, SLAVIC_FARM_DETAIL] : []),
      ...(params.team ? [SLAVIC_TEAM_NOTE] : []),
    ],
  },
  Khmer: {
    context: (eco) => ({ khmer: khmerContext(eco) }),
    atomicGather: true,
    farmNoWalk: (scope) => !!scope.khmer?.bonus,
    farmRate: (scope, average) => khmerFarmRate(scope.khmer, average),
    buildingReady: (scope, id, age, built) => khmerBuildingReady(scope.khmer, id, age, built),
    researchSites: (eco, tech) => {
      const sites: Record<string, readonly number[]> = {
        Mill: [68, 129, 130, 131],
        'Lumber Camp': [562, 563, 564, 565],
        'Mining Camp': [584, 585, 586, 587],
        'Town Center': TC_BY_AGE,
        Market: [84, 116, 137],
        Dock: [45, 47, 51, 133],
      };
      return sites[eco.ecoTechs[tech]?.at ?? ''] ?? [eco.techs[tech]?.at ?? -1];
    },
    prerequisiteCiv: (scope, civ) => (scope.khmer?.noPrerequisites ? civ : ''),
    assumptions: ({ eco, bo }) => {
      const context = khmerContext(eco);
      return [...khmerNotes(context, bo), ...(context.physical && context.bonus && khmerHasFarmAssignment(bo) ? [KHMER_FARM_DETAIL] : [])];
    },
  },
};
const DEFAULT_MECHANISM: CivMechanism = {};
export const civMechanism = (civ?: string): CivMechanism => CIV_MECHANISMS[civ ?? ''] ?? DEFAULT_MECHANISM;
export const mechanismContext = (eco: EcoData, civ?: string): MechanismContext => ({ weiRewards: null, ...civMechanism(civ).context?.(eco) });
export const mechanismAssumptions = (civ: string, input: Assumptions): string[] => civMechanism(civ).assumptions?.(input) ?? [];
export const mechanismFarmRate = (scope: Scope, task: string, average: number): number =>
  task === 'farm' ? (civMechanism(scope.civ).farmRate?.(scope, average) ?? average) : average;

interface ApplicationRule {
  flag: keyof RowApplication;
  civ?: string;
  gather?: boolean;
  allows: (row: EffectRow, scope: Scope) => boolean;
}
const APPLICATION_RULES: readonly ApplicationRule[] = [
  { flag: 'foragerWood', gather: true, allows: (row) => row.tech === 453 },
  { flag: 'lumberFood', gather: true, allows: (row) => rules.hasLumberFoodContext(row) === true },
  { flag: 'malianGold', civ: 'Malians', gather: true, allows: (row) => rules.hasMalianGoldContext(row) === true },
  { flag: 'buildingWood', civ: 'Malians', allows: rules.hasMalianBuildingContext },
  { flag: 'varangianGold', civ: 'Varangians', gather: true, allows: (row) => rules.hasVarangianGoldContext(row) === true },
  { flag: 'tatarShepherd', civ: 'Tatars', gather: true, allows: rules.hasTatarShepherdContext },
  { flag: 'mayanResource', civ: 'Mayans', gather: true, allows: (row) => rules.hasMayanTreeContext(row) === true },
  { flag: 'mayanWall', civ: 'Mayans', allows: rules.hasMayanWallContext },
];
export function rowApplication(civ: string, row: EffectRow, scope: Scope, mode: 'timeline' | 'gather', atomic: () => boolean): RowApplication {
  const application: RowApplication = {};
  for (const rule of APPLICATION_RULES)
    if ((!rule.civ || rule.civ === civ) && (mode !== 'gather' || rule.gather) && rule.allows(row, scope) && (mode !== 'gather' || atomic()))
      application[rule.flag] = true;
  return application;
}
/** Shared source filtering; gather keeps its historical, narrower atomic gate. */
export function mechanismRowAllowed(row: EffectRow, scope: Scope, uniqueMayanTree: boolean): boolean {
  return (
    khmerRowClass(row, scope.civ, scope.khmer)?.kind !== 'unhandled' &&
    (row.tech !== 704 || scope.civ === 'Tatars') &&
    rules.mayanRowAllowed(scope.civ ?? '', row, uniqueMayanTree) &&
    rules.sicilianRowAllowed(scope, row)
  );
}

export const mechanismTeamRowAllowed = (row: EffectRow, scope: Scope, unique: boolean): boolean =>
  civMechanism(scope.civ).teamRowAllowed?.(row, scope, unique) ?? true;
export const mechanismGatherMarkerAllowed = (row: EffectRow, scope: Scope): boolean => !('slavicTree' in row || 'slavicTech' in row) || !!scope.slavs;
