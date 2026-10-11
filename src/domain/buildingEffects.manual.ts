/**
 * 手工编码的建筑效果（历史版本，依据 Fandom Wiki 科技页与游戏内文明说明）。
 * 现在只作为回退：.dat 生成数据缺失或与当前补丁文本不一致时使用；差异见 docs/EFFECTS-AUDIT.md。
 */
import type { Building, Effect } from './types';

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

export const MANUAL_BUILDING_EFFECTS: Record<string, [BPred, Effect[]][]> = {
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

/** [适用判定, 按时代的效果, 说明, 对应 civs.json bon 的序号] */
export type BCivBonus = [BPred, (age: number) => Effect[], string, number];
/** 文明加成（来自游戏内文明说明，仅编码明确数值） */
export const MANUAL_BUILDING_CIV_BONUSES: Record<string, BCivBonus[]> = {
  Byzantines: [[all, (a) => [{ s: 'hp', op: 'mul', v: 1 + 0.1 * a }], '建筑生命值随时代 +10/20/30/40%', 0]],
  Spanish: [[all, () => [{ s: 'bt', op: 'mul', v: 1 / 1.3 }], '建筑工工作速度 +30%', 0]],
  Persians: [[is('Town Center', 'Dock'), () => [{ s: 'hp', op: 'mul', v: 2 }], '城镇中心和码头生命值 +100%', 1]],
  Chinese: [[is('Town Center'), () => [{ s: 'los', v: 7 }], '城镇中心视野 +7', 2]],
  Teutons: [
    [is('Town Center'), () => [{ s: 'gar', v: 10 }], '城镇中心驻扎容量 +10', 1],
    [is(...TOWERS), () => [{ s: 'gar', v: 5 }], '塔驻扎容量 +5', 1],
  ],
  Sicilians: [
    [(b) => b.type === 'defense' || DEFENSIVE(b), () => [{ s: 'bt', op: 'mul', v: 1 / 1.5 }], '防御工事建造速度 +50%', 4],
    [is('Town Center'), () => [{ s: 'bt', op: 'mul', v: 1 / 2 }], '城镇中心建造速度 +100%', 4],
  ],
};
