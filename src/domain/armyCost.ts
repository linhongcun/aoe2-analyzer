import { civByEn } from '../data';
import { ARMY_RESEARCH, type ArmyResearchData, type ResearchCommand } from '../data/armyResearch';
import { AGE_BY_TECH } from './gameIds';
import { productionBuildings, PRODUCTION_UNLOCK_TECH_IDS, type ProductionContext } from './production';
import { makeSimContext, simTechs } from './simulator';
import type { Cost, Unit } from './types';
import { applicableTrainingTechs } from './duelTrainingCost';
import { unitCost } from './unitCost';
import { priceAge } from './costDiscount';

import type { ArmyCostConfig } from './armyCostConfig';
export { emptyArmyCost } from './armyCostConfig';
export type { ArmyCostConfig } from './armyCostConfig';
export const ARMY_RES = ['Food', 'Wood', 'Gold', 'Stone'] as const;
export const researchId = (key: string): number | null =>
  /^t:(0|[1-9]\d*)$/.test(key) && Number.isSafeInteger(Number(key.slice(2))) ? Number(key.slice(2)) : null;
export const researchKey = (id: number) => `t:${id}`;
export function addArmyCost(to: Cost, from: Cost) {
  for (const r of ARMY_RES) to[r] = (to[r] ?? 0) + (from[r] ?? 0);
}
interface Closure {
  ids: Set<number>;
  error: string;
}
const fail = (error: string): Closure => ({ ids: new Set(), error });
const ok = (ids = new Set<number>()): Closure => ({ ids, error: '' });

/** Complete count-of prerequisites. Ambiguous alternative paid paths are not selected for the player. */
export function researchResolver(data: ArmyResearchData, civ: string, age: number, completed: ReadonlySet<number> = new Set()) {
  const context = data.civs[civ];
  const memo = new Map<number, Closure>();
  let revision = completed.size;
  const available = (id: number) => {
    const n = data.nodes[id];
    return !!context && !!n && (n.civ < 0 || n.civ === context.id) && !context.disabled.includes(id);
  };
  const resolve = (id: number, stack = new Set<number>()): Closure => {
    if (revision !== completed.size) {
      memo.clear();
      revision = completed.size;
    }
    if (memo.has(id)) return memo.get(id)!;
    if (!available(id)) return fail(`研究 t:${id} 在本文明不可用或身份未知`);
    if (AGE_BY_TECH[id]) return AGE_BY_TECH[id]! <= age ? ok() : fail('尚未到达所需时代');
    if (stack.has(id)) return fail(`研究 t:${id} 的前置有循环，未核实`);
    const node = data.nodes[id]!;
    // Construction is a context prerequisite only; no building/age expenditure is charged.
    if (data.buildingTechs.includes(id)) return ok();
    const next = new Set(stack).add(id);
    const branches = node.requires.map((pre) => resolve(pre, next));
    const possible = branches.filter((b) => !b.error);
    const satisfied = possible.filter((b) => [...b.ids].every((tid) => completed.has(tid))).length;
    const needed = Math.max(0, node.count - satisfied);
    const paid = possible.filter((b) => [...b.ids].some((tid) => !completed.has(tid)));
    let result: Closure;
    if (needed > paid.length) result = fail(branches.find((b) => b.error)?.error || `研究 t:${id} 的隐藏条件尚未核实`);
    else if (needed && paid.length > needed) result = fail(`研究 t:${id} 存在替代前置，尚不能唯一确定`);
    else {
      const ids = new Set<number>();
      if (needed) for (const branch of paid) for (const pre of branch.ids) ids.add(pre);
      if (node.location > 0) ids.add(id);
      result = ok(ids);
    }
    memo.set(id, result);
    return result;
  };
  return { available, resolve };
}

