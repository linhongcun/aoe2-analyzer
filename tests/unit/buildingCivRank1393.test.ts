import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { GARRISON_HOST_IDS } from '../../src/data/garrisonHosts';
import treesRaw from '../../data/game/trees.json';
import { buildingAge } from '../../src/domain/availabilityAge';
import {
  buildBuildingCivRank,
  buildBuildingRankConstructionHref,
  buildBuildingRankGarrisonHref,
  buildBuildingRankSimHref,
  BUILDING_RANK_COL_META_BY_KEY,
  buildingRankCategory,
  filterBuildingCivRankRows,
  formatBuildingRankMetric,
  isBuildingRankBestCell,
  quantizeBuildingRankMetric,
  sortBuildingCivRankRows,
  supportsBuildingCivRank,
  type BuildingCivRankContext,
  type BuildingGarrisonArrowEntry,
  type BuildingGarrisonArrowsState,
} from '../../src/domain/buildingCivRank';
import { calculateConstruction, decodeConstruction } from '../../src/domain/construction';
import {
  calculateGeneralGarrison,
  explainGeneralGarrison,
  getFreeGarrisonTechs,
  getGarrisonTechs,
  readGeneralGarrison,
} from '../../src/domain/garrisonGeneral';
import type { Building, Trees } from '../../src/domain/types';

const trees = treesRaw as unknown as Trees;
const ctx: BuildingCivRankContext = { core: CORE, trees };
const building = (id: number): Building => CORE.buildingById[id]!;
const hostSet = new Set<number>(GARRISON_HOST_IDS);

function readyArrows(b: Building, age: number): BuildingGarrisonArrowsState {
  const byCiv: Record<string, BuildingGarrisonArrowEntry> = {};
  for (const civ of b.civs) {
    if (buildingAge(b, civ, trees) > age) continue;
    const all = getGarrisonTechs(ctx, b, { civ, age, techs: [], rows: [] }).map((t) => t.id);
    const baseFree = new Set(getFreeGarrisonTechs(ctx, b, { civ, age, techs: [], rows: [] }));
    const first = all.filter((id) => !baseFree.has(id));
    const nextFree = new Set(getFreeGarrisonTechs(ctx, b, { civ, age, techs: first, rows: [] }));
    const manual = first.filter((id) => !nextFree.has(id)).sort((a, c) => a - c);
    const res = calculateGeneralGarrison(ctx, b, { civ, age, techs: manual, rows: [] });
    expect(res.errors).toEqual([]);
    byCiv[civ] = { baseProjectiles: res.baseProjectiles, maxProjectiles: res.maxProjectiles, garrisonTechIds: manual };
  }
  return { status: 'ready', byCiv };
}

