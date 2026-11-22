import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, type Core } from '../../src/data';
import { damageBreakdown, damageSources } from '../../src/domain/damageBreakdown';
import { duel, groupFight } from '../../src/domain/duel';
import { damagePerHit, expectedHit, fighterFrom, mainAttackType } from '../../src/domain/duelFighter';
import { mixedFight } from '../../src/domain/mixedFight';
import { reverseCounters } from '../../src/domain/reverseCounters';
import { calculateSiege, SIEGE_DEFAULT_BUILDING_ID, SIEGE_DEFAULT_UNIT_ID } from '../../src/domain/siege';
import { baseStats } from '../../src/domain/simulator';
import type { Unit } from '../../src/domain/types';
import { UnitNotes } from '../../src/features/units/components/UnitNotes';
import { ctx, techs, units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u])) as Record<number, Unit>;
const strippedUnits: Unit[] = units.map((u) => ({
  ...u,
  atks: u.atks.filter(([, amount]) => amount !== 0),
}));
const strippedById = Object.fromEntries(strippedUnits.map((u) => [u.id, u])) as Record<number, Unit>;

const baseFighter = (u: Unit) => fighterFrom(u, baseStats(u));

let core: Core;
const civNames = civs.map((c) => c.en);

beforeAll(async () => {
  core = await loadCore();
});