export interface ArmyResearchPrice {
  cost: Cost | null;
  free: boolean;
  zero: boolean;
  reason: string;
  sources: string[];
}
/** Research price uses raw research commands; unit-cost discounts never enter this function. */
export function researchPrice(
  data: ArmyResearchData,
  civ: string,
  age: number,
  id: number,
  active: ReadonlySet<number>,
  before: ReadonlySet<number> = active,
): ArmyResearchPrice {
  const node = data.nodes[id];
  const context = data.civs[civ];
  const bad = (reason: string): ArmyResearchPrice => ({ cost: null, free: false, zero: false, reason, sources: [] });
  if (!node || !context) return bad('研究身份或文明未核实');
  const cost: Cost = {};
  const res: Record<number, string> = { 0: 'Food', 1: 'Wood', 2: 'Stone', 3: 'Gold' };
  for (const [r, amount, enabled] of node.cost) {
    if (!enabled) continue;
    if (r === undefined || amount === undefined || !res[r] || !Number.isFinite(amount) || amount < 0) return bad('研究费用资源未核实');
    cost[res[r]!] = (cost[res[r]!] ?? 0) + amount;
  }
  const predicate = (tid: number, seen = new Set<number>()): boolean | null => {
    if (AGE_BY_TECH[tid]) return AGE_BY_TECH[tid]! <= age;
    const n = data.nodes[tid];
    if (!n || seen.has(tid)) return null;
    if (context.disabled.includes(tid) || (n.civ >= 0 && n.civ !== context.id)) return false;
    if (before.has(tid) || data.buildingTechs.includes(tid)) return true;
    if (n.location > 0) return active.has(tid) && tid !== id ? null : false;
    if (!n.requires.length && n.count > 0) return null;
    const results = n.requires.map((p) => predicate(p, new Set(seen).add(tid)));
    const yes = results.filter((r) => r === true).length;
    return yes >= n.count ? true : yes + results.filter((r) => r === null).length < n.count ? false : null;
  };
  const groups: { source: string; mods: ResearchCommand[] }[] = [{ source: '本文明科技树与团队加成', mods: context.mods }];
  for (const [key, n] of Object.entries(data.nodes)) {
    const tid = Number(key);
    const relevant = n.mods.filter(
      (c) => ((c.Type === 101 || c.Type === 103) && c.A === id) || (c.Type === 102 && c.D === id) || ((c.Type === 1 || c.Type === 6) && c.A === 85),
    );
    if (!relevant.length || (n.civ >= 0 && n.civ !== context.id)) continue;
    const applies = n.location > 0 ? (before.has(tid) ? true : active.has(tid) && tid !== id ? null : false) : predicate(tid);
    if (applies === null) return bad('影响本项研究费用的文明条件尚未核实');
    if (applies) groups.push({ source: n.name ?? `文明条件 t:${tid}`, mods: relevant });
  }
  let time = node.time;
  const sources: string[] = [];
  const operations = new Map<string, { source: string; op: number; value: number }>();
  for (const group of groups)
    for (const c of group.mods) {
      if (c.Type === 102 && c.D === id) return bad('本项研究被条件效果禁用');
      if ((c.Type === 1 || c.Type === 6) && c.A === 85) return bad('本文明全局研究费用倍率尚未核实');
      if (c.A !== id) continue;
      if (c.Type !== 101 && c.Type !== 103) return bad('研究修正类型尚未核实');
      if (![0, 1, 2, -1].includes(c.C) || !Number.isFinite(c.D)) return bad('研究修正操作尚未核实');
      for (const key of c.Type === 103 ? ['time'] : c.B === -1 ? [...ARMY_RES] : [res[c.B] ?? 'unknown']) {
        const prev = operations.get(key);
        const op = c.C === -1 ? 1 : c.C;
        if (
          prev &&
          prev.source !== group.source &&
          !((op === prev.op && (op !== 0 || c.D === prev.value)) || (op === 2 && prev.op === 0 && prev.value === 0) || (op === 0 && c.D === 0 && prev.op === 2))
        )
          return bad('多项研究修正的生效顺序尚未核实');
        operations.set(key, { source: group.source, op, value: c.D });
      }
      const apply = (v: number) => Math.max(0, c.C === 0 ? c.D : c.C === 2 ? v * c.D : v + c.D);
      if (c.Type === 103) time = apply(time);
      else if (c.B === -1) for (const r of ARMY_RES) cost[r] = apply(cost[r] ?? 0);
      else if (!res[c.B]) return bad('研究修正资源尚未核实');
      else cost[res[c.B]!] = apply(cost[res[c.B]!] ?? 0);
      sources.push(group.source);
    }
  // The engine's research rounding for nonintegral modifiers is not inferred from unit-cost rounding.
  if (Object.values(cost).some((v) => !Number.isInteger(v))) return bad('研究费用取整尚未核实');
  const zero = ARMY_RES.every((r) => !cost[r]);
  return { cost, zero, free: zero && time === 0, reason: '', sources: [...new Set(sources)] };
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
  qtyValue: number | null;
  status: 'ok' | 'pending' | 'badqty' | 'unavail';
  cost: Cost | null;
  subtotal: Cost | null;
  reason: string;
}
function productionShell(civ: string, age: number, techs: number[] = []) {
  return { civ, age, techs, rows: [], walk: 0, farm: 0 };
}
function unitUnlocks(ctx: ProductionContext, civ: string, age: number, unit: Unit): number[] {
  if (productionBuildings(ctx, productionShell(civ, age), unit).length) return [];
  return PRODUCTION_UNLOCK_TECH_IDS.filter((id) => productionBuildings(ctx, productionShell(civ, age, [id]), unit).length);
}

