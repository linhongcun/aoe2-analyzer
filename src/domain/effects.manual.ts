/**
 * 手工编码的效果表（历史版本，依据游戏内说明与 AoE2 Fandom Wiki）。
 * 现在只作为「回退」：.dat 生成的 src/data/effects.json 无战斗数据（2025-06 之后的新科技/新文明）
 * 或与当前补丁文本不一致时才使用；差异逐条见 docs/EFFECTS-AUDIT.md。
 */
import type { Effect, Unit, UnitPred } from './types';
import { hasCls, isArrow, isCA, isCamel, isFootArcher, isGun, isInf, isKnightLine, isMelee, isMilitiaLine, isMounted, isArcher, isSkirm } from './unitClass';

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

export const MANUAL_TECH_EFFECTS: Record<string, EffectRule[]> = {
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

/** [适用判定, 按时代的效果, 说明, 对应 civs.json bon 的序号] */
export type CivBonus = [UnitPred, (age: number) => Effect[], string, number];
/** 文明加成（仅编码可靠的数值；按时代 2/3/4） */
export const MANUAL_CIV_BONUSES: Record<string, CivBonus[]> = {
  Franks: [[isMounted, (a) => (a >= 2 ? [{ s: 'hp', op: 'mul', v: 1.2 }] : []), '骑兵单位从封建时代起生命值 +20%', 2]],
  Vikings: [[isInf, (a) => (a >= 2 ? [{ s: 'hp', op: 'mul', v: 1.2 }] : []), '步兵从封建时代起生命值 +20%', 1]],
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
      2,
    ],
  ],
  Teutons: [
    [(u) => isInf(u) || isMounted(u), (a) => (a >= 4 ? [{ s: 'ma', v: 2 }] : a >= 3 ? [{ s: 'ma', v: 1 }] : []), '步兵和骑乘单位城堡/帝王近战护甲 +1/+2', 2],
  ],
  Japanese: [[isInf, (a) => (a >= 2 ? [{ s: 'rof', v: 0.33 }] : []), '步兵从封建时代起攻速 +33%', 1]],
  Celts: [[isInf, (a) => [{ s: 'spd', op: 'mul', v: 1 + 0.05 * a }], '步兵移速 +5/10/15/20%（随时代）', 2]],
  Mongols: [[isCA, () => [{ s: 'rof', v: 0.25 }], '骑射手攻速 +25%', 1]],
  Ethiopians: [[isFootArcher, () => [{ s: 'rof', v: 0.18 }], '步弓手攻速 +18%', 1]],
  Malians: [[(u) => u.b === 12, (a) => [{ s: 'pa', v: Math.max(0, a - 1) }], '兵营单位封建/城堡/帝王穿刺护甲 +1/+2/+3', 2]],
  Burmese: [[isInf, (a) => [{ s: 'atk', v: Math.max(0, a - 1) }], '步兵封建/城堡/帝王攻击 +1/+2/+3', 1]],
  Hindustanis: [
    [
      isGun,
      () => [
        { s: 'ma', v: 1 },
        { s: 'pa', v: 1 },
      ],
      '火药单位 +1/+1 护甲',
      2,
    ],
    [isCamel, () => [{ s: 'rof', v: 0.2 }], '骆驼骑兵攻速 +20%', 1],
  ],
  Turks: [[isGun, () => [{ s: 'hp', op: 'mul', v: 1.25 }], '火药单位生命值 +25%', 3]],
  Saracens: [[isCamel, () => [{ s: 'hp', op: 'mul', v: 1.25 }], '骆驼单位生命值 +25%', 1]],
  Vietnamese: [[(u) => isFootArcher(u) || isSkirm(u), () => [{ s: 'hp', op: 'mul', v: 1.2 }], '步弓手和散兵生命值 +20%', 2]],
  Cumans: [[isMounted, (a) => (a >= 2 ? [{ s: 'spd', op: 'mul', v: 1 + 0.05 * (a - 1) }] : []), '骑乘单位封建/城堡/帝王移速 +5/10/15%', 1]],
  Goths: [[isInf, (a) => (a >= 2 ? [{ s: 'bonus', vs: '标准建筑', v: a - 1 }] : []), '步兵封建/城堡/帝王对建筑攻击 +1/+2/+3', 3]],
};
const nm =
  (...names: string[]): UnitPred =>
  (u) =>
    names.includes(u.en.replace(/^Elite /, ''));
