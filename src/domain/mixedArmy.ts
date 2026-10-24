/** Issue 241: finite, conditional reading cards. No mixed-army combat simulation. */
import editorial from '../content/mixed-army.json';
import rules from '../content/mixed-army-rules.json';
import units from '../data/raw/units';
import techs from '../data/raw/techs';
import buildings from '../data/raw/buildings';
import { civs } from '../data';
import { GENERAL_GARRISON_DATA } from './garrisonGeneral';
import { productionBuildings, productionTechAge, productionTechs, type ProductionContext } from './production';

// Keep the reviewed prose intact; finite execution metadata is maintained by the same IDs.
const content = {
  ...editorial,
  defaultScenarioId: rules.defaultScenarioId,
  exampleCardId: rules.exampleCardId,
  confirmationBuildingIds: rules.confirmationBuildingIds,
  unitNameLinks: rules.unitNameLinks,
  scenarios: editorial.scenarios.map((scenario) => {
    const rule = rules.scenarios.find((row) => row.id === scenario.id);
    if (!rule) throw new Error(`Missing mixed-army scenario rules: ${scenario.id}`);
    return { ...scenario, observationProfile: rule.observationProfile, confirmationFormIds: rule.confirmationFormIds };
  }),
  cards: editorial.cards.map((card) => {
    const rule = rules.cards.find((row) => row.id === card.id);
    if (!rule) throw new Error(`Missing mixed-army card rules: ${card.id}`);
    return { ...card, strategy: rule.strategy, conditionalUnits: rule.conditionalUnits };
  }),
};

export const MIXED_ARMY_CONTENT = content;
export const MIXED_ARMY_BUILD = content.build;
export const MIXED_ARMY_URL_LIMIT = 6000;
export const MIXED_ARMY_SCENARIOS = content.scenarios.map((scenario) => scenario.id);
export const MIXED_ARMY_MODES = ['unknown', 'one-v-one-arena', 'one-v-one-other', 'team'] as const;
export const MIXED_ARMY_ENEMIES = [
  'unknown',
  'cavalry',
  'skirmishers',
  'cavalry-skirmishers',
  'wagons',
  'wagons-cannon',
  'wagons-cannon-halberdiers',
  'other',
] as const;
export const MIXED_ARMY_TERRAINS = ['unknown', 'open', 'narrow'] as const;
export const MIXED_ARMY_FORMATIONS = ['unknown', 'grouped', 'spread'] as const;
export const MIXED_ARMY_FLANKS = ['unknown', 'clear', 'blocked'] as const;
export const MIXED_ARMY_POSITIONS = ['unknown', 'safe', 'unsafe'] as const;
export const MIXED_ARMY_FOOD = ['unknown', 'sustainable', 'tight'] as const;
export const MIXED_ARMY_WOOD_GOLD = ['unknown', 'sustainable', 'wood-tight', 'gold-tight', 'both-tight'] as const;
export type MixedScenario = (typeof MIXED_ARMY_SCENARIOS)[number];
export type MixedChoice = number | 'unknown' | 'other';
export interface MixedArmyConfig {
  scenario: MixedScenario;
  civ: string;
  age: number;
  mode: (typeof MIXED_ARMY_MODES)[number];
  ownMain: MixedChoice;
  enemy: (typeof MIXED_ARMY_ENEMIES)[number];
  wagon: MixedChoice;
  cannon: MixedChoice;
  terrain: (typeof MIXED_ARMY_TERRAINS)[number];
  formation: (typeof MIXED_ARMY_FORMATIONS)[number];
  flank: (typeof MIXED_ARMY_FLANKS)[number];
  position: (typeof MIXED_ARMY_POSITIONS)[number];
  retreat: (typeof MIXED_ARMY_POSITIONS)[number];
  food: (typeof MIXED_ARMY_FOOD)[number];
  woodGold: (typeof MIXED_ARMY_WOOD_GOLD)[number];
  completedForms: number[];
  completedUnlockTechIds: number[];
  completedBuildings: number[];
}
export type MixedPrerequisiteStatus = 'conditions-met' | 'civ-unavailable' | 'age-unavailable' | 'missing-prerequisites' | 'unsupported' | 'superseded-shape';
export interface MixedPrerequisiteInput {
  civ: string;
  age: number;
  unitId: number;
  completedForms: readonly number[];
  completedUnlockTechIds: readonly number[];
  completedBuildings: readonly number[];
}
export interface MixedPrerequisiteResult {
  status: MixedPrerequisiteStatus;
  potentialBuildingIds: number[];
  confirmedBuildingIds: number[];
  missingFormIds: number[];
  missingUnlockTechIds: number[];
  missingBuildingAlternatives: number[];
  reasons: string[];
}
export type MixedCard = (typeof content.cards)[number];
export type MixedCardStatus = MixedPrerequisiteStatus | 'needs-observation' | 'conditions-not-met';
export interface MixedCardResult {
  card: MixedCard;
  status: MixedCardStatus;
  reasons: string[];
}
export interface MixedArmyPlan {
  status: 'covered' | 'needs-observation' | 'not-covered' | 'invalid';
  summary: string;
  notices: string[];
  cards: MixedCardResult[];
}
const knownCivs = new Set(civs.map((civ) => civ.en));
const knownUnits = new Set(units.map((unit) => unit.id));
const knownTechs = new Set(techs.map((tech) => tech.id));
const knownBuildings = new Set(buildings.map((building) => building.id));
const supportedUnits = new Set(content.prerequisiteUnitIds);
const has = (values: readonly string[], value: unknown): value is string => typeof value === 'string' && values.includes(value);
const integer = /^(0|[1-9]\d*)$/;
const unique = <T>(values: T[]) => [...new Set(values)];
const enumFields = {
  scenario: MIXED_ARMY_SCENARIOS,
  mode: MIXED_ARMY_MODES,
  enemy: MIXED_ARMY_ENEMIES,
  terrain: MIXED_ARMY_TERRAINS,
  formation: MIXED_ARMY_FORMATIONS,
  flank: MIXED_ARMY_FLANKS,
  position: MIXED_ARMY_POSITIONS,
  retreat: MIXED_ARMY_POSITIONS,
  food: MIXED_ARMY_FOOD,
  woodGold: MIXED_ARMY_WOOD_GOLD,
};
const arrayFields = ['completedForms', 'completedUnlockTechIds', 'completedBuildings'] as const;
const choiceFields = ['ownMain', 'wagon', 'cannon'] as const;
const keys = ['mv', 'build', 'civ', 'age', ...Object.keys(enumFields), ...choiceFields, ...arrayFields];

