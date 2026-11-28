/**
 * #88 真实费用 / 等采集时间（纯函数）。口径：issue 120 Steve 定稿 + Kent 用例草稿（评论 6157773161）。
 * - 数值全部来自 data/game/eco.json（.dat 导出）：villager.tasks、ecoTechs、ecoTechDisabledCivs、civEco，不写死速度。
 * - 采集速度默认按所选文明在所选时代实际可研究的通用采集经济科技（含科技树禁用与勃艮第提前一时代）计算；未选文明按通用全科技兜底；选了文明再叠加文明加成。
 * - 每趟 = 携带量 ÷ 采集速度 + 往返路程 ÷ 村民速度；有效速度 = 携带量 ÷ 每趟；单价耗时 = 价格 ÷ 有效速度。
 * - 金、木、石离放置点 3 格（往返 6 格）；食物按农田，贴着磨坊（往返 0 格，有效速度 = workRate）。
 * - 播种耗时：eco.json 没有，不计入（页面写「播种耗时未核实，不计入」，不出数字）。
 * - 价格用调用方传入的折后价（PK 用 costDiscount 的 cost，与「等资源」显示同一个数）。
 * - 文明采集加成（issue 138，Steve 定稿）：只计入 aoe2techtree 当前文明文案里有来源的条目，数值用来源值（见 SOURCED）；
 *   其余（含 eco.json 读得出但没有来源的）一律记「未计入」，按通用速度。
 */
import { ECO as eco } from '../data/eco';
import { civByEn } from '../data';
import type { Cost } from './types';
import type { CostDiscount } from './costDiscount';
import { UNHANDLED_RES } from './unhandledRes';
import { earlyEcoGatherTechAge } from './availabilityAge';
import { AGE_BY_TECH, VILLAGER_CLASS } from './gameIds';
import { effectiveGatherRate } from './gatherRate';
import { formatClock, ratePerMinute } from './formatTime';

export type GatherRes = 'Food' | 'Wood' | 'Gold' | 'Stone';
type Task = 'farm' | 'wood' | 'gold' | 'stone';
export const RES_TASK: Record<GatherRes, Task> = { Food: 'farm', Wood: 'wood', Gold: 'gold', Stone: 'stone' };
/** 往返格数（口径假设，不是游戏数据） */
export const ROUND_TRIP: Record<Task, number> = { farm: 0, wood: 6, gold: 6, stone: 6 };
/** 村民 class（.dat class 4） */
const VIL = `class:${VILLAGER_CLASS}`;
export const DEFAULT_VILS = 10;
export const DEFAULT_MIN = 10;
export const DEFAULT_AGE = 3;

interface Mod {
  mul: number;
  add: number;
}
type Attr = 'workRate' | 'carry' | 'speed';
const TASK_ZH: Record<Task, string> = { farm: '农田采集', wood: '伐木', gold: '采金', stone: '采石' };
const ATTR_ZH: Record<Attr, string> = { workRate: '采集速度', carry: '携带量', speed: '村民移速' };
/** 与采集相关、但模型读不准的 res（未在 UNHANDLED_RES 登记的项由 GATHER_RES_ZH 提供本地无数字标签，issue 1521） */
const GATHER_RES = [69, 237, 238, 239, 241, 267, 276, 299, 502];
/** 仅用于 realCost 未计入告警的无数字本地标签（避免改动 unhandledRes.ts 及触发 productionWarnings 含数字括注） */
const GATHER_RES_ZH: Record<number, string> = {
  299: '食物采集加成',
};

