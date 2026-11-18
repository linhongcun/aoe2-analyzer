/**
 * 单位 PK 引擎测试。
 * 公式来源：Fandom「Armor class (Age of Empires II)」https://ageofempires.fandom.com/wiki/Armor_class_(Age_of_Empires_II)
 *           与 AoE2DE UGC Guide https://ugc.aoe2.rocks/general/damage_calculation/ ：dmg = max(1, Σ max(0, Atk_i − Arm_i))
 * 单位数值来源：aoe2techtree 数据 + 模拟器效果表（已与 Fandom 核对：法兰克满科技圣骑士 192 生命 / 18 攻 / 5/7 护甲）。
 */
import { describe, expect, it } from 'vitest';
import { countForBudget, damagePerHit, duel, fighterFrom, groupFight, oneWay, type Fighter } from '../../src/domain/duel';
import { allNumeric, simTechs, simulate } from '../../src/domain/simulator';
import { ctx, unit } from './helpers';

const F = (en: string, civ: string, full = true) => {
  const u = unit(en);
  return fighterFrom(u, simulate(ctx, u, civ, 4, full ? allNumeric(simTechs(ctx, u, civ)) : new Set(), new Set()));
};
const testFighter = (overrides: Partial<Fighter> = {}): Fighter => ({
  name: '边界测试兵',
  hp: 10,
  attack: { 近战: 1 },
  armor: { 近战: 0, 穿刺: 0 },
  rof: 1,
  acc: 1,
  ranged: false,
  rng: 0,
  cost: {},
  ...overrides,
});

describe('伤害公式', () => {
  it('仅计入防守方拥有的护甲类别；最低 1 点', () => {
    expect(damagePerHit({ attack: { 近战: 5, 骑兵: 10 } }, { armor: { 近战: 2, 穿刺: 0, 步兵: 0 } })).toBe(3);
    expect(damagePerHit({ attack: { 近战: 5, 骑兵: 10 } }, { armor: { 近战: 2, 穿刺: 0, 骑兵: 0 } })).toBe(13);
    expect(damagePerHit({ attack: { 穿刺: 3 } }, { armor: { 近战: 0, 穿刺: 10 } })).toBe(1);
  });
  it('负攻击类别会扣减（Fandom 第 2 步 max(min(0,Atk),Atk−Arm)）', () => {
    expect(damagePerHit({ attack: { 近战: 14, 村民: -3 } }, { armor: { 近战: 0, 穿刺: 0, 村民: 0 } })).toBe(11);
  });
});

describe('已知对局（满科技）', () => {
  it('圣骑士（法兰克）vs 长戟兵：长戟兵每击 (10−5)+32 = 37，圣骑士每击 18−3 = 15；圣骑士 1v1 获胜', () => {
    // Fandom Halberdier：+32 对骑兵；Paladin：160 HP、2/3 护甲；法兰克骑士系 +20% HP
    const r = duel(F('Paladin', 'Franks'), F('Halberdier', 'Japanese'));
    expect(r.ba.dmg).toBe(37);
    expect(r.ab.dmg).toBe(15);
    expect(r.ab.hits).toBe(4);
    expect(r.ba.hits).toBe(6); // 192 / 37
    expect(r.winner).toBe('a');
  });
  it('但等资源（3000）下长戟兵胜：Fandom 将长戟兵列为圣骑士的成本效益克制', () => {
    const p = F('Paladin', 'Franks'),
      h = F('Halberdier', 'Japanese');
    const g = groupFight(p, countForBudget(p.cost, 3000), h, countForBudget(h.cost, 3000));
    expect(g.winner).toBe('b');
  });
  it('劲弩手 vs 精锐掷矛手：掷矛手几乎免疫（劲弩手每击 10−8 = 2），掷矛手获胜', () => {
    // Fandom Skirmisher：+4 对弓手（精锐），高穿刺护甲，弓兵的克制
    const r = duel(F('Arbalester', 'Mayans'), F('Elite Skirmisher', 'Mayans'));
    expect(r.ab.dmg).toBe(2);
    expect(r.ba.dmg).toBe(7); // (7−4) + 4
    expect(r.winner).toBe('b');
  });
  it('命中率按期望值计入（不列颠劲弩手无扳指，90%）', () => {
    const a = F('Arbalester', 'Britons');
    expect(a.acc).toBeCloseTo(0.9);
    expect(oneWay(a, F('Elite Skirmisher', 'Britons')).expDmg).toBeCloseTo(1.8);
  });
  it('冠军剑士 vs 轻骑兵（匈牙利）：冠军剑士每击 18−3 = 15，7 击；冠军剑士获胜', () => {
    const r = duel(F('Champion', 'Japanese'), F('Hussar', 'Magyars'));
    expect(r.ab.dmg).toBe(15);
    expect(r.ab.hits).toBe(7);
    expect(r.ba.dmg).toBe(7);
    expect(r.winner).toBe('a');
  });
  it('同单位同科技镜像为平局', () => {
    expect(duel(F('Champion', 'Japanese'), F('Champion', 'Japanese')).winner).toBe('draw');
  });
});