export function defaultMixedArmyConfig(): MixedArmyConfig {
  return {
    scenario: content.defaultScenarioId,
    civ: 'Britons',
    age: 4,
    mode: 'unknown',
    ownMain: 'unknown',
    enemy: 'unknown',
    wagon: 'unknown',
    cannon: 'unknown',
    terrain: 'unknown',
    formation: 'unknown',
    flank: 'unknown',
    position: 'unknown',
    retreat: 'unknown',
    food: 'unknown',
    woodGold: 'unknown',
    completedForms: [],
    completedUnlockTechIds: [],
    completedBuildings: [],
  };
}
/** 仍为「未知」的观察。只列出当前情境会问到的项，供首屏说明缺什么。 */
export function mixedArmyGaps(config: MixedArmyConfig): string[] {
  const gaps: string[] = [];
  const add = (unknown: boolean, label: string) => {
    if (unknown) gaps.push(label);
  };
  add(config.ownMain === 'unknown', '现有主力准确形态');
  add(config.enemy === 'unknown', '实际敌军组合');
  add(config.mode === 'unknown', '地图与模式');
  if (content.scenarios.find((scenario) => scenario.id === config.scenario)?.observationProfile === 'wagon-cannon') {
    add(config.wagon === 'unknown', '已见胡斯派战车（普通或精锐）');
    if (config.enemy !== 'wagons') add(config.cannon === 'unknown', '已见后排炮（手推炮或榴弹炮）');
  }
  add(config.terrain === 'unknown', '交战地形');
  add(config.formation === 'unknown', '敌方步行目标阵型');
  add(config.flank === 'unknown', '侧向到场与后排空当');
  add(config.position === 'unknown', '己方保护射击位置');
  add(config.retreat === 'unknown', '撤回与替代资源');
  add(config.food === 'unknown', '食物持续能力');
  add(config.woodGold === 'unknown', '木材与黄金持续能力');
  return gaps;
}
/** Structural failures cannot be safely edited as an allegedly restored plan. */
function structureErrors(config: MixedArmyConfig): string[] {
  const errors: string[] = [];
  for (const [key, values] of Object.entries(enumFields)) if (!has(values, config[key as keyof typeof enumFields])) errors.push(`选项 ${key} 无效。`);
  if (typeof config.civ !== 'string' || !config.civ || config.civ.length > 80) errors.push('文明字段无效。');
  if (!Number.isSafeInteger(config.age) || config.age < 0) errors.push('时代格式无效。');
  for (const key of choiceFields) {
    const value = config[key];
    if (value !== 'unknown' && value !== 'other' && (!Number.isSafeInteger(value) || value < 0)) errors.push(`单位字段 ${key} 无效。`);
  }
  for (const key of arrayFields) {
    const values = config[key];
    if (!Array.isArray(values) || values.length > 50 || values.some((id) => !Number.isSafeInteger(id) || id < 0) || unique(values).length !== values.length)
      errors.push(`确认字段 ${key} 有重复、超限或非法 ID。`);
  }
  return errors;
}
/** Known but incompatible choices stay intact so the user can correct them. */
export function mixedArmyInputErrors(config: MixedArmyConfig): string[] {
  const errors = structureErrors(config);
  if (errors.length) return errors;
  if (!knownCivs.has(config.civ)) errors.push('文明不存在，请重新选择；已保留原值。');
  if (config.age < 1 || config.age > 4) errors.push('当前时代必须是黑暗至帝王时代；已保留原值。');
  for (const key of choiceFields)
    if (typeof config[key] === 'number' && !knownUnits.has(config[key] as number)) errors.push(`单位 ${config[key]} 不存在，请修正 ${key}。`);
  if (config.completedForms.some((id) => !knownUnits.has(id))) errors.push('形态确认含未知单位，请移除或修正。');
  if (config.completedUnlockTechIds.some((id) => !knownTechs.has(id))) errors.push('研究确认含未知科技，请移除或修正。');
  if (config.completedBuildings.some((id) => !knownBuildings.has(id))) errors.push('建筑确认含未知建筑，请移除或修正。');
  return errors;
}
export function encodeMixedArmy(config: MixedArmyConfig): string {
  if (structureErrors(config).length) throw new TypeError('混兵情境的结构无效，不能编码。');
  const params = new URLSearchParams({ mv: '1', build: String(MIXED_ARMY_BUILD), civ: config.civ, age: String(config.age) });
  for (const key of Object.keys(enumFields) as (keyof typeof enumFields)[]) params.set(key, config[key]);
  for (const key of choiceFields) params.set(key, String(config[key]));
  for (const key of arrayFields) params.set(key, config[key].join(','));
  const search = params.toString();
  if (search.length > MIXED_ARMY_URL_LIMIT) throw new TypeError('混兵情境链接超过长度上限。');
  return search;
}
export function decodeMixedArmy(search: string): { config: MixedArmyConfig; errors: string[]; locked: boolean } {
  const fail = (message: string) => ({ config: defaultMixedArmyConfig(), errors: [message], locked: true });
  if (!search || search === '?') return { config: defaultMixedArmyConfig(), errors: [], locked: false };
  if (search.length > MIXED_ARMY_URL_LIMIT) return fail('情境链接过长，推导已暂停；请显式重置。');
  try {
    decodeURIComponent(search.replace(/\+/g, ' '));
  } catch {
    return fail('情境链接编码损坏，推导已暂停；请显式重置。');
  }
  const params = new URLSearchParams(search);
  if ([...params.keys()].some((key) => !keys.includes(key)) || keys.some((key) => params.getAll(key).length !== 1))
    return fail('情境链接有缺失、重复或未知参数，推导已暂停；请显式重置。');
  if (params.get('mv') !== '1' || params.get('build') !== String(MIXED_ARMY_BUILD)) return fail('链接版本或游戏数据版本不匹配，推导已暂停；请显式重置。');
  if (!integer.test(params.get('age')!)) return fail('时代编码无效，推导已暂停；请显式重置。');
  const config = { ...defaultMixedArmyConfig(), civ: params.get('civ')!, age: Number(params.get('age'))! };
  for (const [key, values] of Object.entries(enumFields)) {
    if (!has(values, params.get(key))) return fail(`情境选项 ${key} 无效，推导已暂停；请显式重置。`);
    Object.assign(config, { [key]: params.get(key) });
  }
  for (const key of choiceFields) {
    const raw = params.get(key)!;
    if (!integer.test(raw) && raw !== 'unknown' && raw !== 'other') return fail('单位编码无效，推导已暂停；请显式重置。');
    config[key] = raw === 'unknown' || raw === 'other' ? raw : Number(raw);
  }
  for (const key of arrayFields) {
    const raw = params.get(key)!;
    if (raw !== '' && !raw.split(',').every((id) => integer.test(id))) return fail('确认列表编码无效，推导已暂停；请显式重置。');
    config[key] = raw === '' ? [] : raw.split(',').map(Number);
  }
  if (structureErrors(config).length) return fail('确认列表重复、超限或字段损坏，推导已暂停；请显式重置。');
  return { config, errors: mixedArmyInputErrors(config), locked: false };
}

