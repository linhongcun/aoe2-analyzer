import { civByEn } from '../data';
import { ARMY_RESEARCH, type ArmyResearchData } from '../data/armyResearch';
import {
  ARMY_RES,
  addArmyCost,
  armyResearchIndex,
  civConditionalDisablers,
  evalConditionNode,
  globalRegionalDisabled,
  hasDecimalCost,
  isUnreachableCountNode,
  isUnreachableHiddenNode,
  researchKey,
  researchPrice,
  type ArmyResearchPrice,
} from './armyResearchRules';
import { militaryTechAge, trainingUnitAge } from './availabilityAge';
import { AGE_BY_TECH, NON_PRICING_RESOURCE_SET } from './gameIds';
import { productionBuildings, PRODUCTION_UNLOCK_TECH_IDS, type ProductionContext } from './production';
import { makeSimContext, simTechs, civStatus } from './simulator';
import type { Cost, Unit } from './types';
import { applicableTrainingTechs } from './duelTrainingCost';
import { unitCost } from './unitCost';
import { priceAge } from './costDiscount';
import { DAT } from './datEffects';
import { resistDelta, DEVOTION_ID, FAITH_ID } from './conversion';
import { batchesForQty, deliveredQty, unitTrainCount } from './trainBatch';

import type { ArmyCostConfig } from './armyCostConfig';
export { emptyArmyCost } from './armyCostConfig';
export type { ArmyCostConfig } from './armyCostConfig';
export { ARMY_RES, addArmyCost, hasDecimalCost, researchKey, researchPrice };
export type { ArmyResearchPrice };
export const researchId = (key: string): number | null =>
  /^t:(0|[1-9]\d*)$/.test(key) && Number.isSafeInteger(Number(key.slice(2))) ? Number(key.slice(2)) : null;
interface Closure {
  ids: Set<number>;
  error: string;
  state: 'ready' | 'unavailable' | 'unknown';
}
const fail = (error: string, state: Closure['state'] = 'unknown'): Closure => ({ ids: new Set(), error, state });
const ok = (ids = new Set<number>()): Closure => ({ ids, error: '', state: 'ready' });

/** Count refers to distinct conditions, while identical or larger paid sets add no alternative investment. */
function requiredPaidSet(branches: Closure[], needed: number): Closure {
  if (!needed) return ok();
  if (branches.some((b) => b.state === 'unknown')) return fail('替代前置中存在未核实条件，无法确定必要研究');
  const viable = branches.filter((b) => b.state === 'ready');
  if (viable.length < needed) return fail('尚未满足所需前置条件', 'unavailable');
  const combinations: Set<number>[] = [];
  const choose = (start: number, left: number, ids: Set<number>) => {
    if (!left) return void combinations.push(ids);
    for (let i = start; i <= viable.length - left; i++) choose(i + 1, left - 1, new Set([...ids, ...viable[i]!.ids]));
  };
  choose(0, needed, new Set());
  const unique = [...new Map(combinations.map((s) => [[...s].sort((a, b) => a - b).join(','), s])).values()];
  const minimal = unique.filter((s) => !unique.some((t) => t.size < s.size && [...t].every((id) => s.has(id))));
  return minimal.length === 1 ? ok(minimal[0]) : fail('存在替代前置，尚不能唯一确定');
}

