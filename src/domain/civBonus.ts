/**
 * 文明加成 / 团队加成作为一等实体（与科技同等对待）。
 * 数值效果与模拟器同源：effects.ts 合成的 CIV_BONUSES / BUILDING_CIV_BONUSES / TEAM_BONUSES（.dat 优先、手工回退，按 bon 序号关联）。
 */
import { effectKey, effectParts, unitGroup, type AffectGroup, type AffectRow } from './affects';
import { buildingBase, type BCivBonus, type BPred } from './buildingSim';
import { BUILDING_TYPE_ZH } from './buildings';
import type { DatEco, DatEntry } from './datEffects';
import {
  BONUS_DAT,
  BONUS_SRC,
  BUILDING_CIV_BONUSES,
  CIV_BONUSES,
  CIV_TECH_EXTRAS,
  DAT_FRESH,
  TEAM_BLD,
  TEAM_BONUSES,
  TEAM_ECO,
  type BonusSrc,
  type CivBonus,
  type TeamBonus,
  type TechExtra,
} from './effects';
import { applyEffects, baseStats } from './simulator';
import type { Building, Civ, Effect, NumStat, StatSet, Unit } from './types';

export type BonusCat = '经济' | '军事' | '建筑' | '科技' | '费用' | '海军' | '僧侣' | '其他';
export const BONUS_CATS: BonusCat[] = ['经济', '军事', '建筑', '科技', '费用', '海军', '僧侣', '其他'];

export interface CivBonusEnt {
  /** <文明>-<序号> 或 <文明>-team */
  id: string;
  civ: string;
  idx: number | 'team';
  team: boolean;
  zh: string;
  en: string;
  /** 文本中写明的适用时代（1-4）；null = 全时代 / 未写明 */
  ages: number[] | null;
  cats: BonusCat[];
  unitFx: CivBonus[];
  bldFx: BCivBonus[];
  teamFx: TeamBonus[];
  teamBld: [BPred, Effect[]][];
  /** 由科技触发的部分：科技英文名 → 规则 */
  techFx: [string, TechExtra][];
  /** 数值来源 */
  src: BonusSrc;
  /** 关联的 .dat 条目（含经济/费用项） */
  dat: DatEntry[];
  /** 团队加成的 .dat 经济项 */
  eco: DatEco[];
  /** .dat 数值与当前文本的一致性：true 吻合 / false 不一致（已回退） / null 无可比数值或无 .dat */
  fresh: boolean | null;
  encoded: boolean;
}

const AGE_EN: Record<string, number> = { Dark: 1, Feudal: 2, Castle: 3, Imperial: 4 };
export function parseAges(en: string): number[] | null {
  const st = en.match(/starting in (Dark|Feudal|Castle|Imperial) Age/);
  if (st) return [1, 2, 3, 4].filter((a) => a >= AGE_EN[st[1]!]!);
  const m = en.match(/in ((?:(?:Dark|Feudal|Castle|Imperial)\/?)+) Age/);
  if (m)
    return m[1]!
      .split('/')
      .map((x) => AGE_EN[x]!)
      .filter(Boolean);
  return null;
}

