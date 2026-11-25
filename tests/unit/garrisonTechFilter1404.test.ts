import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  calculateGeneralGarrison,
  GENERAL_GARRISON_DATA,
  getFreeGarrisonTechs,
  getGarrisonBuildingAge,
  getGarrisonBuildings,
  getGarrisonCandidates,
  getGarrisonTechs,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
} from '../../src/domain/garrisonGeneral';
import { civStatus } from '../../src/domain/simulator';
import { productionTechAge } from '../../src/domain/production';

let ctx: GeneralGarrisonContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

const cfg = (civ: string, age = 4, techs: number[] = [], rows: GeneralGarrisonConfig['rows'] = []): GeneralGarrisonConfig => ({
  civ,
  age,
  techs,
  rows,
});
const techIds = (bid: number, civ: string, age = 4) =>
  getGarrisonTechs(ctx, ctx.core.buildingById[bid]!, cfg(civ, age))
    .map((t) => t.id)
    .sort((a, b) => a - b);

describe('Issue 1404: getGarrisonTechs 数据驱动过滤与正例锁定', () => {
  it('全站 56 文明 × 20 驻军宿主：清零启发 233、跨建筑与零火力独科泄漏及非射箭建筑无关射击科技', () => {
    const hosts = getGarrisonBuildings(ctx);
    expect(hosts).toHaveLength(20);

    const globallyBanned = new Set([233, 52, 59, 685, 832, 445, 997, 623, 883, 454, 1080, 1081, 1474]);
    const nonShootingHosts = new Set([12, 49, 68, 70, 84, 87, 101, 104, 2556]);
    const shootingOnlyTechs = new Set([199, 200, 201, 437, 608, 64, 3, 7, 11, 49, 460, 482, 484, 485, 515, 516, 576, 833, 923, 1069, 1392]);

    const seenByTech = new Map<number, string[]>();
    for (const b of hosts) {
      for (const civ of b.civs) {
        if (getGarrisonBuildingAge(b, civ, ctx.trees) > 4) continue;
        const ids = techIds(b.id, civ, 4);
        const label = `${civ}/${b.id}`;
        for (const id of ids) {
          expect(globallyBanned.has(id), `${label} leaked banned tech ${id}`).toBe(false);
          if (nonShootingHosts.has(b.id)) {
            expect(shootingOnlyTechs.has(id), `${label} leaked shooting tech ${id}`).toBe(false);
          }
          if (!seenByTech.has(id)) seenByTech.set(id, []);
          seenByTech.get(id)!.push(label);
        }
        // 马来巨港与船坞绝不泄漏扳指 437
        if (b.id === 1189 || b.id === 45) expect(ids, label).not.toContain(437);
      }
    }

    // 精确归属锁定：城堡独占骑射/战车独科、特定建筑生产解锁独科
    expect(seenByTech.get(833)).toEqual(['Bengalis/82']);
    expect(seenByTech.get(515)).toEqual(['Magyars/82']);
    expect(seenByTech.get(16)).toEqual(['Goths/12']);
    expect(seenByTech.get(483)).toEqual(['Huns/101']);
    expect(seenByTech.get(755)).toEqual(['Burgundians/12']);
    expect(seenByTech.get(7)).toEqual(['Persians/82']);
    expect(seenByTech.get(576)).toEqual(['Malians/109']);
    // 马来巨港 1189 精确只保留 47/199/200/201
    expect(techIds(1189, 'Malay', 4)).toEqual([47, 199, 200, 201]);
    // 化学 47 在非射箭生产建筑仅保留给拥有火枪手(5)的靶场 87 与拥有手推炮(36)的攻城厂 49
    expect(techIds(87, 'Franks', 4)).toEqual([47]);
    expect(techIds(49, 'Franks', 4)).toEqual([47]);
    expect(techIds(87, 'Britons', 4)).toEqual([]);
    expect(techIds(49, 'Britons', 4)).toEqual([]);
    expect(techIds(87, 'Bohemians', 3)).toEqual([47]);
    expect(techIds(12, 'Franks', 4)).toEqual([]);
    expect(techIds(104, 'Franks', 4)).toEqual([]);
    expect(techIds(84, 'Franks', 4)).toEqual([]);
  });

  it('正例防误杀锁定：图皮卡西克 1392、TC 炮塔 64、条顿开垛口 11 按固定 .dat 真实生效建筑保留', () => {
    // 图皮卡西克 1392：TC / 箭塔 / 城堡保留，且投石手 185 驻军火力 4.0 -> 5.0；非射箭建筑与船坞排除
    for (const bid of [109, 79, 234, 235, 82]) {
      expect(techIds(bid, 'Tupi', 4), `Tupi/${bid}`).toContain(1392);
      expect(techIds(bid, 'Tupi', 4), `Tupi/${bid}`).not.toContain(233);
    }
    for (const bid of [12, 45, 49, 84, 87, 101, 104, 2556]) {
      expect(techIds(bid, 'Tupi', 4), `Tupi/${bid}`).not.toContain(1392);
    }
    const slingerBaseNo = calculateGeneralGarrison(ctx, ctx.core.buildingById[109]!, cfg('Tupi', 4, [], [{ unitId: 185, count: '10', entry: 'enter' }]));
    const slingerBaseYes = calculateGeneralGarrison(ctx, ctx.core.buildingById[109]!, cfg('Tupi', 4, [1392], [{ unitId: 185, count: '10', entry: 'enter' }]));
    expect(slingerBaseNo.errors).toEqual([]);
    expect(slingerBaseYes.errors).toEqual([]);
    expect(slingerBaseNo.rows[0]!.powerEach).toBeCloseTo(2, 5);
    expect(slingerBaseYes.rows[0]!.powerEach).toBeCloseTo(2.5, 5);
    const slingerFullNo = calculateGeneralGarrison(
      ctx,
      ctx.core.buildingById[109]!,
      cfg('Tupi', 4, [199, 200, 201, 47], [{ unitId: 185, count: '10', entry: 'enter' }]),
    );
    const slingerFullYes = calculateGeneralGarrison(
      ctx,
      ctx.core.buildingById[109]!,
      cfg('Tupi', 4, [199, 200, 201, 47, 1392], [{ unitId: 185, count: '10', entry: 'enter' }]),
    );
    expect(slingerFullNo.errors).toEqual([]);
    expect(slingerFullYes.errors).toEqual([]);
    expect(slingerFullNo.rows[0]!.powerEach).toBeCloseTo(4, 5);
    expect(slingerFullYes.rows[0]!.powerEach).toBeCloseTo(5, 5);
    expect(slingerFullNo.garrisonPower).toBeCloseTo(40, 5);
    expect(slingerFullYes.garrisonPower).toBeCloseTo(50, 5);

    // 炮塔 64：保留在全部 18 个有炮塔文明的 TC 109（含免费的高丽）
    const bbtCivs = ctx.core.techById[64]!.civs;
    expect(bbtCivs).toHaveLength(18);
    for (const civ of bbtCivs) {
      expect(techIds(109, civ, 4), `${civ}/109`).toContain(64);
    }
    expect(getFreeGarrisonTechs(ctx, ctx.core.buildingById[109]!, cfg('Koreans', 4, [47]))).toContain(64);

    // 条顿开垛口 11：按固定 DE 188329 .dat（109/236 garrisonType=11 允许步兵外部入驻），在 6 座步兵可入驻射击建筑真实加火力并保留，在船坞与非射箭建筑排除
    for (const bid of [109, 79, 234, 235, 236, 82]) {
      expect(techIds(bid, 'Teutons', 4), `Teutons/${bid}`).toContain(11);
      expect(techIds(bid, 'Teutons', 4), `Teutons/${bid}`).not.toContain(233);
    }
    for (const bid of [12, 45, 49, 68, 70, 84, 87, 101, 104]) {
      expect(techIds(bid, 'Teutons', 4), `Teutons/${bid}`).not.toContain(11);
    }
    const tcNo = calculateGeneralGarrison(ctx, ctx.core.buildingById[109]!, cfg('Teutons', 4, [], [{ unitId: 25, count: '10', entry: 'enter' }]));
    const tcYes = calculateGeneralGarrison(ctx, ctx.core.buildingById[109]!, cfg('Teutons', 4, [11], [{ unitId: 25, count: '10', entry: 'enter' }]));
    expect(tcNo.totalProjectiles).toBe(0);
    expect(tcYes.totalProjectiles).toBe(10);
    const bbtMixNo = calculateGeneralGarrison(
      ctx,
      ctx.core.buildingById[236]!,
      cfg(
        'Teutons',
        4,
        [],
        [
          { unitId: 5, count: '7', entry: 'enter' },
          { unitId: 25, count: '3', entry: 'enter' },
        ],
      ),
    );
    const bbtMixYes = calculateGeneralGarrison(
      ctx,
      ctx.core.buildingById[236]!,
      cfg(
        'Teutons',
        4,
        [11],
        [
          { unitId: 5, count: '7', entry: 'enter' },
          { unitId: 25, count: '3', entry: 'enter' },
        ],
      ),
    );
    expect(bbtMixNo.totalProjectiles).toBe(1);
    expect(bbtMixYes.totalProjectiles).toBe(2);
  });

  it('行为完整性与零误杀守卫：全站过滤掉的科技对容量、入驻、建筑火力及可驻单位火力均零改动', () => {
    const sampleCivs = [
      'Chinese',
      'Japanese',
      'Bulgarians',
      'Teutons',
      'Tupi',
      'Malay',
      'Bengalis',
      'Magyars',
      'Goths',
      'Huns',
      'Burgundians',
      'Georgians',
      'Wu',
      'Jurchens',
      'Koreans',
      'Vikings',
      'Shu',
      'Britons',
    ];
    const hosts = getGarrisonBuildings(ctx);

    for (const civ of sampleCivs) {
      const status = civStatus(ctx.trees, civ);
      const disabled = new Set(GENERAL_GARRISON_DATA.civs[civ]?.disabled ?? []);
      const allAvail = ctx.core.techs
        .filter(
          (t) =>
            t.civs.includes(civ) && status['t' + t.id] === 1 && !disabled.has(t.id) && productionTechAge(t, civ) <= 4 && !!GENERAL_GARRISON_DATA.techs[t.id],
        )
        .map((t) => t.id);

      for (const b of hosts) {
        if (!b.civs.includes(civ) || getGarrisonBuildingAge(b, civ, ctx.trees) > 4) continue;
        const kept = new Set(techIds(b.id, civ, 4));
        // 行与已选科技增删不影响可选科技集合
        expect(
          getGarrisonTechs(ctx, b, cfg(civ, 4, [...kept], [{ unitId: 83, count: '1', entry: 'enter' }]))
            .map((t) => t.id)
            .sort((a, z) => a - z),
        ).toEqual([...kept].sort((a, z) => a - z));

        const baseRes = calculateGeneralGarrison(ctx, b, cfg(civ, 4));
        const baseCands = getGarrisonCandidates(ctx, b, cfg(civ, 4));
        // 验证每个保留科技对代表建筑均合法且不因移除其他科技或行报错
        const freeBase = new Set(getFreeGarrisonTechs(ctx, b, cfg(civ, 4)));
        const manualAll = [...kept].filter((id) => !freeBase.has(id));
        const freeNext = new Set(getFreeGarrisonTechs(ctx, b, cfg(civ, 4, manualAll)));
        const cleanManual = manualAll.filter((id) => !freeNext.has(id));
        expect(calculateGeneralGarrison(ctx, b, cfg(civ, 4, cleanManual)).errors, `${civ}/${b.id}`).toEqual([]);

        // 验证被排除的每条科技在规则层面不会改变建筑有效属性或任何可驻单位有效火力
        const shooting = baseRes.mode === 'arrows' || baseRes.mode === 'cannon';
        const candIds = new Set(baseCands.map((c) => c.id));
        for (const tid of allAvail) {
          if (kept.has(tid)) continue;
          const rule = GENERAL_GARRISON_DATA.techs[tid]!;
          for (const e of rule.effects) {
            if (e.unit === b.id) {
              expect(['capacity', 'garrisonType'].includes(e.stat), `${civ}/${b.id}/t:${tid}`).toBe(false);
              if (shooting)
                expect(['attack', 'reload', 'total', 'max', 'projectile', 'secondaryProjectile'].includes(e.stat), `${civ}/${b.id}/t:${tid}`).toBe(false);
            }
            if (shooting && candIds.has(e.unit)) {
              const u = GENERAL_GARRISON_DATA.units[e.unit]!;
              expect(e.stat === 'firepower', `${civ}/${b.id}/t:${tid}/u:${e.unit}`).toBe(false);
              if (u.firepower > 0) expect(['attack', 'reload', 'total'].includes(e.stat), `${civ}/${b.id}/t:${tid}/u:${e.unit}`).toBe(false);
            }
          }
        }
      }
    }
  });
});