interface EffectLike {
  kind: string;
  attr?: string;
  target?: string;
  op?: string;
  v?: number;
  res?: number;
}
const relevant = (e: EffectLike): { key: string; zh: string } | null => {
  if (e.kind === 'res' && e.res !== undefined && GATHER_RES.includes(e.res)) {
    const zh = (GATHER_RES_ZH[e.res] ?? UNHANDLED_RES[e.res] ?? '')
      .replace(/（.*$/, '')
      .replace(/未建模$/, '')
      .trim();
    return { key: 'res:' + e.res, zh: zh || `res ${e.res}` };
  }
  if (e.kind !== 'attr' || !e.attr || !['workRate', 'carry', 'speed'].includes(e.attr)) return null;
  const a = e.attr as Attr;
  if (e.target === VIL) return { key: `${VIL}:${a}`, zh: a === 'speed' ? ATTR_ZH.speed : `村民${ATTR_ZH[a]}` };
  const t = e.target?.startsWith('task:') ? (e.target.slice(5) as Task) : null;
  if (t && t in TASK_ZH) return { key: `task:${t}:${a}`, zh: a === 'workRate' ? TASK_ZH[t] : `${TASK_ZH[t]}${ATTR_ZH[a]}` };
  return null;
};

export interface CivGatherLine {
  /** 「采金 +25%」或「采金加成」（未计入时可能读不出百分比） */
  label: string;
  techs: number[];
}
export interface CivGatherSource extends CivGatherLine {
  key: string;
  fromTree: boolean;
  /** Issue 1532：无法从 DAT.civs[civ].bonus 反查时显式指定对应的 civ.bon 序号 */
  bonusIdx?: number;
}
export interface GatherModel {
  age: number;
  civ: string;
  /** 每种资源的有效速度（资源/秒，含往返） */
  rate: Record<Task, number>;
  applied: (CivGatherLine & { source: string })[];
  unsupported: CivGatherLine[];
}

/**
 * issue 138 有来源的文明采集加成。来源：aoe2techtree.net data/locales/en/strings.json 文明文案（2026-10-16 核对）：
 * - Romans 120192「Villagers gather, build, and repair +5% faster」→ 村民采集 ×1.05；eco.json 另有农田 ×1.038095 无来源，不计也不列
 * - Slavs 120172「Farmers work +15% faster」→ 农田 ×1.15（eco.json 为 1.23，不用）
 * - Celts 120162「Lumberjacks work +15% faster」、Koreans 120167「Stone miners work +20% faster」、
 *   Turks 120159「Gold miners work +25% faster」→ 与 eco.json 一致，用 eco.json 值
 * - Berbers 120176「Villagers move +5% faster in Dark Age, +10% faster starting in Feudal Age」→ 与 eco.json 一致
 * - Armenians 120193「Mule Cart technology effects +40%」→ 对应经济科技（202/203/55/182/278）已研时叠加 eco.json 固定倍率（t:960/961/963/964/965），禁用项（221/279）跳过
 * value：数字 = 用来源值；'eco' = 用 eco.json 值；'drop' = 不计也不列。未列出的条目记「未计入」。
 * bonus：civs.json 的 bon 序号，取 aoe2techtree 中文文明描述中的对应要点作为展示来源。
 */
const SOURCED: Record<string, Record<string, { value: number | 'eco'; bonus: number } | 'drop'>> = {
  Romans: { [`${VIL}:workRate`]: { value: 1.05, bonus: 0 }, 'task:farm:workRate': 'drop' },
  Slavs: { 'task:farm:workRate': { value: 1.15, bonus: 0 } },
  Celts: { 'task:wood:workRate': { value: 'eco', bonus: 0 } },
  Koreans: { 'task:stone:workRate': { value: 'eco', bonus: 0 } },
  Turks: { 'task:gold:workRate': { value: 'eco', bonus: 0 } },
  Berbers: { [`${VIL}:speed`]: { value: 'eco', bonus: 0 } },
  Armenians: {
    'task:wood:workRate': { value: 'eco', bonus: 1 },
    'task:gold:workRate': { value: 'eco', bonus: 1 },
    'task:stone:workRate': { value: 'eco', bonus: 1 },
  },
};

/** issue 331：一组效果里有没有采集模型会读的项（村民采集/搬运/移动、资源产量）；团队行本身在 gatherModel 里一律跳过 */
export const touchesGather = (effects: readonly EffectLike[]): boolean => effects.some((e) => relevant(e) !== null);

/** 一组效果里是否包含村民采集属性修正（workRate / carry / speed）；供持续生产等复用，避免重复手写目标与属性白名单。 */
export const hasGatherAttrEffect = (effects: readonly EffectLike[] | undefined): boolean =>
  (effects ?? []).some((e) => e.kind === 'attr' && relevant(e) !== null);

