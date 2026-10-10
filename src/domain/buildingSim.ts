/**
 * 建筑科技模拟器：复用 simulator.ts 的效果引擎（applyEffects / civStatus / totalCost / prereq）。
 * 数值来源：AoE2 Fandom Wiki 科技页（Masonry、Architecture、Hoardings、Arrowslits、Fletching/Bodkin/Bracer、
 * Chemistry、Murder Holes、Heated Shot、Town Watch/Patrol、Treadmill Crane）与游戏内文明加成文本。
 */
import type { Building, Effect, StatSet } from './types';
import { applyEffects, civStatus, type SimContext, type SimTech } from './simulator';

export type BPred = (b: Building) => boolean;
const is =
  (...names: string[]): BPred =>
  (b) =>
    names.includes(b.en);
const TOWERS = ['Watch Tower', 'Guard Tower', 'Keep'];
/** 射箭的防御工事（受箭术系/化学影响） */
const ARROW_FORT = is(...TOWERS, 'Castle', 'Krepost');
/** Wiki Fletching/Bodkin/Bracer：Harbors、Kreposts、Bombard Towers 亦受益 */
const FLETCH_BLD = is(...TOWERS, 'Castle', 'Krepost', 'Harbor', 'Bombard Tower');
const DEFENSIVE = is(...TOWERS, 'Castle', 'Krepost', 'Donjon', 'Bombard Tower');
const all: BPred = () => true;
const arrow: Effect[] = [
  { s: 'atk', v: 1 },
  { s: 'rng', v: 1 },
  { s: 'los', v: 1 },
];
const masonry: Effect[] = [
  { s: 'hp', op: 'mul', v: 1.1 },
  { s: 'ma', v: 1 },
  { s: 'pa', v: 1 },
  { s: 'barm', v: 3 },
];

export const BUILDING_EFFECTS: Record<string, [BPred, Effect[]][]> = {
  Masonry: [[all, masonry]],
  Architecture: [[all, masonry]],
  Hoardings: [
    [is('Castle'), [{ s: 'hp', op: 'mul', v: 1.21 }]],
    [is('Donjon'), [{ s: 'hp', op: 'mul', v: 1.4444 }]],
    [is('Krepost'), [{ s: 'hp', op: 'mul', v: 1.385 }]],
  ],
  Fletching: [
    [FLETCH_BLD, arrow],
    [
      is('Town Center'),
      [
        { s: 'atk', v: 1 },
        { s: 'los', v: 1 },
      ],
    ],
  ],
  'Bodkin Arrow': [
    [FLETCH_BLD, arrow],
    [
      is('Town Center'),
      [
        { s: 'atk', v: 1 },
        { s: 'los', v: 1 },
      ],
    ],
  ],
  Bracer: [
    [FLETCH_BLD, arrow],
    [
      is('Town Center'),
      [
        { s: 'atk', v: 1 },
        { s: 'los', v: 1 },
      ],
    ],
  ],
  Chemistry: [[is(...TOWERS, 'Castle', 'Krepost', 'Bombard Tower'), [{ s: 'atk', v: 1 }]]],
  Arrowslits: [
    [is('Watch Tower'), [{ s: 'atk', v: 1 }]],
    [is('Guard Tower'), [{ s: 'atk', v: 2 }]],
    [is('Keep', 'Donjon'), [{ s: 'atk', v: 3 }]],
  ],
  'Murder Holes': [[(b) => DEFENSIVE(b) && b.minr > 0, [{ s: 'minr', op: 'set', v: 0 }]]],
  'Heated Shot': [[is('Castle', 'Krepost', 'Harbor', 'Dock', 'Fortified Church'), [{ s: 'bonus', vs: '船只', v: 4 }]]],
  'Town Watch': [[all, [{ s: 'los', v: 4 }]]],
  'Town Patrol': [[all, [{ s: 'los', v: 4 }]]],
  'Treadmill Crane': [[all, [{ s: 'bt', op: 'mul', v: 1 / 1.2 }]]],
};
/** 相关但不计入数值的科技（线路升级或不便数值化） */
export const BUILDING_TEXT_ONLY: Record<string, BPred> = {
  'Heated Shot': is(...TOWERS),
  Ballistics: ARROW_FORT,
  'Guard Tower': is('Watch Tower'),
  Keep: is('Guard Tower'),
  'Fortified Wall': is('Stone Wall'),
  'Bombard Tower': is(...TOWERS),
};

