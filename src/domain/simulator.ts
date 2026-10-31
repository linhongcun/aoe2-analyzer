/** 科技模拟器效果引擎（纯函数，无 UI 依赖） */
import type { Cost, Effect, SimStats, StatSet, Tech, Trees, Unit } from './types';
import { CIV_BONUSES, CIV_TECH_EXTRAS, TEAM_BONUSES, TECH_EFFECTS, TEXT_ONLY_TECHS, genericFx } from './effects';

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

// 纯函数放在无数据依赖的模块里，单位列表等轻量链路不必引入效果数据（issue 280）。
import { civStatus } from './civStatus';
export { civStatus };

export function baseStats(u: Unit): StatSet {
  const bonus: Record<string, number> = {};
  u.atks.forEach(([n, v]) => {
    if (n !== '近战' && n !== '穿刺') bonus[n] = v;
  });
  return {
    hp: u.hp,
    atk: u.atk,
    ma: u.ma,
    pa: u.pa,
    rng: u.rng,
    spd: u.spd,
    los: u.los,
    rof: u.rof,
    acc: u.acc,
    minr: u.minr,
    gar: 0,
    bt: u.tt,
    barm: 0,
    bonus,
    rofx: 1,
  };
}

export function applyEffects(S: StatSet, list: readonly Effect[]): void {
  for (const e of list) {
    if (e.s === 'bonus') {
      if (e.op === 'mul') {
        if (S.bonus[e.vs] !== undefined) S.bonus[e.vs] = S.bonus[e.vs]! * e.v;
      } else S.bonus[e.vs] = (S.bonus[e.vs] ?? 0) + e.v;
    } else if (e.s === 'rof') S.rofx *= 1 + e.v;
    else if (e.op === 'mul') S[e.s] *= e.v;
    else if (e.op === 'set') S[e.s] = e.v;
    else S[e.s] += e.v;
  }
}

/** 该文明下对该单位有意义的科技（编码了数值的 + 独特科技/文本项） */
export function simTechs(ctx: SimContext, u: Unit, civ: string): SimTech[] {
  const st = civStatus(ctx.trees, civ);
  const r: SimTech[] = [];
  const ex = CIV_TECH_EXTRAS[civ] ?? {};
  Object.keys(TECH_EFFECTS).forEach((n) => {
    const t = ctx.techByEn[n];
    if (!t || !st['t' + t.id]) return;
    if (t.type === 'UniqueTech' && !t.civs.includes(civ)) return;
    const ef = [...TECH_EFFECTS[n]!.filter(([f]) => f(u)).flatMap((x) => x[1]), ...(ex[n] ?? []).filter((x) => !x.b && x.pred(u)).flatMap((x) => x.fx)];
    if (ef.length) r.push({ t, ef });
  });
  // 本文明加成由科技触发、但通用科技本身不作用于该单位（如印加村民 + 锻造）
  Object.entries(ex).forEach(([n, l]) => {
    const t = ctx.techByEn[n];
    if (!t || !st['t' + t.id] || r.some((x) => x.t.id === t.id)) return;
    const ef = l.filter((x) => !x.b && x.pred(u)).flatMap((x) => x.fx);
    if (ef.length) r.push({ t, ef });
  });
  ctx.techs.filter((t) => t.type === 'UniqueTech' && t.civs.includes(civ) && !r.some((x) => x.t.id === t.id)).forEach((t) => r.push({ t, ef: null }));
  TEXT_ONLY_TECHS.forEach((n) => {
    const t = ctx.techByEn[n];
    if (t && st['t' + t.id] && (n !== 'Ballistics' || u.rng > 1)) r.push({ t, ef: null });
  });
  return r;
}

export function civBonusNotes(u: Unit, civ: string): string[] {
  return [...new Set((CIV_BONUSES[civ] ?? []).filter(([f]) => f(u)).map((x) => x[2]))];
}
/** 科技触发的文明加成在当前时代是否生效（如印加村民吃锻造需城堡时代） */
const extraOk = (civ: string, t: Tech, u: Unit, age: number) => (CIV_TECH_EXTRAS[civ]?.[t.en] ?? []).every((x) => x.b || !x.pred(u) || x.age <= age);

export interface SimStep {
  source: string;
  techId?: number;
  before: StatSet;
  after: StatSet;
}

export function simulate(
  ctx: SimContext,
  u: Unit,
  civ: string,
  age: number,
  sel: ReadonlySet<number>,
  team: ReadonlySet<number>,
  trace?: (step: SimStep) => void,
): SimStats {
  const S: SimStats = baseStats(u);
  const apply = (list: readonly Effect[], source: string, techId?: number) => {
    const before = trace ? { ...S, bonus: { ...S.bonus } } : null;
    applyEffects(S, list);
    if (trace && before) trace({ source, techId, before, after: { ...S, bonus: { ...S.bonus } } });
  };
  (CIV_BONUSES[civ] ?? []).forEach(([f, g, note]) => {
    if (f(u)) apply(g(age), `文明加成：${note}`);
  });
  simTechs(ctx, u, civ).forEach(({ t, ef }) => {
    if (!ef || !sel.has(t.id)) return;
    if (extraOk(civ, t, u, age)) apply(ef, `科技：${t.zh}`, t.id);
    else {
      // 时代未到：只施加通用部分
      apply(
        (TECH_EFFECTS[t.en] ?? []).filter(([f]) => f(u)).flatMap((x) => x[1]),
        `科技：${t.zh}`,
        t.id,
      );
      apply(
        (CIV_TECH_EXTRAS[civ]?.[t.en] ?? []).filter((x) => !x.b && x.pred(u) && x.age <= age).flatMap((x) => x.fx),
        `科技触发的文明加成：${t.zh}`,
        t.id,
      );
    }
  });
  TEAM_BONUSES.forEach(([, note, f, ef], i) => {
    if (team.has(i) && f(u)) apply(ef(u), `团队加成：${note}`);
  });
  apply(
    genericFx(u, false, age, (n) => !!ctx.techByEn[n] && sel.has(ctx.techByEn[n]!.id)),
    '时代与单位特殊规则',
  );
  S.rof = S.rof / S.rofx;
  // .dat 逐时代乘子保留 4 位小数（如 1.0909），容差 0.2 后取整（1.1×1.0909×1.0833 = 1.29995）
  S.hp = Math.floor(S.hp + 0.2);
  // #38 .dat 射程科技改的是属性 12（Range = 对建筑射程），对单位射程同步变化，差值恒定
  if (u.rngBd) S.rngB = S.rng + u.rngBd;
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

export { decideSimCanonical, parseUnitPath, routeWithQueryCiv, unitHashLocation, unitPath, type SimCanonical, type SimRoute } from './simRoute';