/** issue 317：真实成本采集模型计入了哪些文明加成（civs.json bon 序号）；与 gatherModel 的 applied 同一张 SOURCED 表 */
export const gatherBonusIdx = (civ: string): number[] => [
  ...new Set(Object.values(Object.hasOwn(SOURCED, civ) ? SOURCED[civ]! : {}).flatMap((s) => (s === 'drop' ? [] : [s.bonus]))),
];

const pct = (m: Mod) => Math.round((m.mul - 1) * 100);
const sign = (n: number) => (n < 0 ? `\u2212${-n}` : `+${n}`);

export interface CivGatherOptions {
  techIds?: ReadonlySet<number>;
  availableTechIds?: ReadonlySet<number>;
}
export interface GatherModelOptions extends CivGatherOptions {
  walkTiles?: number;
  farmTiles?: number;
  includeCivEcoTechs?: boolean;
}

const ECO_TECHS = eco.ecoTechs as Record<string, { age: number; effects: EffectLike[] }>;
const ECO_TECH_DISABLED = new Map<string, ReadonlySet<string>>(Object.entries(eco.ecoTechDisabledCivs ?? {}).map(([id, list]) => [id, new Set(list)]));
const CIV_INFRA_KEYS = {
  Armenians: 'armenianInfrastructure',
  Georgians: 'georgianInfrastructure',
  Mapuche: 'mapucheInfrastructure',
  Poles: 'polesInfrastructure',
} as const;
const EMPTY_TECH_SET: ReadonlySet<number> = new Set();
const disabledTechCache = new WeakMap<readonly { Type: number; D: number }[], ReadonlySet<number>>();

function civDisabledTechs(civ: string): ReadonlySet<number> {
  const infraKey = Object.hasOwn(CIV_INFRA_KEYS, civ) ? CIV_INFRA_KEYS[civ as keyof typeof CIV_INFRA_KEYS] : undefined;
  const commands = infraKey ? eco[infraKey]?.treeCommands : undefined;
  if (!commands) return EMPTY_TECH_SET;
  let disabled = disabledTechCache.get(commands);
  if (!disabled) {
    disabled = new Set(commands.filter((c) => c.Type === 102).map((c) => c.D));
    disabledTechCache.set(commands, disabled);
  }
  return disabled;
}

function isEcoTechDisabledForCiv(id: string | number, civ: string): boolean {
  return ECO_TECH_DISABLED.get(String(id))?.has(civ) ?? false;
}

function isDefaultEcoTechEnabled(id: string, t: { age: number; effects: EffectLike[] }, age: number, validCiv: string): boolean {
  if (!validCiv) return t.age <= age;
  if (isEcoTechDisabledForCiv(id, validCiv)) return false;
  return earlyEcoGatherTechAge(t, validCiv, hasGatherAttrEffect(t.effects)) <= age;
}

/** 省略 options.techIds 时默认启用的通用采集经济科技 ID 集合（按文明科技树禁用与勃艮第提前时代过滤；空/未知文明回退通用全科技）。 */
export function defaultGatherEcoTechIds(age: number, civ = ''): Set<number> {
  const validCiv = civ !== '' && civByEn(civ) !== undefined ? civ : '';
  const enabled = new Set<number>();
  for (const [id, t] of Object.entries(ECO_TECHS)) {
    if (hasGatherAttrEffect(t.effects) && isDefaultEcoTechEnabled(id, t, age, validCiv)) {
      enabled.add(Number(id));
    }
  }
  return enabled;
}

/** 提取属于可研究目录科技的前置 ID（排除时代与非目录内部 .dat 触发科技，如 104/101）。 */
const researchablePrereqs = (requires?: readonly number[]): number[] =>
  (requires ?? []).filter((id) => !Object.hasOwn(AGE_BY_TECH, id) && Object.hasOwn(eco.techs, String(id)));

