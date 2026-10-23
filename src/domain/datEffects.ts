/**
 * .dat 原始效果表（scripts/effects_build.py 生成的 src/data/effects.json）的类型与转换。
 * 数据源与新鲜度见 effects.json 的 meta.sources 与 docs/EFFECTS-AUDIT.md。
 */
import raw from '../data/effects.json';
import type { Effect } from './types';

export type DatOp = 'add' | 'mul' | 'set';
export interface DatFx {
  s: string;
  op?: DatOp;
  v: number;
  vs?: string;
}
export interface DatRule {
  t: number[];
  fx: DatFx[];
  /** 目标为建筑 */
  b?: 1;
}
/** 经济/费用类效果（不进属性面板，结构化文本展示） */
export interface DatEco {
  /** 属性号（13 工作效率、14 携带量、100 造价、103-106 分资源造价、109 回血、24 克制抗性、107 箭矢数…） */
  a?: number;
  op: string;
  v: number;
  t?: number[];
  cls?: number | null;
  unit?: number | null;
  /** 资源效果（type 1/6） */
  res?: number;
  name?: string;
  /** 科技费用/时间修改（type 101/103） */
  tech?: string;
  tid?: number;
  what?: string;
  /** 同一建筑各时代形态的倍率（黑暗到帝王）。v 仍是目录里那个形态的值。 */
  byAge?: number[];
}
export interface DatEntry {
  tech: number;
  name: string;
  age: number;
  req: string[];
  combat: boolean;
  rules: DatRule[];
  eco: DatEco[];
  idx: number | null;
  linked: 'auto' | 'manual';
}
export interface DatFresh {
  ok: boolean | null;
  dat: unknown[];
  text: number[];
}
export interface DatCiv {
  dat: boolean;
  bonus: DatEntry[];
  team: { combat: boolean; rules: DatRule[]; eco: DatEco[] };
  fresh: Record<string, DatFresh>;
}
export interface DatTech {
  id: number;
  combat: boolean;
  rules: DatRule[];
  eco: DatEco[];
}
export interface DatGeneric {
  tech: number;
  name: string;
  age: number;
  req: string[];
  any: boolean;
  rules: DatRule[];
}
/** #24 结构化训练费用折扣（scripts/effects_build.py cost_discounts）：tiers 为该时代的累计乘数，由 .dat 费用效果算出 */
export interface DatCostGroup {
  units: number[];
  res: string[];
  tiers: Record<string, number>;
}
export interface DatCostDiscount {
  idx: number | null;
  techs: number[];
  groups: DatCostGroup[];
  /** 加成文本里的百分比（只用于对账） */
  text: Record<string, number> | null;
  /** .dat 与文本逐时代一致 */
  ok: boolean;
}
export interface DatFile {
  costDiscounts: Record<string, DatCostDiscount[]>;
  meta: { newIds: number[]; sources: { id: string; repo: string; commit: string; file: string; patch: string; use: string }[] };
  techs: Record<string, DatTech>;
  civs: Record<string, DatCiv>;
  generic: DatGeneric[];
}
export const DAT = raw as unknown as DatFile;

const NUM = new Set(['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'los', 'acc', 'minr', 'gar', 'bt', 'barm']);
/** dat 效果 → 模拟器 Effect；护甲类别（armc）等面板无对应项的返回空（在审计与经济文本中保留） */
export function toEffects(fx: readonly DatFx[]): Effect[] {
  const out: Effect[] = [];
  fx.forEach((f) => {
    if (f.s === 'rof') out.push({ s: 'rof', v: f.v });
    else if (f.s === 'bonus' && f.vs) out.push(f.op === 'mul' ? { s: 'bonus', vs: f.vs, v: f.v, op: 'mul' } : { s: 'bonus', vs: f.vs, v: f.v });
    else if (NUM.has(f.s)) out.push({ s: f.s as Exclude<Effect['s'], 'rof' | 'bonus'>, op: f.op ?? 'add', v: f.v } as Effect);
  });
  return out;
}
export const idPred = (ids: readonly number[]) => {
  const s = new Set(ids);
  return (x: { id: number }) => s.has(x.id);
};

const ECO_ATTR: Record<number, string> = {
  10: '信仰恢复时间',
  13: '工作效率',
  14: '携带量',
  100: '造价',
  101: '生产时间',
  103: '食物造价',
  104: '木材造价',
  105: '黄金造价',
  106: '石料造价',
  102: '箭矢数',
  107: '箭矢数',
  22: '溅射半径',
  24: '受到的克制伤害',
  108: '驻扎回血',
  109: '每分钟回血',
  63: '特殊能力标记',
};
const CLS_ZH: Record<number, string> = {
  0: '弓兵类',
  2: '贸易船',
  3: '建筑',
  4: '村民',
  6: '步兵',
  12: '骑兵',
  13: '攻城武器',
  20: '运输船',
  21: '渔船',
  22: '战船',
  23: '征服者',
  27: '城墙',
  35: '冲车',
  36: '骑射手',
  39: '城门',
  44: '大象弓手',
  47: '侦察骑兵',
  51: '攻城武器',
  52: '塔',
  53: '战船',
  54: '军事单位',
  55: '攻城武器',
};
const signed = (x: number) => (x > 0 ? '+' : '') + (Math.round(x * 100) / 100).toString();
const pct = (x: number) => signed(Math.round(x * 1000) / 10) + '%';
/** 经济项 → 一行结构化文本；nameOf 提供单位/建筑中文名 */
export function ecoText(x: DatEco, nameOf: (id: number) => string | undefined): string {
  if (x.tech) {
    const what = x.what ?? '';
    if (x.op === 'set') return `科技「${x.tech}」${what} = ${x.v}`;
    // 101/103：c=2 为乘法，显示乘号与倍率；研究时间的加法才带「秒」
    if (x.op === 'mul') return `科技「${x.tech}」${what} ×${x.v}`;
    return `科技「${x.tech}」${what} ${what === '研究时间' ? `${signed(x.v)} 秒` : signed(x.v)}`;
  }
  if (x.res !== undefined) {
    const n = x.name && !x.name.startsWith('资源') ? x.name : `游戏资源 #${x.res}`;
    return `${n} ${x.op === 'mul' ? '×' + x.v : x.op === 'set' ? '= ' + x.v : signed(x.v)}`;
  }
  const who =
    x.unit !== null && x.unit !== undefined
      ? (nameOf(x.unit) ?? `单位 #${x.unit}`)
      : x.cls !== null && x.cls !== undefined
        ? (CLS_ZH[x.cls] ?? `类别 ${x.cls}`)
        : '';
  const attr = ECO_ATTR[x.a ?? -1] ?? `属性 ${x.a}`;
  if (x.op === 'mul' && x.byAge && x.byAge.length > 1) {
    const ps = x.byAge.map((v) => Math.round((v - 1) * 1000) / 10);
    const same = ps.every((p) => p >= 0) || ps.every((p) => p < 0);
    const body = same ? ps.map((p) => String(Math.abs(p))).join('/') : ps.map((p) => (p > 0 ? '+' : '') + p).join('/');
    const sign = same ? (ps[0]! >= 0 ? '+' : '-') : '';
    return `${who} ${attr} ${sign}${body}%`;
  }
  if (x.op === 'mul') return `${who} ${attr} ${pct(x.v - 1)}`;
  if (x.op === 'set') return `${who} ${attr} = ${x.v}`;
  return `${who} ${attr} ${signed(x.v)}`;
}
