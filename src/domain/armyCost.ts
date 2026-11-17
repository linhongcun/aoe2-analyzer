import { civByEn } from '../data';
import { ARMY_RESEARCH, type ArmyResearchData, type ResearchCommand } from '../data/armyResearch';
import { AGE_BY_TECH } from './gameIds';
import { productionBuildings, PRODUCTION_UNLOCK_TECH_IDS, type ProductionContext } from './production';
import { makeSimContext, simTechs, civStatus } from './simulator';
import type { Cost, Unit } from './types';
import { applicableTrainingTechs } from './duelTrainingCost';
import { unitCost } from './unitCost';
import { priceAge } from './costDiscount';
import { DAT } from './datEffects';
import { resistDelta, DEVOTION_ID, FAITH_ID } from './conversion';

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
    // Hidden event placeholders with a nonzero price/time have no proved automatic trigger.
    let result =
      node.location <= 0 && (node.time > 0 || node.cost.some(([, v, enabled]) => enabled && v! > 0))
        ? fail(`研究 t:${id} 的外部触发条件尚未核实`)
        : node.count > node.requires.length
          ? fail(`研究 t:${id} 的隐藏条件尚未核实`)
          : requiredPaidSet(
              branches
                .filter((b) => b.state !== 'ready' || [...b.ids].some((tid) => !completed.has(tid)))
                .map((b) => ({ ...b, ids: new Set([...b.ids].filter((tid) => !completed.has(tid))) })),
              Math.max(0, node.count - satisfied),
            );
    if (!result.error && node.location > 0) result = ok(new Set([...result.ids, id]));
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
  baseCost: Cost | null;
  modifiers: { source: string; condition: string; command: ResearchCommand; applied: boolean }[];
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
  let baseCost: Cost | null = null;
  const modifiers: ArmyResearchPrice['modifiers'] = [];
  const bad = (reason: string): ArmyResearchPrice => ({
    cost: null,
    free: false,
    zero: false,
    reason,
    sources: [...new Set(modifiers.map((m) => m.source))],
    baseCost,
    modifiers,
  });
  if (!node || !context) return bad('研究身份或文明未核实');
  const cost: Cost = {};
  const res: Record<number, string> = { 0: 'Food', 1: 'Wood', 2: 'Stone', 3: 'Gold' };
  for (const [r, amount, enabled] of node.cost) {
    if (!enabled) continue;
    if (r === undefined || amount === undefined || !res[r] || !Number.isFinite(amount) || amount < 0) return bad('研究费用资源未核实');
    cost[res[r]!] = (cost[res[r]!] ?? 0) + amount;
  }
  baseCost = { ...cost };
  const predicate = (tid: number, seen = new Set<number>()): boolean | null => {
    if (AGE_BY_TECH[tid]) return AGE_BY_TECH[tid]! <= age;
    const n = data.nodes[tid];
    if (!n || seen.has(tid)) return null;
    if (context.disabled.includes(tid) || (n.civ >= 0 && n.civ !== context.id)) return false;
    if (before.has(tid) || data.buildingTechs.includes(tid)) return true;
    if (n.location > 0) return active.has(tid) && tid !== id ? null : false;
    if (n.time > 0 || n.cost.some(([, v, enabled]) => enabled && v! > 0)) return null;
    if (!n.requires.length && n.count > 0) return null;
    const results = n.requires.map((p) => predicate(p, new Set(seen).add(tid)));
    const yes = results.filter((r) => r === true).length;
    return yes >= n.count ? true : yes + results.filter((r) => r === null).length < n.count ? false : null;
  };
  const groups: { source: string; condition: string; mods: ResearchCommand[] }[] = [
    { source: '本文明科技树与团队加成', condition: `文明 ${civ} 的常驻效果`, mods: context.mods },
  ];
  for (const [key, n] of Object.entries(data.nodes)) {
    const tid = Number(key);
    const relevant = n.mods.filter(
      (c) => ((c.Type === 101 || c.Type === 103) && c.A === id) || (c.Type === 102 && c.D === id) || ((c.Type === 1 || c.Type === 6) && c.A === 85),
    );
    if (!relevant.length || (n.civ >= 0 && n.civ !== context.id)) continue;
    const applies = n.location > 0 ? (before.has(tid) ? true : active.has(tid) && tid !== id ? null : false) : predicate(tid);
    const group = {
      source: `${n.name ?? '文明条件'} t:${tid}`,
      condition: before.has(tid) ? '已完成或本动作的确定必要前置' : `自动条件：前置 ${n.requires.map(researchKey).join('、') || '无'}，需满足 ${n.count} 项`,
      mods: relevant,
    };
    if (applies === null) {
      modifiers.push(...relevant.map((command) => ({ source: group.source, condition: '触发或相对研究顺序尚未核实', command, applied: false })));
      return bad('影响本项研究费用的文明条件尚未核实');
    }
    if (applies) groups.push(group);
  }
  let time = node.time;
  const sources: string[] = [];
  const operations = new Map<string, { source: string; op: number; value: number }>();
  for (const group of groups)
    for (const c of group.mods) {
      if (!(((c.Type === 101 || c.Type === 103) && c.A === id) || (c.Type === 102 && c.D === id) || ((c.Type === 1 || c.Type === 6) && c.A === 85))) continue;
      const modifier = { source: group.source, condition: group.condition, command: c, applied: false };
      modifiers.push(modifier);
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
      modifier.applied = true;
    }
  // The engine's research rounding for nonintegral modifiers is not inferred from unit-cost rounding.
  if (Object.values(cost).some((v) => !Number.isInteger(v))) return bad('研究费用取整尚未核实');
  const zero = ARMY_RES.every((r) => !cost[r]);
  return { cost, zero, free: zero && time === 0, reason: '', sources: [...new Set(sources)], baseCost, modifiers };
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