function collectCivGather(age: number, civ: string, options: CivGatherOptions = {}) {
  const civMods: Record<string, { m: Mod; zh: string; techs: number[]; fromTree: boolean; exact: boolean; uncertain: boolean }> = {};
  const src = Object.hasOwn(SOURCED, civ) ? SOURCED[civ]! : {};
  const disabled = civDisabledTechs(civ);
  const validCiv = civ !== '' && civByEn(civ) !== undefined ? civ : '';
  const rows = (Object.hasOwn(eco.civEco, civ) ? eco.civEco[civ] : undefined) as
    { age: number; source?: string; tech?: number; requires?: number[]; effects: EffectLike[] }[] | undefined;
  for (const row of rows ?? []) {
    if (row.source === 'team' || row.age > age) continue;
    const prereqs = researchablePrereqs(row.requires);
    if (
      prereqs.some(
        (id) =>
          disabled.has(id) ||
          (validCiv !== '' && isEcoTechDisabledForCiv(id, validCiv)) ||
          (options.availableTechIds !== undefined && !options.availableTechIds.has(id)),
      )
    ) {
      continue;
    }
    let rowUncertain = false;
    if (options.techIds !== undefined) {
      if (prereqs.some((id) => !options.techIds!.has(id))) continue;
    } else if (prereqs.length > 0) {
      let skip = false;
      for (const id of prereqs) {
        if (Object.hasOwn(ECO_TECHS, String(id))) {
          if (!isDefaultEcoTechEnabled(String(id), ECO_TECHS[String(id)]!, age, validCiv)) {
            skip = true;
            break;
          }
        } else {
          rowUncertain = true;
        }
      }
      if (skip) continue;
    }
    for (const e of row.effects) {
      const r = relevant(e);
      if (!r) continue;
      const c = (civMods[r.key] ??= { m: { mul: 1, add: 0 }, zh: r.zh, techs: [], fromTree: false, exact: true, uncertain: false });
      if (row.source === 'tree') c.fromTree = true;
      if (row.tech !== undefined && !c.techs.includes(row.tech)) c.techs.push(row.tech);
      if (rowUncertain) c.uncertain = true;
      if (e.kind !== 'attr' || e.op !== 'mul') c.exact = false;
      else c.m.mul *= e.v ?? 1;
    }
  }
  const applied: (CivGatherLine & { source: string; key: string; mul: number })[] = [];
  const unsupported: CivGatherSource[] = [];
  for (const [key, c] of Object.entries(civMods)) {
    const s = Object.hasOwn(src, key) ? src[key] : undefined;
    if (s === 'drop') continue;
    if (typeof s?.value === 'number') c.m = { mul: s.value, add: 0 };
    const label = c.exact ? `${c.zh} ${sign(pct(c.m))}%` : c.zh;
    if (s !== undefined && c.exact && !c.uncertain) {
      applied.push({ key, mul: c.m.mul, label, techs: c.techs, source: civByEn(civ)?.bon[s.bonus] ?? '' });
    } else unsupported.push({ key, label, techs: c.techs, fromTree: c.fromTree });
  }
  // Issue 1532：同时禁用重犁(13)与马轭(14)的文明（全站 56 国唯一命中契丹）用牧场取代农田，不在 civEco 采集行内
  if (validCiv !== '' && isEcoTechDisabledForCiv(13, validCiv) && isEcoTechDisabledForCiv(14, validCiv)) {
    unsupported.push({ key: 'civ:pasture', label: '牧场取代农田', techs: [], fromTree: false, bonusIdx: 0 });
  }
  return { applied, unsupported };
}

/** 未计入的文明采集加成来源（带属性/资源键与科技树标记，供持续生产同源告警合并使用）。 */
export function gatherUnsupportedSources(age: number, civ: string, options: CivGatherOptions = {}): CivGatherSource[] {
  return collectCivGather(age, civ, options).unsupported;
}