/** Complete count-of prerequisites. Ambiguous alternative paid paths are not selected for the player. */
export function researchResolver(data: ArmyResearchData, civ: string, age: number, completed: ReadonlySet<number> = new Set()) {
  const context = data.civs[civ];
  const globalDisabled = globalRegionalDisabled(data);
  const disablers = civConditionalDisablers(data, context);
  const memo = new Map<number, Closure>();
  let revision = completed.size;
  const available = (id: number) => {
    const n = data.nodes[id];
    if (!context || !n || (n.civ >= 0 && n.civ !== context.id) || context.disabled.includes(id)) return false;
    return !globalDisabled.has(id) || !!context.enabled?.includes(id);
  };
  const resolve = (id: number, stack = new Set<number>()): Closure => {
    if (revision !== completed.size) {
      memo.clear();
      revision = completed.size;
    }
    if (memo.has(id)) return memo.get(id)!;
    if (!data.nodes[id] || !context) return fail(`研究 t:${id} 身份或文明未知`);
    if (!available(id)) return fail(`研究 t:${id} 在本文明不可用`, 'unavailable');
    if (AGE_BY_TECH[id]) return AGE_BY_TECH[id]! <= age ? ok() : fail('尚未到达所需时代', 'unavailable');
    if (stack.has(id)) return fail(`研究 t:${id} 的前置有循环，未核实`);
    const node = data.nodes[id]!;
    // Construction is a context prerequisite only; no building/age expenditure is charged.
    if (data.buildingTechs.includes(id)) return ok();
    const next = new Set(stack).add(id);
    const branches = node.requires.map((pre) => resolve(pre, next));
    const satisfied = branches.filter((b) => b.state === 'ready' && [...b.ids].every((tid) => completed.has(tid))).length;
    // Hidden non-free start-age/scenario placeholders and dead count>requires nodes never trigger in standard RM.
    let result =
      isUnreachableHiddenNode(node) || isUnreachableCountNode(data, id, node)
        ? fail(`研究 t:${id} 在标准对局中不可触发`, 'unavailable')
        : node.location <= 0 && (node.time > 0 || node.cost.some(([, v, enabled]) => enabled && v! > 0))
          ? fail(`研究 t:${id} 的外部触发条件尚未核实`)
          : node.count > node.requires.length
            ? completed.has(id)
              ? ok()
              : fail(`研究 t:${id} 的外部触发条件尚未核实`)
            : requiredPaidSet(
                branches
                  .filter((b) => b.state !== 'ready' || [...b.ids].some((tid) => !completed.has(tid)))
                  .map((b) => ({ ...b, ids: new Set([...b.ids].filter((tid) => !completed.has(tid))) })),
                Math.max(0, node.count - satisfied),
              );
    if (!result.error && node.location > 0) {
      const before = new Set([...completed, ...result.ids]);
      const disabledByCond = (disablers.get(id) ?? []).some((dtid) => evalConditionNode(data, context, age, id, before, before, dtid) === true);
      result = disabledByCond ? fail(`研究 t:${id} 在本文明被条件效果禁用`, 'unavailable') : ok(new Set([...result.ids, id]));
    }
    memo.set(id, result);
    return result;
  };
  return { available, resolve };
}

export interface ResearchEntry {
  key: string;
  id: number | null;
  name: string;
  reason: string;
  beneficiaries: number[];
  status: 'done' | 'inferred-done' | 'free' | 'planned' | 'invalid';
  manual: boolean;
  cost: Cost | null;
  sources: string[];
  origins: { kind: 'done' | 'target' | 'shape' | 'prerequisite'; key: string; row?: number }[];
  quote?: ArmyResearchPrice;
  problem?: 'identity' | 'price';
}
export interface ArmyCostResult {
  blocked: string[];
  ledger: ResearchEntry[];
  training: { lines: ArmyTrainingLine[]; incomplete: boolean };
  researchTotal: Cost;
  trainingTotal: Cost;
  total: Cost;
  partial: boolean;
  hasValue: boolean;
}
export interface ArmyTrainingLine {
  unit: Unit | null;
  trainCount: number;
  qtyValue: number | null;
  billedBatches: number | null;
  deliveredQty: number | null;
  status: 'ok' | 'pending' | 'badqty' | 'unavail';
  cost: Cost | null;
  subtotal: Cost | null;
  reason: string;
  /** 已按可解码条目计入但另含未解码资源或条件效果的估算科技名列表（去重）。 */
  estimatedTechs: string[];
}
function productionShell(civ: string, age: number, techs: number[] = []) {
  return { civ, age, techs, rows: [], walk: 0, farm: 0 };
}
function unitUnlocks(ctx: ProductionContext, civ: string, age: number, unit: Unit): number[] {
  if (productionBuildings(ctx, productionShell(civ, age), unit).length) return [];
  return PRODUCTION_UNLOCK_TECH_IDS.filter((id) => productionBuildings(ctx, productionShell(civ, age, [id]), unit).length);
}

