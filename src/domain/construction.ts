/** Issue 227: audited ordinary-villager construction, independent of historical opening simulations. */
import { CONSTRUCTION_DATA } from '../data/construction';
import type { ConstructionData } from '../data/construction';
import type { Core } from '../data';
import { civs } from '../data';
import type { Trees } from './types';
import { civStatus } from './simulator';
import { gatherModel, type GatherModel } from './realCost';
import { productionTechAge, productionTechs } from './production';
import { GARRISON_TECH_DATA, freeGarrisonTechs } from './garrisonTechs';
import { buildingAge as constructionBuildingAge } from './availabilityAge';

export { CONSTRUCTION_DATA } from '../data/construction';
export const CONSTRUCTION_LIMIT = 200;
export interface ConstructionContext {
  core: Core;
  trees: Trees;
}
export type ConstructionTask = '' | 'farm' | 'wood' | 'gold' | 'stone';
export interface ConstructionConfig {
  buildingId: number;
  civ: string;
  age: number;
  techs: number[];
  builders: string;
  baseline: string;
  hasTownCenter: boolean;
  task: ConstructionTask;
  walk: string;
  farm: string;
}
export const DEFAULT_CONSTRUCTION: ConstructionConfig = {
  buildingId: 70,
  civ: 'Franks',
  age: 3,
  techs: [],
  builders: '4',
  baseline: '1',
  hasTownCenter: true,
  task: '',
  walk: '3',
  farm: '0',
};
export const CONSTRUCTION_TASKS = { farm: '农田食物', wood: '木材', gold: '黄金', stone: '石料' } as const;
export interface ConstructionLine {
  builders: number;
  seconds: number;
  saved: number;
  villagerSeconds: number;
  marginalSeconds: number | null;
  marginalVillagerSeconds: number | null;
  forgone: number | null;
  extraForgone: number | null;
}
export interface ConstructionResult {
  errors: string[];
  warnings: string[];
  applied: string[];
  selected: Set<number>;
  free: Set<number>;
  single: number | null;
  baseTime: number | null;
  builderRate: number | null;
  form: number | null;
  target: ConstructionLine | null;
  baseline: ConstructionLine | null;
  rows: ConstructionLine[];
  gather: GatherModel | null;
}
const unique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
export { constructionBuildingAge };
export function constructionBuildings(ctx: ConstructionContext, config: Pick<ConstructionConfig, 'civ' | 'age'>) {
  return ctx.core.buildings.filter((b) => b.civs.includes(config.civ) && constructionBuildingAge(b, config.civ, ctx.trees) <= config.age);
}
function legalTechs(ctx: ConstructionContext, config: Pick<ConstructionConfig, 'civ' | 'age'>) {
  const status = civStatus(ctx.trees, config.civ);
  return ctx.core.techs.filter((t) => t.civs.includes(config.civ) && productionTechAge(t, config.civ) <= config.age && status['t' + t.id]);
}
const shapeTechs = (id: number) => (id === 236 ? [64] : (GARRISON_TECH_DATA.unitUpgradeTechs?.[id] ?? []));
export function constructionTechs(ctx: ConstructionContext, config: ConstructionConfig) {
  const gatherIds = new Set(
    productionTechs(ctx, config)
      .filter((t) => t.ben !== 'Castle')
      .map((t) => t.id),
  );
  const shapeIds = new Set(shapeTechs(config.buildingId));
  return legalTechs(ctx, config).filter((t) => t.id === 54 || shapeIds.has(t.id) || (config.task !== '' && gatherIds.has(t.id)) || config.techs.includes(t.id));
}
export function freeConstructionTechs(ctx: ConstructionContext, config: ConstructionConfig) {
  const b = ctx.core.buildingById[config.buildingId];
  return b ? new Set(freeGarrisonTechs(ctx, b, { civ: config.civ, age: config.age, techs: config.techs, rows: [] })) : new Set<number>();
}
export function effectiveConstructionTechs(ctx: ConstructionContext, config: ConstructionConfig) {
  const available = new Set(legalTechs(ctx, config).map((t) => t.id));
  const selected = new Set([...config.techs, ...freeConstructionTechs(ctx, config)].filter((id) => available.has(id)));
  const add = (id: number) => {
    const pre = ctx.core.techById[id]?.pre;
    if (pre && available.has(pre) && !selected.has(pre)) {
      selected.add(pre);
      add(pre);
    }
  };
  [...selected].forEach(add);
  return selected;
}
export function toggleConstructionTech(ctx: ConstructionContext, config: ConstructionConfig, id: number) {
  const selected = effectiveConstructionTechs(ctx, config);
  if (freeConstructionTechs(ctx, config).has(id)) return [...selected];
  if (selected.has(id)) {
    selected.delete(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const tid of selected) {
        const pre = ctx.core.techById[tid]?.pre;
        if (pre && !selected.has(pre)) {
          selected.delete(tid);
          changed = true;
        }
      }
    }
  } else selected.add(id);
  return [...effectiveConstructionTechs(ctx, { ...config, techs: [...selected] })];
}
/** Published ideal simultaneous-arrival rule; not an engine or pathfinding simulation. */
export function idealConstructionSeconds(single: number, builders: number) {
  return Number.isFinite(single) && single > 0 && Number.isSafeInteger(builders) && builders >= 1 && builders <= CONSTRUCTION_LIMIT
    ? (3 * single) / (builders + 2)
    : null;
}
const count = (s: string) => (/^[1-9]\d{0,2}$/.test(s) && +s <= CONSTRUCTION_LIMIT ? +s : null);
const distance = (s: string) => (/^(?:0|[1-9]\d?)(?:\.\d{1,3})?$/.test(s) && +s <= 10 ? +s : null);
type Command = ConstructionData['civs'][string]['tree'][number];
type ObjectData = ConstructionData['civs'][string]['units'][string];
function matches(c: Command, id: number, u: ObjectData) {
  return c.A === id || (c.A === -1 && c.B === u.class);
}
function change(base: number, c: Command) {
  const t = c.Type >= 10 ? c.Type - 10 : c.Type;
  return t === 0 ? c.D : t === 5 ? base * c.D : base + c.D;
}
export function calculateConstruction(ctx: ConstructionContext, config: ConstructionConfig): ConstructionResult {
  const result: ConstructionResult = {
    errors: [],
    warnings: [],
    applied: [],
    selected: new Set(),
    free: new Set(),
    single: null,
    baseTime: null,
    builderRate: null,
    form: null,
    target: null,
    baseline: null,
    rows: [],
    gather: null,
  };
  const { errors, warnings, applied } = result;
  const b = ctx.core.buildingById[config.buildingId],
    cd = CONSTRUCTION_DATA.civs[config.civ],
    bd = CONSTRUCTION_DATA.buildings[config.buildingId];
  if (!cd || !civs.some((c) => c.en === config.civ)) errors.push('文明不存在。');
  if (![1, 2, 3, 4].includes(config.age)) errors.push('时代须为黑暗至帝王时代。');
  if (!b || !bd) errors.push('建筑不存在。');
  else {
    if (!b.civs.includes(config.civ)) errors.push('该文明不能建造此建筑。');
    if (constructionBuildingAge(b, config.civ, ctx.trees) > config.age) errors.push('当前时代尚不能建造此建筑。');
    if (!bd.supported) errors.push(bd.reason);
  }
  const n = count(config.builders),
    base = count(config.baseline),
    walk = distance(config.walk),
    farm = distance(config.farm);
  if (n === null || base === null) errors.push(`施工人数和基准人数须为 1–${CONSTRUCTION_LIMIT} 的整数。`);
  if (walk === null || farm === null) errors.push('采集单程距离须为 0–10 格的有限数，最多三位小数。');
  if (config.task !== '' && !(config.task in CONSTRUCTION_TASKS)) errors.push('原采集任务无效。');
  if (typeof config.hasTownCenter !== 'boolean') errors.push('请明确是否已完成过首座城镇中心。');
  const legal = new Set(legalTechs(ctx, config).map((t) => t.id));
  if (config.techs.length > 200 || unique(config.techs).length !== config.techs.length || config.techs.some((id) => !legal.has(id)))
    errors.push('科技包含重复、未知或当前文明时代不可用的项目。');
  result.selected = effectiveConstructionTechs(ctx, config);
  result.free = freeConstructionTechs(ctx, config);
  if (b) for (const id of shapeTechs(b.id)) if (!result.selected.has(id)) errors.push(`建造此形态须先研究${ctx.core.techById[id]?.zh ?? `科技 ${id}`}。`);
  if (b?.id === 109) {
    if (!config.hasTownCenter && config.age !== 1) errors.push('首版仅支持黑暗时代的起始城镇中心；其他起始时代条件尚未核实。');
    if (config.hasTownCenter && config.age < 3 && !(config.civ === 'Cumans' && config.age === 2))
      errors.push('首版额外城镇中心支持城堡时代起，库曼另支持封建额外城镇中心；重建条件未核实。');
  }
  if (errors.length || !cd || !bd || !b || n === null || base === null || walk === null || farm === null) return result;
  const form = bd.forms[config.age - 1],
    object = form === undefined ? undefined : cd.units[form],
    builder = cd.units[118],
    female = cd.units[212];
  if (!object || !builder || !female || !object.at.includes(118) || builder.rate !== female.rate) {
    errors.push('该建筑施工形态或普通村民速率尚未核实，暂停计算。');
    return result;
  }
  let time = object.time,
    rate = builder.rate,
    femaleRate = female.rate;
  const apply = (commands: Command[], label: string) => {
    let changed = false;
    for (const c of commands) {
      if (c.C === 101 && matches(c, form!, object)) {
        time = change(time, c);
        changed = true;
      }
      if (c.C === 13 && matches(c, 212, female)) femaleRate = change(femaleRate, c);
      if (c.C === 13 && matches(c, 118, builder)) {
        rate = change(rate, c);
        changed = true;
      }
    }
    if (changed) applied.push(label);
  };
  apply(cd.tree, '文明固定科技树效果');
  apply(cd.team, '本文明常驻团队加成（仅一次）');
  const known = new Set<number>([104, ...result.selected]);
  if (config.hasTownCenter) {
    known.add(307);
    known.add(722);
  }
  [101, 102, 103].forEach((id, i) => {
    if (config.age >= i + 2) known.add(id);
  });
  const done = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of cd.automatic)
      if (!done.has(r.id) && r.requires.filter((id) => known.has(id)).length >= r.count) {
        const labels: Record<number, string> = {
          159: '西班牙后续城镇中心施工加成',
          723: '库曼封建额外城镇中心工期',
          724: '库曼城堡时代城镇中心工期恢复',
          770: '西西里城镇中心与防御工事施工加成',
          887: '罗马村民工作速率',
          1089: '吴房屋常驻团队加成',
        };
        apply(r.commands, labels[r.id] ?? '满足条件的固定文明施工效果');
        done.add(r.id);
        known.add(r.id);
        changed = true;
      }
  }
  for (const id of result.selected) {
    const rule = CONSTRUCTION_DATA.research[id];
    if (rule) apply(rule.commands, `${ctx.core.techById[id]?.zh ?? `科技 ${id}`}`);
  }
  if (!Number.isFinite(time) || !Number.isFinite(rate) || time <= 0 || rate <= 0 || Math.abs(rate - femaleRate) > 1e-9) {
    errors.push('施工工期或工作速率异常，或男女建造者速率不同，暂停计算。');
    return result;
  }
  result.baseTime = time;
  result.builderRate = rate;
  result.form = form!;
  result.single = time / rate;
  warnings.push('理论同时施工：所有普通村民已到场，不计步行、阻挡、分批到达、战斗或维修。没有在游戏里实测。');
  if (b.id === 109) warnings.push('按游戏里实际建造城镇中心的 150 秒计算，和其他页面里的 100 秒不是同一个口径。');
  if (['Spanish', 'Romans'].includes(config.civ)) warnings.push('本工具计入了这个文明的建造速度加成，结果可能和开局模拟不同。');
  if (config.civ === 'Sicilians') warnings.push('西西里施工加成须已完成过首座城镇中心；本开关同时控制城堡与防御工事加成。');
  let gather: GatherModel | null = null;
  if (config.task) {
    gather = gatherModel(config.age, config.civ, { techIds: result.selected, walkTiles: walk, farmTiles: farm });
    result.gather = gather;
    warnings.push(...gather.unsupported.map((x) => `${x.label}未计入：停采量采用已支持的采集模型。`));
    warnings.push('停采量为该方案全部施工者占用的估计损失；基准增量另列，不等于提前完工收益。不计盟友经济加成及特殊存放机制。');
  }
  const baseSeconds = idealConstructionSeconds(result.single, base)!;
  const line = (v: number): ConstructionLine => {
    const seconds = idealConstructionSeconds(result.single!, v)!;
    const work = v * seconds;
    const next = idealConstructionSeconds(result.single!, v + 1);
    const r = config.task && gather ? gather.rate[config.task] : null;
    return {
      builders: v,
      seconds,
      saved: baseSeconds - seconds,
      villagerSeconds: work,
      marginalSeconds: next === null ? null : seconds - next,
      marginalVillagerSeconds: next === null ? null : (v + 1) * next - work,
      forgone: r === null ? null : work * r,
      extraForgone: r === null ? null : (work - base * baseSeconds) * r,
    };
  };
  result.target = line(n);
  result.baseline = line(base);
  result.rows = unique([1, 2, 3, 4, 5, 8, 10, 15, 20, n, base])
    .filter((v) => v <= CONSTRUCTION_LIMIT)
    .map(line);
  return result;
}
const fields = ['cv', 'building', 'civ', 'age', 'techs', 'builders', 'baseline', 'tc', 'task', 'walk', 'farm'];
export function encodeConstruction(c: ConstructionConfig) {
  return new URLSearchParams({
    cv: '1',
    building: String(c.buildingId),
    civ: c.civ,
    age: String(c.age),
    techs: c.techs.join(','),
    builders: c.builders,
    baseline: c.baseline,
    tc: c.hasTownCenter ? '1' : '0',
    task: c.task,
    walk: c.walk,
    farm: c.farm,
  }).toString();
}
export function decodeConstruction(search: string, ctx?: ConstructionContext): { config: ConstructionConfig; errors: string[] } {
  if (!search || search === '?') return { config: { ...DEFAULT_CONSTRUCTION, techs: [] }, errors: [] };
  if (search.length > 8000) return { config: { ...DEFAULT_CONSTRUCTION, techs: [] }, errors: ['方案链接过长。'] };
  const q = new URLSearchParams(search),
    errors: string[] = [];
  try {
    decodeURIComponent(search);
  } catch {
    errors.push('方案链接含无效编码。');
  }
  for (const key of q.keys()) if (!fields.includes(key) || q.getAll(key).length !== 1) errors.push('方案链接含未知或重复参数。');
  if (fields.some((k) => !q.has(k)) || q.get('cv') !== '1') errors.push('方案链接版本无效或缺少必要参数。');
  const techs = q.get('techs') ?? '';
  if (techs && !/^\d+(?:,\d+)*$/.test(techs)) errors.push('科技参数格式无效。');
  if (!/^[1-9]\d{0,5}$/.test(q.get('building') ?? '') || !/^[1-4]$/.test(q.get('age') ?? '') || !/^[01]$/.test(q.get('tc') ?? ''))
    errors.push('建筑、时代或首座城镇中心参数无效。');
  if (!CONSTRUCTION_DATA.buildings[q.get('building') ?? ''] || !CONSTRUCTION_DATA.civs[q.get('civ') ?? '']) errors.push('方案链接的建筑或文明不存在。');
  const ids = techs ? techs.split(',').map(Number) : [];
  if (ctx) {
    const legal = new Set(legalTechs(ctx, { civ: q.get('civ') ?? '', age: Number(q.get('age')) }).map((t) => t.id));
    if (ids.some((id) => !legal.has(id))) errors.push('方案链接含当前文明或时代不可用的科技。');
  }
  if (unique(ids).length !== ids.length || ids.some((id) => !Number.isSafeInteger(id))) errors.push('科技参数重复或超出范围。');
  if (count(q.get('builders') ?? '') === null || count(q.get('baseline') ?? '') === null) errors.push('方案链接的施工人数和基准人数须为 1–200 的整数。');
  if (distance(q.get('walk') ?? '') === null || distance(q.get('farm') ?? '') === null) errors.push('方案链接的采集距离无效。');
  const task = q.get('task') ?? '';
  if (task !== '' && !(task in CONSTRUCTION_TASKS)) errors.push('采集任务参数无效。');
  return {
    config: {
      buildingId: Number(q.get('building')),
      civ: q.get('civ') ?? '',
      age: Number(q.get('age')),
      techs: ids,
      builders: q.get('builders') ?? '',
      baseline: q.get('baseline') ?? '',
      hasTownCenter: q.get('tc') === '1',
      task: task as ConstructionTask,
      walk: q.get('walk') ?? '',
      farm: q.get('farm') ?? '',
    },
    errors: uniqueStrings(errors),
  };
}
function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
/** Stable shared-entry helper: preserves legal simulator selections and fills the complete v1 URL. */
export function constructionLink(ctx: ConstructionContext, input: { buildingId: number; civ: string; age: number; techs?: Iterable<number> }) {
  const config = { ...DEFAULT_CONSTRUCTION, ...input, techs: [...(input.techs ?? [])] };
  const legal = new Set(legalTechs(ctx, config).map((t) => t.id));
  config.techs = config.techs.filter((id) => legal.has(id));
  return '/construction?' + encodeConstruction(config);
}
