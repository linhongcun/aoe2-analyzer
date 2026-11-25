/**
 * Issue 1408：验证 .dat 死科技 t:396 剔除后中国爆破船系 HP 恢复 40/50/70、
 * 亚美尼亚 BuildTech 科技 [949, 957] 完整保留、以及中国 bon[2] 站点产物错字清零。
 */
import { describe, expect, it } from 'vitest';
import effects from '../../data/game/effects.json';
import pageMetadata from '../../data/game/page-metadata.json';
import searchPy from '../../data/game/search-py.json';
import { civs, loadTrees } from '../../src/data';
import { CORE } from '../../src/data/core';
import { bonusTechs } from '../../src/domain/bonusUsage';
import { civBonuses } from '../../src/domain/civBonus';
import { BONUS_SRC, CIV_BONUSES } from '../../src/domain/effects';
import { makeSimContext, simTechs, simulate } from '../../src/domain/simulator';
import { buildUnitCivRank } from '../../src/domain/unitCivRank';

const trees = await loadTrees();
const ctx = makeSimContext(CORE.techs, trees);
const uById = (id: number) => CORE.unitById[id]!;

describe('Issue 1408：死科技 t:396 剔除、中国爆破船系 HP 与中国 bon[2] 错字纠偏', () => {
  it('effects.json 剔除中国 t:396 且保留亚美尼亚 BuildTech 科技 [949, 957]', () => {
    const chBonus = effects.civs.Chinese.bonus;
    expect(chBonus.some((e) => e.tech === 396)).toBe(false);

    const armBonus = effects.civs.Armenians.bonus;
    const t949 = armBonus.find((e) => e.tech === 949);
    const t957 = armBonus.find((e) => e.tech === 957);
    expect(t949?.idx).toBe(3);
    expect(t957?.idx).toBe(3);

    // 跨模块 Issue 317 不变量：Armenians-3 仍映射为 eco 且 bonusTechs 保持完整原子组 [949, 957]
    expect(BONUS_SRC.Armenians?.['3']).toBe('eco');
    const armCiv = civs.find((c) => c.en === 'Armenians')!;
    const armBon3 = civBonuses(armCiv).find((b) => b.id === 'Armenians-3')!;
    expect([...bonusTechs(armBon3).techs].sort((a, b) => a - b)).toEqual([949, 957]);
  });

  it('CIV_BONUSES["Chinese"] 不再向爆破船系 1104/527/528 施加隐藏 HP 加成', () => {
    const hiddenBonuses = (CIV_BONUSES.Chinese ?? []).filter((entry) => entry[3] === -1);
    for (const uid of [1104, 527, 528]) {
      const u = uById(uid);
      for (const age of [1, 2, 3, 4]) {
        const hiddenHpFx = hiddenBonuses
          .filter(([pred]) => pred(u))
          .flatMap(([, fn]) => fn(age))
          .filter((fx) => fx.s === 'hp');
        expect(hiddenHpFx).toEqual([]);
      }
    }
  });

  it.each([
    { uid: 1104, expectedHp: 40, expectedRows: 50 },
    { uid: 527, expectedHp: 50, expectedRows: 50 },
    { uid: 528, expectedHp: 70, expectedRows: 25 },
  ])('单位 $uid 中国帝王满科技生命恢复 $expectedHp 且跨文明排行 $expectedRows 家全员并列无生命冠军', ({ uid, expectedHp, expectedRows }) => {
    const u = uById(uid);
    const fullTechs = new Set(
      simTechs(ctx, u, 'Chinese')
        .filter((x) => x.ef && x.t.age <= 4)
        .map((x) => x.t.id),
    );
    const sim = simulate(ctx, u, 'Chinese', 4, fullTechs, new Set());
    expect(sim.hp).toBe(expectedHp);

    const rank = buildUnitCivRank(ctx, u, 4);
    expect(rank.rows).toHaveLength(expectedRows);
    expect(rank.rows.some((r) => r.civ === 'Portuguese')).toBe(false);

    const chRow = rank.rows.find((r) => r.civ === 'Chinese');
    expect(chRow).toBeDefined();
    expect(chRow!.hp).toBe(expectedHp);
    for (const row of rank.rows) {
      expect(row.hp).toBe(expectedHp);
    }
    // 全部可训练文明并列，不再出现中国虚假生命冠军
    expect(rank.champions.find((c) => c.col === 'hp')).toBeUndefined();
  });

  it('中国 bon[2] 站点产物修正为「人口空间」，全站生成产物不再含「人口控件」', () => {
    const expected = '城镇中心的视野 +7，提供的人口空间 +15';
    const ch = civs.find((c) => c.en === 'Chinese')!;
    expect(ch.bon[2]).toBe(expected);
    expect(JSON.stringify(civs)).not.toContain('人口控件');

    const pyMap = searchPy as Record<string, unknown>;
    expect(Object.hasOwn(pyMap, expected)).toBe(true);
    expect(Object.keys(pyMap).some((k) => k.includes('人口控件'))).toBe(false);

    const meta = pageMetadata as Record<string, { description?: string }>;
    expect(meta['/civ/Chinese/bonus/2']?.description).toBe(expected);
    expect(JSON.stringify(pageMetadata)).not.toContain('人口控件');
  });
});
