/**
 * issue 1387：单位详情「各文明满科技对照」纯领域引擎与边界全量单测。
 */
import { describe, expect, it } from 'vitest';
import { loadTrees } from '../../src/data';
import { CORE } from '../../src/data/core';
import { militaryTechAge } from '../../src/domain/availabilityAge';
import { costSum } from '../../src/domain/duel';
import { parseSide } from '../../src/domain/duelState';
import { applicableSimCostTechs, mergeSimCostTechs } from '../../src/domain/simEffectiveCost';
import { makeSimContext, parseUnitPath, simTechs } from '../../src/domain/simulator';
import type { Unit } from '../../src/domain/types';
import {
  buildCivRankDuelHref,
  buildCivRankSimHref,
  buildUnitCivRank,
  filterUnitCivRankRows,
  formatRankMetric,
  isRankBestCell,
  quantizeRankMetric,
  RANK_METRIC_COLS,
  sortUnitCivRankRows,
  supportsUnitCivRank,
  type UnitCivRankRow,
} from '../../src/domain/unitCivRank';
import { resolve, isUnavail } from '../../src/features/duel/logic/duelSide';

const trees = await loadTrees();
const ctx = makeSimContext(CORE.techs, trees);
const uById = (id: number) => CORE.unitById[id]!;

