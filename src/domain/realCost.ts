/**
 * #88 真实费用 / 等采集时间（纯函数）。口径：issue 120 Steve 定稿 + Kent 用例草稿（评论 6157773161）。
 * - 数值全部来自 src/data/eco.json（.dat 导出）：villager.tasks、ecoTechs、civEco，不写死速度。
 * - 采集速度按所选时代，该时代及以前的经济科技（ecoTechs）全算；选了文明再叠加文明加成。
 * - 每趟 = 携带量 ÷ 采集速度 + 往返路程 ÷ 村民速度；有效速度 = 携带量 ÷ 每趟；单价耗时 = 价格 ÷ 有效速度。
 * - 金、木、石离放置点 3 格（往返 6 格）；食物按农田，贴着磨坊（往返 0 格，有效速度 = workRate）。
 * - 播种耗时：eco.json 没有，不计入（页面写「播种耗时 未核实」，不出数字）。
 * - 价格用调用方传入的折后价（PK 用 costDiscount 的 cost，与「等资源」显示同一个数）。
 * - 开局模拟不支持的文明（simSupport = false，与 #42 白名单同一口径），其采集相关加成记「未计入」，按通用速度。
 */
import ecoRaw from '../data/eco.json';
import type { Cost } from './types';
import type { EcoData } from './buildSim';
import { UNHANDLED_RES } from './buildSim';
import { simSupport } from './simSupport';

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
    const zh = (UNHANDLED_RES[e.res] ?? '').replace(/（.*$/, '').replace(/未建模$/, '').trim();
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
  applied: CivGatherLine[];
  unsupported: CivGatherLine[];
}

const pct = (m: Mod) => Math.round((m.mul - 1) * 100);
const sign = (n: number) => (n < 0 ? `\u2212${-n}` : `+${n}`);

export function gatherModel(age: number, civ = ''): GatherModel {
  const mods: Record<string, Mod> = {};
  const push = (key: string, op: string | undefined, v: number) => {
    const m = (mods[key] ??= { mul: 1, add: 0 });
    if (op === 'mul') m.mul *= v;
    else if (op === 'add') m.add += v;
  };
  for (const t of Object.values(eco.ecoTechs) as { age: number; effects: EffectLike[] }[])
    if (t.age <= age) for (const e of t.effects) if (relevant(e) && e.kind === 'attr') push(`${e.target}:${e.attr}`, e.op, e.v ?? 0);

  const civMods: Record<string, { m: Mod; zh: string; techs: number[]; exact: boolean }> = {};
  const supported = !civ || simSupport(civ);
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
  const applied: CivGatherLine[] = [],
    unsupported: CivGatherLine[] = [];
  for (const [key, c] of Object.entries(civMods)) {
    const label = c.exact ? `${c.zh} ${sign(pct(c.m))}%` : c.zh;
    if (supported && c.exact) {
      push(key, 'mul', c.m.mul);
      applied.push({ label, techs: c.techs });
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
    const trip = carry / wr + ROUND_TRIP[t] / speed;
    rate[t] = ROUND_TRIP[t] === 0 ? wr : carry / trip;
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
