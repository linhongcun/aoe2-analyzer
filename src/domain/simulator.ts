/** 科技模拟器效果引擎（纯函数，无 UI 依赖） */
import type { Cost, Effect, StatSet, Tech, Trees, Unit } from './types';
import { CIV_BONUSES, TEAM_BONUSES, TECH_EFFECTS, TEXT_ONLY_TECHS } from './effects';

export interface SimContext {
  techs: Tech[];
  trees: Trees;
  techByEn: Record<string, Tech>;
}
export interface SimTech {
  t: Tech;
  ef: Effect[] | null;
}

export function makeSimContext(techs: Tech[], trees: Trees): SimContext {
  const techByEn: Record<string, Tech> = {};
  techs.forEach((t) => {
    if (!techByEn[t.en]) techByEn[t.en] = t;
  });
  return { techs, trees, techByEn };
}

/** 某文明科技树中可用项目，键为 "u<id>" / "t<id>" */
export function civStatus(trees: Trees, civ: string): Record<string, number> {
  const s: Record<string, number> = {};
  (trees.t[civ] ?? []).forEach((b) =>
    b[3].forEach((c) => {
      s[c[2] + c[3]] = c[4];
    }),
  );
  return s;
}

export function baseStats(u: Unit): StatSet {
  const bonus: Record<string, number> = {};
  u.atks.forEach(([n, v]) => {
    if (n !== '近战' && n !== '穿刺') bonus[n] = v;
  });
  return { hp: u.hp, atk: u.atk, ma: u.ma, pa: u.pa, rng: u.rng, spd: u.spd, los: u.los, rof: u.rof, acc: u.acc, bonus, rofx: 1 };
}

export function applyEffects(S: StatSet, list: readonly Effect[]): void {
  for (const e of list) {
    if (e.s === 'bonus') S.bonus[e.vs] = (S.bonus[e.vs] ?? 0) + e.v;
    else if (e.s === 'rof') S.rofx *= 1 + e.v;
    else if (e.op === 'mul') S[e.s] *= e.v;
    else if (e.op === 'set') S[e.s] = e.v;
    else S[e.s] += e.v;
  }
}

/** 该文明下对该单位有意义的科技（编码了数值的 + 独特科技/文本项） */
export function simTechs(ctx: SimContext, u: Unit, civ: string): SimTech[] {
  const st = civStatus(ctx.trees, civ);
  const r: SimTech[] = [];
  Object.keys(TECH_EFFECTS).forEach((n) => {
    const t = ctx.techByEn[n];
    if (!t || !st['t' + t.id]) return;
    const ef = TECH_EFFECTS[n]!.filter(([f]) => f(u)).flatMap((x) => x[1]);
    if (ef.length) r.push({ t, ef });
  });
  ctx.techs.filter((t) => t.type === 'UniqueTech' && t.civs.includes(civ)).forEach((t) => r.push({ t, ef: null }));
  TEXT_ONLY_TECHS.forEach((n) => {
    const t = ctx.techByEn[n];
    if (t && st['t' + t.id] && (n !== 'Ballistics' || u.rng > 1)) r.push({ t, ef: null });
  });
  return r;
}

export function civBonusNotes(u: Unit, civ: string): string[] {
  return (CIV_BONUSES[civ] ?? []).filter(([f]) => f(u)).map((x) => x[2]);
}

export function simulate(ctx: SimContext, u: Unit, civ: string, age: number, sel: ReadonlySet<number>, team: ReadonlySet<number>): StatSet {
  const S = baseStats(u);
  (CIV_BONUSES[civ] ?? []).forEach(([f, g]) => {
    if (f(u)) applyEffects(S, g(age));
  });
  simTechs(ctx, u, civ).forEach(({ t, ef }) => {
    if (ef && sel.has(t.id)) applyEffects(S, ef);
  });
  TEAM_BONUSES.forEach(([, , f, ef], i) => {
    if (team.has(i) && f(u)) applyEffects(S, ef);
  });
  S.rof = S.rof / S.rofx;
  S.hp = Math.floor(S.hp);
  return S;
}

/** 所有可数值计入的科技 */
export const allNumeric = (avail: readonly SimTech[]) => new Set(avail.filter((x) => x.ef).map((x) => x.t.id));
/** 时代预设：该时代及之前的全部可计入科技 */
export const presetUpTo = (avail: readonly SimTech[], age: number) => new Set(avail.filter((x) => x.ef && x.t.age <= age).map((x) => x.t.id));

export function totalCost(avail: readonly SimTech[], sel: ReadonlySet<number>): { cost: Cost; time: number } {
  const cost: Cost = {};
  let time = 0;
  avail.forEach(({ t }) => {
    if (sel.has(t.id)) {
      Object.entries(t.cost).forEach(([k, v]) => (cost[k] = (cost[k] ?? 0) + v));
      time += t.rt;
    }
  });
  return { cost, time };
}

export function simGroup(t: Tech): string {
  return t.type === 'UniqueTech' ? '城堡（独特科技）' : t.bz;
}

/** 解析/生成 #unit/<id>/<civ>/<age>/<ids>/<team> */
export interface SimRoute {
  id: number;
  civ?: string;
  age?: number;
  ids: number[];
  team: number[];
}
const nums = (s?: string) =>
  (s ?? '')
    .split(',')
    .filter((x) => x)
    .map(Number);
export function parseUnitPath(path: string): SimRoute | null {
  const m = path.match(/^\/?unit\/(\d+)(?:\/([^/]*))?(?:\/(\d))?(?:\/([\d,]*))?(?:\/([\d,]*))?/);
  if (!m) return null;
  return { id: +m[1]!, civ: m[2] || undefined, age: m[3] ? +m[3] : undefined, ids: nums(m[4]), team: nums(m[5]) };
}
export const unitPath = (id: number, civ: string, age: number, sel: Iterable<number>, team: Iterable<number>) =>
  `/unit/${id}/${civ}/${age}/${[...sel].join(',')}/${[...team].join(',')}`;