describe('建筑详情各文明满科技对照（#1393）', () => {
  it('全库 38 座建筑：精确覆盖 32 座多文明建筑、排除 6 座单文明，全时代零报错', () => {
    const multi = CORE.buildings.filter((b) => supportsBuildingCivRank(b));
    const single = CORE.buildings.filter((b) => !supportsBuildingCivRank(b));
    expect(CORE.buildings).toHaveLength(38);
    expect(multi).toHaveLength(32);
    expect(single.map((b) => b.id).sort((a, b) => a - b)).toEqual([1021, 1189, 1251, 1665, 1734, 1889]);
    expect(multi.filter((b) => hostSet.has(b.id))).toHaveLength(17);

    const catCounts = { A: 0, B: 0, C: 0, D: 0 };
    for (const b of multi) {
      const cat = buildingRankCategory(b);
      catCounts[cat]++;
      const minA = Math.min(...b.civs.map((c) => buildingAge(b, c, trees)));
      for (let age = minA; age <= 4; age++) {
        const res = buildBuildingCivRank(ctx, b, age, cat === 'A' ? readyArrows(b, age) : { status: 'idle' });
        expect(res.rows.length).toBeGreaterThan(0);
        for (const r of res.rows) {
          expect(Number.isFinite(r.hp) && r.hp > 0).toBe(true);
          expect(Number.isFinite(r.totalCost) && r.totalCost >= 0).toBe(true);
        }
        // 量化单调性与展示精度一致
        for (const col of res.sortableCols) {
          const sorted = sortBuildingCivRankRows(res.rows, col, BUILDING_RANK_COL_META_BY_KEY[col].bestDir);
          let seenNull = false;
          for (const row of sorted) {
            if (row[col] === null) seenNull = true;
            else expect(seenNull).toBe(false);
          }
        }
      }
    }
    expect(catCounts).toEqual({ A: 6, B: 1, C: 10, D: 15 });
  });

  it('四类动态列裁剪：船坞屏蔽伪攻击、炮塔隐藏箭数、骡车带移速科技说明', () => {
    const keep = buildBuildingCivRank(ctx, building(235), 4, readyArrows(building(235), 4));
    expect(keep.category).toBe('A');
    expect(keep.visibleCols).toEqual(['hp', 'atk', 'rng', 'ma', 'pa', 'barm', 'gar', 'baseProj', 'maxProj', 'totalCost', 'stone', 'bt']);

    const bbt = buildBuildingCivRank(ctx, building(236), 4);
    expect(bbt.category).toBe('B');
    expect(bbt.visibleCols).toEqual(['hp', 'atk', 'rof', 'rng', 'ma', 'pa', 'barm', 'gar', 'totalCost', 'stone', 'gold', 'bt']);
    expect(bbt.visibleCols).not.toContain('baseProj');
    expect(bbt.visibleCols).not.toContain('maxProj');

    const dock = buildBuildingCivRank(ctx, building(45), 4);
    expect(dock.category).toBe('C');
    expect(dock.visibleCols).toEqual(['hp', 'ma', 'pa', 'barm', 'gar', 'totalCost', 'bt']);
    for (const r of dock.rows) {
      expect(r.atk).toBeNull();
      expect(r.rng).toBeNull();
      expect(r.rof).toBeNull();
      const missingIds = r.missingTechs.map((t) => t.id);
      for (const forbidden of [199, 200, 201, 47, 322, 380, 608]) expect(missingIds).not.toContain(forbidden);
    }

    const barracks = buildBuildingCivRank(ctx, building(12), 4);
    expect(barracks.category).toBe('C');
    const barracksMissingUnion = new Set(barracks.rows.flatMap((r) => r.missingTechs.map((t) => t.id)));
    expect([...barracksMissingUnion].sort((a, b) => a - b)).toEqual([50, 51, 54]);
    expect(barracks.rows.find((r) => r.civ === 'Goths')?.tags).toContain('未计入：训练速度 ×2 · 井喷');

    const wall = buildBuildingCivRank(ctx, building(117), 4);
    expect(wall.category).toBe('D');
    expect(wall.visibleCols).toEqual(['hp', 'ma', 'pa', 'barm', 'totalCost', 'stone', 'bt']);

    const mule = buildBuildingCivRank(ctx, building(1808), 4);
    expect(mule.category).toBe('D');
    expect(mule.moveSpeedTechNames).toEqual(expect.arrayContaining(['独轮推车', '手推车']));
    expect(mule.rows.find((r) => r.civ === 'Armenians')?.missingTechs.map((t) => t.id)).toEqual([51]);
    expect(mule.rows.find((r) => r.civ === 'Georgians')?.missingTechs).toEqual([]);

    // #1407：商队旅馆（1754）及全站无攻多文明建筑的 simTechIds / missingTechs 不含 322/380
    const caravanserai = buildBuildingCivRank(ctx, building(1754), 4);
    expect(caravanserai.rows.find((r) => r.civ === 'Persians')?.simTechIds).toEqual([8, 50, 51, 280]);
    expect(caravanserai.rows.find((r) => r.civ === 'Hindustanis')?.simTechIds).toEqual([8, 50, 280]);
    for (const b of CORE.buildings.filter((x) => supportsBuildingCivRank(x) && x.atk === 0 && (x.atks?.length ?? 0) === 0)) {
      const rank = buildBuildingCivRank(ctx, b, 4);
      for (const r of rank.rows) {
        expect(r.simTechIds, `${b.id}/${r.civ} simTechIds`).not.toContain(322);
        expect(r.simTechIds, `${b.id}/${r.civ} simTechIds`).not.toContain(380);
        expect(
          r.missingTechs.map((t) => t.id),
          `${b.id}/${r.civ} missingTechs`,
        ).not.toContain(322);
        expect(
          r.missingTechs.map((t) => t.id),
          `${b.id}/${r.civ} missingTechs`,
        ).not.toContain(380);
      }
    }
  });

  it('大型箭塔（235）与城堡（82）：数值、斯拉夫 455、凯尔特 482 与机制标签核对', () => {
    const keep = buildBuildingCivRank(ctx, building(235), 4, readyArrows(building(235), 4));
    expect(keep.availableAges).toEqual([4]);
    expect(keep.rows[0]!.civ).toBe('Chinese');
    expect(formatBuildingRankMetric('hp', keep.rows[0]!.hp)).toBe('3539.25');
    expect(keep.rows[0]!.tags).toContain('长城（已计入）');
    expect(isBuildingRankBestCell(keep, 'hp', keep.rows[0]!.hp)).toBe(true);
    expect(keep.rows.find((r) => r.civ === 'Britons')?.atk).toBe(17);
    expect(keep.rows.find((r) => r.civ === 'Britons')?.tags).toContain('英皇侍卫（已计入）');
    expect(keep.rows.find((r) => r.civ === 'Georgians')?.atk).toBe(17);
    expect(keep.rows.find((r) => r.civ === 'Georgians')?.tags).toContain('斯万箭塔（已计入）');
    expect(keep.rows.find((r) => r.civ === 'Koreans')?.rng).toBe(13);
    expect(keep.rows.find((r) => r.civ === 'Teutons')?.gar).toBe(10);
    expect(keep.rows.find((r) => r.civ === 'Teutons')?.maxProj).toBe(9);
    const jpn = keep.rows.find((r) => r.civ === 'Japanese')!;
    expect(jpn.baseProj).toBe(3);
    expect(jpn.maxProj).toBe(7);
    expect(jpn.tags).toContain('额外箭矢 +2 · 射箭孔（已计入箭数）');
    expect(formatBuildingRankMetric('totalCost', keep.rows.find((r) => r.civ === 'Incas')!.totalCost)).toBe('141');
    expect(formatBuildingRankMetric('stone', keep.rows.find((r) => r.civ === 'Incas')!.stone)).toBe('106');
    expect(formatBuildingRankMetric('bt', keep.rows.find((r) => r.civ === 'Spanish')!.bt)).toBe('61.5');
    // #1453：修复 buildingBase 基础目标类别加成后，加热射击 380 在四级防御塔/炮塔生效，缺少 380 的文明自动进入 missingTechs
    const keepMissing380 = keep.rows.filter((r) => r.missingTechs.some((t) => t.id === 380)).map((r) => r.civ);
    expect(keepMissing380).toHaveLength(11);
    expect(keepMissing380).toEqual(expect.arrayContaining(['Byzantines', 'Japanese', 'Spanish']));
    for (const civ of ['Chinese', 'Britons', 'Turks']) {
      expect(keep.rows.find((r) => r.civ === civ)!.missingTechs.map((t) => t.id)).not.toContain(380);
    }
    // 79 瞭望箭塔（17 国缺 380；封建时代 380 未解锁不进缺项）与 234 警戒箭塔（15 国缺 380）
    const wtImp = buildBuildingCivRank(ctx, building(79), 4, readyArrows(building(79), 4));
    expect(wtImp.rows.filter((r) => r.missingTechs.some((t) => t.id === 380))).toHaveLength(17);
    const wtFeudal = buildBuildingCivRank(ctx, building(79), 2, readyArrows(building(79), 2));
    for (const r of wtFeudal.rows) expect(r.missingTechs.map((t) => t.id)).not.toContain(380);
    const gtImp = buildBuildingCivRank(ctx, building(234), 4, readyArrows(building(234), 4));
    expect(gtImp.rows.filter((r) => r.missingTechs.some((t) => t.id === 380))).toHaveLength(15);
    // 凯尔特 482 堡垒在 A 类不显示间隔列，不得误标「已计入」
    const celtsKeep = keep.rows.find((r) => r.civ === 'Celts')!;
    expect(celtsKeep.tags).toContain('未计入：攻速加快 · 堡垒');
    expect(celtsKeep.tags).not.toContain('堡垒（已计入）');

    const castle = buildBuildingCivRank(ctx, building(82), 4, readyArrows(building(82), 4));
    expect(castle.rows[0]!.civ).toBe('Byzantines');
    expect(formatBuildingRankMetric('hp', castle.rows[0]!.hp)).toBe('8130.71');
    const persians = castle.rows.find((r) => r.civ === 'Persians')!;
    expect(persians.atk).toBe(18);
    expect(persians.tags).toContain('堡垒（已计入）');
    expect(persians.tags).toContain('未计入：受额外伤害减少 · 堡垒');
    const slavs = castle.rows.find((r) => r.civ === 'Slavs')!;
    expect(formatBuildingRankMetric('stone', slavs.stone)).toBe('390');
    expect(formatBuildingRankMetric('totalCost', slavs.totalCost)).toBe('650');
    expect(slavs.tags).toContain('罗斯堡垒 · 石料改木材（已计入造价）');
    expect(isBuildingRankBestCell(castle, 'stone', slavs.stone)).toBe(true);
    expect(formatBuildingRankMetric('totalCost', castle.rows.find((r) => r.civ === 'Franks')!.totalCost)).toBe('487.5');
    expect(formatBuildingRankMetric('bt', castle.rows.find((r) => r.civ === 'Sicilians')!.bt)).toBe('133.3');
    expect(castle.rows.find((r) => r.civ === 'Saxons')?.baseProj).toBe(10);
    expect(castle.rows.find((r) => r.civ === 'Saxons')?.maxProj).toBe(26);
    expect(castle.rows.find((r) => r.civ === 'Jurchens')?.tags).toContain('未计入：每分钟回复 500 生命 · 强化堡垒');
    expect(castle.rows.find((r) => r.civ === 'Berbers')?.tags).toContain('未计入：训练速度 ×1.25 · 土堡');
    expect(castle.rows.find((r) => r.civ === 'Celts')?.tags).toContain('未计入：攻速加快 · 堡垒');
    expect(castle.rows.find((r) => r.civ === 'Celts')?.tags).not.toContain('堡垒（已计入）');

    // 斯拉夫 455 同样计入 79 瞭望箭塔与 234 警戒箭塔（按固定数据斯拉夫不拥有 235/236）
    expect(building(235).civs).not.toContain('Slavs');
    expect(building(236).civs).not.toContain('Slavs');
    for (const tid of [79, 234]) {
      const tower = buildBuildingCivRank(ctx, building(tid), 4, readyArrows(building(tid), 4));
      const row = tower.rows.find((r) => r.civ === 'Slavs')!;
      expect(formatBuildingRankMetric('stone', row.stone)).toBe('75');
      expect(row.tags).toContain('罗斯堡垒 · 石料改木材（已计入造价）');
    }
  });

  it('城镇中心（109）四时代、养鱼场（199）、攻城武器厂（49）、强化教堂（1806）与炮塔（236）边界', () => {
    const tc4 = buildBuildingCivRank(ctx, building(109), 4, readyArrows(building(109), 4));
    expect(tc4.availableAges).toEqual([1, 2, 3, 4]);
    expect(tc4.rows[0]!.civ).toBe('Persians');
    expect(formatBuildingRankMetric('hp', tc4.rows[0]!.hp)).toBe('5808');
    expect(formatBuildingRankMetric('bt', tc4.rows.find((r) => r.civ === 'Sicilians')!.bt)).toBe('75.0');
    expect(formatBuildingRankMetric('bt', tc4.rows.find((r) => r.civ === 'Spanish')!.bt)).toBe('115.4');
    expect(formatBuildingRankMetric('stone', tc4.rows.find((r) => r.civ === 'Bulgarians')!.stone)).toBe('50');
    expect(formatBuildingRankMetric('totalCost', tc4.rows.find((r) => r.civ === 'Britons')!.totalCost)).toBe('237.5');
    const mali4 = tc4.rows.find((r) => r.civ === 'Malians')!;
    expect(mali4.baseProj).toBe(8);
    expect(mali4.maxProj).toBe(18);
    expect(mali4.tags).toContain('额外箭矢 +8 · 蛮王（已计入箭数）');
    // 未就绪/失败态不标「已计入箭数」且箭数列不可排序
    const tcLoading = buildBuildingCivRank(ctx, building(109), 4, { status: 'loading' });
    expect(tcLoading.sortableCols).not.toContain('baseProj');
    expect(tcLoading.sortableCols).not.toContain('maxProj');
    expect(tcLoading.rows.find((r) => r.civ === 'Malians')!.tags).toContain('额外箭矢 +8 · 蛮王');
    expect(tcLoading.rows.find((r) => r.civ === 'Malians')!.tags).not.toContain('额外箭矢 +8 · 蛮王（已计入箭数）');
    // TC minr === 0，近射孔 322 自动排除出并集；城堡时代波希米亚使化学 47 进入缺项
    for (const r of tc4.rows) expect(r.missingTechs.map((t) => t.id)).not.toContain(322);
    const tc3 = buildBuildingCivRank(ctx, building(109), 3, readyArrows(building(109), 3));
    expect(tc3.rows.find((r) => r.civ === 'Franks')!.missingTechs.map((t) => t.id)).toContain(47);
    expect(tc3.rows.find((r) => r.civ === 'Bohemians')!.missingTechs.map((t) => t.id)).not.toContain(47);
    // 封建 TC：仅库曼 270.0s 可算，其余 55 国 null，openSlots 仍保留 construction 以对齐槽位
    const tc2 = buildBuildingCivRank(ctx, building(109), 2, readyArrows(building(109), 2));
    expect(formatBuildingRankMetric('bt', tc2.rows.find((r) => r.civ === 'Cumans')!.bt)).toBe('270.0');
    expect(tc2.rows.filter((r) => r.bt === null)).toHaveLength(55);
    expect(tc2.rows.find((r) => r.civ === 'Franks')!.btReason).toContain('首版额外城镇中心支持城堡时代起');
    expect(tc2.openSlots).toEqual(['sim', 'garrison', 'construction']);
    // 黑暗 TC：56 国 bt 均为 null，bt 不可排序且省略 construction 槽
    const tc1 = buildBuildingCivRank(ctx, building(109), 1, readyArrows(building(109), 1));
    expect(tc1.sortableCols).not.toContain('bt');
    expect(tc1.openSlots).toEqual(['sim', 'garrison']);

    // 养鱼场 199：工期全 null、不排序、无多人施工槽、不误报脚踏起重机 54
    const fish = buildBuildingCivRank(ctx, building(199), 4);
    expect(fish.hasValidConstruction).toBe(false);
    expect(fish.sortableCols).not.toContain('bt');
    expect(fish.openSlots).toEqual(['sim']);
    expect(fish.rows[0]!.btReason).toContain('渔船');
    for (const r of fish.rows) expect(r.missingTechs.map((t) => t.id)).not.toContain(54);

    // 攻城武器厂 49：封建仅库曼 1 / 56 且标提前解锁
    const sw2 = buildBuildingCivRank(ctx, building(49), 2);
    expect(sw2.standardAge).toBe(3);
    expect(sw2.rows).toHaveLength(1);
    expect(sw2.rows[0]!.civ).toBe('Cumans');
    expect(sw2.rows[0]!.earlyUnlock).toBe(true);

    // 强化教堂 1806（#1474）：空驻 0 / 满驻 5，接入 931/942–946 后攻/射程/护甲与驻军预览及独科标签完全一致
    const church = buildBuildingCivRank(ctx, building(1806), 4, readyArrows(building(1806), 4));
    expect(church.rows).toHaveLength(2);
    for (const r of church.rows) {
      expect(r.baseProj).toBe(0);
      expect(r.maxProj).toBe(5);
      expect(r.missingTechs.map((t) => t.id)).not.toContain(322);
    }
    const armChurch = church.rows.find((r) => r.civ === 'Armenians')!;
    const geoChurch = church.rows.find((r) => r.civ === 'Georgians')!;
    expect(armChurch.hp).toBeCloseTo(2640, 6);
    expect(formatBuildingRankMetric('hp', armChurch.hp)).toBe('2640');
    expect([armChurch.atk, armChurch.rng, armChurch.ma, armChurch.pa, armChurch.barm]).toEqual([9, 8, 6, 12, 3]);
    expect(geoChurch.hp).toBeCloseTo(2904, 6);
    expect(formatBuildingRankMetric('hp', geoChurch.hp)).toBe('2904');
    expect([geoChurch.atk, geoChurch.rng, geoChurch.ma, geoChurch.pa, geoChurch.barm]).toEqual([11, 8, 7, 13, 6]);
    expect(armChurch.missingTechs.map((t) => t.id)).toEqual([51]);
    expect(geoChurch.missingTechs.map((t) => t.id)).toEqual([380]);
    expect(geoChurch.tags).toContain('斯万箭塔（已计入）');
    expect(armChurch.tags).not.toContain('斯万箭塔（已计入）');
    expect(church.champions.map((c) => [c.col, c.formattedValue, c.civs[0]?.civ])).toEqual([
      ['hp', '2904', 'Georgians'],
      ['atk', '11', 'Georgians'],
      ['ma', '7', 'Georgians'],
      ['pa', '13', 'Georgians'],
      ['barm', '6', 'Georgians'],
    ]);
    // 与同页驻军预览副弹丸攻击严格对齐（格鲁吉亚 11、亚美尼亚 9）
    const geoGarrison = explainGeneralGarrison(ctx, building(1806), {
      civ: 'Georgians',
      age: 4,
      techs: geoChurch.garrisonTechIds,
      rows: [{ unitId: 83, count: '5', entry: 'enter' }],
    });
    const armGarrison = explainGeneralGarrison(ctx, building(1806), {
      civ: 'Armenians',
      age: 4,
      techs: armChurch.garrisonTechIds,
      rows: [{ unitId: 83, count: '5', entry: 'enter' }],
    });
    expect(geoGarrison.buildingThreshold?.attack).toBe(11);
    expect(armGarrison.buildingThreshold?.attack).toBe(9);
    // 强化教堂城堡时代：不计 942 帝王护甲、不计护腕/化学，格鲁吉亚仍计斯万箭塔
    const churchCastle = buildBuildingCivRank(ctx, building(1806), 3, readyArrows(building(1806), 3));
    const armChurch3 = churchCastle.rows.find((r) => r.civ === 'Armenians')!;
    const geoChurch3 = churchCastle.rows.find((r) => r.civ === 'Georgians')!;
    expect([armChurch3.hp, armChurch3.atk, armChurch3.rng, armChurch3.ma, armChurch3.pa, armChurch3.barm]).toEqual([2640, 7, 7, 5, 11, 3]);
    expect([geoChurch3.hp, geoChurch3.atk, geoChurch3.rng, geoChurch3.ma, geoChurch3.pa, geoChurch3.barm]).toEqual([2640, 9, 7, 5, 11, 3]);
    expect(armChurch3.missingTechs).toEqual([]);
    expect(geoChurch3.missingTechs.map((t) => t.id)).toEqual([380]);
    expect(geoChurch3.tags).toContain('斯万箭塔（已计入）');
    expect(churchCastle.champions.map((c) => [c.col, c.formattedValue, c.civs[0]?.civ])).toEqual([['atk', '9', 'Georgians']]);

    // 聚落 2556（#1474）：帝王自动计入 1356 帝王 +1/+1 护甲，城堡及以前不计入
    const settlementImp = buildBuildingCivRank(ctx, building(2556), 4);
    expect(settlementImp.rows.find((r) => r.civ === 'Mapuche')).toMatchObject({ hp: 1210, ma: 3, pa: 10, barm: 6 });
    expect(settlementImp.rows.find((r) => r.civ === 'Incas')).toMatchObject({ hp: 1100, ma: 2, pa: 9, barm: 3 });
    expect(settlementImp.rows.find((r) => r.civ === 'Muisca')).toMatchObject({ hp: 1100, ma: 2, pa: 9, barm: 3 });
    expect(settlementImp.rows.find((r) => r.civ === 'Tupi')).toMatchObject({ hp: 1000, ma: 1, pa: 8, barm: 0 });
    expect(settlementImp.champions.find((c) => c.col === 'ma')).toMatchObject({ formattedValue: '3', civs: [{ civ: 'Mapuche', civZh: '马普切' }] });
    expect(settlementImp.champions.find((c) => c.col === 'pa')).toMatchObject({ formattedValue: '10', civs: [{ civ: 'Mapuche', civZh: '马普切' }] });
    const settlementCastle = buildBuildingCivRank(ctx, building(2556), 3);
    for (const civ of ['Mapuche', 'Incas', 'Muisca']) {
      expect(settlementCastle.rows.find((r) => r.civ === civ)).toMatchObject({ ma: 1, pa: 8 });
    }
    expect(settlementCastle.rows.find((r) => r.civ === 'Tupi')).toMatchObject({ ma: 0, pa: 7 });
    expect(settlementCastle.champions.map((c) => c.col)).not.toContain('ma');
    expect(settlementCastle.champions.map((c) => c.col)).not.toContain('pa');

    // 炮塔 236：拜占庭希腊之火、土耳其火炮术，及 6 国缺加热射击（#1453）
    const bbt = buildBuildingCivRank(ctx, building(236), 4);
    expect(bbt.rows.find((r) => r.civ === 'Byzantines')!.tags).toContain('未计入：爆炸半径 +0.5 · 希腊之火');
    expect(bbt.rows.find((r) => r.civ === 'Turks')!.tags).toContain('火炮术（已计入）');
    expect(bbt.rows.find((r) => r.civ === 'Turks')!.rng).toBe(13);
    const bbtMissing380 = bbt.rows.filter((r) => r.missingTechs.some((t) => t.id === 380)).map((r) => r.civ);
    expect(bbtMissing380).toHaveLength(6);
    expect(bbtMissing380).toEqual(expect.arrayContaining(['Byzantines', 'Spanish']));
    for (const civ of ['Chinese', 'Turks']) {
      expect(bbt.rows.find((r) => r.civ === civ)!.missingTechs.map((t) => t.id)).not.toContain(380);
    }
  });

  it('最优值少于半数阈值、量化一致性与文明搜索三态', () => {
    const keep = buildBuildingCivRank(ctx, building(235), 4, readyArrows(building(235), 4));
    // 大型箭塔近甲最高 5 超过半数文明持有，不应出现在 bestValues / champions
    expect(keep.bestValues.ma).toBeUndefined();
    expect(keep.champions.map((c) => c.col)).not.toContain('ma');
    // 生命最高仅中国 1 家，必在 bestValues / champions
    expect(keep.bestValues.hp).toBe(quantizeBuildingRankMetric('hp', keep.rows[0]!.hp));
    expect(keep.champions.find((c) => c.col === 'hp')?.label).toBe('生命最高');

    // 搜索三态：命中、全库无匹配、不能建造 / 晚时代解锁
    expect(filterBuildingCivRankRows(keep.rows, 'riben', building(235), 4).rows.map((r) => r.civ)).toEqual(['Japanese']);
    expect(filterBuildingCivRankRows(keep.rows, '不存在文明xyz', building(235), 4).emptyMessage).toContain('没有匹配');
    expect(filterBuildingCivRankRows(keep.rows, '法兰克', building(235), 4).emptyMessage).toBe('法兰克不能建造大型箭塔。');
    const sw2 = buildBuildingCivRank(ctx, building(49), 2);
    expect(filterBuildingCivRankRows(sw2.rows, '法兰克', building(49), 2).emptyMessage).toBe('法兰克在封建时代不能建造攻城武器厂。');
  });

  it('全库「打开」链接零报错：17 宿主驻军链接（含高丽 TC 无免费科技泄漏）与 31 建筑施工链接', () => {
    const multi = CORE.buildings.filter((b) => supportsBuildingCivRank(b));
    let garrisonChecked = 0;
    let constructionChecked = 0;

    for (const b of multi) {
      const cat = buildingRankCategory(b);
      const minA = Math.min(...b.civs.map((c) => buildingAge(b, c, trees)));
      for (let age = minA; age <= 4; age++) {
        const resReady = buildBuildingCivRank(ctx, b, age, cat === 'A' ? readyArrows(b, age) : { status: 'idle' });
        for (const row of resReady.rows) {
          // 模拟器链接结构合法
          const simHref = buildBuildingRankSimHref(b.id, row, age);
          expect(simHref).toContain(`/building/${b.id}?tab=sim&civ=${row.civ}&age=${age}`);

          // 驻军链接（17 宿主）：A 类就绪与未就绪 / B / C 均 0 报错
          if (resReady.isGarrisonHost) {
            const href = buildBuildingRankGarrisonHref(b.id, row, age);
            const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
            const parsed = readGeneralGarrison(params, b);
            expect(parsed.errors).toEqual([]);
            const calc = calculateGeneralGarrison(ctx, b, parsed.config);
            expect(calc.errors).toEqual([]);
            if (cat === 'A') {
              // 确认无任何免费科技泄漏进 URL（含高丽 TC 帝王 64）
              const freeIds = new Set(getFreeGarrisonTechs(ctx, b, parsed.config));
              for (const tid of parsed.config.techs) expect(freeIds.has(tid)).toBe(false);
              if (b.id === 235 && row.civ === 'Japanese' && age === 4) {
                expect(calc.baseProjectiles).toBe(3);
                expect(calc.maxProjectiles).toBe(7);
              }
              if (b.id === 109 && row.civ === 'Malians' && age >= 3) {
                expect(calc.baseProjectiles).toBe(8);
                expect(calc.maxProjectiles).toBe(18);
              }
              if (b.id === 109 && row.civ === 'Koreans' && age === 4) {
                expect(parsed.config.techs).not.toContain(64);
              }
            } else {
              expect(parsed.config.techs).toEqual([]);
            }
            garrisonChecked++;
          }

          // 多人施工链接（全部 bt !== null 行，含 155/234/235/236 形态科技）
          const cHref = buildBuildingRankConstructionHref(ctx, b.id, row, age);
          if (row.bt === null) {
            expect(cHref).toBeNull();
          } else {
            expect(cHref).not.toBeNull();
            const parsed = decodeConstruction(cHref!.slice(cHref!.indexOf('?')), ctx);
            expect(parsed.errors).toEqual([]);
            const calc = calculateConstruction(ctx, { ...parsed.config, builders: '1' });
            expect(calc.errors).toEqual([]);
            expect(calc.single).toBeCloseTo(row.bt, 6);
            constructionChecked++;
          }
        }
      }
    }
    expect(garrisonChecked).toBeGreaterThan(2000);
    expect(constructionChecked).toBeGreaterThan(3000);
  });
});