describe('N vs M', () => {
  it('1v1 群战模型与 duel 一致', () => {
    const a = F('Champion', 'Japanese'),
      b = F('Hussar', 'Magyars');
    const g = groupFight(a, 1, b, 1);
    expect(g.winner).toBe('a');
    expect(g.duration).toBeCloseTo(duel(a, b).duration);
  });
  it('数量优势：10 个无科技长戟兵击败 2 个满科技圣骑士', () => {
    const g = groupFight(F('Paladin', 'Franks'), 2, F('Halberdier', 'Japanese', false), 10);
    expect(g.winner).toBe('b');
    expect(g.timeline.at(-1)![1]).toBe(0);
  });
  it('等资源数量', () => {
    expect(countForBudget({ Food: 60, Gold: 75 }, 1000)).toBe(7);
  });

  it('零攻击间隔的真实爆破兵镜像只结算首击，不在601秒虚构第二击', () => {
    const petard = F('Petard', 'Franks', false);
    expect(petard.rof).toBe(0);
    const result = groupFight(petard, 1, petard, 1);
    expect(result).toMatchObject({ winner: 'draw', duration: 600, aAlive: 1, bAlive: 1 });
    expect(result.timeline.every(([time]) => time <= 600)).toBe(true);
  });

  it('单侧零攻击间隔不重复攻击，未决结果用满模拟时限', () => {
    const petard = F('Petard', 'Franks', false);
    const target = testFighter({ hp: 50, ranged: true, acc: 0, rof: 1000 });
    const result = groupFight(petard, 1, target, 1);
    expect(result).toMatchObject({ winner: 'draw', duration: 600, aAlive: 1, bAlive: 1 });
    expect(result.timeline.at(-1)).toEqual([0, 1, 1]);
  });

  it('正攻击间隔恰在模拟时限内时仍结算，且保留t=0首击', () => {
    const a = testFighter({ hp: 10, rof: 600 });
    const b = testFighter({ hp: 2, rof: 1000 });
    const result = groupFight(a, 1, b, 1);
    expect(result).toMatchObject({ winner: 'a', duration: 600, aAlive: 1, bAlive: 0, hpLeft: 9 });
    expect(result.timeline).toContainEqual([600, 1, 0]);
  });

  it('小数攻击间隔的数学时限边界攻击仍结算，时间线不越界', () => {
    const a = testFighter({ rof: 0.1 });
    const b = testFighter({ hp: 4, ranged: true, acc: 0, rof: 1000 });
    const result = groupFight(a, 1, b, 1, 0.3);
    expect(result).toMatchObject({ winner: 'a', duration: 0.3, aAlive: 1, bAlive: 0 });
    expect(result.timeline).toContainEqual([0.3, 1, 0]);
    expect(result.timeline.every(([time]) => time <= 0.3)).toBe(true);
  });

  it('默认模拟时限下小数累积不会丢失第751击', () => {
    const a = testFighter({ rof: 0.8 });
    const b = testFighter({ hp: 751, ranged: true, acc: 0, rof: 1000 });
    const result = groupFight(a, 1, b, 1);
    expect(result).toMatchObject({ winner: 'a', duration: 600, aAlive: 1, bAlive: 0 });
    expect(result.timeline).toHaveLength(752);
    expect(result.timeline).toContainEqual([600, 1, 0]);
    expect(result.timeline.every(([time]) => time <= 600)).toBe(true);
  });

  it.each([
    [600, 600.000001],
    [0, 0.000001],
  ])('超过 maxT=%s 的下一击不结算，双方保留存活状态', (maxT, nextAttack) => {
    const a = testFighter({ hp: 10, rof: nextAttack });
    const b = testFighter({ hp: 2, rof: 1000, ranged: true, acc: 0 });
    const result = groupFight(a, 1, b, 1, maxT);
    expect(result).toMatchObject({ winner: 'draw', duration: maxT, aAlive: 1, bAlive: 1 });
    expect(result.timeline.every(([time]) => time <= maxT)).toBe(true);
  });

  it('maxT为0时仍在t=0同时结算双方致命首击', () => {
    const a = testFighter({ hp: 1 });
    const b = testFighter({ hp: 1 });
    const result = groupFight(a, 1, b, 1, 0);
    expect(result).toMatchObject({ winner: 'draw', duration: 0, aAlive: 0, bAlive: 0 });
    expect(result.timeline.at(-1)).toEqual([0, 0, 0]);
  });
});
