import { DAT, toEffects, type DatEco } from '../../../domain/datEffects';
import { TEAM_BONUSES } from '../../../domain/effects';
import { NON_PRICING_RESOURCE_SET } from '../../../domain/gameIds';
import type { MixedSideInput } from '../../../domain/mixedDuelParams';
import { PRODUCTION_UNLOCK_TECH_IDS, freeProductionTechs, productionBuildings, type ProductionContext } from '../../../domain/production';
import type { ProductionTransferNotice } from '../../../domain/productionTransfer';
import { emptyTrainTotal, encodeTrainTotal, evaluateTrainTotal } from '../../../domain/trainTotal';
import type { Unit } from '../../../domain/types';
import { isUnitCostAttribute } from '../../../domain/unitCost';
import type { MixedFieldError, MixedSideView } from './mixedDuel';

type MixedNotice = Extract<ProductionTransferNotice, { source: 'mixed-duel' }>;
export type MixedTrainingTransfer = { errors: MixedFieldError[] } | { to: string; notice: MixedNotice };

const unlockIds: readonly number[] = PRODUCTION_UNLOCK_TECH_IDS;
// Pinned .dat (empires2_x2_p1.dat, DE Update 188329) + UGC Guide combat attributes in eco:
// 10 monk faith recharge, 22 blast width, 24 bonus damage resistance,
// 59-62 charge attack (max charge / recharge rate / charge event / charge type),
// 63 Combat Ability (type_50.break_off_combat bitfield), 102/107 projectiles, 108 garrison heal, 109 HP regen,
// 118 melee damage reflection.
const combatAttributes = new Set([10, 22, 24, 59, 60, 61, 62, 63, 102, 107, 108, 109, 118]);
// Pinned .dat + UGC Guide non-pricing operational attributes:
// 13 Work Rate (bird.work_rate: pack/unpack, heal, gather, trade, building train/research speed),
// 14 Carry Capacity (unit.resource_capacity),
// 110 Population Space (unit.resource_storages[type=4]; does not alter unit training price or unlock).
const nonPricingAttributes = new Set([13, 14, 110]);
export function hasUnsupportedTransferResourceOrCost(eco: readonly DatEco[]): boolean {
  return eco.some((effect) => (effect.res !== undefined && !NON_PRICING_RESOURCE_SET.has(effect.res)) || (isUnitCostAttribute(effect.a) && !effect.t?.length));
}

export function isUnclassifiedTransferEcoEffect(
  effect: DatEco,
  armyUnitIds: ReadonlySet<number>,
  unitById: Readonly<Record<number, Unit | undefined>>,
): boolean {
  if (effect.res !== undefined) return !NON_PRICING_RESOURCE_SET.has(effect.res);
  if (isUnitCostAttribute(effect.a)) return !effect.t?.length;
  if (effect.a !== undefined && (combatAttributes.has(effect.a) || nonPricingAttributes.has(effect.a))) return false;
  // Attribute effects whose explicit catalog unit targets are all outside this side's army cannot alter its training price.
  if (effect.a !== undefined && effect.t?.length && effect.t.every((target) => Boolean(unitById[target]) && !armyUnitIds.has(target))) return false;
  return true;
}

