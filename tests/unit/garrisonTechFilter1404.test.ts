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
  toggleGeneralGarrisonTech,
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
function techIds(bid: number, civ: string, age = 4, data: GeneralGarrisonData = GENERAL_GARRISON_DATA) {
  return getGarrisonTechs(ctx, ctx.core.buildingById[bid]!, cfg(civ, age), data)
    .map((t) => t.id)
    .sort((a, b) => a - b);
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

          // 真实引擎对照：将所有被排除的可用科技写入 civs[civ].free，使 snapshot() 在真实 selected 升序循环中、
          // 早于 data.conditional 之前按与手选完全一致的顺序执行，验证空态与保留全选态下输出零变化
          const withExcludedData: GeneralGarrisonData = {
            ...GENERAL_GARRISON_DATA,
            unitUpgradeTechs: GARRISON_TECH_DATA.unitUpgradeTechs,
            civs: {
              ...GENERAL_GARRISON_DATA.civs,
              [civ]: {
                ...GENERAL_GARRISON_DATA.civs[civ]!,
                free: [...new Set([...GENERAL_GARRISON_DATA.civs[civ]!.free, ...excluded])].sort((a, z) => a - z),
              },
            },
          };

          const keyOf = (list: ReturnType<typeof getGarrisonCandidates>) => list.map((c) => `${c.id}:${+c.canEnter}${+c.canCreate}${+c.canDeposit}`);
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

          for (const [tag, selectedTechs] of [
            ['base', []],
            ['kept', manualKept],
          ] as const) {
            const candsA = getGarrisonCandidates(ctx, b, cfg(civ, age, [...selectedTechs]));
            const candsB = getGarrisonCandidates(ctx, b, cfg(civ, age, [...selectedTechs]), withExcludedData);
            expect(keyOf(candsB), `${label} ${tag} cands changed by [${excluded.join(',')}]`).toEqual(keyOf(candsA));

            const headA = calculateGeneralGarrison(ctx, b, cfg(civ, age, [...selectedTechs]));
            const headB = calculateGeneralGarrison(ctx, b, cfg(civ, age, [...selectedTechs]), withExcludedData);
            expect(headA.errors, `${label} ${tag} A`).toEqual([]);
            expect(headB.errors, `${label} ${tag} B`).toEqual([]);
            if (tag === 'kept') {
              const injectable = excluded.filter((id) => {
                let pre = ctx.core.techById[id]?.pre;
                while (pre) {
                  if (shapeUpgrades.has(pre)) return false;
                  pre = ctx.core.techById[pre]?.pre;
                }
                return true;
              });
              expect(headB.selected, `${label} kept missing injected excluded`).toEqual(expect.arrayContaining(injectable));
            }
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

          // 反向必要性守卫（帝王时代）：每项非前置垫脚、非免费保留科技均须实际改写至少一项候选、建筑参数或可驻单位单人火力
          if (age === 4) {
            const preUsed = new Set<number>();
            for (const kid of kept) {
              const pre = ctx.core.techById[kid]?.pre;
              if (pre && kept.has(pre)) preUsed.add(pre);
            }
            const stateSignature = (techs: number[]) => {
              const cands = getGarrisonCandidates(ctx, b, cfg(civ, age, techs));
              const head = calculateGeneralGarrison(ctx, b, cfg(civ, age, techs));
              expect(head.errors, `${label} kept sig [${techs.join(',')}]`).toEqual([]);
              const powers: (number | null)[] = [];
              if (isShooting(head)) {
                const rowsAll = cands.map((c) => ({
                  unitId: c.id,
                  count: '0',
                  entry: (c.canDeposit ? 'deposit' : c.canEnter ? 'enter' : 'created') as 'enter' | 'created' | 'deposit',
                }));
                for (let i = 0; i < rowsAll.length; i += 32) {
                  const res = calculateGeneralGarrison(ctx, b, cfg(civ, age, techs, rowsAll.slice(i, i + 32)));
                  powers.push(...res.rows.map((r) => r.powerEach));
                }
              }
              return JSON.stringify({ cands: keyOf(cands), head: summarize(head), powers });
            };
            for (const tid of manualKept) {
              if (preUsed.has(tid)) continue;
              const chain: number[] = [];
              let pre = ctx.core.techById[tid]?.pre;
              while (pre && kept.has(pre)) {
                if (!freeBase.has(pre)) chain.push(pre);
                pre = ctx.core.techById[pre]?.pre;
              }
              const freeAfterChain = new Set(getFreeGarrisonTechs(ctx, b, cfg(civ, age, chain)));
              const preClean = chain.filter((id) => !freeAfterChain.has(id));
              if (freeAfterChain.has(tid)) continue;
              expect(stateSignature([...preClean, tid]), `${label} kept tech ${tid} had no observable effect`).not.toBe(stateSignature(preClean));
            }
          }
        }
      }
    }
    expect(checkedCombos).toBeGreaterThan(2200);
  }, 30_000);

  it('R11 回归：自动规则前置勾选/取消、微小浮点火力差、圣物村民离池火力与 11 项常量覆写零溢出', () => {
    const cloneData = (): GeneralGarrisonData => structuredClone({ ...GENERAL_GARRISON_DATA, unitUpgradeTechs: GARRISON_TECH_DATA.unitUpgradeTechs });
    const tc = ctx.core.buildingById[109]!;
    const tcForms = [109, ...(GENERAL_GARRISON_DATA.buildings[109]?.eraForms ?? [])];

    // 1. R11 P1: 自动规则将 199 写入 known 且 233.pre=199；勾选 233 不强制带入 199，从 [199,233] 取消 199 保留 233
    const preCore = structuredClone(ctx.core);
    preCore.techById[233] = { ...preCore.techById[233]!, pre: 199 };
    preCore.techs[preCore.techs.findIndex((t) => t.id === 233)] = preCore.techById[233]!;
    const preCtx: GeneralGarrisonContext = { core: preCore, trees: ctx.trees };
    const preTc = preCore.buildingById[109]!;
    const preData = cloneData();
    preData.techs = {
      199: {
        id: 199,
        requires: [],
        count: 0,
        effects: [
          { unit: 109, stat: 'capacity', op: 'add', value: 1 },
          { unit: 492, stat: 'firepower', op: 'set', value: 0 },
        ],
      },
      233: { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 4 }] },
    };
    preData.civs.Britons!.automatic = [{ id: 199, requires: [], count: 0, effects: [] }];
    preData.civs.Britons!.free = [];
    preData.conditional = [];
    preData.units[492] = { ...preData.units[492]!, attack: 6, reload: 2, total: 1, firepower: 1 };
    expect(toggleGeneralGarrisonTech(preCtx, preTc, cfg('Britons', 4, []), 233, preData)).toEqual([233]);
    expect(toggleGeneralGarrisonTech(preCtx, preTc, cfg('Britons', 4, [199, 233]), 199, preData)).toEqual([233]);

    // 2. R11 P2-1: 副弹丸攻击 20 -> 20 + 1e-11 在阈值处令弹丸 1 -> 0，精确比较不吞掉
    const epsData = cloneData();
    epsData.techs = { 233: { id: 233, requires: [], count: 0, effects: [{ unit: 54, stat: 'attack', op: 'add', value: 1e-11 }] } };
    epsData.civs.Britons!.automatic = [];
    epsData.civs.Britons!.free = [];
    epsData.conditional = [];
    epsData.units[54] = { ...epsData.units[54]!, attack: 20 };
    for (const form of tcForms) epsData.units[form] = { ...epsData.units[form]!, reload: 2, secondaryProjectile: 54 };
    epsData.units[492] = { ...epsData.units[492]!, attack: 19.999999980005, reload: 2, total: 1, firepower: 1 };
    expect(techIds(109, 'Britons', 4, epsData)).toContain(233);
    const epsBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], [{ unitId: 492, count: '1', entry: 'enter' }]), epsData);
    const epsAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], [{ unitId: 492, count: '1', entry: 'enter' }]), epsData);
    expect(epsAfter.errors).toEqual([]);
    expect(epsBefore.totalProjectiles).toBe(1);
    expect(epsAfter.totalProjectiles).toBe(0);

    // 3. R11 P2-2: 强化教堂（1806）移除 rosterIds 中的村民 83 后，修改村民攻击仍影响圣物火力（2.5 -> 4.5），保留 233
    const relicVillData = cloneData();
    relicVillData.rosterIds = relicVillData.rosterIds.filter((id) => id !== 83);
    relicVillData.techs = { 233: { id: 233, requires: [], count: 0, effects: [{ unit: 83, stat: 'attack', op: 'add', value: 4 }] } };
    relicVillData.civs.Armenians!.automatic = [];
    relicVillData.civs.Armenians!.free = [];
    relicVillData.conditional = [];
    expect(techIds(1806, 'Armenians', 4, relicVillData)).toContain(233);
    const rvChurch = ctx.core.buildingById[1806]!;
    const rvBefore = calculateGeneralGarrison(ctx, rvChurch, cfg('Armenians', 4, [], [{ unitId: 285, count: '1', entry: 'deposit' }]), relicVillData);
    const rvAfter = calculateGeneralGarrison(ctx, rvChurch, cfg('Armenians', 4, [233], [{ unitId: 285, count: '1', entry: 'deposit' }]), relicVillData);
    expect(rvAfter.errors).toEqual([]);
    expect(rvAfter.garrisonPower! - rvBefore.garrisonPower!).toBeCloseTo(2, 5);

    // 4. R11 P2-3: 11 项把 TC 容量设为 15（与初始/基线恒等）的科技均识别为常量无效果，不触发超限误留
    const status = civStatus(ctx.trees, 'Britons');
    const shape = new Set(Object.values(GARRISON_TECH_DATA.unitUpgradeTechs ?? {}).flat());
    const skip = new Set([16, 47, 483, 755, ...GENERAL_GARRISON_DATA.civs.Britons!.disabled]);
    const capIds = ctx.core.techs
      .filter((t) => !t.pre && !shape.has(t.id) && !skip.has(t.id) && t.civs.includes('Britons') && status['t' + t.id] === 1)
      .map((t) => t.id)
      .sort((a, b) => a - b)
      .slice(0, 11);
    expect(capIds).toHaveLength(11);
    const constCapData = cloneData();
    constCapData.unitUpgradeTechs = {};
    constCapData.civs.Britons!.automatic = [];
    constCapData.civs.Britons!.free = [];
    constCapData.conditional = [];
    constCapData.techs = Object.fromEntries(
      capIds.map((id) => [id, { id, requires: [], count: 0, effects: [{ unit: 109, stat: 'capacity', op: 'set', value: 15 }] }]),
    );
    expect(techIds(109, 'Britons', 4, constCapData)).toEqual([]);
  });
});