export type BCivBonus = [BPred, (age: number) => Effect[], string];
/** 文明加成（来自游戏内文明说明，仅编码明确数值） */
export const BUILDING_CIV_BONUSES: Record<string, BCivBonus[]> = {
  Byzantines: [[all, (a) => [{ s: 'hp', op: 'mul', v: 1 + 0.1 * a }], '建筑生命值随时代 +10/20/30/40%']],
  Spanish: [[all, () => [{ s: 'bt', op: 'mul', v: 1 / 1.3 }], '建筑工工作速度 +30%']],
  Persians: [[is('Town Center', 'Dock'), () => [{ s: 'hp', op: 'mul', v: 2 }], '城镇中心和码头生命值 +100%']],
  Chinese: [[is('Town Center'), () => [{ s: 'los', v: 7 }], '城镇中心视野 +7']],
  Teutons: [
    [is('Town Center'), () => [{ s: 'gar', v: 10 }], '城镇中心驻扎容量 +10'],
    [is(...TOWERS), () => [{ s: 'gar', v: 5 }], '塔驻扎容量 +5'],
  ],
  Sicilians: [
    [(b) => b.type === 'defense' || DEFENSIVE(b), () => [{ s: 'bt', op: 'mul', v: 1 / 1.5 }], '防御工事建造速度 +50%'],
    [is('Town Center'), () => [{ s: 'bt', op: 'mul', v: 1 / 2 }], '城镇中心建造速度 +100%'],
  ],
};

export function buildingBase(b: Building): StatSet {
  return {
    hp: b.hp,
    atk: b.atk,
    ma: b.ma,
    pa: b.pa,
    rng: b.rng,
    spd: 0,
    los: b.los,
    rof: b.rof,
    acc: 100,
    minr: b.minr,
    gar: b.gar,
    bt: b.bt,
    barm: b.barm,
    bonus: {},
    rofx: 1,
  };
}

export function buildingSimTechs(ctx: SimContext, b: Building, civ: string): SimTech[] {
  const st = civStatus(ctx.trees, civ);
  const r: SimTech[] = [];
  const has = (n: string) => {
    const t = ctx.techByEn[n];
    return t && st['t' + t.id] ? t : null;
  };
  Object.keys(BUILDING_EFFECTS).forEach((n) => {
    const t = has(n);
    if (!t) return;
    const ef = BUILDING_EFFECTS[n]!.filter(([f]) => f(b)).flatMap((x) => x[1]);
    if (ef.length) r.push({ t, ef });
  });
  Object.entries(BUILDING_TEXT_ONLY).forEach(([n, f]) => {
    const t = has(n);
    if (t && f(b) && !r.some((x) => x.t.id === t.id)) r.push({ t, ef: null });
  });
  // 在该建筑研究的独特科技：仅文本
  ctx.techs.filter((t) => t.type === 'UniqueTech' && t.civs.includes(civ) && b.techs.includes(t.id)).forEach((t) => r.push({ t, ef: null }));
  return r;
}

export const buildingCivNotes = (b: Building, civ: string) => (BUILDING_CIV_BONUSES[civ] ?? []).filter(([f]) => f(b)).map((x) => x[2]);

export function simulateBuilding(ctx: SimContext, b: Building, civ: string, age: number, sel: ReadonlySet<number>): StatSet {
  const S = buildingBase(b);
  (BUILDING_CIV_BONUSES[civ] ?? []).forEach(([f, g]) => {
    if (f(b)) applyEffects(S, g(age));
  });
  buildingSimTechs(ctx, b, civ).forEach(({ t, ef }) => {
    if (ef && sel.has(t.id)) applyEffects(S, ef);
  });
  S.hp = Math.round(S.hp);
  S.bt = Math.round(S.bt * 10) / 10;
  return S;
}
