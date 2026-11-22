import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { breakEven } from '../../src/domain/breakEven';
import { fighterFrom, groupFight } from '../../src/domain/duel';
import { contactFight, contactFighterError } from '../../src/domain/contactFight';
import { applicableUnmodeledTechIds, collectDuelUnmodeled, detectUnitUnmodeled, hasPositiveEcoAttr } from '../../src/domain/duelUnmodeled';
import { baseStats, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { prepareVgDisplay } from '../../src/features/duel/components/VgNotes';
import { resolveUnitForm } from '../../src/features/units/unitFormDetail';
import { ctx, techs, units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
const techById = Object.fromEntries(techs.map((t) => [t.id, t]));
const techByEn = Object.fromEntries(techs.map((t) => [t.en, t]));

function fighterFull(uid: number, civ: string, age = 4) {
  const u = byId[uid]!;
  const avail = simTechs(ctx, u, civ);
  const S = simulate(ctx, u, civ, age, presetUpTo(avail, age), new Set());
  return { u, S, F: fighterFrom(u, S) };
}

describe('#1296 群体 minRange > 0 纵深建模（固定排容 2r+1、无硬截断）', () => {
  it('40 穆伊斯卡投石手 vs 42 日本冠军：接敌后后排继续射击，不再全员停火', () => {
    const slinger = fighterFull(185, 'Muisca');
    const champ = fighterFull(567, 'Japanese');
    const res = groupFight(slinger.F, 40, champ.F, 42);
    if (res.status !== 'win') throw new Error(`unexpected status: ${res.status}`);
    expect(res.winner).toBe('b');
    // 旧模型贴脸后全部停火剩 29/42（2006 HP）；按 2r+1 纵深后前 3 排 9 人停火、后 4 排 31 人持续输出，冠军仅剩 11/42（704 HP）
    expect(res.bAlive).toBe(11);
    expect(res.hpLeft).toBeCloseTo(704, 1);
    expect(res.contact.meleeAt).toBeCloseTo(9.0186, 3);
    expect(res.contact.firstStrike?.side).toBe('a');
    expect(res.contact.firstStrike?.volleys).toBe(4);
    expect(res.contact.a[0]!.maxRanged).toBe(40);
    // 盈亏平衡点严格单调，首个 A 胜点 na = 47
    const be = breakEven(slinger.F, champ.F, 42);
    expect(be.n).toBe(47);
  });

  it('50 拜占庭精锐掷矛 vs 42 日本冠军：后排纵深持续射击', () => {
    const skirm = fighterFull(6, 'Byzantines');
    const champ = fighterFull(567, 'Japanese');
    const res = groupFight(skirm.F, 50, champ.F, 42);
    if (res.status !== 'win') throw new Error(`unexpected status: ${res.status}`);
    expect(res.winner).toBe('b');
    expect(res.bAlive).toBe(37);
    expect(res.hpLeft).toBeCloseTo(2573, 1);
  });

  it('大规模远程互射（40/200 玛雅掷矛 vs 劲弩、200 拜占庭掷矛 vs 不列颠步弓）零截断、逐比特一致', () => {
    const mayanSkirm = fighterFull(6, 'Mayans').F;
    const mayanArb = fighterFull(492, 'Mayans').F;
    const r40 = groupFight(mayanSkirm, 40, mayanArb, 40);
    if (r40.status !== 'win') throw new Error(`unexpected status: ${r40.status}`);
    expect(r40.winner).toBe('a');
    expect(r40.aAlive).toBe(27);
    expect(r40.hpLeft).toBeCloseTo(923, 1);
    expect(r40.duration).toBeCloseTo(22.0275, 3);

    const r200 = groupFight(mayanSkirm, 200, mayanArb, 200);
    if (r200.status !== 'win') throw new Error(`unexpected status: ${r200.status}`);
    expect(r200.winner).toBe('a');
    expect(r200.aAlive).toBe(133);
    expect(r200.hpLeft).toBeCloseTo(4637, 1);
    expect(r200.duration).toBeCloseTo(22.0275, 3);
    expect(r200.contact.a[0]!.maxRanged).toBe(189);
    expect(r200.contact.b[0]!.maxRanged).toBe(200);

    const byzSkirm = fighterFull(7, 'Byzantines').F;
    const britArch = fighterFull(4, 'Britons').F;
    const r200b = groupFight(byzSkirm, 200, britArch, 200);
    if (r200b.status !== 'win') throw new Error(`unexpected status: ${r200b.status}`);
    expect(r200b.winner).toBe('a');
    expect(r200b.aAlive).toBe(166);
    expect(r200b.duration).toBeCloseTo(22.1525, 3);
    expect(r200b.contact.a[0]!.maxRanged).toBe(190);
    expect(r200b.contact.b[0]!.maxRanged).toBe(200);
  });

  it('1 条顿手推炮 vs 1 日本轻骑：单兵贴脸仍因 minr = 5 停火，行为不变', () => {
    const bbc = fighterFull(36, 'Teutons').F;
    const lcav = fighterFull(546, 'Japanese').F;
    const res = groupFight(bbc, 1, lcav, 1);
    if (res.status !== 'win') throw new Error(`unexpected status: ${res.status}`);
    expect(res.winner).toBe('b');
    expect(res.bAlive).toBe(1);
    expect(res.hpLeft).toBeCloseTo(42, 1);
    expect(res.contact.firstStrike?.side).toBe('a');
    expect(res.contact.firstStrike?.volleys).toBe(1);
  });

  it('全量 29 个 minr >= 1 单位：na = 1..100 严格单调无倒挂、减员过程停火/开火人数零反弹、200v200 零 limit/NaN', () => {
    const champ = fighterFull(567, 'Japanese').F;
    const minrUnits = units.filter((u) => u.minr >= 1 && u.civs.length > 0 && !contactFighterError(fighterFrom(u, baseStats(u))));
    expect(minrUnits.length).toBe(29);

    for (const u of minrUnits) {
      const f = fighterFrom(u, baseStats(u));
      const diameter = 2 * f.contact!.radiusX!;
      // 1) 纯几何检验：减员 alive -> alive - 1 时，在 gap = 0 下可开火人数（offset >= minr）永不反向增加
      const firingAtGap0 = (alive: number) => {
        let count = 0;
        for (let rank = 0, placed = 0; placed < alive; rank++) {
          const cap = Math.min(2 * rank + 1, alive - placed);
          if (rank * diameter >= f.contact!.minRange - 1e-9) count += cap;
          placed += cap;
        }
        return count;
      };
      for (let alive = 2; alive <= 200; alive++) {
        expect(firingAtGap0(alive - 1), `unit ${u.id} rebound at alive ${alive}->${alive - 1}`).toBeLessThanOrEqual(firingAtGap0(alive));
      }

      // 2) 全流程仿真单调性：na = 1..100 逐步加 1 人，A 方战果永不倒挂
      let prev: [number, number, number, number] | null = null;
      for (let na = 1; na <= 100; na++) {
        const res = contactFight([{ uid: u.id, count: na, fighter: f }], [{ uid: 567, count: 42, fighter: champ }]);
        expect(res.status, `unit ${u.id} na=${na}`).not.toBe('error');
        expect(res.status, `unit ${u.id} na=${na}`).not.toBe('limit');
        if (res.status === 'error') throw new Error(res.reason);
        expect(Number.isFinite(res.duration)).toBe(true);
        const score: [number, number, number, number] = [
          res.a.total.alive,
          Math.round(res.a.total.hp * 100),
          -res.b.total.alive,
          -Math.round(res.b.total.hp * 100),
        ];
        if (prev) {
          const nonDecreasing =
            score[0] > prev[0] ||
            (score[0] === prev[0] && (score[1] > prev[1] || (score[1] === prev[1] && (score[2] > prev[2] || (score[2] === prev[2] && score[3] >= prev[3])))));
          expect(nonDecreasing, `unit ${u.id} (${u.zh}) na=${na} inverted: ${prev} -> ${score}`).toBe(true);
        }
        prev = score;
      }

      // 3) 200 vs 200 压力测试：无 limit / NaN
      const r200 = contactFight([{ uid: u.id, count: 200, fighter: f }], [{ uid: 567, count: 200, fighter: champ }]);
      expect(r200.status, `unit ${u.id} 200v200`).not.toBe('error');
      expect(r200.status, `unit ${u.id} 200v200`).not.toBe('limit');
      if (r200.status !== 'error') expect(Number.isFinite(r200.duration)).toBe(true);
    }
  });
});

describe('#1296 未建模机制精准判定（全量 24 充能单位 + 5 类机制 + 反例硬门禁）', () => {
  it('全部 24 个 chargeType > 0 单位按固定源语义精确分型，不误标防御护盾或单发充能', () => {
    const chargeUnits = units.filter((u) => (u.chargeType ?? 0) > 0);
    expect(chargeUnits.length).toBe(24);

    const pillOf = (uid: number) => {
      const u = byId[uid]!;
      const hit = detectUnitUnmodeled({ unit: u, civ: u.civs[0]!, age: 4, selectedTechs: [] }).find((m) => m.kind === 'charge');
      return hit;
    };

    for (const uid of [1751, 1753]) {
      const m = pillOf(uid)!;
      expect(m.pill).toBe('充能投射物闪避');
      expect(m.detail).toContain('抗远程生存能力');
    }
    for (const uid of [1908, 1910]) {
      const m = pillOf(uid)!;
      expect(m.pill).toBe('充能近战格挡');
      expect(m.detail).toContain('抗近战生存能力');
    }
    for (const uid of [1655, 1657, 1735, 1737]) {
      expect(pillOf(uid)!.pill).toBe('蓄力增伤攻击');
    }
    for (const uid of [291, 560]) {
      const m = pillOf(uid)!;
      expect(m.pill).toBe('充能特殊机制');
      expect(m.detail).toContain('非普通攻击增伤');
    }
    for (const uid of [1968, 1970, 1901, 1903, 1948, 1952]) {
      expect(pillOf(uid)!.pill).toBe('充能多箭齐射');
    }
    for (const uid of [2569, 2571, 2705, 2706, 2711, 2712, 831, 832]) {
      expect(pillOf(uid)!.pill).toBe('充能远程攻击');
    }

    // 吴精锐火焰弓（1970）：仅 2 枚胶囊（充能多箭齐射 + 固有溅射伤害），无冗余多弹丸胶囊
    expect(detectUnitUnmodeled({ unit: byId[1970]!, civ: 'Wu', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['充能多箭齐射', '固有溅射伤害']);
    // 龟甲船（832）：固有 3 弹丸 + 固有溅射 + 中性充能远程，不再误称“充能多箭齐射”
    expect(detectUnitUnmodeled({ unit: byId[832]!, civ: 'Koreans', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual([
      '充能远程攻击',
      '多弹丸 / 副弹丸',
      '固有溅射伤害',
    ]);
  });

  it('精准命中多弹丸、下马（城堡+营垒）、切换形态、固有溅射、已选科技溅射/额外弹矢与文明加成去重', () => {
    // 诸葛弩 559：多弹丸
    expect(detectUnitUnmodeled({ unit: byId[559]!, civ: 'Chinese', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['多弹丸 / 副弹丸']);

    // 城堡版与营垒版保加利亚骑兵（1225/1227/1254/1255）全部命中下马二阶段
    for (const uid of [1225, 1227, 1254, 1255]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Bulgarians', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['阵亡下马步兵阶段']);
    }

    // 蜀战车 1962：多弹丸 + 可切换形态；孟加拉战车 1759：可切换形态
    expect(detectUnitUnmodeled({ unit: byId[1962]!, civ: 'Shu', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['多弹丸 / 副弹丸', '可切换形态']);
    expect(detectUnitUnmodeled({ unit: byId[1759]!, civ: 'Bengalis', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['可切换形态']);

    // 战象 558 & 象兵 1134：固有溅射
    expect(detectUnitUnmodeled({ unit: byId[558]!, civ: 'Persians', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['固有溅射伤害']);
    expect(detectUnitUnmodeled({ unit: byId[1134]!, civ: 'Malay', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['固有溅射伤害']);

    // 带后勤学（61）的精锐甲胄骑兵（553）命中科技溅射
    const logistica = techById[61]!;
    const cataWithLog = detectUnitUnmodeled({ unit: byId[553]!, civ: 'Byzantines', age: 4, selectedTechs: [logistica] });
    expect(cataWithLog.map((m) => m.pill)).toEqual(['践踏 / 溅射伤害 · 后勤学']);
    expect(cataWithLog[0]!.techEn).toBe('Logistica');

    // 瓦兰吉卫队（2704）选哥瑟砍（1474）：近战单位使用“常规近战主攻击”文案而非“主箭”
    const gothikon = techById[1474]!;
    const vgWithGoth = detectUnitUnmodeled({ unit: byId[2704]!, civ: 'Varangians', age: 4, selectedTechs: [gothikon] });
    expect(vgWithGoth.map((m) => m.pill)).toEqual(['额外弹矢 · 哥瑟砍']);
    expect(vgWithGoth[0]!.detail).toContain('常规近战主攻击');
    expect(vgWithGoth[0]!.detail).not.toContain('主箭');

    // 皇家卫队（513）：近战步兵（567 冠军）触发溅射，远程步兵（281 掷斧兵 +0.5/-0.5 抵消）不误触发
    const druzhina = techById[513]!;
    expect(detectUnitUnmodeled({ unit: byId[567]!, civ: 'Slavs', age: 4, selectedTechs: [druzhina] }).map((m) => m.pill)).toEqual([
      '践踏 / 溅射伤害 · 皇家卫队',
    ]);
    expect(detectUnitUnmodeled({ unit: byId[281]!, civ: 'Slavs', age: 4, selectedTechs: [druzhina] })).toEqual([]);

    // 亚美尼亚箭船（539）命中文明加成；亚美尼亚德罗蒙战舰（1795）固有 + 文明加成去重合并为 1 枚多弹丸胶囊（另加固有溅射）
    expect(detectUnitUnmodeled({ unit: byId[539]!, civ: 'Armenians', age: 2, selectedTechs: [] }).map((m) => m.pill)).toEqual(['多弹丸 / 副弹丸']);
    const armDromon = detectUnitUnmodeled({ unit: byId[1795]!, civ: 'Armenians', age: 4, selectedTechs: [] });
    expect(armDromon.filter((m) => m.kind === 'multi-projectile')).toHaveLength(1);
    expect(armDromon.map((m) => m.pill)).toEqual(['多弹丸 / 副弹丸', '固有溅射伤害']);
  });

  it('反例硬门禁：常规单位与未勾选后勤学的甲胄骑兵（blast=0, blastDamage=-5）零误报', () => {
    expect(byId[553]!.blast).toBe(0);
    expect(byId[553]!.blastDamage).toBe(-5);
    for (const [uid, civ] of [
      [359, 'Japanese'],
      [567, 'Japanese'],
      [569, 'Franks'],
      [553, 'Byzantines'],
      [185, 'Muisca'],
      [6, 'Byzantines'],
      [2704, 'Vikings'],
    ] as const) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ, age: 4, selectedTechs: [] }), `unit ${uid} ${civ}`).toEqual([]);
    }
    // a:102 与 a:107 独立聚合，不混加错抵
    expect(
      hasPositiveEcoAttr(
        [
          { a: 102, op: 'add', v: -1, t: [4] },
          { a: 107, op: 'add', v: 1, t: [4] },
        ],
        4,
        107,
        1,
      ),
    ).toBe(true);
    expect(
      hasPositiveEcoAttr(
        [
          { a: 102, op: 'add', v: -1, t: [4] },
          { a: 107, op: 'add', v: 1, t: [4] },
        ],
        4,
        102,
        1,
      ),
    ).toBe(false);
  });

  it('单兵种可选性：后勤学/哥瑟砍/皇家卫队对目标单位进入 applicableUnmodeledTechIds，且副形态 1980 清空透传字段', () => {
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[553]!, 'Byzantines'), 553).has(techByEn.Logistica!.id)).toBe(true);
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[2704]!, 'Varangians'), 2704).has(techByEn.Gothikon!.id)).toBe(true);
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[567]!, 'Slavs'), 567).has(techByEn.Druzhina!.id)).toBe(true);
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[359]!, 'Japanese'), 359).size).toBe(0);

    // #/unit/1980 掩护模式不透传 1962 的 totalProjectiles / chargeMultiProjectiles
    const form1980 = resolveUnitForm(CORE, 1980);
    expect(form1980.rawTarget?.id).toBe(1980);
    expect(form1980.rawTarget?.totalProjectiles).toBeUndefined();
    expect(form1980.rawTarget?.chargeMultiProjectiles).toBeUndefined();
  });

  it('collectDuelUnmodeled 与 prepareVgDisplay 支持混编同侧 2703 + 2704 去重且保留唯一 rowKey', () => {
    const entries = collectDuelUnmodeled([
      { side: 'a', badge: 'A1', unit: byId[546]!, civ: 'Chinese', age: 4, selectedTechs: [] },
      { side: 'a', badge: 'A2', unit: byId[559]!, civ: 'Chinese', age: 4, selectedTechs: [] },
      { side: 'a', badge: 'A2', unit: byId[559]!, civ: 'Chinese', age: 4, selectedTechs: [] },
      { side: 'b', badge: 'B1', unit: byId[558]!, civ: 'Persians', age: 4, selectedTechs: [] },
      { side: 'b', badge: 'B2', unit: byId[359]!, civ: 'Persians', age: 4, selectedTechs: [] },
    ]);
    expect(entries.map((e) => [e.badge, e.unit.id])).toEqual([
      ['A2', 559],
      ['B1', 558],
    ]);

    // 同侧编入 2703 普通 + 2704 精锐瓦兰吉卫队，选哥瑟砍时抑去 vg-gothikon，产金按行分列且加成去重
    const vg = prepareVgDisplay(
      [
        { rowKey: 'a-0-2703', k: 'a', rowLabel: 'A1 · 瓦兰吉卫队', unitId: 2703, civ: 'Varangians', age: 4, rof: 1.6, seconds: 12 },
        { rowKey: 'a-1-2704', k: 'a', rowLabel: 'A2 · 精锐瓦兰吉卫队', unitId: 2704, civ: 'Varangians', age: 4, rof: 1.6, seconds: 24 },
      ],
      { group: true, suppressedTechs: { a: new Set(['Gothikon']), b: new Set() } },
    );
    expect(vg.gold.map((g) => g.rowKey)).toEqual(['a-0-2703', 'a-1-2704']);
    expect(vg.lines.map((l) => l.note.id)).toEqual(['vg-rof', 'vg-gold']);
    expect(vg.lines.every((l) => !l.distinctRow)).toBe(true);

    // 若同侧两行 rof 不同，两行 vg-rof 保留并带不同 rowKey 与 distinctRow=true
    const vgDiffRof = prepareVgDisplay(
      [
        { rowKey: 'a-0-2703', k: 'a', rowLabel: 'A1 · 瓦兰吉卫队', unitId: 2703, civ: 'Varangians', age: 4, rof: 1.8, seconds: 12 },
        { rowKey: 'a-1-2704', k: 'a', rowLabel: 'A2 · 精锐瓦兰吉卫队', unitId: 2704, civ: 'Varangians', age: 4, rof: 1.6, seconds: 24 },
      ],
      { group: true },
    );
    const rofLines = vgDiffRof.lines.filter((l) => l.note.id === 'vg-rof');
    expect(rofLines).toHaveLength(2);
    expect(new Set(rofLines.map((l) => `${l.rowKey}-${l.note.id}`)).size).toBe(2);
    expect(rofLines.every((l) => l.distinctRow)).toBe(true);
  });
});
