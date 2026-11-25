import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees } from '../../src/data';
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
  type GeneralGarrisonData,
} from '../../src/domain/garrisonGeneral';
import { GARRISON_TECH_DATA } from '../../src/domain/garrisonTechs';
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
const techIds = (bid: number, civ: string, age = 4, data: GeneralGarrisonData = GENERAL_GARRISON_DATA) =>
  getGarrisonTechs(ctx, ctx.core.buildingById[bid]!, cfg(civ, age), data)
    .map((t) => t.id)
    .sort((a, b) => a - b);

function cloneCustomData(): GeneralGarrisonData {
  return structuredClone({ ...GENERAL_GARRISON_DATA, unitUpgradeTechs: GARRISON_TECH_DATA.unitUpgradeTechs });
}

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

  it('靶场 87、兵营 12、强化教堂 1806 与巨港 1189：科技筛选与 candidate() 生产来源完全一致', () => {
    const range = ctx.core.buildingById[87]!;
    const barracks = ctx.core.buildingById[12]!;
    const church = ctx.core.buildingById[1806]!;
    const harbor = ctx.core.buildingById[1189]!;

    // 靶场 87 不因 predecessors 含兵营 12 而接收兵营近卫军/弗拉芒民兵
    const gothRangeIds = getGarrisonCandidates(ctx, range, cfg('Goths', 4)).map((c) => c.id);
    expect(gothRangeIds).not.toContain(759);
    expect(gothRangeIds).not.toContain(761);
    expect(gothRangeIds).not.toContain(41);
    expect(gothRangeIds).not.toContain(555);
    expect(techIds(87, 'Goths', 4)).not.toContain(16);
    expect(calculateGeneralGarrison(ctx, range, cfg('Goths', 4, [], [{ unitId: 759, count: '1', entry: 'created' }])).errors.length).toBeGreaterThan(0);

    const burgRangeIds = getGarrisonCandidates(ctx, range, cfg('Burgundians', 4)).map((c) => c.id);
    expect(burgRangeIds).not.toContain(1699);
    expect(techIds(87, 'Burgundians', 4)).not.toContain(755);
    expect(calculateGeneralGarrison(ctx, range, cfg('Burgundians', 4, [], [{ unitId: 1699, count: '1', entry: 'created' }])).errors.length).toBeGreaterThan(0);

    // 兵营 12 正常保留无政府 16 与弗拉芒革命 755 及其自产留驻
    expect(techIds(12, 'Goths', 4)).toContain(16);
    expect(calculateGeneralGarrison(ctx, barracks, cfg('Goths', 4, [16], [{ unitId: 41, count: '1', entry: 'created' }])).errors).toEqual([]);
    expect(calculateGeneralGarrison(ctx, barracks, cfg('Goths', 4, [16], [{ unitId: 759, count: '1', entry: 'created' }])).errors).toEqual([]);
    expect(techIds(12, 'Burgundians', 4)).toContain(755);
    expect(calculateGeneralGarrison(ctx, barracks, cfg('Burgundians', 4, [755], [{ unitId: 1699, count: '1', entry: 'created' }])).errors).toEqual([]);

    // 强化教堂 1806 仍保留僧侣(125)/牧师战士(1811) 自产留驻与圣物存放(285)
    const armChurchCands = getGarrisonCandidates(ctx, church, cfg('Armenians', 4));
    expect(armChurchCands.find((c) => c.id === 125)?.canCreate).toBe(true);
    expect(armChurchCands.find((c) => c.id === 1811)?.canCreate).toBe(true);
    expect(armChurchCands.find((c) => c.id === 285)?.canDeposit).toBe(true);
    expect(calculateGeneralGarrison(ctx, church, cfg('Armenians', 4, [], [{ unitId: 1811, count: '2', entry: 'created' }])).errors).toEqual([]);

    // 马来巨港 1189 仍继承船坞生产留驻与化学炮舰
    expect(calculateGeneralGarrison(ctx, harbor, cfg('Malay', 4, [47], [{ unitId: 420, count: '1', entry: 'created' }])).errors).toEqual([]);
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

  it('自定义数据边界回归：链式触发、跨科技火力联动、自动迁移与免费火力生效后不再漏判', () => {
    const tc = ctx.core.buildingById[109]!;
    const barracks = ctx.core.buildingById[12]!;

    // 1. 链式触发：233 -> 无直接效果的中间标记规则 -> TC 容量 +2
    const chainData = cloneCustomData();
    chainData.conditional.push(
      { id: 99001, requires: [233], count: 1, effects: [] },
      { id: 99002, requires: [99001], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 2 }] },
    );
    expect(techIds(109, 'Franks', 4, chainData)).toContain(233);
    expect(calculateGeneralGarrison(ctx, tc, cfg('Franks', 4, [233]), chainData).capacity).toBe(
      calculateGeneralGarrison(ctx, tc, cfg('Franks', 4, []), chainData).capacity + 2,
    );

    // 2. OR 规则跨两个可选科技（count: 1）双方均保留，而已被时代满足的 OR 规则不误保留
    const orData = cloneCustomData();
    orData.conditional.push(
      { id: 99003, requires: [233, 608], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 1 }] },
      { id: 99004, requires: [102, 233], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 1 }] },
    );
    expect(techIds(109, 'Franks', 4, orData)).toContain(233);
    const baseSatisfiedData = cloneCustomData();
    baseSatisfiedData.conditional.push({ id: 99005, requires: [102, 233], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 1 }] });
    expect(techIds(109, 'Franks', 4, baseSatisfiedData)).not.toContain(233);

    // 3. 跨科技火力联动：免费或前置科技赋予步兵非零火力，后续攻击科技能真实提升贡献 -> 保留
    const fpChainData = cloneCustomData();
    fpChainData.techs[11] = { id: 11, requires: [], count: 0, effects: [{ unit: 74, stat: 'firepower', op: 'set', value: 1 }] };
    fpChainData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 74, stat: 'attack', op: 'add', value: 4 }] };
    expect(techIds(109, 'Teutons', 4, fpChainData)).toContain(233);
    const fpBefore = calculateGeneralGarrison(ctx, tc, cfg('Teutons', 4, [11], [{ unitId: 74, count: '1', entry: 'enter' }]), fpChainData);
    const fpAfter = calculateGeneralGarrison(ctx, tc, cfg('Teutons', 4, [11, 233], [{ unitId: 74, count: '1', entry: 'enter' }]), fpChainData);
    expect(fpAfter.rows[0]!.powerEach!).toBeGreaterThan(fpBefore.rows[0]!.powerEach!);

    // 4. 跨科技多弹丸联动：一个科技把 total 从 1 提到 2，另一科技改副弹丸 -> 两者均保留
    const multiData = cloneCustomData();
    multiData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 4, stat: 'secondaryProjectile', op: 'set', value: 54 }] };
    multiData.techs[608] = {
      ...multiData.techs[608]!,
      effects: [...multiData.techs[608]!.effects, { unit: 4, stat: 'total', op: 'add', value: 1 }],
    };
    expect(techIds(109, 'Franks', 4, multiData)).toContain(233);

    // 5. 自动规则把单位迁入当前射击建筑生产后，该单位的火力科技进入列表
    const relocData = cloneCustomData();
    relocData.units[4] = { ...relocData.units[4]!, garrisonTasks: [] };
    relocData.civs.Franks!.automatic.push({ id: 99006, requires: [], count: 0, effects: [], trainingLocations: [{ unit: 4, slot: 0, location: 109 }] });
    relocData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 4, stat: 'attack', op: 'add', value: 3 }] };
    expect(getGarrisonCandidates(ctx, tc, cfg('Franks', 4), relocData).find((c) => c.id === 4)?.canCreate).toBe(true);
    expect(techIds(109, 'Franks', 4, relocData)).toContain(233);

    // 6. 科技让非射击建筑转为射击建筑时，建筑与可驻单位射击科技同时保留
    const shelterShootData = cloneCustomData();
    const barracksImpForm = shelterShootData.buildings[12]!.eraForms[3]!;
    shelterShootData.units[barracksImpForm] = {
      ...shelterShootData.units[barracksImpForm]!,
      reload: 2,
      projectile: 54,
      total: 1,
      max: 5,
      attack: 0,
    };
    shelterShootData.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 12, stat: 'attack', op: 'set', value: 6 }] };
    shelterShootData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 12, stat: 'reload', op: 'mul', value: 0.8 }] };
    expect(techIds(12, 'Franks', 4, shelterShootData)).toEqual(expect.arrayContaining([199, 233]));
    expect(calculateGeneralGarrison(ctx, barracks, cfg('Franks', 4, [199, 233]), shelterShootData).mode).toBe('arrows');
  });

  it('全站 56 文明 × 20 宿主 × 全有效时代真实行为完整性守卫：被排除科技零行为变化且行增删列表稳定', () => {
    const hosts = getGarrisonBuildings(ctx);
    const shapeUpgrades = new Set(Object.values(GARRISON_TECH_DATA.unitUpgradeTechs ?? {}).flat());
    let checkedCombos = 0;

    for (const civ of civs.map((c) => c.en)) {
      const status = civStatus(ctx.trees, civ);
      const disabled = new Set(GENERAL_GARRISON_DATA.civs[civ]?.disabled ?? []);
      const civTechs = ctx.core.techs.filter(
        (t) => t.civs.includes(civ) && status['t' + t.id] === 1 && !disabled.has(t.id) && !shapeUpgrades.has(t.id) && !!GENERAL_GARRISON_DATA.techs[t.id],
      );

      for (const b of hosts) {
        if (!b.civs.includes(civ)) continue;
        const minAge = getGarrisonBuildingAge(b, civ, ctx.trees);
        for (let age = minAge; age <= 4; age++) {
          const keptList = getGarrisonTechs(ctx, b, cfg(civ, age));
          const kept = new Set(keptList.map((t) => t.id));
          const label = `${civ}/${b.id}/a${age}`;
          checkedCombos++;

          // 行与已选科技增删不影响可选科技集合
          if (age === 4) {
            expect(
              getGarrisonTechs(ctx, b, cfg(civ, age, [...kept], [{ unitId: 83, count: '1', entry: 'enter' }]))
                .map((t) => t.id)
                .sort((a, z) => a - z),
              label,
            ).toEqual([...kept].sort((a, z) => a - z));
          }

          // 全部保留科技（剔除免费后）在真实引擎中零报错
          const freeBase = new Set(getFreeGarrisonTechs(ctx, b, cfg(civ, age)));
          const firstManual = [...kept].filter((id) => !freeBase.has(id));
          const freeNext = new Set(getFreeGarrisonTechs(ctx, b, cfg(civ, age, firstManual)));
          const manualKept = firstManual.filter((id) => !freeNext.has(id));
          const fullKeptRes = calculateGeneralGarrison(ctx, b, cfg(civ, age, manualKept));
          expect(fullKeptRes.errors, label).toEqual([]);

          // 与真实引擎对照：将所有被排除的可用科技一并注入（经 custom data 允许）不得改变候选列表、建筑模式/容量/箭数/阈值或任何可驻单位单人火力
          const excluded = civTechs.filter((t) => productionTechAge(t, civ) <= age && !kept.has(t.id)).map((t) => t.id);
          if (!excluded.length) continue;

          // 真实引擎对照：将所有被排除的可用科技注入 civ.automatic（以原 tech.id 进入 known 并触发全部条件链），
          // 验证在空态与保留全选态下，候选列表、建筑模式/容量/箭数/火力阈值及全部可驻单位单人火力均零变化
          const baseCiv = GENERAL_GARRISON_DATA.civs[civ]!;
          const withExcludedData: GeneralGarrisonData = {
            ...GENERAL_GARRISON_DATA,
            unitUpgradeTechs: GARRISON_TECH_DATA.unitUpgradeTechs,
            civs: {
              ...GENERAL_GARRISON_DATA.civs,
              [civ]: {
                ...baseCiv,
                automatic: [...baseCiv.automatic, ...excluded.map((id) => ({ ...GENERAL_GARRISON_DATA.techs[id]!, requires: [], count: 0 }))],
              },
            },
          };

          for (const [tag, selectedTechs] of [
            ['base', []],
            ['kept', manualKept],
          ] as const) {
            const candsA = getGarrisonCandidates(ctx, b, cfg(civ, age, [...selectedTechs]));
            const candsB = getGarrisonCandidates(ctx, b, cfg(civ, age, [...selectedTechs]), withExcludedData);
            const keyOf = (list: typeof candsA) => list.map((c) => `${c.id}:${+c.canEnter}${+c.canCreate}${+c.canDeposit}`);
            expect(keyOf(candsB), `${label} ${tag} cands changed by [${excluded.join(',')}]`).toEqual(keyOf(candsA));

            const isShooting = (r: ReturnType<typeof calculateGeneralGarrison>) => r.mode === 'arrows' || r.mode === 'cannon';
            const summarize = (r: ReturnType<typeof calculateGeneralGarrison>) => ({
              mode: r.mode,
              capacity: r.capacity,
              baseProjectiles: r.baseProjectiles,
              maxProjectiles: r.maxProjectiles,
              totalProjectiles: r.totalProjectiles,
              buildingPower: r.buildingPower,
              ...(isShooting(r) ? { powers: r.rows.map((row) => row.powerEach) } : {}),
            });
            const headA = calculateGeneralGarrison(ctx, b, cfg(civ, age, [...selectedTechs]));
            const headB = calculateGeneralGarrison(ctx, b, cfg(civ, age, [...selectedTechs]), withExcludedData);
            expect(headA.errors, `${label} ${tag} A`).toEqual([]);
            expect(headB.errors, `${label} ${tag} B`).toEqual([]);
            expect(summarize(headB), `${label} ${tag} building changed by [${excluded.join(',')}]`).toEqual(summarize(headA));
            if (!isShooting(headA) && !isShooting(headB)) continue;

            // 射击建筑分批以 count='0' 核对全部可驻单位 powerEach
            const rowsAll = candsA.map((c) => ({
              unitId: c.id,
              count: '0',
              entry: (c.canDeposit ? 'deposit' : c.canEnter ? 'enter' : 'created') as 'enter' | 'created' | 'deposit',
            }));
            for (let i = 0; i < rowsAll.length; i += 32) {
              const chunk = rowsAll.slice(i, i + 32);
              const resA = calculateGeneralGarrison(ctx, b, cfg(civ, age, [...selectedTechs], chunk));
              const resB = calculateGeneralGarrison(ctx, b, cfg(civ, age, [...selectedTechs], chunk), withExcludedData);
              expect(resA.errors, `${label} ${tag} A`).toEqual([]);
              expect(resB.errors, `${label} ${tag} B`).toEqual([]);
              expect(summarize(resB), `${label} ${tag} output changed by [${excluded.join(',')}]`).toEqual(summarize(resA));
            }
          }
        }
      }
    }
    expect(checkedCombos).toBeGreaterThan(2200);
  }, 30_000);
});