export function armyResearchChoices(ctx: ProductionContext, config: ArmyCostConfig): number[] {
  const sim = makeSimContext(ctx.core.techs, ctx.trees);
  const ids = new Set<number>();
  for (const row of config.rows) {
    const u = ctx.core.unitById[row.unit];
    if (!u || !u.civs.includes(config.civ)) continue;
    for (const { t, ef } of simTechs(sim, u, config.civ)) if (ef?.length && t.age <= Number(config.age)) ids.add(t.id);
    for (const { tech } of applicableTrainingTechs(sim, u, config.civ, Number(config.age))) ids.add(tech.id);
    for (const id of unitUnlocks(ctx, config.civ, Number(config.age), u)) ids.add(id);
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
          }
        : ensure(id);
    ledger.set(key, entry);
    if (row === undefined) entry.manual = true;
    if (row !== undefined && !entry.beneficiaries.includes(row)) entry.beneficiaries.push(row);
    const closure = id === null ? fail('研究身份无法解析') : resolver.resolve(id);
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
        const enabling = Object.entries(data.nodes).filter(([id, n]) => resolver.available(Number(id)) && n.enables.includes(u.id));
        if (enabling.length) {
          const paths = enabling.map(([id]) => resolver.resolve(Number(id)));
          const possible = paths.filter((p) => !p.error);
          // An already satisfied enabling path makes extra paid alternatives unnecessary.
          const necessary = possible.find((p) => possible.every((other) => [...p.ids].every((id) => other.ids.has(id))));
          if (!necessary) badRows.set(index, paths.find((p) => p.error)?.error ?? '单位启用条件存在未核实的替代路径');
          else for (const id of necessary.ids) request(researchKey(id), false, index);
        }
        if (u.from_) {
          const candidates = Object.entries(data.nodes).filter(
            ([id, n]) => resolver.available(Number(id)) && n.upgrades.some(([, b]) => b === u.id) && !resolver.resolve(Number(id)).error,
          );
          if (candidates.length !== 1) {
            badRows.set(index, '单位升级研究身份未能唯一核实');
            return;
          }
          request(researchKey(Number(candidates[0]![0])), false, index);
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
      continue;
    }
    const before = new Set([...completed, ...resolver.resolve(entry.id).ids]);
    before.delete(entry.id);
    const price = researchPrice(data, config.civ, age, entry.id, all, before);
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
      const base = { unit, qtyValue, cost: null, subtotal: null };
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
          ...simTechs(sim, unit, config.civ)
            .filter((x) => x.ef?.length)
            .map((x) => x.t.id),
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
      const techs = [...all]
        .filter((id) => ledger.get(researchKey(id))?.problem !== 'identity')
        .flatMap((id) => (ctx.core.techById[id] ? [ctx.core.techById[id]!] : []));
      const quote = unitCost(unit, config.civ, priceAge(unit.age, age), techs);
      if (quote.undecoded.length || quote.discount.unsupported.length) badRows.set(index, '目标状态训练费用修正未核实');
      else {
        line.cost = quote.cost;
        line.subtotal = {};
        for (const r of ARMY_RES) line.subtotal[r] = (quote.cost[r] ?? 0) * line.qtyValue!;
      }
    }
    if (badRows.has(index)) {
      line.status = 'unavail';
      line.reason = badRows.get(index)!;
      line.cost = null;
      line.subtotal = null;
    }
    if (line.subtotal) addArmyCost(trainingTotal, line.subtotal);
  }
  for (const entry of ledger.values()) if (entry.status === 'planned' && entry.cost) addArmyCost(researchTotal, entry.cost);
  const total: Cost = {};
  addArmyCost(total, trainingTotal);
  addArmyCost(total, researchTotal);
  const hasValue = !blocked.length && (training.lines.some((l) => l.status === 'ok') || [...ledger.values()].some((e) => e.status === 'planned' && !!e.cost));
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
