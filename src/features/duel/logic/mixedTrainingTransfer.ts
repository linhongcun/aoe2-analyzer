import { DAT, toEffects } from '../../../domain/datEffects';
import { TEAM_BONUSES } from '../../../domain/effects';
import type { MixedSideInput } from '../../../domain/mixedDuelParams';
import { PRODUCTION_UNLOCK_TECH_IDS, productionBuildings, type ProductionContext } from '../../../domain/production';
import type { ProductionTransferNotice } from '../../../domain/productionTransfer';
import { emptyTrainTotal, encodeTrainTotal, evaluateTrainTotal } from '../../../domain/trainTotal';
import { isUnitCostAttribute } from '../../../domain/unitCost';
import type { MixedFieldError, MixedSideView } from './mixedDuel';

type MixedNotice = Extract<ProductionTransferNotice, { source: 'mixed-duel' }>;
export type MixedTrainingTransfer = { errors: MixedFieldError[] } | { to: string; notice: MixedNotice };

const unlockIds: readonly number[] = PRODUCTION_UNLOCK_TECH_IDS;
// The fixed effect table also records these combat attributes in its eco section.
const combatAttributes = new Set([10, 22, 24, 102, 107, 108, 109]);

export function mixedTrainingTransfer(context: ProductionContext, input: MixedSideInput, side: 'a' | 'b', view: MixedSideView): MixedTrainingTransfer {
  if (!view.army) return { errors: view.errors };
  const age = Number(input.age);
  const ids = input.techs.map(Number);
  const units = view.army.map(({ uid }) => context.core.unitById[uid]!);
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
    if (data?.id !== id || data.eco.some((effect) => effect.res !== undefined || (isUnitCostAttribute(effect.a) && !effect.t?.length))) {
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
      data.eco.some((effect) => {
        if (isUnitCostAttribute(effect.a) || (effect.a !== undefined && combatAttributes.has(effect.a))) return false;
        // Building work rate affects throughput, not the unit price.
        return effect.a !== 13 || !effect.t?.length || !effect.t.every((target) => context.core.buildingById[target]);
      }) || data.rules.some((rule) => toEffects(rule.fx).length !== rule.fx.length);
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
  for (const id of input.team.map(Number)) {
    const [civ, name] = TEAM_BONUSES[id]!;
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