/** Counterfactual only: never writes its technology set to completedUnlockTechIds. */
function potentialBuildings(ctx: ProductionContext, civ: string, age: number, unitId: number): number[] {
  const unit = ctx.core.unitById[unitId];
  if (!unit) return [];
  return productionBuildings(ctx, { civ, age, techs: productionTechs(ctx, { civ, age }).map((tech) => tech.id), walk: 3, farm: 1, rows: [] }, unit);
}
export function mixedFormNeedsConfirmation(ctx: ProductionContext, unitId: number): boolean {
  const unit = ctx.core.unitById[unitId];
  return !!unit?.from_ && !!GENERAL_GARRISON_DATA.unitUpgradeTechs?.[unitId]?.length;
}
function descendsFrom(ctx: ProductionContext, descendant: number, ancestor: number): boolean {
  const visited = new Set<number>();
  let parent = ctx.core.unitById[descendant]?.from_;
  while (parent && !visited.has(parent)) {
    if (parent === ancestor) return true;
    visited.add(parent);
    parent = ctx.core.unitById[parent]?.from_;
  }
  return false;
}
export function mixedUnitPrerequisites(ctx: ProductionContext, input: MixedPrerequisiteInput): MixedPrerequisiteResult {
  const result: MixedPrerequisiteResult = {
    status: 'unsupported',
    potentialBuildingIds: [],
    confirmedBuildingIds: [],
    missingFormIds: [],
    missingUnlockTechIds: [],
    missingBuildingAlternatives: [],
    reasons: [],
  };
  const unit = ctx.core.unitById[input.unitId];
  if (!unit || !supportedUnits.has(input.unitId)) return { ...result, reasons: ['这个具体形态的前置暂未支持，不自动替换为相近单位。'] };
  if (!knownCivs.has(input.civ) || !Number.isInteger(input.age) || input.age < 1 || input.age > 4)
    return { ...result, reasons: ['文明或时代无效，请先修正输入。'] };
  const finalBuildings = potentialBuildings(ctx, input.civ, 4, input.unitId);
  if (
    !unit.civs.includes(input.civ) ||
    !(ctx.trees.t[input.civ] ?? []).some((block) => block[3].some((cell) => cell[2] === 'u' && cell[3] === input.unitId && cell[4] === 1))
  )
    return { ...result, status: 'civ-unavailable', reasons: [`本文明无法训练${unit.zh}。`] };
  if (!finalBuildings.length || (unit.from_ !== null && !mixedFormNeedsConfirmation(ctx, unit.id)))
    return { ...result, reasons: [`${unit.zh}的特殊前置或形态索引尚未可靠核对。`] };
  result.potentialBuildingIds = potentialBuildings(ctx, input.civ, input.age, input.unitId);
  if (!result.potentialBuildingIds.length) return { ...result, status: 'age-unavailable', reasons: [`${unit.zh}在当前时代尚不可用。`] };
  const higher = input.completedForms.find((id) => descendsFrom(ctx, id, unit.id) && potentialBuildings(ctx, input.civ, input.age, id).length > 0);
  if (higher !== undefined)
    return { ...result, status: 'superseded-shape', reasons: [`已确认${ctx.core.unitById[higher]!.zh}完成，${unit.zh}已被升级取代；请调整精确形态。`] };
  if (mixedFormNeedsConfirmation(ctx, unit.id) && !input.completedForms.includes(unit.id)) {
    result.missingFormIds.push(unit.id);
    result.reasons.push(`尚未明确确认${unit.zh}所需形态升级实际完成。`);
  }
  // Audited required unlocks for this finite tool; raw enable commands are not all mandatory prerequisites.
  result.missingUnlockTechIds = ((content.requiredUnlocks as Record<string, number[] | undefined>)[unit.id] ?? []).filter(
    (id) => !input.completedUnlockTechIds.includes(id),
  );
  for (const id of result.missingUnlockTechIds) result.reasons.push(`尚未明确确认${ctx.core.techById[id]!.zh}实际完成；免费获得也需确认。`);
  result.confirmedBuildingIds = result.potentialBuildingIds.filter((id) => input.completedBuildings.includes(id));
  if (!result.confirmedBuildingIds.length) {
    result.missingBuildingAlternatives = [...result.potentialBuildingIds];
    result.reasons.push(
      `尚未确认当前可用的生产建筑：${result.potentialBuildingIds.map((id) => ctx.core.buildingById[id]!.zh).join('或')}（任选合法地点之一）。`,
    );
  }
  return { ...result, status: result.reasons.length ? 'missing-prerequisites' : 'conditions-met' };
}
/** Necessary unit unlocks and card-specific research share one finite confirmation list. */
export function mixedArmyUnlockTechIds(): number[] {
  return unique([...Object.values(content.requiredUnlocks).flat(), ...content.cards.flatMap((card) => card.techIds ?? [])]);
}
/** Stale confirmations are retained and shown, never silently carried into a new civilization/age. */
export function mixedArmyConfirmationErrors(ctx: ProductionContext, config: MixedArmyConfig): string[] {
  const errors: string[] = [];
  for (const id of config.completedForms) {
    const unit = ctx.core.unitById[id];
    if (!unit) continue;
    if (!supportedUnits.has(id) || !mixedFormNeedsConfirmation(ctx, id)) errors.push(`${unit.zh}不属于本页可确认的升级形态，请移除此确认。`);
    else if (!potentialBuildings(ctx, config.civ, config.age, id).length) errors.push(`${unit.zh}的完成确认与当前文明或时代不符，请核对并移除此确认。`);
  }
  for (const id of config.completedUnlockTechIds) {
    const tech = ctx.core.techById[id];
    if (!tech) continue;
    if (!mixedArmyUnlockTechIds().includes(id)) errors.push(`${tech.zh}不是本页收录的必要研究，请移除此确认。`);
    else if (
      !tech.civs.includes(config.civ) ||
      productionTechAge(tech, config.civ) > config.age ||
      !(ctx.trees.t[config.civ] ?? []).some((block) => block[3].some((cell) => cell[2] === 't' && cell[3] === id && cell[4] === 1))
    )
      errors.push(`${tech.zh}的完成确认与当前文明或时代不符，请核对并移除此确认。`);
  }
  for (const id of config.completedBuildings) {
    const building = ctx.core.buildingById[id];
    const availableEarly =
      building && building.age > config.age && ctx.core.units.some((unit) => potentialBuildings(ctx, config.civ, config.age, unit.id).includes(id));
    if (building && (!building.civs.includes(config.civ) || (building.age > config.age && !availableEarly)))
      errors.push(`${building.zh}的建成确认与当前文明或时代不符，请核对并移除此确认。`);
  }
  return unique(errors);
}

