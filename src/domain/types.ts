/** 资源费用，键为 aoe2techtree 资源名 */
export type Cost = Partial<Record<'Food' | 'Wood' | 'Gold' | 'Stone', number>> & Record<string, number>;
export type Age = 1 | 2 | 3 | 4;
export type CivType = 'cav' | 'arch' | 'inf' | 'naval' | 'monk' | 'siege' | 'def' | 'eco';

export interface Civ {
  en: string;
  zh: string;
  ty: CivType[];
  desc: string;
  uu: string;
  ct: string;
  it: string;
  bon: string[];
  bonEn: string[];
  tb: string;
  tbEn: string;
  /** 8 项能力评分：骑兵 弓手 步兵 经济 防御 攻城 僧侣 海军 */
  s: number[];
  fl: number;
  pk: number;
  op: string;
  /** 派生：DLC 序号 */
  dlc: number | null;
}
export interface Unit {
  id: number;
  en: string;
  zh: string;
  type: string;
  age: number;
  b: number;
  pic: number | string;
  from_: number | null;
  cost: Cost;
  hp: number;
  atk: number;
  ma: number;
  pa: number;
  rng: number;
  minr: number;
  spd: number;
  los: number;
  rof: number;
  tt: number;
  acc: number;
  blast: number;
  atks: [string, number][];
  arms: [string, number][];
  desc: string;
  civs: string[];
  /** 原始护甲类别 id（用于模拟器判定单位类别） */
  cls: number[];
  /** 护甲类别（不含近战/穿刺）：[类别名, 护甲值]，决定受到哪些克制加成 */
  armc: [string, number][];
  up: [Cost, number] | null;
  bz: string;
  ben: string;
  dlc: number | null;
}
export interface Tech {
  id: number;
  en: string;
  zh: string;
  type: string;
  age: number;
  b: number;
  pic: number | string;
  pre: number | null;
  cost: Cost;
  rt: number;
  desc: string;
  descEn: string;
  civs: string[];
  bz: string;
  ben: string;
  dlc: number | null;
}
/** 科技树格子：[行, 列, 类型 u/t, id, 是否可用 0/1, 连线父级 id] */
/** 格子类型：u=单位 t=科技 b=建筑（如鱼栅、港口） */
export type TreeCell = [number, number, 'u' | 't' | 'b', number, number, number | null];
export type TreeBlock = [number, number, number, TreeCell[]];
export interface Trees {
  b: Record<string, [string, string, string | number, number]>;
  t: Record<string, TreeBlock[]>;
}
export interface Dlc {
  zh: string;
  en: string;
  year: number;
  civs: string[];
}

export interface StatSet {
  hp: number;
  atk: number;
  ma: number;
  pa: number;
  rng: number;
  spd: number;
  /** 最小射程 / 驻扎容量 / 建造或生产时间 / 建筑护甲（建筑模拟器用） */
  minr: number;
  gar: number;
  bt: number;
  barm: number;
  los: number;
  rof: number;
  acc: number;
  bonus: Record<string, number>;
  rofx: number;
}
export type NumStat = Exclude<keyof StatSet, 'bonus' | 'rofx'>;
/** 效果：add 加值、mul 乘、set 设定；rof 表示攻速 +x%（攻击间隔 /(1+x)）；bonus 为对某类别的加成伤害（op=mul 时按倍率放大已有加成） */
export type Effect =
  { s: Exclude<NumStat, 'rof'>; op?: 'add' | 'mul' | 'set'; v: number } | { s: 'rof'; v: number } | { s: 'bonus'; vs: string; v: number; op?: 'add' | 'mul' };
export type UnitPred = (u: Unit) => boolean;

export type BuildingType = 'military' | 'economy' | 'defense' | 'other';
export interface Building {
  id: number;
  en: string;
  zh: string;
  age: number;
  pic: number;
  cost: Cost;
  hp: number;
  ma: number;
  pa: number;
  /** 建筑护甲（护甲类别 21） */
  barm: number;
  /** 建造时间（秒） */
  bt: number;
  gar: number;
  atk: number;
  rng: number;
  minr: number;
  rof: number;
  los: number;
  /** 提供人口（仅当游戏说明中明确写出时） */
  pop: number;
  desc: string;
  descEn: string;
  civs: string[];
  /** 该建筑格子中出现过的单位/科技（所有文明并集） */
  units: number[];
  techs: number[];
  dlc: number | null;
  type: BuildingType;
}