describe('#1323 显式零值攻击类别与负护甲伤害结算', () => {
  it('验收 1：7 掷矛手 vs 875 精锐骑象射手每击由 3 变为 7，含骑射手 0/-4/+4 与期望 6.3', () => {
    const a = damageSources(ctx, byId[7]!, 'Mayans', 2, new Set(), new Set()).fighter;
    const d = damageSources(ctx, byId[875]!, 'Dravidians', 4, new Set(), new Set()).fighter;
    const oldA = baseFighter(strippedById[7]!);
    const oldD = baseFighter(strippedById[875]!);

    expect(damagePerHit(oldA, oldD)).toBe(3);
    expect(damagePerHit(a, d)).toBe(7);
    expect(expectedHit(a, d)).toBeCloseTo(6.3, 6);

    const bd = damageBreakdown(a, d);
    expect(bd).toMatchObject({ subtotal: 7, minimum: 0, total: 7 });
    expect(bd.expected).toBeCloseTo(6.3, 6);
    expect(bd.rows).toContainEqual({ category: '骑射手', attack: 0, armor: -4, damage: 4 });
    expect(bd.rows).toContainEqual({ category: '弓手', attack: 3, armor: 0, damage: 3 });
  });

  it('验收 2：279 弩炮 vs 1258 攻城锤每击由 1 变为 4，含近战 0/-3/+3 与冲车 1/0/+1', () => {
    const a = baseFighter(byId[279]!);
    const d = baseFighter(byId[1258]!);
    const oldA = baseFighter(strippedById[279]!);
    const oldD = baseFighter(strippedById[1258]!);

    expect(damagePerHit(oldA, oldD)).toBe(1);
    expect(damagePerHit(a, d)).toBe(4);
    expect(expectedHit(a, d)).toBe(4);

    const bd = damageBreakdown(a, d);
    expect(bd).toMatchObject({ subtotal: 4, minimum: 0, total: 4, expected: 4 });
    expect(bd.rows).toContainEqual({ category: '近战', attack: 0, armor: -3, damage: 3 });
    expect(bd.rows).toContainEqual({ category: '冲车', attack: 1, armor: 0, damage: 1 });
    expect(bd.rows).toContainEqual({ category: '穿刺', attack: 11, armor: 180, damage: 0 });
  });

  it('负例：不含该攻击类别的单位（4 弓箭手）不因目标负护甲获得额外伤害', () => {
    const archer = baseFighter(byId[4]!);
    const eleArcher = baseFighter(byId[875]!);
    const ram = baseFighter(byId[1258]!);

    expect('骑射手' in archer.attack).toBe(false);
    expect('近战' in archer.attack).toBe(false);
    expect(damagePerHit(archer, eleArcher)).toBe(2);
    expect(damagePerHit(archer, ram)).toBe(1);
  });

  it('全库 248×248 基础属性精确 28 组每击伤害变化 + 4 组保底替代', () => {
    const changed: [number, number, number, number][] = [];
    const floorReplaced: [number, number][] = [];

    for (let i = 0; i < units.length; i++) {
      const aNew = baseFighter(units[i]!);
      const aOld = baseFighter(strippedUnits[i]!);
      for (let j = 0; j < units.length; j++) {
        const dNew = baseFighter(units[j]!);
        const dOld = baseFighter(strippedUnits[j]!);
        const bNew = damageBreakdown(aNew, dNew);
        const bOld = damageBreakdown(aOld, dOld);
        if (bNew.total !== bOld.total) {
          changed.push([units[i]!.id, units[j]!.id, bOld.total, bNew.total]);
        } else if (bNew.subtotal !== bOld.subtotal || bNew.minimum !== bOld.minimum) {
          expect(bOld).toMatchObject({ subtotal: 0, minimum: 1, total: 1 });
          expect(bNew).toMatchObject({ subtotal: 1, minimum: 0, total: 1 });
          floorReplaced.push([units[i]!.id, units[j]!.id]);
        }
      }
    }

    changed.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    floorReplaced.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

    expect(changed).toEqual([
      [7, 827, 3, 4],
      [7, 829, 3, 4],
      [7, 873, 3, 7],
      [7, 875, 3, 7],
      [73, 422, 1, 2],
      [73, 1105, 1, 2],
      [73, 1258, 1, 3],
      [73, 1744, 1, 2],
      [73, 1746, 1, 2],
      [279, 422, 1, 2],
      [279, 1105, 1, 3],
      [279, 1258, 1, 4],
      [279, 1744, 1, 3],
      [279, 1746, 1, 3],
      [542, 422, 1, 3],
      [542, 1105, 2, 4],
      [542, 1258, 2, 5],
      [542, 1744, 2, 4],
      [542, 1746, 2, 4],
      [559, 422, 1, 2],
      [559, 1105, 1, 2],
      [559, 1258, 1, 3],
      [559, 1744, 1, 2],
      [559, 1746, 1, 2],
      [1010, 827, 5, 6],
      [1010, 829, 4, 5],
      [1010, 873, 5, 9],
      [1010, 875, 5, 9],
    ]);
    expect(floorReplaced).toEqual([
      [73, 548],
      [279, 548],
      [542, 548],
      [559, 548],
    ]);
  });

  it('单挑、群战与混编使用同一 fighterFrom 伤害口径', () => {
    const skNew = baseFighter(byId[7]!);
    const skOld = baseFighter(strippedById[7]!);
    const ele = baseFighter(byId[875]!);

    expect(duel(skNew, ele).ab.dmg).toBe(7);
    expect(duel(skOld, ele).ab.dmg).toBe(3);

    const gNew = groupFight(skNew, 8, ele, 1);
    const gOld = groupFight(skOld, 8, ele, 1);
    expect(gNew.status).toBe('win');
    expect(gOld.status).toBe('win');
    if (gNew.status !== 'error' && gOld.status !== 'error') {
      expect(gNew.winner).toBe('a');
      expect(gNew.duration).toBeLessThan(gOld.duration);
    }

    const scorpNew = baseFighter(byId[279]!);
    const scorpOld = baseFighter(strippedById[279]!);
    const ram = baseFighter(byId[1258]!);

    expect(duel(scorpNew, ram).ab.dmg).toBe(4);
    expect(duel(scorpOld, ram).ab.dmg).toBe(1);

    const mixNew = mixedFight([{ uid: 279, count: 15, fighter: scorpNew }], [{ uid: 1258, count: 1, fighter: ram }]);
    const mixOld = mixedFight([{ uid: 279, count: 15, fighter: scorpOld }], [{ uid: 1258, count: 1, fighter: ram }]);
    expect(mixNew.status).toBe('win');
    expect(mixOld.status).toBe('win');
    if (mixNew.status === 'win' && mixOld.status === 'win') {
      // 新口径每击 4 在攻城锤进入最小射程 2 前即可击杀；旧口径每击 1 无法及时击杀而被反杀
      expect(mixNew.winner).toBe('a');
      expect(mixOld.winner).toBe('b');
    }

    const mixSkNew = mixedFight([{ uid: 7, count: 8, fighter: skNew }], [{ uid: 875, count: 1, fighter: ele }]);
    const mixSkOld = mixedFight([{ uid: 7, count: 8, fighter: skOld }], [{ uid: 875, count: 1, fighter: ele }]);
    expect(mixSkNew.status).toBe('win');
    expect(mixSkOld.status).toBe('win');
    if (mixSkNew.status === 'win' && mixSkOld.status === 'win') {
      expect(mixSkNew.winner).toBe('a');
      expect(mixSkNew.duration).toBeLessThan(mixSkOld.duration);
    }
  });

  it('mainAttackType 与 Python 统一两轮优先级，fighterFrom 保持主类首位且不覆盖 S.bonus', () => {
    for (const id of [73, 279, 542, 559]) {
      const u = byId[id]!;
      expect(mainAttackType(u)).toBe('穿刺');
      const s = baseStats(u);
      const f = fighterFrom(u, s);
      expect(Object.keys(f.attack)[0]).toBe('穿刺');
      expect(Object.values(f.attack)[0]).toBe(s.atk);
      expect(f.attack['近战']).toBe(0);
    }

    expect(
      mainAttackType({
        atks: [
          ['近战', 0],
          ['穿刺', 11],
        ],
        rng: 7,
      }),
    ).toBe('穿刺');
    expect(
      mainAttackType({
        atks: [
          ['穿刺', 0],
          ['近战', 10],
        ],
        rng: 0,
      }),
    ).toBe('近战');
    expect(
      mainAttackType({
        atks: [
          ['穿刺', 5],
          ['近战', 7],
        ],
        rng: 5,
      }),
    ).toBe('近战');
    expect(
      mainAttackType({
        atks: [
          ['穿刺', 0],
          ['近战', 0],
        ],
        rng: 5,
      }),
    ).toBe('近战');
    expect(mainAttackType({ atks: [['穿刺', 0]], rng: 0 })).toBe('穿刺');
    expect(mainAttackType({ atks: [], rng: 9 })).toBe('穿刺');
    expect(mainAttackType({ atks: [], rng: 0 })).toBe('近战');

    // S.bonus 在副基础类之后合并，避免覆盖未来可能经科技修改的副基础类值
    const s = baseStats(byId[279]!);
    const modified = fighterFrom(byId[279]!, { ...s, bonus: { ...s.bonus, 近战: 2 } });
    expect(modified.attack['穿刺']).toBe(s.atk);
    expect(modified.attack['近战']).toBe(2);
  });

  it('攻城计算：既有攻城单位不变，合成双基础类不覆写副类且不伪造缺失基础类', () => {
    const castle = core.buildingById[SIEGE_DEFAULT_BUILDING_ID]!;
    const house = core.buildingById[70]!; // ma = -2, pa = 7, barm = 0
    const ram = core.unitById[SIEGE_DEFAULT_UNIT_ID]!;

    const baseRam = calculateSiege(ram, castle, 4, '', []);
    expect(baseRam.verified).toBe(true);
    // 含显式 0 非建筑类别的单位仍可计算，但非零未建模建筑类别仍阻断
    expect(calculateSiege(byId[74]!, castle, 4, '', []).verified).toBe(true);
    expect(calculateSiege(byId[1923]!, castle, 4, '', []).verified).toBe(true);
    expect(calculateSiege(byId[473]!, castle, 4, '', []).verified).toBe(false);
    expect(calculateSiege(byId[239]!, castle, 4, '', []).verified).toBe(false);

    // 合成双基础类单位打房屋（ma=-2, pa=7）：近战 0−(−2)=2，穿刺 11−7=4，总计 6（若误写为 attacker.atk=11 会变 17）
    const dualSiege: Unit = {
      ...byId[279]!,
      id: 900_101,
      atk: 11,
      atks: [
        ['近战', 0],
        ['穿刺', 11],
      ],
    };
    const dualResult = calculateSiege(dualSiege, house, 1, '', []);
    expect(dualResult).toMatchObject({ verified: true, damage: 6 });

    // 合成无基础类单位只带所有建筑攻击：不得伪造近战/穿刺吃到房屋 ma=-2
    const noBaseSiege: Unit = {
      ...byId[279]!,
      id: 900_102,
      atk: 10,
      atks: [['所有建筑', 10]],
    };
    const noBaseResult = calculateSiege(noBaseSiege, house, 1, '', []);
    expect(noBaseResult).toMatchObject({ verified: true, damage: 10 });
  });

  it('验收 4：UnitNotes 过滤零值加成，4 个全零加成单位不出现空表，代表单位不显示 +0', () => {
    const renderNotes = (u: Unit) =>
      renderToStaticMarkup(
        createElement(StaticRouter, { location: `/unit/${u.id}` }, createElement(UnitNotes, { u, catalog: units, relation: null, techs, invalid: false })),
      );

    for (const id of [74, 1811, 2703, 2704]) {
      const html = renderNotes(byId[id]!);
      expect(html, `unit ${id} should not render empty BonusTable`).not.toContain('本单位对其他单位的攻击加成');
    }

    const skHtml = renderNotes(byId[7]!);
    expect(skHtml).toContain('本单位对其他单位的攻击加成');
    expect(skHtml).toContain('弓手');
    expect(skHtml).toContain('长矛兵');
    expect(skHtml).not.toContain('骑射手');
    expect(skHtml).not.toContain('标准建筑');

    const vilHtml = renderNotes(byId[83]!);
    expect(vilHtml).toContain('所有建筑');
    expect(vilHtml).not.toContain('掠食动物');
  });

  it('验收 6：reverseCounters 全库 248 单位输出零变化，且坏数据与重复显式零仍告警', () => {
    const strippedCore = {
      ...core,
      units: strippedUnits,
      unitById: strippedById,
    };
    const summarize = (res: ReturnType<typeof reverseCounters>) => ({
      state: res.state,
      problems: res.problems,
      groups: res.groups.map((g) => ({
        category: g.category,
        armor: g.armor,
        rows: g.rows.map((r) => ({
          id: r.unit.id,
          members: r.members.map((m) => m.id),
          attack: r.attack,
          armor: r.armor,
          damage: r.damage,
        })),
      })),
    });

    for (let i = 0; i < units.length; i++) {
      const actual = reverseCounters(units[i]!, units, core, civNames, null, { civ: '', age: null });
      const baseline = reverseCounters(strippedUnits[i]!, strippedUnits, strippedCore, civNames, null, { civ: '', age: null });
      expect(summarize(actual), `reverseCounters changed for unit ${units[i]!.id}`).toEqual(summarize(baseline));
    }

    const eleRes = reverseCounters(byId[875]!, units, core, civNames, null, { civ: '', age: null });
    const caRows = eleRes.groups.find((g) => g.category === '骑射手')?.rows.map((r) => r.unit.id) ?? [];
    expect(caRows).not.toContain(7);
    expect(caRows).not.toContain(1010);

    // 重复显式零攻击仍应触发 INVALID_DATA
    const dupZero: Unit = {
      ...byId[7]!,
      id: 900_201,
      atks: [
        ['穿刺', 2],
        ['骑射手', 0],
        ['骑射手', 0],
      ],
    };
    const dupRes = reverseCounters(byId[875]!, [dupZero], core, civNames, null, { civ: '', age: null });
    expect(dupRes.state).toBe('partial');
    expect(dupRes.problems.join(' ')).toContain('目录中的类别或数值异常');
  });
});