export function classify(en: string): BonusCat[] {
  const c = new Set<BonusCat>();
  if (/Ship|Galley|Dromon|Longship|Galleon|Warship|Dock|Caravel|Lou Chuan|Fish Trap|Careening|Dry Dock|Turtle/i.test(en)) c.add('海军');
  if (/\bMonks?\b|Monaster|Relic|Fortified Church|Fervor|Sanctity|faith|healing/i.test(en)) c.add('僧侣');
  if (/cost|free|-\d+%|discount|cheaper/i.test(en)) c.add('费用');
  if (/technolog|upgrade/i.test(en)) c.add('科技');
  if (
    /Villager|work|gather|Farm|Fish|Lumber|Miner|Forag|Hunt|Shepherd|Trade|Market|resource|drop off|carry|Mill|Camp|Livestock|food|gold|wood|stone|Pasture|Folwark|population|Start with/i.test(
      en,
    )
  )
    c.add('经济');
  if (/Town Center|Building|Castle|Tower|Wall|House|Fortif|Krepost|Donjon|Settlement|Caravanserai|Feitoria|repair/i.test(en)) c.add('建筑');
  if (
    /HP|attack|armor|range|line of sight|move|Infantry|Cavalry|Archer|Mounted|Units?\b|Soldiers|Spearman|Militia|Knight|Scout|Elephant|Camel|Siege|Gunpowder|Skirmisher/i.test(
      en,
    )
  )
    c.add('军事');
  if (!c.size) c.add('其他');
  return BONUS_CATS.filter((x) => c.has(x));
}

export function civBonuses(c: Civ): CivBonusEnt[] {
  const U = CIV_BONUSES[c.en] ?? [],
    B = BUILDING_CIV_BONUSES[c.en] ?? [];
  const list: CivBonusEnt[] = c.bon.map((zh, i) => {
    const en = c.bonEn[i] ?? '';
    const unitFx = U.filter((x) => x[3] === i),
      bldFx = B.filter((x) => x[3] === i);
    const src = BONUS_SRC[c.en]?.[String(i)] ?? 'text';
    const techFx: [string, TechExtra][] =
      src === 'dat'
        ? Object.entries(CIV_TECH_EXTRAS[c.en] ?? {}).flatMap(([t, l]) => l.filter((x) => x.idx === i).map((x) => [t, x] as [string, TechExtra]))
        : [];
    const dat = BONUS_DAT[c.en]?.[String(i)] ?? [];
    return {
      id: `${c.en}-${i}`,
      civ: c.en,
      idx: i,
      team: false,
      zh,
      en,
      ages: parseAges(en),
      cats: classify(en),
      unitFx,
      bldFx,
      teamFx: [],
      teamBld: [],
      techFx,
      src,
      dat,
      eco: [],
      fresh: DAT_FRESH(c.en, String(i)),
      encoded: unitFx.length + bldFx.length + techFx.length > 0,
    };
  });
  const teamFx = TEAM_BONUSES.filter((t) => t[0] === c.en);
  const teamBld = TEAM_BLD[c.en] ?? [];
  list.push({
    id: `${c.en}-team`,
    civ: c.en,
    idx: 'team',
    team: true,
    zh: c.tb,
    en: c.tbEn,
    ages: parseAges(c.tbEn),
    cats: classify(c.tbEn),
    unitFx: [],
    bldFx: [],
    teamFx,
    teamBld,
    techFx: [],
    src: BONUS_SRC[c.en]?.team ?? 'text',
    dat: [],
    eco: TEAM_ECO[c.en] ?? [],
    fresh: DAT_FRESH(c.en, 'team'),
    encoded: teamFx.length + teamBld.length > 0,
  });
  return list;
}
export const allCivBonuses = (civs: readonly Civ[]) => civs.flatMap(civBonuses);

/** 某加成在某时代对某单位的效果（团队加成与时代无关） */
export function unitEffects(b: CivBonusEnt, u: Unit, age: number): Effect[] {
  return [...b.unitFx.filter(([f]) => f(u)).flatMap(([, g]) => g(age)), ...b.teamFx.filter(([, , f]) => f(u)).flatMap((t) => t[3](u))];
}
export const bldEffects = (b: CivBonusEnt, x: Building, age: number): Effect[] => [
  ...b.bldFx.filter(([f]) => f(x)).flatMap(([, g]) => g(age)),
  ...b.teamBld.filter(([f]) => f(x)).flatMap(([, fx]) => fx),
];

