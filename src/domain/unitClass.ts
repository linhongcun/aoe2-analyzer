import type { Unit, UnitPred } from './types';
// 单位类别判定（基于护甲类别 id：1步兵 8骑兵 15弓手 23火药 28骑射 30骆驼 5战象 38散兵 20攻城）
export const hasCls = (u: Unit, c: number) => u.cls.includes(c);
export const isInf: UnitPred = (u) => hasCls(u, 1);
export const isMounted: UnitPred = (u) => hasCls(u, 8) || hasCls(u, 30) || hasCls(u, 5);
export const isArcher: UnitPred = (u) => hasCls(u, 15);
export const isGun: UnitPred = (u) => hasCls(u, 23);
export const isCA: UnitPred = (u) => hasCls(u, 28);
export const isSkirm: UnitPred = (u) => hasCls(u, 38);
export const isCamel: UnitPred = (u) => hasCls(u, 30);
export const isMelee: UnitPred = (u) => u.rng <= 1 && (isInf(u) || isMounted(u));
export const isArrow: UnitPred = (u) => isArcher(u) && !isGun(u);
export const isFootArcher: UnitPred = (u) => isArcher(u) && !isMounted(u) && !isGun(u);
const MIL = /^(Militia|Man-at-Arms|Long Swordsman|Two-Handed Swordsman|Champion|Fire Lancer|Elite Fire Lancer|Varangian Guard|Elite Varangian Guard)$/;
const KNL = /^(Knight|Cavalier|Paladin)$/;
export const isMilitiaLine: UnitPred = (u) => MIL.test(u.en);
export const isKnightLine: UnitPred = (u) => KNL.test(u.en);