export const MIXED_CARD_STATUS_ZH: Record<MixedCardStatus, string> = {
  'conditions-met': '所列前置与观察条件满足',
  'needs-observation': '先补观察',
  'conditions-not-met': '当前条件不符',
  'missing-prerequisites': '需要准备或确认',
  'age-unavailable': '时代未到',
  'civ-unavailable': '文明不可用',
  unsupported: '前置暂未支持',
  'superseded-shape': '形态已被升级取代',
};
function evaluateCard(ctx: ProductionContext, config: MixedArmyConfig, card: MixedCard): MixedCardResult {
  const pending: string[] = [],
    blocked: string[] = [];
  const need = (condition: boolean, message: string) => {
    if (!condition) pending.push(message);
  };
  const observation = (value: string, expected: string, message: string) => {
    if (value === 'unknown') pending.push(`尚未确认：${message}`);
    else if (value !== expected) blocked.push(message);
  };
  const checkFood = () => observation(config.food, 'sustainable', '食物能够持续补兵。');
  const checkWoodGold = (woodOnly = false) => {
    if (config.woodGold === 'unknown') pending.push('尚未确认：所需木材和黄金能否持续投入。');
    else if (config.woodGold !== 'sustainable' && !(woodOnly && config.woodGold === 'gold-tight'))
      blocked.push(woodOnly ? '当前木材持续投入不足。' : '当前木材或黄金持续投入不足。');
  };
  const scenario = content.scenarios.find((row) => row.id === card.scenario)!;
  if (config.age < scenario.age) return { card, status: 'age-unavailable', reasons: ['本情境的帝王路线尚未到时代，只作后续准备阅读。'] };
  const mixedCavalry = config.enemy === 'cavalry-skirmishers';
  const cardUnits = [...card.unitIds, ...card.conditionalUnits.filter((rule) => rule.enemyCompositions.includes(config.enemy)).flatMap((rule) => rule.unitIds)];
  const requirements = unique([...cardUnits, ...(typeof config.ownMain === 'number' ? [config.ownMain] : [])]).map((unitId) =>
    mixedUnitPrerequisites(ctx, { ...config, unitId }),
  );
  const priority: MixedPrerequisiteStatus[] = ['unsupported', 'civ-unavailable', 'age-unavailable', 'superseded-shape', 'missing-prerequisites'];
  const first = priority.find((status) => requirements.some((row) => row.status === status));
  const prerequisiteReasons = requirements.flatMap((row) => row.reasons);
  for (const id of card.techIds ?? [])
    if (!config.completedUnlockTechIds.includes(id)) prerequisiteReasons.push(`尚未明确确认${ctx.core.techById[id]!.zh}实际完成。`);
  need(config.ownMain !== 'unknown', '先确认现有主力的精确形态。');
  need(config.enemy !== 'unknown', '先确认实际敌军主力与掩护。');
  if (['anti-cavalry-screen', 'light-cavalry-access', 'protected-onager'].includes(card.strategy)) {
    const hasCavalry = config.enemy === 'cavalry' || mixedCavalry,
      hasSkirmishers = config.enemy === 'skirmishers' || mixedCavalry;
    if (card.strategy === 'anti-cavalry-screen') {
      if (config.enemy !== 'unknown' && !hasCavalry) blocked.push('当前未记录近战骑兵，防骑前排不能代替清掷矛手的任务。');
      checkFood();
      checkWoodGold(true);
    } else {
      if (config.enemy !== 'unknown' && !hasSkirmishers) blocked.push('当前未记录掷矛手，不把本路线当通用补兵指令。');
      if (card.strategy === 'light-cavalry-access') {
        observation(config.terrain, 'open', '地形允许侧向接近。');
        observation(config.flank, 'clear', '存在无需穿过护军的到场路线。');
        observation(config.retreat, 'safe', '到场后能够安全撤回。');
        checkFood();
      } else {
        observation(config.formation, 'grouped', '目标需要紧密成群；分散目标不套用此范围火力思路。');
        observation(config.position, 'safe', '具有受保护的射击位置。');
        observation(config.retreat, 'safe', '具有可撤回的位置和资源。');
        checkWoodGold();
      }
    }
  } else if (['protected-artillery', 'flank-opening', 'reposition'].includes(card.strategy)) {
    need(config.mode !== 'unknown', '先确认是否为1v1 Arena。');
    need(config.wagon !== 'unknown', '先确认胡斯派战车是普通还是精锐。');
    if (config.enemy !== 'wagons') need(config.cannon !== 'unknown', '先辨认后排是手推炮还是榴弹炮。');
    if (card.strategy !== 'reposition' && config.enemy === 'wagons')
      blocked.push('目前只记录胡斯派战车，未见后排手推炮或榴弹炮；纯胡斯派战车完整应对暂未覆盖。');
    if (card.strategy === 'protected-artillery') {
      observation(config.position, 'safe', '需要受保护的射击位置。');
      observation(config.retreat, 'safe', '需要可撤回的位置和资源。');
      checkWoodGold();
    } else if (card.strategy === 'flank-opening') {
      observation(config.terrain, 'open', '地形允许侧向接近。');
      observation(config.flank, 'clear', '后排暴露且侧向到场路线已查清。');
      observation(config.retreat, 'safe', '侧切后能够撤回。');
      observation(config.position, 'safe', '分兵后主力仍有受保护的位置。');
      checkFood();
    } else {
      observation(config.retreat, 'safe', '先查明能撤回到可继续采集与补兵的位置。');
      if (
        ![config.position, config.flank, config.food, config.woodGold].some((value) =>
          ['unsafe', 'blocked', 'tight', 'wood-tight', 'gold-tight', 'both-tight'].includes(value),
        )
      ) {
        if ([config.position, config.flank, config.food, config.woodGold].includes('unknown'))
          pending.push('正面、通路或持续资源尚未查清，先补观察再决定是否转移。');
        else blocked.push('当前填报未显示必须转移的条件；保留此卡作条件变化时参考。');
      }
    }
  } else return { card, status: 'unsupported', reasons: ['本卡片的条件策略暂未支持。'] };
  const reasons = unique([...prerequisiteReasons, ...pending, ...blocked]);
  return {
    card,
    status:
      first ??
      (prerequisiteReasons.length ? 'missing-prerequisites' : blocked.length ? 'conditions-not-met' : pending.length ? 'needs-observation' : 'conditions-met'),
    reasons,
  };
}
export function planMixedArmy(ctx: ProductionContext, config: MixedArmyConfig): MixedArmyPlan {
  const errors = mixedArmyInputErrors(config);
  if (errors.length) return { status: 'invalid', summary: '输入或确认记录需要修正，保留原选择，暂停路线推导。', notices: errors, cards: [] };
  const scenario = content.scenarios.find((row) => row.id === config.scenario)!;
  const outside: string[] = [];
  if (!scenario.civs.includes(config.civ)) outside.push('本情境暂未整理当前自方文明；保留选择，不表示该文明没有应对方法。');
  if (config.ownMain === 'other' || (typeof config.ownMain === 'number' && !scenario.ownMainUnitIds.includes(config.ownMain)))
    outside.push('当前主力形态不在本情境收录范围，不自动替换为相近兵种。');
  if (config.enemy === 'other' || (config.enemy !== 'unknown' && !scenario.enemyCompositions.includes(config.enemy)))
    outside.push('实际敌军组合暂未收录；额外攻城、僧侣或其他护军不能当作不存在。');
  if (scenario.observationProfile === 'wagon-cannon') {
    if (config.mode !== 'unknown' && config.mode !== 'one-v-one-arena') outside.push('本情境只整理1v1 Arena，其他模式暂未覆盖。');
    if (config.wagon === 'other' || (typeof config.wagon === 'number' && !(scenario.enemyMainUnitIds ?? []).includes(config.wagon)))
      outside.push('这种胡斯派战车暂未覆盖，请保留观察或修正。');
    if (config.cannon === 'other' || (typeof config.cannon === 'number' && !(scenario.enemyCannonUnitIds ?? []).includes(config.cannon)))
      outside.push('这种后排炮暂未覆盖，请保留观察或修正。');
  }
  const confirmationErrors = mixedArmyConfirmationErrors(ctx, config);
  if (outside.length)
    return { status: 'not-covered', summary: '暂未覆盖这组输入。', notices: [...outside, ...confirmationErrors, scenario.notCovered], cards: [] };
  if (confirmationErrors.length)
    return { status: 'invalid', summary: '输入或确认记录需要修正，保留原选择，暂停路线推导。', notices: confirmationErrors, cards: [] };
  const cards = content.cards.filter((card) => card.scenario === config.scenario).map((card) => evaluateCard(ctx, config, card));
  const unknown =
    config.ownMain === 'unknown' ||
    config.enemy === 'unknown' ||
    (scenario.observationProfile === 'wagon-cannon' &&
      (config.mode === 'unknown' || config.wagon === 'unknown' || (config.enemy !== 'wagons' && config.cannon === 'unknown')));
  const single = ['cavalry', 'skirmishers', 'wagons'].includes(config.enemy);
  return {
    status: unknown ? 'needs-observation' : 'covered',
    summary: unknown ? '关键信息仍未知，先补查主力、掩护与适用条件。' : single ? scenario.singleThreatNote : scenario.mixedThreatNote,
    notices: [scenario.notCovered, '所列前置满足仅表示固定数据与本人确认记录相符；不认证资源、人口、兵力、微操或战斗结果。'],
    cards,
  };
}