/** 作用对象（与模拟器同一判定）。按帝王时代数值合并同效果；civOnly=true 时只列该文明拥有的单位/建筑（团队加成列全部） */
export function bonusAffects(b: CivBonusEnt, units: readonly Unit[], buildings: readonly Building[], civOnly = true): AffectGroup[] {
  const G = new Map<string, Map<string, AffectRow>>();
  const add = (g: string, ef: Effect[], u?: Unit, x?: Building) => {
    const k = effectKey(ef);
    const m = G.get(g) ?? new Map<string, AffectRow>();
    G.set(g, m);
    const r = m.get(k) ?? { effect: k, parts: effectParts(ef), units: [], buildings: [] };
    m.set(k, r);
    if (u) r.units.push(u);
    if (x) r.buildings.push(x);
  };
  const own = (civs: string[]) => !civOnly || b.team || civs.includes(b.civ);
  units.forEach((u) => {
    if (!own(u.civs)) return;
    const ef = unitEffects(b, u, 4);
    if (ef.length) add(unitGroup(u), ef, u);
  });
  buildings.forEach((x) => {
    if (!own(x.civs)) return;
    const ef = bldEffects(b, x, 4);
    if (ef.length) add(BUILDING_TYPE_ZH[x.type] + '建筑', ef, undefined, x);
  });
  return [...G.entries()].map(([group, m]) => ({ group, rows: [...m.values()] }));
}

export interface Example {
  name: string;
  kind: 'unit' | 'building';
  id: number;
  /** [适用时代（相同数值的时代合并）, 属性, 之前, 之后]；团队加成时代为空数组 */
  rows: [number[], NumStat, number, number][];
}
const STATS: NumStat[] = ['hp', 'atk', 'ma', 'pa', 'rng', 'spd', 'los', 'rof', 'gar', 'bt', 'minr'];
function diffRows(base: StatSet, f: (age: number) => Effect[], ages: number[]): Example['rows'] {
  const out: Example['rows'] = [];
  const last = new Map<NumStat, Example['rows'][number]>();
  ages.forEach((a) => {
    const S: StatSet = { ...base, bonus: { ...base.bonus } };
    applyEffects(S, f(a));
    S.rof = S.rof / S.rofx;
    S.hp = Math.round(S.hp);
    STATS.forEach((k) => {
      if (Math.abs(S[k] - base[k]) < 1e-9) return;
      const v = Math.round(S[k] * 100) / 100,
        p = last.get(k);
      if (p && p[3] === v && p[0].at(-1) === a - 1) p[0].push(a);
      else {
        const r: Example['rows'][number] = [[a], k, base[k], v];
        out.push(r);
        last.set(k, r);
      }
    });
  });
  return out;
}
/** 代表性数值示例：优先选该文明拥有的、受影响的最高时代单位/建筑 */
export function bonusExample(b: CivBonusEnt, units: readonly Unit[], buildings: readonly Building[], prefer?: string): Example | null {
  const ages = b.team ? [4] : [1, 2, 3, 4];
  const us = units.filter((u) => u.civs.length && unitEffects(b, u, 4).length && (b.team || u.civs.includes(b.civ)));
  const pick = us.find((u) => u.en === prefer) ?? [...us].sort((x, y) => y.age - x.age || y.hp - x.hp)[0];
  if (pick) {
    const rows = diffRows(baseStats(pick), (a) => unitEffects(b, pick, a), ages);
    if (rows.length) return { name: pick.zh, kind: 'unit', id: pick.id, rows: b.team ? rows.map((r) => [[], r[1], r[2], r[3]]) : rows };
  }
  const bs = buildings.filter((x) => bldEffects(b, x, 4).length && x.civs.includes(b.civ));
  const bx = bs.find((x) => x.en === prefer) ?? bs.find((x) => x.en === 'Town Center') ?? bs[0];
  if (bx) {
    const rows = diffRows(buildingBase(bx), (a) => bldEffects(b, bx, a), ages);
    if (rows.length) return { name: bx.zh, kind: 'building', id: bx.id, rows };
  }
  return null;
}