const armcHas = (u: Unit, c: string) => u.armc.some(([n]) => n === c);
const SCOUT = ['Scout Cavalry', 'Light Cavalry', 'Hussar', 'Winged Hussar'];
const GALLEY = ['Galley', 'War Galley', 'Galleon'];
const FIRESHIP = ['Fire Galley', 'Fire Ship', 'Fast Fire Ship'];
const SPEAR = ['Spearman', 'Pikeman', 'Halberdier'];
const SKIRM = ['Skirmisher', 'Imperial Skirmisher'];
const isShip: UnitPred = (u) => armcHas(u, '船只');
const isSiege: UnitPred = (u) => hasCls(u, 20);
const step = (ages: number[], vals: number[]) => (a: number) => {
  let v = 0;
  ages.forEach((g, i) => a >= g && (v = vals[i]!));
  return v;
};
const pctHp = (ages: number[], vals: number[]) => (a: number) => (step(ages, vals)(a) ? [{ s: 'hp', op: 'mul', v: 1 + step(ages, vals)(a) } as Effect] : []);
const pctSpd = (ages: number[], vals: number[]) => (a: number) => (step(ages, vals)(a) ? [{ s: 'spd', op: 'mul', v: 1 + step(ages, vals)(a) } as Effect] : []);
const armor = (m: number, p: number) => (): Effect[] => [...(m ? [{ s: 'ma', v: m } as Effect] : []), ...(p ? [{ s: 'pa', v: p } as Effect] : [])];
const rof =
  (v: number, from = 1) =>
  (a: number): Effect[] =>
    a >= from ? [{ s: 'rof', v }] : [];
/** 新增文明加成（2026-10 补充）；合并进 CIV_BONUSES */
const MORE: Record<string, CivBonus[]> = {
  Mongols: [[nm(...SCOUT, 'Steppe Lancer'), pctHp([3, 4], [0.2, 0.3]), '侦察骑兵系与草原枪兵城堡/帝王生命值 +20/30%', 2]],
  Burmese: [[nm('Battle Elephant'), armor(1, 1), '象兵 +1/+1 护甲', 2]],
  Turks: [[nm(...SCOUT), armor(0, 1), '侦察骑兵系 +1 穿刺护甲', 1]],
  Saracens: [
    [nm(...GALLEY), rof(0.25), '桨帆船系攻速 +25%', 2],
    [nm('Transport Ship'), () => [{ s: 'hp', op: 'mul', v: 2 }], '运输船生命值 +100%', 3],
  ],
  Celts: [[isSiege, rof(0.25), '攻城武器攻速 +25%', 3]],
  Spanish: [[isGun, rof(0.18), '火药单位攻速 +18%', 3]],
  Byzantines: [[nm(...FIRESHIP, 'Dromon'), rof(0.25), '火船与德罗蒙战舰攻速 +25%', 4]],
  Japanese: [[nm('Fishing Ship'), () => [{ s: 'hp', op: 'mul', v: 2 }], '渔船生命值 +100%', 3]],
  Chinese: [[nm('Fire Lancer', ...FIRESHIP), pctSpd([3, 4], [0.05, 0.1]), '火矛兵与火船城堡/帝王移速 +5/10%', 3]],
  Bengalis: [[nm('Monk'), armor(3, 3), '僧侣 +3/+3 护甲', 3]],
  Berbers: [[isShip, () => [{ s: 'spd', op: 'mul', v: 1.1 }], '船只移速 +10%', 2]],
  Burgundians: [[isGun, () => [{ s: 'atk', op: 'mul', v: 1.25 }], '火药单位攻击 +25%', 3]],
  Dravidians: [[(u) => isSkirm(u) || nm('Elephant Archer')(u), rof(0.25), '散兵与骑象射手攻速 +25%', 2]],
  Italians: [[(u) => isFootArcher(u) || nm('Condottiero')(u), armor(1, 1), '步弓手与意大利佣兵 +1/+1 护甲', 1]],
  Jurchens: [[(u) => isMounted(u) || nm('Fire Lancer')(u), rof(0.25, 2), '骑乘单位与火矛兵从封建时代起攻速 +25%', 1]],
  Khmer: [[nm('Battle Elephant'), () => [{ s: 'spd', op: 'mul', v: 1.1 }], '象兵移速 +10%', 3]],
  Lithuanians: [[nm(...SPEAR, ...SKIRM), () => [{ s: 'spd', op: 'mul', v: 1.1 }], '长矛兵系与散兵系移速 +10%', 1]],
  Mapuche: [
    [
      (u) => isInf(u) || isSkirm(u) || nm('Slinger')(u),
      (a) => (step([2, 3, 4], [5, 10, 15])(a) ? [{ s: 'hp', v: step([2, 3, 4], [5, 10, 15])(a) }] : []),
      '步兵、投石兵与散兵封建/城堡/帝王生命值 +5/10/15',
      2,
    ],
  ],
  Muisca: [
    [
      (u) => u.b === 87 || nm('Champi Warrior')(u),
      (a) => (step([2, 3, 4], [1, 2, 3])(a) ? [{ s: 'ma', v: step([2, 3, 4], [1, 2, 3])(a) }] : []),
      '蔷琵战士与靶场单位封建/城堡/帝王近战护甲 +1/2/3',
      2,
    ],
  ],
  Portuguese: [[isShip, pctHp([2, 3, 4], [0.1, 0.15, 0.2]), '船只封建/城堡/帝王生命值 +10/15/20%', 3]],
  Romans: [[nm(...GALLEY, 'Dromon'), armor(1, 1), '桨帆船系与德罗蒙战舰 +1/+1 护甲', 3]],
  Saxons: [[nm('Longship', 'Catapult Galleon'), () => [{ s: 'hp', op: 'mul', v: 1.2 }], '长船与投石战船生命值 +20%', 3]],
  Slavs: [[nm('Monk'), () => [{ s: 'spd', op: 'mul', v: 1.2 }], '僧侣移速 +20%', 3]],
  Varangians: [
    [nm('Varangian Guard'), rof(0.25), '瓦兰吉卫队攻速 +25%（产金部分仅文本）', 2],
    [nm('Longship', 'Catapult Galleon'), rof(0.15), '长船与投石战船攻速 +15%', 3],
  ],
  Wei: [[(u) => /Hei Guang|Xianbei Raider/.test(u.en), pctHp([3, 4], [0.2, 0.3]), '黑光铠骑兵与鲜卑掠骑兵城堡/帝王生命值 +20/30%', 1]],
  Wu: [[(u) => /Jian Swordsman|Hei Guang/.test(u.en), (a) => (a >= 4 ? [{ s: 'atk', v: 2 }] : []), '剑士（剑）与黑光铠骑兵帝王时代攻击 +2', 2]],
};
Object.entries(MORE).forEach(([c, l]) => (MANUAL_CIV_BONUSES[c] = [...(MANUAL_CIV_BONUSES[c] ?? []), ...l]));

