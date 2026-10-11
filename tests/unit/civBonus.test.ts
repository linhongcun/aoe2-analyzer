/**
 * 文明加成实体测试。加成数值来源：游戏内文明说明（aoe2techtree 字符串，即 bonEn 原文）与 AoE2 Fandom 各文明页
 * （https://ageofempires.fandom.com/wiki/<Civ>_(Age_of_Empires_II) 的 "Civilization bonuses" 一节）。
 */
import { describe, expect, it } from 'vitest';
import civsRaw from '../../src/data/civs.json';
import raw from '../../src/data/buildings.json';
import { allCivBonuses, bonusAffects, bonusExample, civBonuses, classify, parseAges } from '../../src/domain/civBonus';
import { BUILDING_CIV_BONUSES } from '../../src/domain/buildingSim';
import { buildingType } from '../../src/domain/buildings';
import { CIV_BONUSES } from '../../src/domain/effects';
import { simulate } from '../../src/domain/simulator';
import type { Building, Civ } from '../../src/domain/types';
import { ctx, unit, units } from './helpers';

const civs = civsRaw as unknown as Civ[];
const civ = (en: string) => civs.find((c) => c.en === en)!;
const bs = (raw as unknown as Building[]).map((b) => ({ ...b, dlc: null, type: buildingType(b.en) }));
const none = new Set<number>();

describe('实体与原文', () => {
  it('每个文明都有中英文加成且条数一致；+1 条团队加成', () => {
    civs.forEach((c) => {
      expect(c.bonEn.length).toBe(c.bon.length);
      expect(civBonuses(c).length).toBe(c.bon.length + 1);
    });
  });
  it('跨行原文已拼接（凯尔特步兵移速写全了四个时代）', () => {
    expect(civ('Celts').bonEn[2]).toBe('Infantry moves +5/10/15/20% faster in Dark/Feudal/Castle/Imperial Age');
    expect(civ('Celts').bon[2]).toContain('移动速度 +5/10/15/20%');
  });
  it('每条已编码效果都指向有效的加成序号', () => {
    Object.entries(CIV_BONUSES).forEach(([c, l]) => l.forEach((x) => expect(x[3]).toBeLessThan(civ(c).bon.length)));
    Object.entries(BUILDING_CIV_BONUSES).forEach(([c, l]) => l.forEach((x) => expect(x[3]).toBeLessThan(civ(c).bon.length)));
  });
  it('时代解析与分类', () => {
    expect(parseAges('Mounted Units +20% HP starting in Feudal Age')).toEqual([2, 3, 4]);
    expect(parseAges('Castles cost -15/25% in Castle/Imperial Age')).toEqual([3, 4]);
    expect(parseAges('Mill technologies free')).toBeNull();
    expect(classify('Mill technologies free')).toEqual(expect.arrayContaining(['费用', '科技', '经济']));
    expect(classify('Mounted Units +20% HP starting in Feudal Age')).toContain('军事');
  });
  it('覆盖率：至少 50 条加成已计入数值', () => {
    expect(allCivBonuses(civs).filter((b) => b.encoded).length).toBeGreaterThanOrEqual(50);
  });
});

describe('数值示例与作用对象（与模拟器同一判定）', () => {
  const franks = civBonuses(civ('Franks'));
  it('法兰克骑兵 +20% HP：圣骑士 160 到 192（封建起）', () => {
    const ex = bonusExample(franks[2]!, units, bs, 'Paladin')!;
    expect(ex.name).toBe(unit('Paladin').zh);
    expect(ex.rows).toEqual([[[2, 3, 4], 'hp', 160, 192]]);
  });
  it('作用对象只列法兰克拥有的骑乘单位，且与 simulate 一致', () => {
    const g = bonusAffects(franks[2]!, units, bs);
    const us = g.flatMap((x) => x.rows.flatMap((r) => r.units));
    expect(us.length).toBeGreaterThan(3);
    expect(us.every((u) => u.civs.includes('Franks'))).toBe(true);
    expect(us.some((u) => u.en === 'Paladin')).toBe(true);
    expect(simulate(ctx, unit('Paladin'), 'Franks', 4, none, none).hp).toBe(192);
  });
  it('仅文本加成：法兰克磨坊科技免费', () => {
    expect(franks[1]!.encoded).toBe(false);
    expect(bonusAffects(franks[1]!, units, bs)).toEqual([]);
  });
  it('建筑加成：拜占庭建筑生命值逐时代 +10/20/30/40%（城镇中心 2400 到 2640/2880/3120/3360）', () => {
    const ex = bonusExample(civBonuses(civ('Byzantines'))[0]!, units, bs, 'Town Center')!;
    expect(ex.kind).toBe('building');
    expect(ex.rows.map((r) => r[3])).toEqual([2640, 2880, 3120, 3360]);
  });
  it('团队加成：法兰克骑士系视野 +2，作用于所有文明的骑士', () => {
    const t = civBonuses(civ('Franks')).at(-1)!;
    expect(t.team).toBe(true);
    expect(t.encoded).toBe(true);
    expect(bonusExample(t, units, bs)!.rows[0]![1]).toBe('los');
  });
});

describe('新增编码的文明加成（Fandom 各文明页）', () => {
  it('缅甸：象兵 +1/+1 护甲（Burmese: "Battle Elephants +1 melee/+1 pierce armor"）', () => {
    const u = unit('Battle Elephant');
    const s = simulate(ctx, u, 'Burmese', 4, none, none);
    expect([s.ma - u.ma, s.pa - u.pa]).toEqual([1, 1]);
  });
  it('西班牙：火药单位攻速 +18%（手炮手攻击间隔 3.45 到 2.92）', () => {
    expect(simulate(ctx, unit('Hand Cannoneer'), 'Spanish', 4, none, none).rof).toBeCloseTo(3.45 * 0.85, 2); // .dat: 攻击间隔 ×0.85（文本「+18%」= 1/0.85 取整）;
  });
  it('蒙古：轻骑兵帝王时代 +30% 生命值', () => {
    const u = unit('Hussar');
    expect(simulate(ctx, u, 'Mongols', 4, none, none).hp).toBe(Math.floor(u.hp * 1.3));
    expect(simulate(ctx, u, 'Mongols', 3, none, none).hp).toBe(Math.floor(u.hp * 1.2));
  });
  it('土耳其：侦察骑兵系 +1 穿刺护甲', () => {
    const u = unit('Light Cavalry');
    expect(simulate(ctx, u, 'Turks', 4, none, none).pa).toBe(u.pa + 1);
  });
  it('葡萄牙：船只封建/城堡/帝王 +10/15/20% 生命值', () => {
    const u = unit('Galleon');
    expect(simulate(ctx, u, 'Portuguese', 4, none, none).hp).toBe(Math.floor(u.hp * 1.2));
  });
  it('吴：帝王时代剑士攻击 +2，城堡时代不加', () => {
    const u = unit('Jian Swordsman');
    expect(simulate(ctx, u, 'Wu', 4, none, none).atk).toBe(u.atk + 2);
    expect(simulate(ctx, u, 'Wu', 3, none, none).atk).toBe(u.atk);
  });
  it('团队：瓦兰吉骑士系对步兵 +1（与模拟器团队开关同源）', () => {
    const t = civBonuses(civ('Varangians')).at(-1)!;
    expect(t.encoded).toBe(true);
    expect(bonusAffects(t, units, bs)[0]!.rows[0]!.effect).toContain('步兵');
  });
});