export function mixedTrainingTransfer(context: ProductionContext, input: MixedSideInput, side: 'a' | 'b', view: MixedSideView): MixedTrainingTransfer {
  if (!view.army) return { errors: view.errors };
  const age = Number(input.age);
  const ids = input.techs.map(Number);
  const units = view.army.map(({ uid }) => context.core.unitById[uid]!);
  const armyUnitIds = new Set(units.map((unit) => unit.id));
  const rows = view.army.map(({ uid }, index) => ({ unit: uid, qty: input.rows[index]!.qty }));
  const errors: MixedFieldError[] = [];
  const pricing: number[] = [];
  const unlocks: number[] = [];
  const omitted: string[] = [];
  const fail = (field: string, message: string) => errors.push({ field: `mix-${side}-${field}`, message });
  const setup = { civ: input.civ, age, techs: ids, walk: 0, farm: 0, rows: [] };
  for (const id of ids) {
    const tech = context.core.techById[id]!;
    const data = DAT.techs[tech.en];
    if (data?.id !== id || hasUnsupportedTransferResourceOrCost(data.eco)) {
      fail('techs', `${tech.zh}的条件无法完整换算为训练计价。`);
      continue;
    }
    const priceEffect = data.eco.some((effect) => isUnitCostAttribute(effect.a) && units.some((unit) => effect.t?.includes(unit.id)));
    const unlock =
      unlockIds.includes(id) &&
      units.some((unit) => {
        const withTech = productionBuildings(context, setup, unit);
        const withoutTech = productionBuildings(context, { ...setup, techs: ids.filter((other) => other !== id) }, unit);
        return withTech.length > 0 && withoutTech.length === 0;
      });
    const unclassifiedEffect =
      data.eco.some((effect) => isUnclassifiedTransferEcoEffect(effect, armyUnitIds, context.core.unitById)) ||
      data.rules.some((rule) => toEffects(rule.fx).length !== rule.fx.length);
    if (unclassifiedEffect) {
      fail('techs', `${tech.zh}有尚未核实的训练条件。`);
    } else if (priceEffect || unlock) {
      if (priceEffect) pricing.push(id);
      if (unlock) unlocks.push(id);
    } else if (data.rules.length || data.eco.length || tech.en === 'Ballistics' || unlockIds.includes(id)) {
      const combatOnly =
        tech.en === 'Ballistics' || (data.rules.length && !data.eco.length && data.rules.every((rule) => rule.fx.every((effect) => effect.s !== 'bt')));
      omitted.push(`${tech.zh}（${combatOnly ? '仅影响战斗' : '不改变本方训练单价或解锁'}）`);
    } else {
      fail('techs', `${tech.zh}有尚未核实的训练条件。`);
    }
  }
  for (const id of new Set(input.team.map(Number))) {
    const [civ, name] = TEAM_BONUSES[id]!;
    if (civ === input.civ) continue;
    const data = DAT.civs[civ]?.team;
    if (
      !data?.combat ||
      !data.rules.length ||
      data.eco.length ||
      data.rules.some((rule) => toEffects(rule.fx).length !== rule.fx.length || rule.fx.some((effect) => effect.s === 'bt'))
    ) {
      fail('team', `${name}的团队条件无法完整带入训练总价。`);
    } else {
      omitted.push(`${name}（仅影响战斗）`);
    }
  }
  if (errors.length) return { errors };

  // Issue 1468: 按数据驱动规则自动补齐合法阵容在当前文明与时代下可用且非免费的训练解锁前置（如化学 47、无政府 16、掠夺者 483）。
  const freeUnlocks = freeProductionTechs(context, { civ: input.civ, age });
  for (const unit of units) {
    const currentTechs = [...pricing, ...unlocks];
    if (productionBuildings(context, { ...setup, techs: currentTechs }, unit).length > 0) continue;
    for (const id of unlockIds) {
      if (freeUnlocks.has(id) || unlocks.includes(id)) continue;
      if (productionBuildings(context, { ...setup, techs: [...currentTechs, id] }, unit).length > 0) {
        unlocks.push(id);
        break;
      }
    }
  }

  const config = { ...emptyTrainTotal(input.civ, age), rows, techs: [...new Set([...pricing, ...unlocks])] };
  const result = evaluateTrainTotal(context, config);
  for (const message of result.blocked) fail('rows', message);
  for (const [index, line] of result.lines.entries()) {
    if (line.status !== 'ok') fail(line.status === 'badqty' ? `qty-${index}` : `unit-${index}`, line.summary);
    for (const problem of line.pricingProblems ?? []) fail(`unit-${index}`, `第 ${index + 1} 行（${line.unit?.zh}）：${problem}`);
  }
  for (const tech of result.techs) {
    if (tech.selected && tech.invalidReason) fail('techs', tech.invalidReason);
    else if (tech.selected && (!tech.supported || (pricing.includes(tech.id) && !tech.appliedSomewhere))) fail('techs', `${tech.zh}无法完整计入本方单价。`);
  }
  if (!errors.length && (result.incomplete || result.validCount !== rows.length)) fail('rows', '本方存在无法完整核算的训练条件。');
  if (errors.length) return { errors };
  const search = '?' + encodeTrainTotal(config);
  return {
    to: '/production' + search,
    notice: {
      source: 'mixed-duel',
      side,
      civ: input.civ,
      age,
      count: rows.length,
      search,
      pricing: result.techs.filter((tech) => tech.selected && tech.appliedSomewhere).map(({ zh }) => zh),
      unlocks: result.techs.filter((tech) => tech.panel === 'unlock' && tech.selected).map(({ zh }) => zh),
      omitted,
    },
  };
}