/** Unit-scoped combat mechanics, including text-only projectile effects; no production speed. */
function armyCombatResearch(sim: ReturnType<typeof makeSimContext>, u: Unit, civ: string, age: number, data = ARMY_RESEARCH) {
  const numeric = new Map(simTechs(sim, u, civ).map((entry) => [entry.t.id, entry.ef]));
  const tree = civStatus(sim.trees, civ);
  return sim.techs
    .filter((t) => t.age <= age && t.civs.includes(civ) && tree['t' + t.id])
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

export function armyResearchChoices(ctx: ProductionContext, config: ArmyCostConfig, includeUnverified = true): number[] {
  const sim = makeSimContext(ctx.core.techs, ctx.trees);
  const ids = new Set<number>();
  for (const row of config.rows) {
    const u = ctx.core.unitById[row.unit];
    if (!u || !u.civs.includes(config.civ)) continue;
    for (const { t } of armyCombatResearch(sim, u, config.civ, Number(config.age))) ids.add(t.id);
    for (const { tech } of applicableTrainingTechs(sim, u, config.civ, Number(config.age))) ids.add(tech.id);
    for (const id of unitUnlocks(ctx, config.civ, Number(config.age), u)) ids.add(id);
    // A form upgrade may also be an explicit target, in addition to automatic inference.
    for (const [id, node] of Object.entries(ARMY_RESEARCH.nodes)) if (node.upgrades.some(([, target]) => target === u.id)) ids.add(Number(id));
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
              : ctx.core.units.filter((u) => u.civs.includes(config.civ) && u.age <= age).map((u) => ({ unit: u.id, qty: '1' })),
          },
          false,
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
    const closure = id === null ? fail('研究身份无法解析') : outsideScope ? fail('不属于当前阵容的战斗、训练费用或形态研究；未计入') : resolver.resolve(id);
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
          if (!necessary || (necessary.ids.size > 0 && paths.some((p) => p.state === 'unknown')))
            badRows.set(index, paths.find((p) => p.error)?.error ?? '单位启用条件存在未核实的替代路径');
          else for (const id of necessary.ids) request(researchKey(id), false, index);
        }
        if (u.from_) {
          const candidates = Object.entries(data.nodes).filter(
            ([id, n]) => resolver.available(Number(id)) && n.upgrades.some(([, b]) => b === u.id) && resolver.resolve(Number(id)).state !== 'unavailable',
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
          ...armyCombatResearch(sim, unit, config.civ, age, data).map((x) => x.t.id),
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