function scopedTechs(sim: ReturnType<typeof makeSimContext>, civ: string, age: number) {
  const tree = civStatus(sim.trees, civ);
  return sim.techs.filter((t) => !AGE_BY_TECH[t.id] && militaryTechAge(civ, t.id, t.age) <= age && t.civs.includes(civ) && tree['t' + t.id]);
}

/** Unit-scoped combat mechanics, including text-only projectile effects; no production speed. */
function armyCombatResearch(sim: ReturnType<typeof makeSimContext>, u: Unit, civ: string, age: number, data = ARMY_RESEARCH) {
  const numeric = new Map(simTechs(sim, u, civ).map((entry) => [entry.t.id, entry.ef]));
  return scopedTechs(sim, civ, age)
    .filter(
      (t) =>
        numeric.get(t.id)?.some((e) => e.s !== 'bt') ||
        data.nodes[t.id]?.combatUnits.includes(u.id) ||
        ([DEVOTION_ID, FAITH_ID].includes(t.id) && resistDelta(DAT.techs[t.en]) !== null) ||
        (DAT.techs[t.en] &&
          resistDelta({ ...DAT.techs[t.en]!, rules: [], eco: DAT.techs[t.en]!.eco.filter((e) => e.res === 178 || e.res === 179) }) !== null) ||
        DAT.techs[t.en]?.eco.some(
          (e) =>
            // Global conversion resistance/death, and monk conversion permissions/group faith.
            e.res !== undefined && (e.res === 192 || (u.cls.includes(25) && [27, 28, 29, 193].includes(e.res))),
        ),
    )
    .map((t) => ({ t, ef: numeric.get(t.id) ?? null }));
}

/** Unit-scoped population-space mechanics (attribute 110); separate from combat and production speed. */
function armyPopulationResearch(sim: ReturnType<typeof makeSimContext>, u: Unit, civ: string, age: number, data = ARMY_RESEARCH) {
  return scopedTechs(sim, civ, age).filter((t) => data.nodes[t.id]?.populationUnits?.includes(u.id));
}

export function armyResearchChoices(ctx: ProductionContext, config: ArmyCostConfig, includeUnverified = true, data = ARMY_RESEARCH): number[] {
  const sim = makeSimContext(ctx.core.techs, ctx.trees);
  const age = Number(config.age);
  const resolver = researchResolver(data, config.civ, age);
  const { upgradesByUnit } = armyResearchIndex(data);
  const ids = new Set<number>();
  for (const row of config.rows) {
    const u = ctx.core.unitById[row.unit];
    if (!u || !u.civs.includes(config.civ)) continue;
    for (const { t } of armyCombatResearch(sim, u, config.civ, age, data)) ids.add(t.id);
    for (const t of armyPopulationResearch(sim, u, config.civ, age, data)) ids.add(t.id);
    for (const { tech } of applicableTrainingTechs(sim, u, config.civ, age)) ids.add(tech.id);
    for (const id of unitUnlocks(ctx, config.civ, age, u)) ids.add(id);
    // A form upgrade may also be an explicit target, in addition to automatic inference.
    for (const tid of upgradesByUnit.get(u.id) ?? []) {
      if (resolver.available(tid) && resolver.resolve(tid).state !== 'unavailable') ids.add(tid);
    }
  }
  // Unresolved unique abilities stay visible as unverified instead of silently disappearing.
  if (includeUnverified)
    for (const t of ctx.core.techs.filter((t) => t.type === 'UniqueTech' && t.civs.includes(config.civ) && t.age <= Number(config.age))) {
      const effects = DAT.techs[t.en];
      const pureProduction =
        effects && !effects.rules.length && effects.eco.length > 0 && effects.eco.every((e) => e.a !== undefined && [13, 14, 101].includes(e.a));
      if (!pureProduction) ids.add(t.id);
    }
  return [...ids];
}