describe('#1387 单位详情「各文明满科技对照」纯领域计算引擎', () => {
  it('覆盖全库 248 个目录单位：89 个多文明单位全时代无报错，159 个单文明单位与副形态排除', () => {
    const multi = CORE.units.filter((u) => u.civs.length >= 2);
    const single = CORE.units.filter((u) => u.civs.length < 2);
    expect(CORE.units.length).toBe(248);
    expect(multi.length).toBe(89);
    expect(single.length).toBe(159);

    for (const u of single) {
      expect(supportsUnitCivRank(u, false, false)).toBe(false);
    }
    for (const u of multi) {
      expect(supportsUnitCivRank(u, false, false)).toBe(true);
      expect(supportsUnitCivRank(u, true, false)).toBe(false);
      expect(supportsUnitCivRank(u, false, true)).toBe(false);
      const imp = buildUnitCivRank(ctx, u, 4);
      expect(imp.rows.length).toBe(u.civs.length);
      for (const age of imp.availableAges) {
        const res = buildUnitCivRank(ctx, u, age);
        expect(res.rows.length).toBeGreaterThan(0);
        for (const r of res.rows) {
          expect(Number.isFinite(r.hp)).toBe(true);
          expect(Number.isFinite(r.totalCost)).toBe(true);
          expect(Number.isFinite(r.gold)).toBe(true);
          expect(Number.isFinite(r.bt)).toBe(true);
          for (const { col } of RANK_METRIC_COLS) {
            const v = r[col];
            if (v !== null) {
              expect(formatRankMetric(col, quantizeRankMetric(col, v))).toBe(formatRankMetric(col, v));
            }
          }
        }
        // 冠军胶囊文本与对应最优单元格展示值严格一致
        for (const champ of res.champions) {
          for (const leader of champ.civs) {
            const row = res.rows.find((x) => x.civ === leader.civ)!;
            expect(formatRankMetric(champ.col, row[champ.col])).toBe(champ.formattedValue);
          }
        }
      }
    }
  });

  it('全库 89 个多文明单位 × 全部适用时代与 duelSide.resolve(..., "f") 数值 100% 一致，且 simTechIds 与 useSimState 校验集 0 偏差', () => {
    const multi = CORE.units.filter((u) => u.civs.length >= 2);
    for (const u of multi) {
      const imp = buildUnitCivRank(ctx, u, 4);
      for (const age of imp.availableAges) {
        const res = buildUnitCivRank(ctx, u, age);
        for (const row of res.rows) {
          const side = resolve(ctx, CORE.unitById, { uid: u.id, civ: row.civ, age, ageSet: true, techs: 'f', team: [] }, u.id, 0);
          expect(isUnavail(side), `unit ${u.id} civ ${row.civ} age ${age}`).toBe(false);
          if (isUnavail(side)) continue;
          expect(row.hp).toBeCloseTo(side.S.hp, 6);
          if (row.atk !== null) expect(row.atk).toBeCloseTo(side.S.atk, 6);
          if (row.rof !== null) expect(row.rof).toBeCloseTo(side.S.rof, 6);
          if (row.dps !== null && row.atk !== null && row.rof !== null) expect(row.dps).toBeCloseTo(row.atk / row.rof, 6);
          expect(row.ma).toBeCloseTo(side.S.ma, 6);
          expect(row.pa).toBeCloseTo(side.S.pa, 6);
          expect(row.rng).toBeCloseTo(side.S.rng, 6);
          expect(row.spd).toBeCloseTo(side.S.spd, 6);
          expect(row.totalCost).toBeCloseTo(costSum(side.training.price.cost), 6);
          expect(row.gold).toBeCloseTo(side.training.price.cost.Gold ?? 0, 6);
          expect(row.bt).toBeCloseTo(side.S.bt, 6);
          expect(row.ignoreArmorTech).toBe(side.ignoreArmorTech);
          expect(row.selTechIds).toEqual([...side.sel].sort((a, b) => a - b));

          // 验证 simTechIds 100% 落入 useSimState 合法集合（含古吉拉 835 对 4/24 的精确过滤）
          const costTechs = applicableSimCostTechs(ctx, u, row.civ);
          const costTechIds = new Set(costTechs.map((c) => c.tech.id));
          const mergedAvail = mergeSimCostTechs(simTechs(ctx, u, row.civ), costTechs);
          const okSim = new Set(
            mergedAvail.filter((x) => (x.ef || costTechIds.has(x.t.id)) && militaryTechAge(row.civ, x.t.id, x.t.age) <= age).map((x) => x.t.id),
          );
          for (const id of row.simTechIds) {
            expect(okSim.has(id), `unit ${u.id} civ ${row.civ} age ${age} tech ${id} should be valid in useSimState`).toBe(true);
          }
          const href = buildCivRankSimHref(u.id, row, age);
          expect(href.endsWith('?tab=sim')).toBe(true);
          expect(href).not.toContain('civ=');
          const parsed = parseUnitPath(href.split('?')[0]!);
          expect(parsed?.civ).toBe(row.civ);
          expect(parsed?.age).toBe(age);
          expect(parsed?.ids).toEqual(row.simTechIds);
        }
      }
    }
    // 明确断言古吉拉 835（刹帝利）对步弓手(4)/弩手(24)不进入 simTechIds
    for (const uid of [4, 24]) {
      const gurjaras = buildUnitCivRank(ctx, uById(uid), 4).rows.find((r) => r.civ === 'Gurjaras')!;
      expect(gurjaras.simTechIds).not.toContain(835);
    }
  });

  it('代表区域与通用单位（2701 / 1372 / 1903 / 569）数值、各项第一、缺科与立陶宛 0 圣物基线准确', () => {
    const r2701 = buildUnitCivRank(ctx, uById(2701), 4);
    expect(r2701.availableAges).toEqual([4]);
    expect(r2701.rows.length).toBe(10);
    const saxons = r2701.rows.find((r) => r.civ === 'Saxons')!;
    const varangians = r2701.rows.find((r) => r.civ === 'Varangians')!;
    const teutons = r2701.rows.find((r) => r.civ === 'Teutons')!;
    const franks = r2701.rows.find((r) => r.civ === 'Franks')!;
    const spanish = r2701.rows.find((r) => r.civ === 'Spanish')!;
    const poles = r2701.rows.find((r) => r.civ === 'Poles')!;

    expect(saxons.hp).toBe(75);
    expect(saxons.atk).toBe(12);
    expect(formatRankMetric('dps', saxons.dps)).toBe('5.33');
    expect(saxons.missingTechs).toEqual([]);
    expect(varangians.hp).toBe(85);
    expect(teutons.ma).toBe(7);
    expect(franks.totalCost).toBe(79);
    expect(franks.gold).toBe(39);
    // 全部 10 国均无帕提亚战术，绝不出现伪缺项
    for (const r of r2701.rows) {
      expect(r.missingTechs.some((t) => t.zh === '帕提亚战术')).toBe(false);
    }
    expect(spanish.missingTechs.map((t) => t.zh)).toEqual(['便携弯弩装置']);
    expect(poles.missingTechs.map((t) => t.zh)).toEqual(expect.arrayContaining(['射手锁甲', '便携弯弩装置']));
    // 2701 射程(8)/移速(1.38) 多数并列，不进各项第一
    expect(r2701.champions.map((c) => c.col)).not.toContain('rng');
    expect(r2701.champions.map((c) => c.col)).not.toContain('spd');
    expect(r2701.champions.map((c) => c.col)).toEqual(expect.arrayContaining(['hp', 'rof', 'dps', 'ma', 'totalCost', 'gold']));

    // 1372 精锐草原枪兵
    const r1372 = buildUnitCivRank(ctx, uById(1372), 4);
    expect(formatRankMetric('dps', r1372.rows.find((r) => r.civ === 'Jurchens')!.dps)).toBe('9.38');
    expect(formatRankMetric('hp', r1372.rows.find((r) => r.civ === 'Mongols')!.hp)).toBe('124.06');
    expect(r1372.rows.find((r) => r.civ === 'Tatars')!.pa).toBe(7);
    expect(formatRankMetric('spd', r1372.rows.find((r) => r.civ === 'Cumans')!.spd)).toBe('1.68');

    // 1903 精锐火矛兵
    const r1903 = buildUnitCivRank(ctx, uById(1903), 4);
    expect(formatRankMetric('dps', r1903.rows.find((r) => r.civ === 'Jurchens')!.dps)).toBe('8.75');
    expect(formatRankMetric('totalCost', r1903.rows.find((r) => r.civ === 'Koreans')!.totalCost)).toBe('67.5');

    // 569 游侠：立陶宛缺鼓风炉，按 0 圣物基线为 14 + 2 = 16 攻（绝非叠满 4 圣物的 20 攻）
    const r569 = buildUnitCivRank(ctx, uById(569), 4);
    const lith = r569.rows.find((r) => r.civ === 'Lithuanians')!;
    expect(lith.atk).toBe(16);
    expect(lith.missingTechs.map((t) => t.zh)).toContain('鼓风炉');
  });

  it('缺项并集排除阿兹特克僧侣伪缺项，城堡时代 24 弩手排除提前解锁的化学伪缺项', () => {
    const monk = buildUnitCivRank(ctx, uById(125), 4);
    expect(monk.combatKind).toBe('non-attacking');
    expect(monk.canDuel).toBe(false);
    expect(monk.defaultSortCol).toBe('hp');
    const allMonkMissing = new Set(monk.rows.flatMap((r) => r.missingTechs.map((t) => t.zh)));
    expect(allMonkMissing.has('赎罪')).toBe(false);
    expect(allMonkMissing.has('救赎')).toBe(false);
    expect(allMonkMissing.has('异教')).toBe(false);
    expect(allMonkMissing.has('圣洁')).toBe(true);
    expect(allMonkMissing.has('雕版印刷术')).toBe(true);

    // 城堡时代弩手 24：波希米亚享受提前化学（8 攻），其余正常满科技文明不标「缺 化学」
    const xbowCastle = buildUnitCivRank(ctx, uById(24), 3);
    expect(xbowCastle.rows.find((r) => r.civ === 'Bohemians')!.atk).toBe(8);
    expect(xbowCastle.rows.find((r) => r.civ === 'Britons')!.missingTechs.some((t) => t.zh === '化学')).toBe(false);
  });

  it('未建模机制合并、共有机制去重与 PK 链接构造（常规 m=r&bud=3000 / 自爆 m=1 / 仅缺失时写显式 ID）', () => {
    // 567 冠军剑士：斯拉夫皇家卫队践踏 + 达罗毗荼乌兹钢无视护甲
    const champ = buildUnitCivRank(ctx, uById(567), 4);
    const slavs = champ.rows.find((r) => r.civ === 'Slavs')!;
    const dravidians = champ.rows.find((r) => r.civ === 'Dravidians')!;
    const teutons = champ.rows.find((r) => r.civ === 'Teutons')!;
    expect(slavs.unmodeledPills.some((p) => p.includes('皇家卫队'))).toBe(true);
    expect(dravidians.ignoreArmorTech).toBe('乌兹钢');

    const duelSlavs = buildCivRankDuelHref(567, slavs, teutons, 4, champ.combatKind);
    const paramsS = new URLSearchParams(duelSlavs.split('?')[1]);
    expect(paramsS.get('m')).toBe('r');
    expect(paramsS.get('bud')).toBe('3000');
    const sideA = parseSide(paramsS.get('a'), { uid: 567, civ: 'Slavs', age: 4, techs: 'f', team: [] });
    const sideB = parseSide(paramsS.get('b'), { uid: 567, civ: 'Teutons', age: 4, techs: 'f', team: [] });
    expect(Array.isArray(sideA.techs) && sideA.techs.includes(513)).toBe(true);
    expect(sideB.techs).toBe('f');

    // 331 巨型投石机·不列颠（461 战狼号）已含于 sel，保留 'f' 预设高亮
    const treb = buildUnitCivRank(ctx, uById(331), 4);
    const britons = treb.rows.find((r) => r.civ === 'Britons')!;
    const franksT = treb.rows.find((r) => r.civ === 'Franks')!;
    expect(britons.unmodeledPills.some((p) => p.includes('战狼号'))).toBe(true);
    const trebHref = buildCivRankDuelHref(331, britons, franksT, 4, treb.combatKind);
    expect(new URLSearchParams(trebHref.split('?')[1]).get('a')).toBe('331.Britons.4.f.');

    // 528 重型爆破船（自爆）：共有机制上提，PK 走 m=1 不带 bud
    const demo = buildUnitCivRank(ctx, uById(528), 4);
    expect(demo.combatKind).toBe('suicide');
    expect(demo.canDuel).toBe(true);
    expect(demo.defaultSortCol).toBe('atk');
    expect(demo.commonMechanisms).toContain('固有溅射伤害');
    for (const r of demo.rows) {
      expect(r.rof).toBeNull();
      expect(r.dps).toBeNull();
      expect(r.unmodeledPills).not.toContain('固有溅射伤害');
    }
    const demoHref = buildCivRankDuelHref(528, demo.rows[0]!, demo.rows[1]!, 4, demo.combatKind);
    const demoParams = new URLSearchParams(demoHref.split('?')[1]);
    expect(demoParams.get('m')).toBe('1');
    expect(demoParams.get('bud')).toBeNull();
  });

  it('提前解锁（含长矛兵 93 standardAge = 2 与重装骑士 283 城堡 1/39）与 2 文明最优值边界（752 / 1707）', () => {
    const spearDark = buildUnitCivRank(ctx, uById(93), 1);
    expect(spearDark.standardAge).toBe(2);
    expect(spearDark.rows.length).toBe(1);
    expect(spearDark.rows[0]!.civ).toBe('Armenians');
    expect(spearDark.rows[0]!.earlyUnlock).toBe(true);
    const spearImp = buildUnitCivRank(ctx, uById(93), 4);
    expect(spearImp.rows.find((r) => r.civ === 'Armenians')!.earlyUnlock).toBe(true);
    expect(spearImp.rows.find((r) => r.civ === 'Franks')!.earlyUnlock).toBe(false);

    const cavCastle = buildUnitCivRank(ctx, uById(283), 3);
    expect(cavCastle.rows.length).toBe(1);
    expect(cavCastle.rows[0]!.civ).toBe('Burgundians');
    expect(cavCastle.rows[0]!.earlyUnlock).toBe(true);
    expect(cavCastle.standardAge).toBe(4);
    expect(cavCastle.champions).toEqual([]);

    // 2 文明单位：1/2 唯一胜出标绿，2/2 并列不标
    const wing = buildUnitCivRank(ctx, uById(1707), 4);
    expect(wing.rows.length).toBe(2);
    expect(wing.rows.find((r) => r.civ === 'Poles')!.unmodeledPills.some((p) => p.includes('列克提克遗产'))).toBe(true);
    const eagle = buildUnitCivRank(ctx, uById(752), 4);
    expect(eagle.rows.length).toBe(2);
    expect(eagle.champions.length).toBeGreaterThan(0);
    for (const champ of eagle.champions) {
      expect(champ.civs.length).toBe(1);
    }
  });

  it('精确小数格式（691 土耳其 187.50 生命、588 萨拉森 87.25 攻击、维京箭船 25.5 / 魏 157.5 黄金）、展示精度并列（2700 城堡 4.00）、稳定次级排序、合成估算标记与对局返回参数', () => {
    const cg = buildUnitCivRank(ctx, uById(691), 4);
    const turks = cg.rows.find((r) => r.civ === 'Turks')!;
    expect(formatRankMetric('hp', turks.hp)).toBe('187.50');
    expect(isRankBestCell(cg, 'hp', turks.hp)).toBe(true);

    const saracen = buildUnitCivRank(ctx, uById(588), 4).rows.find((r) => r.civ === 'Saracens')!;
    expect(formatRankMetric('atk', saracen.atk)).toBe('87.25');

    const vikingGalley = buildUnitCivRank(ctx, uById(539), 3).rows.find((r) => r.civ === 'Vikings')!;
    expect(formatRankMetric('gold', vikingGalley.gold)).toBe('25.5');

    const weiGold = buildUnitCivRank(ctx, uById(1942), 4).rows.find((r) => r.civ === 'Wei')!;
    expect(formatRankMetric('gold', weiGold.gold)).toBe('157.5');

    // 2700 城堡时代骑马弩兵：葡萄牙（4.0000176）与波希米亚（4.0）均展示为 4.00，并列判定与冠军高亮完全一致
    const mcCastle = buildUnitCivRank(ctx, uById(2700), 3);
    const port = mcCastle.rows.find((r) => r.civ === 'Portuguese')!;
    const boh = mcCastle.rows.find((r) => r.civ === 'Bohemians')!;
    expect(formatRankMetric('dps', port.dps)).toBe('4.00');
    expect(formatRankMetric('dps', boh.dps)).toBe('4.00');
    expect(isRankBestCell(mcCastle, 'dps', port.dps)).toBe(isRankBestCell(mcCastle, 'dps', boh.dps));
    const dpsChamp = mcCastle.champions.find((c) => c.col === 'dps');
    if (dpsChamp) {
      expect(dpsChamp.civs.map((c) => c.civ)).toEqual(expect.arrayContaining(['Portuguese', 'Bohemians']));
    }

    // 329 骆驼兵 & 1370 草原枪兵城堡时代移速：库曼 1.60 严格领先 1.59 且夺得移速最快；545 运输船冠军胶囊与单元格完全一致
    for (const uid of [329, 1370]) {
      const res = buildUnitCivRank(ctx, uById(uid), 3);
      const sortedSpd = sortUnitCivRankRows(res.rows, 'spd', 'desc');
      expect(sortedSpd[0]!.civ).toBe('Cumans');
      expect(formatRankMetric('spd', sortedSpd[0]!.spd)).toBe('1.60');
      const spdChamp = res.champions.find((c) => c.col === 'spd')!;
      expect(spdChamp.formattedValue).toBe('1.60');
      expect(spdChamp.civs.map((c) => c.civ)).toEqual(['Cumans']);
    }
    const shipDark = buildUnitCivRank(ctx, uById(545), 1);
    const shipSpd = shipDark.champions.find((c) => c.col === 'spd')!;
    expect(shipSpd.formattedValue).toBe(formatRankMetric('spd', shipDark.rows.find((r) => r.civ === 'Berbers')!.spd));

    // 模拟器跳转保留对局助手 me/opp，不带入旧 civ 或 relics
    const simKeep = buildCivRankSimHref(2701, buildUnitCivRank(ctx, uById(2701), 4).rows[0]!, 4, '?civ=Franks&relics=3&me=Saxons&opp=Poles');
    const simParams = new URLSearchParams(simKeep.split('?')[1]);
    expect(simParams.get('me')).toBe('Saxons');
    expect(simParams.get('opp')).toBe('Poles');
    expect(simParams.get('tab')).toBe('sim');
    expect(simParams.get('civ')).toBeNull();
    expect(simParams.get('relics')).toBeNull();

    // 真实合成 partial 费用科技（马普切 1380 布图马普命中 2569）：触发 estimatedCost 与 hasEstimatedCost
    const syntheticPartialUnit: Unit = { ...uById(2569), civs: ['Mapuche', 'Franks'] };
    const partialRes = buildUnitCivRank(ctx, syntheticPartialUnit, 4);
    expect(partialRes.hasEstimatedCost).toBe(true);
    expect(partialRes.rows.find((r) => r.civ === 'Mapuche')!.estimatedCost).toBe(true);
    expect(partialRes.rows.find((r) => r.civ === 'Franks')!.estimatedCost).toBe(false);

    // 稳定次级排序（同值按生命降序 -> 总价升序 -> 文明英文名升序，null 沉底）
    const fakeRows: UnitCivRankRow[] = [
      {
        civ: 'B',
        civZh: '乙',
        earlyUnlock: false,
        hp: 100,
        atk: 10,
        rof: 2,
        dps: 5,
        ma: 2,
        pa: 2,
        rng: 1,
        spd: 1,
        totalCost: 80,
        gold: 40,
        bt: 20,
        estimatedCost: false,
        missingTechs: [],
        unmodeledPills: [],
        selTechIds: [],
        simTechIds: [],
        activeUnmodeledTechIds: [],
      },
      {
        civ: 'A',
        civZh: '甲',
        earlyUnlock: false,
        hp: 100,
        atk: 10,
        rof: 2,
        dps: 5,
        ma: 2,
        pa: 2,
        rng: 1,
        spd: 1,
        totalCost: 80,
        gold: 40,
        bt: 20,
        estimatedCost: true,
        missingTechs: [],
        unmodeledPills: [],
        selTechIds: [],
        simTechIds: [],
        activeUnmodeledTechIds: [],
      },
      {
        civ: 'C',
        civZh: '丙',
        earlyUnlock: false,
        hp: 120,
        atk: 10,
        rof: 2,
        dps: 5,
        ma: 2,
        pa: 2,
        rng: 1,
        spd: 1,
        totalCost: 90,
        gold: 40,
        bt: 20,
        estimatedCost: false,
        missingTechs: [],
        unmodeledPills: [],
        selTechIds: [],
        simTechIds: [],
        activeUnmodeledTechIds: [],
      },
      {
        civ: 'D',
        civZh: '丁',
        earlyUnlock: false,
        hp: 100,
        atk: null,
        rof: null,
        dps: null,
        ma: 2,
        pa: 2,
        rng: 1,
        spd: 1,
        totalCost: 60,
        gold: 20,
        bt: 20,
        estimatedCost: false,
        missingTechs: [],
        unmodeledPills: [],
        selTechIds: [],
        simTechIds: [],
        activeUnmodeledTechIds: [],
      },
    ];
    expect(sortUnitCivRankRows(fakeRows, 'dps', 'desc').map((r) => r.civ)).toEqual(['C', 'A', 'B', 'D']);
    expect(sortUnitCivRankRows(fakeRows, 'dps', 'asc').map((r) => r.civ)).toEqual(['C', 'A', 'B', 'D']);

    // 合成估算造价与 SSR 异常 fixture 兜底（NaN 不扩散）
    const brokenUnit: Unit = {
      ...uById(2701),
      hp: Number.NaN,
      atk: Number.NaN,
      rof: Number.NaN,
      spd: Number.NaN,
      tt: Number.NaN,
    };
    const safeRes = buildUnitCivRank(ctx, brokenUnit, 4);
    expect(safeRes.rows.length).toBe(10);
    expect(safeRes.rows[0]!.hp).toBe(0);
    expect(safeRes.rows[0]!.dps).toBeNull();
  });

  it('搜索匹配（中/英文子串 + norm + pyMatch 前缀防误报）与空结果三态精确分流', () => {
    const champ = buildUnitCivRank(ctx, uById(567), 4);
    const av = filterUnitCivRankRows(champ.rows, 'AV', uById(567), 4);
    expect(av.emptyMessage).toBeNull();
    expect(av.rows.map((r) => r.civ)).toEqual(expect.arrayContaining(['Slavs', 'Dravidians']));

    // 拼音前缀（大写 + 空格经 norm 归一化生效），且不因 an 误命中缅甸/越南/波兰
    const falu = filterUnitCivRankRows(champ.rows, '  FLK ', uById(567), 4);
    expect(falu.rows.map((r) => r.civ)).toContain('Franks');
    const an = filterUnitCivRankRows(champ.rows, 'an', uById(567), 4);
    expect(an.rows.map((r) => r.civ)).not.toContain('Burmese');
    expect(an.rows.map((r) => r.civ)).not.toContain('Vietnamese');

    // 劲弩手 492 搜法兰克 -> 不能训练
    const arbalest = buildUnitCivRank(ctx, uById(492), 4);
    expect(filterUnitCivRankRows(arbalest.rows, '法兰克', uById(492), 4).emptyMessage).toBe('法兰克不能训练劲弩手。');

    // 重装骑士 283 城堡时代：搜法兰克 -> 城堡时代不能训练；搜阿兹特克 -> 不能训练（绝不暗示帝王可训）；搜乱码 -> 无匹配
    const cavCastle = buildUnitCivRank(ctx, uById(283), 3);
    expect(filterUnitCivRankRows(cavCastle.rows, '法兰克', uById(283), 3).emptyMessage).toBe('法兰克在城堡时代不能训练重装骑士。');
    expect(filterUnitCivRankRows(cavCastle.rows, '阿兹特克', uById(283), 3).emptyMessage).toBe('阿兹特克不能训练重装骑士。');
    expect(filterUnitCivRankRows(cavCastle.rows, '不存在文明xyz', uById(283), 3).emptyMessage).toBe('没有匹配「不存在文明xyz」的文明。');
  });
});
