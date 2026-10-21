/**
 * #88 真实费用 / 等采集时间（纯函数）。口径：issue 120 Steve 定稿 + Kent 用例草稿（评论 6157773161）。
 * - 数值全部来自 src/data/eco.json（.dat 导出）：villager.tasks、ecoTechs、civEco，不写死速度。
 * - 采集速度按所选时代，该时代及以前的经济科技（ecoTechs）全算；选了文明再叠加文明加成。
 * - 每趟 = 携带量 ÷ 采集速度 + 往返路程 ÷ 村民速度；有效速度 = 携带量 ÷ 每趟；单价耗时 = 价格 ÷ 有效速度。
 * - 金、木、石离放置点 3 格（往返 6 格）；食物按农田，贴着磨坊（往返 0 格，有效速度 = workRate）。
 * - 播种耗时：eco.json 没有，不计入（页面写「播种耗时未核实，不计入」，不出数字）。
 * - 价格用调用方传入的折后价（PK 用 costDiscount 的 cost，与「等资源」显示同一个数）。
 * - 文明采集加成（issue 138，Steve 定稿）：只计入 aoe2techtree 当前文明文案里有来源的条目，数值用来源值（见 SOURCED）；
 *   其余（含 eco.json 读得出但没有来源的）一律记「未计入」，按通用速度。
 */
import ecoRaw from '../data/raw/eco';
import civs from '../data/raw/civs';
import type { Cost } from './types';
import type { EcoData } from './buildSim';
import { UNHANDLED_RES } from './buildSim';

const eco = ecoRaw as unknown as EcoData;
export type GatherRes = 'Food' | 'Wood' | 'Gold' | 'Stone';
type Task = 'farm' | 'wood' | 'gold' | 'stone';
export const RES_TASK: Record<GatherRes, Task> = { Food: 'farm', Wood: 'wood', Gold: 'gold', Stone: 'stone' };
/** 往返格数（口径假设，不是游戏数据） */
export const ROUND_TRIP: Record<Task, number> = { farm: 0, wood: 6, gold: 6, stone: 6 };
/** 村民 class（.dat class 4） */
const VIL = 'class:4';
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
/** 与采集相关、但模型读不准的 res（取自 UNHANDLED_RES 的同名条目） */
const GATHER_RES = [69, 237, 238, 239, 241, 267, 276, 502];

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
    const zh = (UNHANDLED_RES[e.res] ?? '')
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
 * value：数字 = 用来源值；'eco' = 用 eco.json 值；'drop' = 不计也不列。未列出的条目记「未计入」。
 * bonus：civs.json 的 bon 序号，取 aoe2techtree 中文文明描述中的对应要点作为展示来源。
 */
const SOURCED: Record<string, Record<string, { value: number | 'eco'; bonus: number } | 'drop'>> = {
  Romans: { 'class:4:workRate': { value: 1.05, bonus: 0 }, 'task:farm:workRate': 'drop' },
  Slavs: { 'task:farm:workRate': { value: 1.15, bonus: 0 } },
  Celts: { 'task:wood:workRate': { value: 'eco', bonus: 0 } },
  Koreans: { 'task:stone:workRate': { value: 'eco', bonus: 0 } },
  Turks: { 'task:gold:workRate': { value: 'eco', bonus: 0 } },
  Berbers: { 'class:4:speed': { value: 'eco', bonus: 0 } },
};

/** issue 317：真实成本采集模型计入了哪些文明加成（civs.json bon 序号）；与 gatherModel 的 applied 同一张 SOURCED 表 */
export const gatherBonusIdx = (civ: string): number[] => Object.values(SOURCED[civ] ?? {}).flatMap((s) => (s === 'drop' ? [] : [s.bonus]));

const pct = (m: Mod) => Math.round((m.mul - 1) * 100);
const sign = (n: number) => (n < 0 ? `\u2212${-n}` : `+${n}`);

/** 不传 options 时保持原来的「所选时代经济科技全研究」口径。 */
export function gatherModel(age: number, civ = '', options: { techIds?: ReadonlySet<number>; walkTiles?: number; farmTiles?: number } = {}): GatherModel {
  const mods: Record<string, Mod> = {};
  const push = (key: string, op: string | undefined, v: number) => {
    const m = (mods[key] ??= { mul: 1, add: 0 });
    if (op === 'mul') m.mul *= v;
    else if (op === 'add') m.add += v;
  };
  for (const [id, t] of Object.entries(eco.ecoTechs) as [string, { age: number; effects: EffectLike[] }][]) {
    const enabled = options.techIds ? options.techIds.has(Number(id)) : t.age <= age;
    if (enabled) for (const e of t.effects) if (relevant(e) && e.kind === 'attr') push(`${e.target}:${e.attr}`, e.op, e.v ?? 0);
  }

  const civMods: Record<string, { m: Mod; zh: string; techs: number[]; exact: boolean }> = {};
  const src = SOURCED[civ] ?? {};
  for (const row of (eco.civEco[civ] ?? []) as { age: number; source?: string; tech?: number; effects: EffectLike[] }[]) {
    if (row.source === 'team' || row.age > age) continue;
    for (const e of row.effects) {
      const r = relevant(e);
      if (!r) continue;
      const c = (civMods[r.key] ??= { m: { mul: 1, add: 0 }, zh: r.zh, techs: [], exact: true });
      if (row.tech !== undefined && !c.techs.includes(row.tech)) c.techs.push(row.tech);
      if (e.kind !== 'attr' || e.op !== 'mul') c.exact = false;
      else c.m.mul *= e.v ?? 1;
    }
  }
  const applied: GatherModel['applied'] = [],
    unsupported: CivGatherLine[] = [];
  for (const [key, c] of Object.entries(civMods)) {
    const s = src[key];
    if (s === 'drop') continue;
    if (typeof s?.value === 'number') c.m = { mul: s.value, add: 0 };
    const label = c.exact ? `${c.zh} ${sign(pct(c.m))}%` : c.zh;
    if (s !== undefined && c.exact) {
      push(key, 'mul', c.m.mul);
      applied.push({ label, techs: c.techs, source: civs.find((c) => c.en === civ)?.bon[s.bonus] ?? '' });
    } else unsupported.push({ label, techs: c.techs });
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
    const distance = t === 'farm' ? (options.farmTiles ?? 0) * 2 : options.walkTiles === undefined ? ROUND_TRIP[t] : options.walkTiles * 2;
    const trip = carry / wr + distance / speed;
    rate[t] = distance === 0 ? wr : carry / trip;
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
export const countForTime = (unitSec: number, vils: number, min: number) => (unitSec > 0 ? Math.floor((vils * min * 60) / unitSec + 1e-9) : 0);

/** m:ss；满 1 小时 h:mm:ss（四舍五入到秒） */
export function fmtClock(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
