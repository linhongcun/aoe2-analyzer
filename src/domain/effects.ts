/** 结构化效果表：科技英文名 -> [适用单位判定, 效果列表][]。数值来源：游戏内说明与 AoE2 Fandom Wiki。 */
import type { Effect, UnitPred } from './types';
import { isArrow, isCA, isCamel, isFootArcher, isGun, isInf, isKnightLine, isMelee, isMilitiaLine, isMounted, isArcher, isSkirm } from './unitClass';

export type EffectRule = [UnitPred, Effect[]];
const cav: UnitPred = (u) => isMounted(u) && !isArcher(u);
/** 射箭战船（Wiki Fletching/Bodkin/Bracer：Galleys, Longships, Caravels） */
const ARROW_SHIP = /^(Galley|War Galley|Galleon|Longship|Elite Longship|Caravel|Elite Caravel)$/;
const isArrowShip: UnitPred = (u) => ARROW_SHIP.test(u.en);
/** 近战战船（Wiki Forging：Hulk-line melee attack） */
const isHulk: UnitPred = (u) => /^(Hulk|War Hulk|Carrack)$/.test(u.en);
/** 远程非火药攻城（Wiki Chemistry："ranged non-gunpowder siege units"，含被归类为攻城的弩象/战车/骑乘投石机） */
const isRangedSiege: UnitPred = (u) => u.cls.includes(20) && u.rng > 1 && !isGun(u);
const arrow3: Effect[] = [
  { s: 'atk', v: 1 },
  { s: 'rng', v: 1 },
  { s: 'los', v: 1 },
];

export const TECH_EFFECTS: Record<string, EffectRule[]> = {
  Forging: [[(u) => isMelee(u) || isHulk(u), [{ s: 'atk', v: 1 }]]],
  'Iron Casting': [[(u) => isMelee(u) || isHulk(u), [{ s: 'atk', v: 1 }]]],
  'Blast Furnace': [[(u) => isMelee(u) || isHulk(u), [{ s: 'atk', v: 2 }]]],
  Fletching: [[(u) => isArrow(u) || isArrowShip(u), arrow3]],
  'Bodkin Arrow': [[(u) => isArrow(u) || isArrowShip(u), arrow3]],
  Bracer: [[(u) => isArrow(u) || isArrowShip(u), arrow3]],
  'Scale Mail Armor': [
    [
      isInf,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ],
    ],
  ],
  'Chain Mail Armor': [
    [
      isInf,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ],
    ],
  ],
  'Plate Mail Armor': [
    [
      isInf,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 2 },
      ],
    ],
  ],
  'Scale Barding Armor': [
    [
      cav,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ],
    ],
  ],
  'Chain Barding Armor': [
    [
      cav,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ],
    ],
  ],
  'Plate Barding Armor': [
    [
      cav,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 2 },
      ],
    ],
  ],
  'Padded Archer Armor': [
    [
      isArcher,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ],
    ],
  ],
  'Leather Archer Armor': [
    [
      isArcher,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ],
    ],
  ],
  'Ring Archer Armor': [
    [
      isArcher,
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 2 },
      ],
    ],
  ],
  Bloodlines: [[isMounted, [{ s: 'hp', v: 20 }]]],
  Husbandry: [[isMounted, [{ s: 'spd', op: 'mul', v: 1.1 }]]],
  Squires: [[isInf, [{ s: 'spd', op: 'mul', v: 1.1 }]]],
  Arson: [[isInf, [{ s: 'bonus', vs: '标准建筑', v: 2 }]]],
  Gambesons: [[isMilitiaLine, [{ s: 'pa', v: 1 }]]],
  'Thumb Ring': [
    [
      (u) => isArrow(u) && !isSkirm(u),
      [
        { s: 'rof', v: 0.1765 },
        { s: 'acc', op: 'set', v: 100 },
      ],
    ],
    [isSkirm, [{ s: 'acc', op: 'set', v: 100 }]],
  ],
  'Parthian Tactics': [
    [
      (u) => isCA(u) && !/Genitour/.test(u.en),
      [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 2 },
        { s: 'bonus', vs: '长矛兵', v: 2 },
      ],
    ],
  ],
  Chemistry: [[(u) => isArrow(u) || isArrowShip(u) || isRangedSiege(u), [{ s: 'atk', v: 1 }]]],
};
/** 仅显示文本、不计入数值的通用科技 */
export const TEXT_ONLY_TECHS = ['Ballistics', 'Conscription'] as const;

