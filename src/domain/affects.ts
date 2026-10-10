/**
 * 科技“作用对象”：直接复用单位/建筑模拟器的效果表与判定（单一事实来源）。
 */
import { BUILDING_EFFECTS } from './buildingSim';
import { BUILDING_TYPE_ZH } from './buildings';
import { TECH_EFFECTS } from './effects';
import { linkify, type Linker } from './linker';
import type { Building, Effect, Tech, Unit } from './types';
import { hasCls, isArcher, isInf, isMounted } from './unitClass';

const STAT_ZH: Record<string, [string, string]> = {
  hp: ['生命值', 'hp'],
  atk: ['攻击', 'atk'],
  ma: ['近战护甲', 'marm'],
  pa: ['穿刺护甲', 'parm'],
  rng: ['射程', 'range'],
  spd: ['移动速度', 'speed'],
  los: ['视野', ''],
  acc: ['准确度', ''],
  minr: ['最小射程', ''],
  gar: ['驻扎容量', ''],
  bt: ['建造时间', 'time'],
  barm: ['建筑护甲', ''],
  rof: ['攻击速度', 'rof'],
};
export interface EffectPart {
  icon: string;
  text: string;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
export function effectParts(ef: readonly Effect[]): EffectPart[] {
  return ef.map((e) => {
    if (e.s === 'bonus') return { icon: '', text: `对 ${e.vs} 加成 ${e.v > 0 ? '+' : ''}${e.v}` };
    const [n, icon] = STAT_ZH[e.s] ?? [e.s, ''];
    if (e.s === 'rof') return { icon, text: `${n} +${pct(e.v)}` };
    if (e.s === 'bt' && 'op' in e && e.op === 'mul') return { icon, text: `建造速度 +${pct(1 / e.v - 1)}` };
    if ('op' in e && e.op === 'mul') return { icon, text: `${n} ${e.v >= 1 ? '+' : ''}${pct(e.v - 1)}` };
    if ('op' in e && e.op === 'set') return { icon, text: `${n} → ${e.v}` };
    return { icon, text: `${n} ${e.v > 0 ? '+' : ''}${e.v}` };
  });
}
export const effectKey = (ef: readonly Effect[]) =>
  effectParts(ef)
    .map((p) => p.text)
    .join('，');

export function unitGroup(u: Unit): string {
  if (hasCls(u, 16)) return '船只';
  if (hasCls(u, 20)) return '攻城';
  if (isArcher(u)) return '弓兵';
  if (isMounted(u)) return '骑兵';
  if (isInf(u)) return '步兵';
  return '其他';
}
const GROUP_ORDER = ['步兵', '骑兵', '弓兵', '攻城', '船只', '其他', ...Object.values(BUILDING_TYPE_ZH).map((x) => x + '建筑')];

export interface AffectRow {
  effect: string;
  parts: EffectPart[];
  units: Unit[];
  buildings: Building[];
}
export interface AffectGroup {
  group: string;
  rows: AffectRow[];
}

/** 编码了数值的作用对象（与模拟器相同的判定）；按类别、相同效果合并 */
export function techAffects(t: Tech, units: readonly Unit[], buildings: readonly Building[]): AffectGroup[] {
  const G = new Map<string, Map<string, AffectRow>>();
  const add = (g: string, ef: Effect[], u?: Unit, b?: Building) => {
    const k = effectKey(ef);
    const m = G.get(g) ?? new Map<string, AffectRow>();
    G.set(g, m);
    const r = m.get(k) ?? { effect: k, parts: effectParts(ef), units: [], buildings: [] };
    m.set(k, r);
    if (u) r.units.push(u);
    if (b) r.buildings.push(b);
  };
  const ur = TECH_EFFECTS[t.en];
  if (ur)
    units.forEach((u) => {
      const ef = ur.filter(([f]) => f(u)).flatMap((x) => x[1]);
      if (ef.length) add(unitGroup(u), ef, u);
    });
  const br = BUILDING_EFFECTS[t.en];
  if (br)
    buildings.forEach((b) => {
      const ef = br.filter(([f]) => f(b)).flatMap((x) => x[1]);
      if (ef.length) add(BUILDING_TYPE_ZH[b.type] + '建筑', ef, undefined, b);
    });
  return [...G.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0])).map(([group, m]) => ({ group, rows: [...m.values()] }));
}

/** 文本推断：说明文字中提到的单位/建筑（不计入数值） */
export function textMentions(t: Tech, L: Linker, unitById: Record<number, Unit>, buildingById: Record<number, Building>) {
  const us = new Map<number, Unit>(),
    bs = new Map<number, Building>();
  linkify(t.desc, L).forEach((s) => {
    if (!s.href) return;
    if (s.kind === 'unit') {
      const u = unitById[+s.href.replace(/\D/g, '')];
      if (u) us.set(u.id, u);
    }
    if (s.kind === 'building') {
      const b = buildingById[+s.href.replace(/\D/g, '')];
      if (b) bs.set(b.id, b);
    }
  });
  return { units: [...us.values()], buildings: [...bs.values()] };
}