/** [文明, 说明, 适用判定, 效果] */
export type ManualTeamBonus = [string, string, UnitPred, Effect[]];
export const MANUAL_TEAM_BONUSES: ManualTeamBonus[] = [
  ['Franks', '法兰克：骑士系视野 +2', isKnightLine, [{ s: 'los', v: 2 }]],
  ['Persians', '波斯：骑士系对远程士兵攻击 +2', isKnightLine, [{ s: 'bonus', vs: '弓手', v: 2 }]],
  ['Khitans', '契丹：步兵对远程士兵攻击 +2', isInf, [{ s: 'bonus', vs: '弓手', v: 2 }]],
  ['Saracens', '萨拉森：步弓手和散兵对建筑攻击 +2', (u) => isFootArcher(u) || isSkirm(u), [{ s: 'bonus', vs: '标准建筑', v: 2 }]],
  ['Armenians', '亚美尼亚：步兵视野 +2', isInf, [{ s: 'los', v: 2 }]],
  ['Danes', '丹麦：攻城武器视野 +2', (u) => hasCls(u, 20), [{ s: 'los', v: 2 }]],
  ['Jurchens', '女真：火药单位视野 +2', isGun, [{ s: 'los', v: 2 }]],
  ['Khmer', '高棉：蝎式弩炮射程 +1', (u) => /Scorpion/.test(u.en), [{ s: 'rng', v: 1 }]],
  ['Koreans', '高丽：村民视野 +3', (u) => u.armc.some(([n]) => n === '村民'), [{ s: 'los', v: 3 }]],
  ['Mapuche', '马普切：长矛兵系与散兵视野 +2', (u) => /^(Spearman|Pikeman|Halberdier)$/.test(u.en) || isSkirm(u), [{ s: 'los', v: 2 }]],
  ['Poles', '波兰：侦察骑兵系对远程士兵攻击 +1', (u) => /^(Scout Cavalry|Light Cavalry|Hussar|Winged Hussar)$/.test(u.en), [{ s: 'bonus', vs: '弓手', v: 1 }]],
  ['Shu', '蜀：步弓手视野 +2', isFootArcher, [{ s: 'los', v: 2 }]],
  ['Tatars', '鞑靼：骑射单位视野 +2', isCA, [{ s: 'los', v: 2 }]],
  ['Varangians', '瓦兰吉：骑士系对步兵攻击 +1', isKnightLine, [{ s: 'bonus', vs: '步兵', v: 1 }]],
  ['Wei', '魏：骑兵对攻城武器攻击 +2', (u) => isMounted(u) && !isArcher(u), [{ s: 'bonus', vs: '攻城武器', v: 2 }]],
];