/** 不传 options.techIds 时按该文明在所选时代可研究的通用采集经济科技（空/未知文明回退通用全科技）；文明专属采集独科须调用方显式传 includeCivEcoTechs 才生效。 */
export function gatherModel(age: number, civ = '', options: GatherModelOptions = {}): GatherModel {
  const mods: Record<string, Mod> = {};
  const push = (key: string, op: string | undefined, v: number) => {
    const m = (mods[key] ??= { mul: 1, add: 0 });
    if (op === 'mul') m.mul *= v;
    else if (op === 'add') m.add += v;
  };
  const activeTechIds = options.techIds ?? defaultGatherEcoTechIds(age, civ);
  for (const [id, t] of Object.entries(ECO_TECHS)) {
    if (activeTechIds.has(Number(id))) {
      for (const e of t.effects) if (relevant(e) && e.kind === 'attr') push(`${e.target}:${e.attr}`, e.op, e.v ?? 0);
    }
  }
  if (options.includeCivEcoTechs && options.techIds && eco.civEcoTechs) {
    for (const [id, t] of Object.entries(eco.civEcoTechs) as [string, { civ: string; age: number; effects: EffectLike[] }][]) {
      if (t.civ === civ && t.age <= age && options.techIds.has(Number(id))) {
        for (const e of t.effects) if (relevant(e) && e.kind === 'attr') push(`${e.target}:${e.attr}`, e.op, e.v ?? 0);
      }
    }
  }

  const collected = collectCivGather(age, civ, options);
  const applied: GatherModel['applied'] = [];
  for (const item of collected.applied) {
    push(item.key, 'mul', item.mul);
    applied.push({ label: item.label, techs: item.techs, source: item.source });
  }
  const unsupported: CivGatherLine[] = [];
  const unsupportedByLabel = new Map<string, CivGatherLine>();
  for (const item of collected.unsupported) {
    const existing = unsupportedByLabel.get(item.label);
    if (existing) {
      for (const tid of item.techs) {
        if (!existing.techs.includes(tid)) existing.techs.push(tid);
      }
    } else {
      const line: CivGatherLine = { label: item.label, techs: [...item.techs] };
      unsupportedByLabel.set(item.label, line);
      unsupported.push(line);
    }
  }

  const get = (key: string, base: number) => {
    const m = mods[key];
    return m ? base * m.mul + m.add : base;
  };
  const speed = get(`${VIL}:speed`, eco.villager.speed);
  const rate = {} as Record<Task, number>;
  for (const t of Object.keys(ROUND_TRIP) as Task[]) {
    const b = eco.villager.tasks[t]!;
    const wr = get(`task:${t}:workRate`, get(`${VIL}:workRate`, b.workRate));
    const carry = get(`task:${t}:carry`, get(`${VIL}:carry`, b.carry));
    const oneWay = t === 'farm' ? (options.farmTiles ?? 0) : options.walkTiles === undefined ? ROUND_TRIP[t] / 2 : options.walkTiles;
    rate[t] = oneWay === 0 ? wr : effectiveGatherRate({ workRate: wr, carry, speed, walkTiles: oneWay });
  }
  return { age, civ, rate, applied, unsupported };
}

export interface RealCost {
  /** 每种资源的村民秒 */
  per: Partial<Record<GatherRes, number>>;
  /** 单个用时（1 个村民，秒） */
  total: number;
  hasFood: boolean;
}
export function realCost(cost: Cost, g: GatherModel): RealCost {
  const per: Partial<Record<GatherRes, number>> = {};
  let total = 0;
  for (const r of Object.keys(RES_TASK) as GatherRes[]) {
    const v = cost[r];
    if (!v) continue;
    per[r] = v / g.rate[RES_TASK[r]];
    total += per[r]!;
  }
  return { per, total, hasFood: !!cost.Food };
}

/** 预算内能出几个（floor，与等资源一致；至少 0） */
export const countForTime = (unitSec: number, vils: number, min: number) => (unitSec > 0 ? Math.floor(ratePerMinute(vils * min, unitSec) + 1e-9) : 0);

/** m:ss；满 1 小时 h:mm:ss。与时间线共用向下取整；GameClock 的 nearest 是显式 converter 模式。 */
export function fmtClock(sec: number): string {
  return formatClock(sec, { hours: true });
}

/** issue 322：折后价 → 采集模型 + 真实成本（原在 shared/ui/RealCost，纯计算迁入 domain） */
export function realCostOf(d: CostDiscount, age: number, civ: string) {
  const g = gatherModel(age, civ);
  return { g, rc: realCost(d.cost, g) };
}