export function evaluateArmyCost(ctx: ProductionContext, config: ArmyCostConfig, data = ARMY_RESEARCH): ArmyCostResult {
  const age = Number(config.age);
  const blocked: string[] = [];
  if (!civByEn(config.civ) || !data.civs[config.civ]) blocked.push('文明无效，请重新选择；原方案已保留。');
  if (!/^[1-4]$/.test(config.age)) blocked.push('时代无效，请重新选择；原方案已保留。');
  const ledger = new Map<string, ResearchEntry>();
  const all = new Set<number>();
  const completed = new Set<number>();
  const resolver = researchResolver(data, config.civ, age, completed);
  const manualDone = new Set(config.done);
  const badRows = new Map<number, string>();
  // Removing the last row retains a legitimate research-only intention.
  const targetScope = config.targets.length
    ? new Set(
        armyResearchChoices(
          ctx,
          {
            ...config,
            rows: config.rows.length
              ? config.rows
              : ctx.core.units
                  .filter((u) => u.civs.includes(config.civ) && trainingUnitAge(config.civ, u.id, u.age) <= age)
                  .map((u) => ({ unit: u.id, qty: '1' })),
          },
          false,
          data,
        ),
      )
    : new Set<number>();
  const ensure = (id: number): ResearchEntry => {
    const key = researchKey(id);
    let entry = ledger.get(key);
    if (!entry) {
      entry = {
        id,
        key,
        name: data.nodes[id]?.name ?? ctx.core.techById[id]?.zh ?? `未识别研究 ${key}`,
        reason: '',
        beneficiaries: [],
        status: 'planned',
        manual: false,
        cost: null,
        sources: [],
        origins: [],
      };
      ledger.set(key, entry);
    }
    return entry;
  };
  const request = (key: string, done: boolean, row?: number) => {
    const id = researchId(key);
    const entry =
      id === null
        ? {
            key,
            id: null,
            name: `未识别研究 ${key}`,
            reason: '研究身份无法解析',
            beneficiaries: [],
            status: 'invalid' as const,
            manual: true,
            cost: null,
            sources: [],
            origins: [],
          }
        : ensure(id);
    ledger.set(key, entry);
    const origin: ResearchEntry['origins'][number] = {
      kind: done ? 'done' : row === undefined ? 'target' : 'shape',
      key,
      ...(row === undefined ? {} : { row }),
    };
    const noteOrigin = (e: ResearchEntry, reason = origin) => {
      if (!e.origins.some((o) => o.kind === reason.kind && o.key === reason.key && o.row === reason.row)) e.origins.push(reason);
    };
    noteOrigin(entry);
    if (row === undefined) entry.manual = true;
    if (row !== undefined && !entry.beneficiaries.includes(row)) entry.beneficiaries.push(row);
    const outsideScope = !done && row === undefined && id !== null && !targetScope.has(id);
    const closure =
      id === null ? fail('研究身份无法解析') : outsideScope ? fail('不属于当前阵容的战斗、训练费用、人口空间或形态研究；未计入') : resolver.resolve(id);
    if (closure.error || !data.nodes[id!]?.name) {
      entry.status = 'invalid';
      entry.problem = 'identity';
      entry.reason = closure.error || '研究身份缺少已核实的对应关系';
      if (row !== undefined) badRows.set(row, entry.reason);
      return;
    }
    for (const tid of closure.ids) {
      all.add(tid);
      const e = ensure(tid);
      noteOrigin(e, tid === id ? origin : { ...origin, kind: 'prerequisite' });
      if (row !== undefined && !e.beneficiaries.includes(row)) e.beneficiaries.push(row);
      if (done) {
        completed.add(tid);
        e.status = manualDone.has(e.key) ? 'done' : 'inferred-done';
      }
    }
    if (!closure.ids.has(id!) && entry.status !== 'invalid') {
      entry.status = 'free';
      entry.reason = '条件满足的自动动作，无独立研究支出';
      entry.cost = {};
    }
  };
  if (!blocked.length) {
    for (const key of config.done) request(key, true);
    for (const key of config.targets) request(key, false);
    const { enablesByUnit, upgradesByUnit } = armyResearchIndex(data);
    config.rows.forEach((row, index) => {
      const unit = ctx.core.unitById[row.unit];
      if (!unit) return;
      for (const id of unitUnlocks(ctx, config.civ, age, unit)) request(researchKey(id), false, index);
      const visited = new Set<number>();
      const shape = (u: Unit) => {
        if (visited.has(u.id)) {
          badRows.set(index, '单位升级形态有循环，未核实');
          return;
        }
        visited.add(u.id);
        const enabling = (enablesByUnit.get(u.id) ?? []).filter((tid) => resolver.available(tid) && !isUnreachableCountNode(data, tid, data.nodes[tid]!));
        if (enabling.length) {
          const paths = enabling.map((tid) => resolver.resolve(tid));
          const possible = paths.filter((p) => !p.error);
          // An already satisfied enabling path makes extra paid alternatives unnecessary.
          const necessary = possible.find((p) => possible.every((other) => [...p.ids].every((id) => other.ids.has(id))));
          if (!necessary || (necessary.ids.size > 0 && paths.some((p) => p.state === 'unknown')))
            badRows.set(index, paths.find((p) => p.error)?.error ?? '单位启用条件存在未核实的替代路径');
          else for (const id of necessary.ids) request(researchKey(id), false, index);
        }
        if (u.from_) {
          const candidates = (upgradesByUnit.get(u.id) ?? []).filter((tid) => resolver.available(tid) && resolver.resolve(tid).state !== 'unavailable');
          if (candidates.length !== 1) {
            badRows.set(index, '单位升级研究身份未能唯一核实');
            return;
          }
          request(researchKey(candidates[0]!), false, index);
          const parent = ctx.core.unitById[u.from_];
          if (parent) shape(parent);
          else badRows.set(index, '前置单位形态未知');
        }
      };
      shape(unit);
    });
  }
  const researchTotal: Cost = {};
  for (const entry of ledger.values()) {
    if (entry.status === 'invalid' || entry.id === null || !all.has(entry.id)) continue;
    if (completed.has(entry.id)) {
      entry.cost = {};
      entry.quote = researchPrice(data, config.civ, age, entry.id, completed, new Set([...completed].filter((id) => id !== entry.id)));
      continue;
    }
    const before = new Set([...completed, ...resolver.resolve(entry.id).ids]);
    before.delete(entry.id);
    const price = researchPrice(data, config.civ, age, entry.id, all, before);
    entry.quote = price;
    entry.sources = price.sources;
    entry.cost = price.cost;
    if (!price.cost) {
      entry.status = 'invalid';
      entry.problem = 'price';
      entry.reason = price.reason;
    } else {
      entry.status = price.free ? 'free' : 'planned';
      entry.reason = price.free ? '免费自动完成' : price.zero ? '零费用，仍需完成研究' : entry.manual ? '本次手动目标' : '目标形态或研究的必要前置';
    }
  }
  // Unverified predecessors invalidate the dependent action, never just its price component.
  for (const entry of ledger.values()) {
    if (entry.id === null || ['invalid', 'done', 'inferred-done'].includes(entry.status)) continue;
    const closure = resolver.resolve(entry.id);
    if ([...closure.ids].some((id) => ledger.get(researchKey(id))?.status === 'invalid')) {
      entry.status = 'invalid';
      entry.problem = 'price';
      entry.cost = null;
      entry.reason = '必要前置尚未核实，未计入';
    }
  }
  for (const entry of ledger.values())
    if (entry.status === 'invalid' && entry.problem !== 'price') for (const index of entry.beneficiaries) badRows.set(index, entry.reason);
  const activeTechs = [...all].filter((id) => ledger.get(researchKey(id))?.problem !== 'identity');
  const training: ArmyCostResult['training'] = {
    incomplete: false,
    lines: config.rows.map((row) => {
      const unit = ctx.core.unitById[row.unit] ?? null;
      const qtyValue = /^\d+$/.test(row.qty) && +row.qty >= 1 && +row.qty <= 1000 ? +row.qty : null;
      const base = {
        unit,
        trainCount: unitTrainCount(unit),
        qtyValue,
        billedBatches: null,
        deliveredQty: null,
        cost: null,
        subtotal: null,
        estimatedTechs: [] as string[],
      };
      if (blocked.length) return { ...base, status: 'unavail', reason: '文明或时代无效，原行已保留' };
      if (!unit) return { ...base, status: 'pending', reason: row.unit ? '无法识别单位形态，原行已保留' : '请选择兵种形态' };
      if (!productionBuildings(ctx, productionShell(config.civ, age, activeTechs), unit).length)
        return { ...base, status: 'unavail', reason: '当前文明、时代或必要解锁条件下不可训练' };
      if (qtyValue === null) return { ...base, status: 'badqty', reason: '新增训练数量须为1–1000的正整数，未计入本行训练费' };
      return { ...base, status: 'ok', reason: '' };
    }),
  };
  const trainingTotal: Cost = {};
  const sim = makeSimContext(ctx.core.techs, ctx.trees);
  for (const [index, line] of training.lines.entries()) {
    const unit = line.unit;
    const related = unit
      ? new Set([
          ...armyCombatResearch(sim, unit, config.civ, age, data).map((x) => x.t.id),
          ...armyPopulationResearch(sim, unit, config.civ, age, data).map((t) => t.id),
          ...applicableTrainingTechs(sim, unit, config.civ, age).map((x) => x.tech.id),
        ])
      : new Set<number>();
    for (const entry of ledger.values())
      if (entry.id !== null && related.has(entry.id) && !entry.beneficiaries.includes(index)) entry.beneficiaries.push(index);
    const unknownSelected = [...ledger.values()].some(
      (e) => e.status === 'invalid' && e.problem !== 'price' && (e.id === null || !data.nodes[e.id] || related.has(e.id!)),
    );
    if (unknownSelected) badRows.set(index, '所选研究或其效果未核实，不能确认目标状态单价');
    if (unit && line.status === 'ok' && !badRows.has(index)) {
      // Unlocks/combat actions may contain unrelated resource markers. Only unit-targeted
      // training-cost research belongs in unitCost; unknown cost effects remain blocked there.
      const techs = applicableTrainingTechs(sim, unit, config.civ, age)
        .filter(({ tech }) => all.has(tech.id) && ledger.get(researchKey(tech.id))?.problem !== 'identity')
        .map(({ tech }) => tech);
      const quote = unitCost(unit, config.civ, priceAge(unit.age, age), techs);
      const unknownUndecoded = quote.undecoded.filter((u) => u.attr !== undefined || u.res === undefined || !NON_PRICING_RESOURCE_SET.has(u.res));
      const hasInvalidCostOp = unknownUndecoded.some((u) => u.attr !== undefined || u.res === undefined);
      const appliedIds = new Set(quote.appliedTechs.map((t) => t.id));
      const canPrice =
        !quote.discount.unsupported.length &&
        !hasInvalidCostOp &&
        (unknownUndecoded.length === 0 || (quote.appliedTechs.length > 0 && unknownUndecoded.every((u) => appliedIds.has(u.techId))));
      if (!canPrice) badRows.set(index, '目标状态训练费用修正未核实');
      else {
        const batches = batchesForQty(line.qtyValue!, line.trainCount);
        line.billedBatches = batches;
        line.deliveredQty = deliveredQty(line.qtyValue!, line.trainCount);
        line.cost = quote.cost;
        line.subtotal = {};
        for (const r of ARMY_RES) line.subtotal[r] = (quote.cost[r] ?? 0) * batches;
        line.estimatedTechs = [...new Set(unknownUndecoded.map((u) => u.tech))];
      }
    }
    if (badRows.has(index)) {
      line.status = 'unavail';
      line.reason = badRows.get(index)!;
      line.billedBatches = null;
      line.deliveredQty = null;
      line.cost = null;
      line.subtotal = null;
      line.estimatedTechs = [];
    }
    if (line.subtotal) addArmyCost(trainingTotal, line.subtotal);
  }
  for (const entry of ledger.values()) if (entry.status === 'planned' && entry.cost) addArmyCost(researchTotal, entry.cost);
  const total: Cost = {};
  addArmyCost(total, trainingTotal);
  addArmyCost(total, researchTotal);
  const hasValue =
    !blocked.length &&
    (training.lines.some((l) => l.status === 'ok') ||
      [...ledger.values()].some((e) => e.status === 'planned' && !!e.cost) ||
      [...config.done, ...config.targets].some((key) => ['done', 'inferred-done', 'free'].includes(ledger.get(key)?.status ?? '')));
  return {
    blocked,
    ledger: [...ledger.values()],
    training,
    researchTotal,
    trainingTotal,
    total,
    hasValue,
    partial:
      !!blocked.length || training.incomplete || training.lines.some((l) => l.status !== 'ok') || [...ledger.values()].some((e) => e.status === 'invalid'),
  };
}