export type CivBonus = [UnitPred, (age: number) => Effect[], string];
/** 文明加成（仅编码可靠的数值；按时代 2/3/4） */
export const CIV_BONUSES: Record<string, CivBonus[]> = {
  Franks: [[isMounted, (a) => (a >= 2 ? [{ s: 'hp', op: 'mul', v: 1.2 }] : []), '骑兵单位从封建时代起生命值 +20%']],
  Vikings: [[isInf, (a) => (a >= 2 ? [{ s: 'hp', op: 'mul', v: 1.2 }] : []), '步兵从封建时代起生命值 +20%']],
  Britons: [
    [
      isFootArcher,
      (a) =>
        a >= 4
          ? [
              { s: 'rng', v: 2 },
              { s: 'los', v: 2 },
            ]
          : a >= 3
            ? [
                { s: 'rng', v: 1 },
                { s: 'los', v: 1 },
              ]
            : [],
      '步弓手城堡/帝王射程 +1/+2',
    ],
  ],
  Teutons: [
    [(u) => isInf(u) || isMounted(u), (a) => (a >= 4 ? [{ s: 'ma', v: 2 }] : a >= 3 ? [{ s: 'ma', v: 1 }] : []), '步兵和骑乘单位城堡/帝王近战护甲 +1/+2'],
  ],
  Japanese: [[isInf, (a) => (a >= 2 ? [{ s: 'rof', v: 0.33 }] : []), '步兵从封建时代起攻速 +33%']],
  Celts: [[isInf, (a) => [{ s: 'spd', op: 'mul', v: 1 + 0.05 * a }], '步兵移速 +5/10/15/20%（随时代）']],
  Mongols: [[isCA, () => [{ s: 'rof', v: 0.25 }], '骑射手攻速 +25%']],
  Ethiopians: [[isFootArcher, () => [{ s: 'rof', v: 0.18 }], '步弓手攻速 +18%']],
  Malians: [[(u) => u.b === 12, (a) => [{ s: 'pa', v: Math.max(0, a - 1) }], '兵营单位封建/城堡/帝王穿刺护甲 +1/+2/+3']],
  Burmese: [[isInf, (a) => [{ s: 'atk', v: Math.max(0, a - 1) }], '步兵封建/城堡/帝王攻击 +1/+2/+3']],
  Hindustanis: [
    [
      isGun,
      () => [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ],
      '火药单位 +1/+1 护甲',
    ],
    [isCamel, () => [{ s: 'rof', v: 0.2 }], '骆驼骑兵攻速 +20%'],
  ],
  Turks: [[isGun, () => [{ s: 'hp', op: 'mul', v: 1.25 }], '火药单位生命值 +25%']],
  Saracens: [[isCamel, () => [{ s: 'hp', op: 'mul', v: 1.25 }], '骆驼单位生命值 +25%']],
  Vietnamese: [[(u) => isFootArcher(u) || isSkirm(u), () => [{ s: 'hp', op: 'mul', v: 1.2 }], '步弓手和散兵生命值 +20%']],
  Cumans: [[isMounted, (a) => (a >= 2 ? [{ s: 'spd', op: 'mul', v: 1 + 0.05 * (a - 1) }] : []), '骑乘单位封建/城堡/帝王移速 +5/10/15%']],
  Goths: [[isInf, (a) => (a >= 2 ? [{ s: 'bonus', vs: '标准建筑', v: a - 1 }] : []), '步兵封建/城堡/帝王对建筑攻击 +1/+2/+3']],
};

export type TeamBonus = [string, string, UnitPred, Effect[]];
export const TEAM_BONUSES: TeamBonus[] = [
  ['Franks', '法兰克：骑士系视野 +2', isKnightLine, [{ s: 'los', v: 2 }]],
  ['Persians', '波斯：骑士系对远程士兵攻击 +2', isKnightLine, [{ s: 'bonus', vs: '弓手', v: 2 }]],
  ['Khitans', '契丹：步兵对远程士兵攻击 +2', isInf, [{ s: 'bonus', vs: '弓手', v: 2 }]],
  ['Saracens', '萨拉森：步弓手和散兵对建筑攻击 +2', (u) => isFootArcher(u) || isSkirm(u), [{ s: 'bonus', vs: '标准建筑', v: 2 }]],
];
