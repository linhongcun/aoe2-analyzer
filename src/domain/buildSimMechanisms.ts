import { gurjaraContext, gurjaraNotes, gurjaraRowAllowed, GURJARA_MODEL_NOTE } from './gurjaraEconomy';
import { romanContext, romanRowClass, romanFarmRate, romanBuilderMultiplier, romanNotes } from './romanEconomy';
import {
  polishContext,
  polishRowAllowed,
  polishBuildOrder,
  polishResearchSites,
  polishBuildingReady,
  polishBuildingPopulation,
  polishNotes,
  polishBuildingTime,
  polishBuildingCost,
  POLISH_MODEL_NOTE,
} from './polishEconomy';
import {
  mapucheContext,
  mapucheBuildOrder,
  mapucheResearchSites,
  mapucheNotes,
  mapucheRowAllowed,
  MAPUCHE_MODEL_NOTE,
  type MapucheContext,
} from './mapucheEconomy';
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
import {
  armenianContext,
  armenianBuildOrder,
  armenianResearchBonus,
  ARMENIAN_RESEARCH_IDS,
  ARMENIAN_ASSUMPTION,
  ARMENIAN_RESEARCH_NOTE,
} from './armenianEconomy';
import { georgianContext, georgianBuildOrder, GEORGIAN_ASSUMPTION } from './georgianEconomy';
import { slavicContext, slavicFarmRate, slavicHasFarmAssignment, SLAVIC_FARM_NOTE, SLAVIC_FARM_DETAIL, SLAVIC_TEAM_NOTE } from './slavicEconomy';
import { khmerContext, khmerRowClass, khmerFarmRate, khmerBuildingReady, khmerModel } from './khmerEconomy';
import { chineseContext, chinesePopulation, chineseStartingVillagers, chineseRowAllowed, chineseModel } from './chineseEconomy';
import { jurchenContext, jurchenNotes, jurchenRowClass, JURCHEN_RESEARCH_NOTE } from './jurchenEconomy';
import { DATA_PATCH, SOURCE_PINS } from '../data/sources';
import { isAgeTech } from './gameIds';
import { SPECIAL_INCOME, SPECIAL_INCOME_EXCEPTIONS } from './specialIncome';
import type { CivContext } from './civModel';
export interface MechanismContext {
  romans?: ReturnType<typeof romanContext>;
  poles?: ReturnType<typeof polishContext>;
  gurjaras?: ReturnType<typeof gurjaraContext>;
  mapuche?: MapucheContext;
  chinese?: ReturnType<typeof chineseContext>;
  jurchens?: ReturnType<typeof jurchenContext>;
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
type Assumptions = { eco: EcoData; bo: BuildOrder; params: SimParams; scope: () => Scope; ctx?: CivContext };
export type ModelSource = {
  status: 'current' | 'evidence-pinned' | 'legacy';
  patch: number;
  datCommit?: string;
  datSha256?: string;
  evidence?: string;
};
const CURRENT_MODEL_SOURCE: ModelSource = {
  status: 'current',
  patch: DATA_PATCH.build,
  datCommit: SOURCE_PINS.dat.commit,
  datSha256: SOURCE_PINS.dat.sha256,
};
const EVIDENCE_MODEL_SOURCE = (evidence: string): ModelSource => ({ status: 'evidence-pinned', patch: 185872, evidence });
const MODEL_SOURCE_BY_CIV: Readonly<Record<string, ModelSource>> = {
  Armenians: EVIDENCE_MODEL_SOURCE('docs/design/armenians197-source.json'),
  Georgians: EVIDENCE_MODEL_SOURCE('docs/design/georgians197-source.json'),
  Khmer: EVIDENCE_MODEL_SOURCE('docs/design/khmer197-source.json'),
  Slavs: EVIDENCE_MODEL_SOURCE('docs/design/slavs197-source.json'),
};
interface CivMechanism {
  source: ModelSource;
  /** assumptions 的 scope 使用当前 bo（而不是 ALL_BOS）；目前仅两个 CivModel 样板。 */
  assumptionScope?: 'bo';
  civContext?: (eco: EcoData) => CivContext;
  builderMultiplier?: (scope: Scope) => number;
  buildingCost?: (scope: Scope, id: number) => EcoData['buildings'][string]['cost'] | undefined;
  buildingPopulation?: (scope: Scope, id: number) => number;
  startingVillagers?: (scope: Scope) => number;
  /** simScope 在完整 Scope 构造前就要知道起始建筑，所以接收 context。 */
  startingBuildings?: (context: MechanismContext) => readonly number[];
  techCostRule?: (kind: 'tech' | 'up', id: number, scope: Scope) => { applyTechCostAll: boolean } | undefined;
  researchRewards?: (input: { scope: Scope; tech: number; age: number; applied: ReadonlySet<number> }) => readonly EffectRow[];
  townCenterPopulation?: (scope: Scope) => number;
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
  researchSites?: (eco: EcoData, tech: number, scope: Scope) => readonly number[];
  prerequisiteCiv?: (scope: Scope, civ: string) => string;
  assumptions?: (input: Assumptions) => string[];
}
const knightNote = (bo: BuildOrder, note: string) => (bo.id === 'fast-castle-knights' ? [note] : []);
/** Numbers are source identities, not copied gameplay multipliers: actual values still come from eco. */
export const CIV_MECHANISMS: Readonly<Record<string, CivMechanism>> = {
  Romans: {
    source: CURRENT_MODEL_SOURCE,
    context: (eco) => ({ romans: romanContext(eco) }),
    atomicGather: true,
    farmRate: (scope, average) => romanFarmRate(scope.romans, average),
    builderMultiplier: (scope) => romanBuilderMultiplier(scope.romans),
    assumptions: ({ eco, bo }) => romanNotes(eco, bo),
  },
  Poles: {
    source: CURRENT_MODEL_SOURCE,
    context: (eco) => ({ poles: polishContext(eco) }),
    prepare: polishBuildOrder,
    atomicGather: true,
    buildingReady: (scope, id, _age, built) => polishBuildingReady(scope.poles, id, built),
    buildingTime: (scope, _eco, _mods, id) => polishBuildingTime(scope.poles, id),
    buildingCost: (scope, id) => polishBuildingCost(scope.poles, id),
    buildingPopulation: (scope, id) => polishBuildingPopulation(scope.poles, id),
    researchSites: (eco, tech, scope) => polishResearchSites(eco, tech, scope),
    assumptions: ({ eco, bo }) => (polishContext(eco).complete ? [...polishNotes(eco, bo.id), POLISH_MODEL_NOTE] : []),
  },
  Gurjaras: {
    source: CURRENT_MODEL_SOURCE,
    context: (eco) => ({ gurjaras: gurjaraContext(eco) }),
    assumptions: ({ eco, bo }) => (gurjaraContext(eco).complete ? [...gurjaraNotes(eco, bo.id), GURJARA_MODEL_NOTE] : []),
  },
  Mapuche: {
    source: CURRENT_MODEL_SOURCE,
    context: (eco) => ({ mapuche: mapucheContext(eco) }),
    prepare: mapucheBuildOrder,
    buildingReady: (scope, id, _age, built) => !scope.mapuche?.infrastructure || ![50, 1187, 84].includes(id) || (built.get(2556) ?? 0) > 0,
    buildingPopulation: (scope, id) => (id === 2556 ? (scope.mapuche?.infrastructure?.settlements[0]?.populationSource.amount ?? 0) : 0),
    researchSites: mapucheResearchSites,
    deferAgeTechs: [1405, 1406, 1407],
    atomicGather: true,
    assumptions: ({ eco, bo }) => (mapucheContext(eco).complete ? [...mapucheNotes(eco, bo.id), MAPUCHE_MODEL_NOTE] : []),
  },
  Chinese: {
    source: CURRENT_MODEL_SOURCE,
    civContext: chineseModel.context,
    assumptionScope: 'bo',
    context: (eco) => ({ chinese: chineseContext(eco) }),
    startingVillagers: (scope) => chineseStartingVillagers(scope.chinese),
    techCostRule: (kind, id) => (kind === 'up' ? { applyTechCostAll: true } : { applyTechCostAll: !isAgeTech(id) }),
    townCenterPopulation: (scope) => chinesePopulation(scope.chinese),
    assumptions: (input) => chineseModel.assumptions?.({ eco: input.eco, bo: input.bo, ctx: input.ctx ?? chineseModel.context(input.eco) }) ?? [],
  },
  Jurchens: {
    source: CURRENT_MODEL_SOURCE,
    context: (eco) => ({ jurchens: jurchenContext(eco) }),
    assumptions: ({ eco, bo }) => (jurchenContext(eco).complete ? [...jurchenNotes(eco, bo.id), JURCHEN_RESEARCH_NOTE] : []),
  },
  Portuguese: { source: CURRENT_MODEL_SOURCE, assumptions: () => [rules.FORAGER_WOOD_ASSUMPTION] },
  Shu: { source: CURRENT_MODEL_SOURCE, assumptions: () => [rules.LUMBER_FOOD_ASSUMPTION, rules.SHU_KNIGHT_TEMPLATE_NOTE] },
  Malians: { source: CURRENT_MODEL_SOURCE, assumptions: () => [rules.MALIAN_GOLD_ASSUMPTION] },
  Varangians: { source: CURRENT_MODEL_SOURCE, assumptions: () => [rules.VARANGIAN_GOLD_ASSUMPTION] },
  Tatars: { source: CURRENT_MODEL_SOURCE, atomicGather: true, assumptions: () => [rules.TATAR_SHEPHERD_ASSUMPTION] },
  Mayans: {
    source: CURRENT_MODEL_SOURCE,
    atomicGather: true,
    startingVillagers: () => 4,
    teamRowAllowed: (row, scope, unique) => row.source !== 'team' || (unique && rules.hasMayanWallContext(row, scope)),
    assumptions: () => [rules.MAYAN_RESOURCE_ASSUMPTION, rules.MAYAN_CAVALRY_TEMPLATE_NOTE],
  },
  Franks: { source: CURRENT_MODEL_SOURCE, freeResearchOnce: true },
  Sicilians: {
    source: CURRENT_MODEL_SOURCE,
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
    source: CURRENT_MODEL_SOURCE,
    context: (eco) => ({ weiRewards: weiRewardFamily(eco.civEco.Wei) }),
    bonusVillagerEvents: true,
    assumptions: ({ eco, bo }) => (weiRewardFamily(eco.civEco.Wei) ? [WEI_SPAWN_ASSUMPTION, ...knightNote(bo, WEI_KNIGHT_TEMPLATE_NOTE)] : []),
  },
  Bengalis: {
    source: CURRENT_MODEL_SOURCE,
    context: (eco) => ({ bengaliRewards: bengaliRewardFamily(eco.civEco.Bengalis) }),
    bonusVillagerEvents: true,
    assumptions: ({ eco, bo }) => (bengaliRewardFamily(eco.civEco.Bengalis) ? [BENGALI_SPAWN_ASSUMPTION, ...knightNote(bo, BENGALI_KNIGHT_TEMPLATE_NOTE)] : []),
  },
  Armenians: {
    source: MODEL_SOURCE_BY_CIV.Armenians!,
    context: (eco) => ({ armenians: armenianContext(eco) }),
    prepare: armenianBuildOrder,
    deferAgeTechs: ARMENIAN_RESEARCH_IDS,
    researchRewards: ({ scope, tech, age, applied }) => armenianResearchBonus(scope.armenians, tech, age, applied),
    assumptions: ({ eco }) => (armenianContext(eco).infrastructure ? [ARMENIAN_ASSUMPTION, ARMENIAN_RESEARCH_NOTE] : []),
  },
  Georgians: {
    source: MODEL_SOURCE_BY_CIV.Georgians!,
    context: (eco) => ({ georgians: georgianContext(eco) }),
    prepare: georgianBuildOrder,
    startingBuildings: ({ georgians }) => (georgians?.start ? [1808] : []),
    assumptions: ({ eco }) => {
      const context = georgianContext(eco);
      return context.infrastructure
        ? [context.start ? GEORGIAN_ASSUMPTION : GEORGIAN_ASSUMPTION.replace('起始免费骡车已作为完成实体和一种时代前置；', '未应用起始免费骡车；')]
        : [];
    },
  },
  Slavs: {
    source: MODEL_SOURCE_BY_CIV.Slavs!,
    context: (eco) => ({ slavs: slavicContext(eco) }),
    atomicGather: true,
    farmRate: (scope, average) => slavicFarmRate(scope.slavs, average),
    assumptions: ({ eco, bo, params }) => [
      ...(slavicContext(eco).physical && slavicHasFarmAssignment(bo) ? [SLAVIC_FARM_NOTE, SLAVIC_FARM_DETAIL] : []),
      ...(params.team ? [SLAVIC_TEAM_NOTE] : []),
    ],
  },
  Khmer: {
    source: MODEL_SOURCE_BY_CIV.Khmer!,
    civContext: khmerModel.context,
    assumptionScope: 'bo',
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
    assumptions: (input) => khmerModel.assumptions?.({ eco: input.eco, bo: input.bo, ctx: input.ctx ?? khmerModel.context(input.eco) }) ?? [],
  },
};
export const CIV_MECHANISM_KEYS = Object.freeze(Object.keys(CIV_MECHANISMS));
const DEFAULT_MECHANISM: CivMechanism = { source: { status: 'legacy', patch: DATA_PATCH.build } };
export const civMechanism = (civ?: string): CivMechanism => CIV_MECHANISMS[civ ?? ''] ?? DEFAULT_MECHANISM;
export const mechanismContext = (eco: EcoData, civ?: string): MechanismContext => ({ weiRewards: null, ...civMechanism(civ).context?.(eco) });
export const mechanismAssumptions = (civ: string, input: Assumptions): string[] => {
  const model = civMechanism(civ);
  const ctx = input.ctx ?? model.civContext?.(input.eco) ?? { reasons: [] };
  return model.assumptions?.({ ...input, ctx }) ?? [];
};
export const mechanismFarmRate = (scope: Scope, task: string, average: number): number =>
  task === 'farm' ? (civMechanism(scope.civ).farmRate?.(scope, average) ?? average) : average;

interface ApplicationRule {
  flag: keyof RowApplication;
  civ?: string;
  gather?: boolean;
  allows: (row: EffectRow, scope: Scope) => boolean;
}
export const APPLICATION_RULES: readonly ApplicationRule[] = [
  ...SPECIAL_INCOME.flatMap((rule) =>
    rule.flag && rule.allows ? [{ flag: rule.flag, civ: rule.civ, gather: rule.gather, allows: rule.allows as ApplicationRule['allows'] }] : [],
  ),
  {
    flag: SPECIAL_INCOME_EXCEPTIONS.applicationOnly.find((entry) => entry.flag === 'buildingWood')!.flag,
    civ: SPECIAL_INCOME_EXCEPTIONS.applicationOnly.find((entry) => entry.flag === 'buildingWood')!.civ,
    allows: rules.hasMalianBuildingContext,
  },
  {
    flag: SPECIAL_INCOME_EXCEPTIONS.applicationOnly.find((entry) => entry.flag === 'mayanWall')!.flag,
    civ: SPECIAL_INCOME_EXCEPTIONS.applicationOnly.find((entry) => entry.flag === 'mayanWall')!.civ,
    allows: rules.hasMayanWallContext,
  },
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
    romanRowClass(row, scope.civ, scope.romans)?.kind !== 'unhandled' &&
    polishRowAllowed(row, scope.civ, scope.poles) &&
    gurjaraRowAllowed(row, scope.civ, scope.gurjaras) &&
    mapucheRowAllowed(row, scope.civ, scope.mapuche) &&
    chineseRowAllowed(row, scope.civ, scope.chinese) &&
    jurchenRowClass(row, scope.civ, scope.jurchens)?.kind !== 'unhandled' &&
    khmerRowClass(row, scope.civ, scope.khmer)?.kind !== 'unhandled' &&
    (row.tech !== 704 || scope.civ === 'Tatars') &&
    rules.mayanRowAllowed(scope.civ ?? '', row, uniqueMayanTree) &&
    rules.sicilianRowAllowed(scope, row)
  );
}

export const mechanismTeamRowAllowed = (row: EffectRow, scope: Scope, unique: boolean): boolean =>
  civMechanism(scope.civ).teamRowAllowed?.(row, scope, unique) ?? true;
export const mechanismGatherMarkerAllowed = (row: EffectRow, scope: Scope): boolean => !('slavicTree' in row || 'slavicTech' in row) || !!scope.slavs;
