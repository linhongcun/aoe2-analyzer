import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import eco from '../../data/game/eco.json';
import { civs } from '../../src/data';
import { CORE } from '../../src/data/core';
import { armyResearchChoices, emptyArmyCost as makeArmyCost, evaluateArmyCost } from '../../src/domain/armyCost';
import { bonusLevel, bonusUsage } from '../../src/domain/bonusUsage';
import { buildBuildingCivRank } from '../../src/domain/buildingCivRank';
import { buildingSimTechs, simulateBuilding } from '../../src/domain/buildingSim';
import { civBonuses } from '../../src/domain/civBonus';
import { splitMechTagSegments } from '../../src/domain/civRankShared';
import { DAT } from '../../src/domain/datEffects';
import { fighterFrom, oneVOneFight } from '../../src/domain/duel';
import { applicableTrainingTechs, selectTrainingIds } from '../../src/domain/duelTrainingCost';
import { applicableUnmodeledTechIds, collectDuelUnmodeled, detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { unitRelatedTechs } from '../../src/domain/relatedTechs';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { buildUnitCivRank } from '../../src/domain/unitCivRank';
import { upgradePlan } from '../../src/domain/upgradeComparison';
import { DuelUnmodeledNotes } from '../../src/features/duel/components/DuelUnmodeledNotes';
import { prepareVgDisplay, VgNotes } from '../../src/features/duel/components/VgNotes';
import { canonicalizeDuelSide, filterExplicitTechsForUnit, isUnavail, resolve, switchSideUnit } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { varangianPkNotes } from '../../src/features/duel/logic/varangianNotes';
import { resolveUnitForm } from '../../src/features/units/unitFormDetail';
import { CivRankMechTag } from '../../src/shared/ui/CivRankMechTag';
import { ctx, techById, trees } from './helpers';

const byId = CORE.unitById;
const bldById = CORE.buildingById;
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

describe('Issue 1403 数据管线与未建模提示卡全站对齐', () => {
  it('项 1：10 国被动链接与计入档口径一致（区分来源已链接与工具已计入）', () => {
    const bonOf = (civEn: string, idx: number) => civBonuses(civs.find((c) => c.en === civEn)!).find((b) => b.idx === idx)!;

    // 新关联后变为 eco；勃艮第-0 与越南-1 经开局模拟去效果验证为已计入（all）
    expect(bonOf('Bulgarians', 1).src).toBe('eco');
    expect(bonusLevel(bonOf('Bulgarians', 1))).toBe('none');
    expect(bonOf('Burgundians', 0).src).toBe('eco');
    expect(bonusLevel(bonOf('Burgundians', 0))).toBe('all');
    expect(bonOf('Burgundians', 1).src).toBe('eco');
    expect(bonusLevel(bonOf('Burgundians', 1))).toBe('none');
    // 勃艮第-2 移除误链后回到纯文本，无开局模拟行
    expect(bonOf('Burgundians', 2).src).toBe('text');
    expect(bonusUsage(bonOf('Burgundians', 2))).toEqual([]);
    expect(bonOf('Byzantines', 3).src).toBe('eco');
    expect(bonOf('Dravidians', 3).src).toBe('eco');
    expect(bonOf('Italians', 0).src).toBe('eco');
    expect(bonusLevel(bonOf('Italians', 0))).toBe('all');
    expect(bonOf('Italians', 2).src).toBe('eco');
    expect(bonOf('Poles', 3).src).toBe('eco');
    expect(bonOf('Spanish', 2).src).toBe('eco');
    expect(bonOf('Turks', 2).src).toBe('eco');
    expect(bonOf('Vietnamese', 1).src).toBe('eco');
    expect(bonusLevel(bonOf('Vietnamese', 1))).toBe('all');
    // 马普切-4 已关联 t:1386（src = eco），但无工具建模揭示城堡，bonusLevel 仍为 none
    expect(bonOf('Mapuche', 4).src).toBe('eco');
    expect(bonOf('Mapuche', 4).dat.map((d) => d.tech)).toEqual([1386]);
    expect(bonusLevel(bonOf('Mapuche', 4))).toBe('none');
  });

  it('项 2：穆伊斯卡草药学（1365）清除 1.0005 残差，纯反例在模拟器/相关科技/混编/阵容费用彻底缺席，受益单位保留且不破范围外混编', () => {
    expect(DAT.techs.Herbalism?.excluded).toEqual([6, 7, 185, 1155, 2562, 2564]);
    expect(DAT.techs.Herbalism?.rules).toHaveLength(1);
    for (const uid of [6, 7, 185, 1155, 2562, 2564]) {
      expect(DAT.techs.Herbalism?.rules[0]?.t).not.toContain(uid);
      // simTechs 过滤 excluded，含越南独有 1155 在领域层直接验证
      expect(simTechs(ctx, byId[uid]!, 'Muisca').some((item) => item.t.id === 1365)).toBe(false);
      // 单位详情相关科技（techAffects）不含草药学
      expect(unitRelatedTechs(ctx, byId[uid]!).some((item) => item.t.id === 1365)).toBe(false);
    }

    // 真实受益单位保留数值规则与模拟器行
    for (const uid of [4, 24, 492, 2550, 2552, 2554]) {
      const hit = simTechs(ctx, byId[uid]!, 'Muisca').find((item) => item.t.id === 1365);
      expect(hit?.ef).toEqual([{ s: 'spd', op: 'mul', v: 1.15 }]);
    }

    // 混编与阵容费用：使用穆伊斯卡实际可用反例单位（6/7/185/2562/2564）
    const mixNeg = resolveMixedSide(
      ctx,
      CORE,
      {
        civ: 'Muisca',
        age: '4',
        techs: [],
        team: [],
        rows: [
          { uid: '6', qty: '10' },
          { uid: '185', qty: '10' },
          { uid: '2564', qty: '5' },
        ],
      },
      'a',
    );
    expect(mixNeg.errors).toEqual([]);
    expect(mixNeg.techs.some((o) => o.t.id === 1365)).toBe(false);

    // 阵容费用（#/production?mode=army-cost）：纯掷矛/投石穆伊斯卡编制不再收取草药学 300F+350G
    const armyCtx = { core: CORE, trees };
    const negCfg = {
      ...makeArmyCost('Muisca', '4'),
      rows: [
        { unit: 6, qty: '20' },
        { unit: 185, qty: '20' },
      ],
    };
    expect(armyResearchChoices(armyCtx, negCfg, false)).not.toContain(1365);
    const negEval = evaluateArmyCost(armyCtx, negCfg);
    expect(negEval.ledger.some((e) => e.id === 1365)).toBe(false);

    // 含真实受益单位（2554 蔷琵勇士 / 492 劲弩手）时草药学仍可选且按原价计费
    const posCfg = {
      ...makeArmyCost('Muisca', '4'),
      rows: [{ unit: 2554, qty: '10' }],
      targets: ['t:1365'],
    };
    expect(armyResearchChoices(armyCtx, posCfg, false)).toContain(1365);
    const posEval = evaluateArmyCost(armyCtx, posCfg);
    expect(posEval.ledger.find((e) => e.id === 1365)).toMatchObject({ status: 'planned', beneficiaries: [0] });

    // 范围外混编回归：不列颠骑士 38 显式选 3（英皇侍卫）仍保持合法且可计算
    const outOfScopeMix = resolveMixedSide(
      ctx,
      CORE,
      {
        civ: 'Britons',
        age: '4',
        techs: ['3'],
        team: [],
        rows: [{ uid: '38', qty: '10' }],
      },
      'a',
    );
    expect(outOfScopeMix.errors).toEqual([]);
    expect(outOfScopeMix.army).not.toBeNull();
  });

  it('项 3a：图皮箭毒（1393）精准覆盖 5 个步弓单位与 5 座有攻建筑，单/混编/对照表/建筑模拟器均零误报', () => {
    expect(DAT.projectilePoison).toEqual({
      Curare: {
        units: [4, 24, 492, 2579, 2581],
        buildings: [79, 82, 109, 234, 235],
      },
    });

    const curare = techById[1393]!;
    const expectedPill = '命中后持续伤害 · 箭毒';
    const expectedDetail = '当前未计入命中后的中毒持续伤害（已选科技「箭毒」；未勾选该科技时本项不会触发）；实际输出通常高于此处估算。';

    // 5 个步弓单位：开放勾选、不进 f/c 预设、勾选出胶囊且数值不变
    for (const uid of [4, 24, 492, 2579, 2581]) {
      const u = byId[uid]!;
      const avail = simTechs(ctx, u, 'Tupi');
      expect(applicableUnmodeledTechIds(avail, uid, u.combatAbility ?? 0).has(1393), `unit ${uid}`).toBe(true);
      expect(presetUpTo(avail, 4, 'Tupi').has(1393), `preset ${uid}`).toBe(false);
      expect(detectUnitUnmodeled({ unit: u, civ: 'Tupi', age: 4, selectedTechs: [] })).toEqual([]);
      expect(detectUnitUnmodeled({ unit: u, civ: 'Tupi', age: 4, selectedTechs: [curare] })).toEqual([
        {
          kind: 'on-hit',
          pill: expectedPill,
          detail: expectedDetail,
          techId: 1393,
          techEn: 'Curare',
        },
      ]);
      // 勾选箭毒不改变 1v1 战斗数值
      const opp = byId[567]!;
      const sOff = simulate(ctx, u, 'Tupi', 4, presetUpTo(avail, 4, 'Tupi'), new Set());
      const sOn = simulate(ctx, u, 'Tupi', 4, new Set([...presetUpTo(avail, 4, 'Tupi'), 1393]), new Set());
      const oppS = simulate(ctx, opp, 'Japanese', 4, presetUpTo(simTechs(ctx, opp, 'Japanese'), 4, 'Japanese'), new Set());
      expect(oneVOneFight(fighterFrom(u, sOn), fighterFrom(opp, oppS))).toEqual(oneVOneFight(fighterFrom(u, sOff), fighterFrom(opp, oppS)));
    }

    // 反例：掷矛手（6/7）与投石手（185）保持仅文本、不可勾选、显式 ID 裁剪、无胶囊
    for (const uid of [6, 7, 185]) {
      const u = byId[uid]!;
      const avail = simTechs(ctx, u, 'Tupi');
      expect(
        avail.some((item) => item.t.id === 1393 && item.ef === null),
        `text-only avail ${uid}`,
      ).toBe(true);
      expect(applicableUnmodeledTechIds(avail, uid, u.combatAbility ?? 0).has(1393), `uncheckable ${uid}`).toBe(false);
      expect(detectUnitUnmodeled({ unit: u, civ: 'Tupi', age: 4, selectedTechs: [curare] })).toEqual([]);
      // 直达 #/duel?a=<uid>.Tupi.4.1393. 或从已选箭毒步弓切换：sel 与 spec.techs 均自动剔除 1393
      const costs = applicableTrainingTechs(ctx, u, 'Tupi', 4);
      expect(selectTrainingIds([1393], avail, 4, costs, 'Tupi', uid).has(1393)).toBe(false);
      expect(filterExplicitTechsForUnit([47, 1393], techById, uid)).toEqual([47]);
      const resolved = resolve(ctx, byId, { uid, civ: 'Tupi', age: 4, ageSet: true, techs: [1393], team: [] }, uid);
      expect(isUnavail(resolved)).toBe(false);
      if (!isUnavail(resolved)) {
        expect(resolved.sel.has(1393)).toBe(false);
        expect(resolved.spec.techs).toEqual([]);
      }
    }

    // 2581（选 1393）→ 185 投石手 → 切回 2581：切换提交即移除 1393，不残留在链接、不复活且不阻断升级对比；直达比较链接仍严格拒收 1393
    const archerWithCurare = { uid: 2581, civ: 'Tupi', age: 4, ageSet: true, techs: [1393] as number[], team: [] };
    const rStart = resolve(ctx, byId, archerWithCurare, 2581);
    expect(isUnavail(rStart)).toBe(false);
    if (!isUnavail(rStart)) expect([...rStart.sel]).toEqual([1393]);
    const slingerSpec = switchSideUnit(techById, archerWithCurare, 185);
    expect(slingerSpec.techs).toEqual([]);
    const rSlinger = resolve(ctx, byId, slingerSpec, 185);
    expect(isUnavail(rSlinger)).toBe(false);
    if (!isUnavail(rSlinger)) {
      expect([...rSlinger.sel]).toEqual([]);
      expect(rSlinger.spec.techs).toEqual([]);
    }
    expect(upgradePlan(ctx, byId, slingerSpec).ok).toBe(true);
    expect(upgradePlan(ctx, byId, { ...slingerSpec, techs: [1393] }).ok).toBe(false);
    const backToArcher = switchSideUnit(techById, slingerSpec, 2581);
    expect(backToArcher.techs).toEqual([]);
    const rBack = resolve(ctx, byId, backToArcher, 2581);
    expect(isUnavail(rBack)).toBe(false);
    if (!isUnavail(rBack)) expect([...rBack.sel]).toEqual([]);
    // 普通 PK 链接规范化同步剔除反例单位上的 1393，保留受益单位上的 1393
    expect(canonicalizeDuelSide(CORE, { uid: 6, civ: 'Tupi', age: 4, ageSet: true, techs: [1393], team: [] }, archerWithCurare).techs).toEqual([]);
    expect(canonicalizeDuelSide(CORE, archerWithCurare, archerWithCurare).techs).toEqual([1393]);
    // 不影响医疗部队（831）等非投射物剧毒科技的既有切单位行为
    expect(switchSideUnit(techById, { uid: 1744, civ: 'Dravidians', age: 4, ageSet: true, techs: [831], team: [] }, 567).techs).toEqual([831]);

    // 混编模式：纯反例不可勾选且显式 1393 拦截；步弓+投石同队仅步弓行适用与出胶囊
    const mixPureNeg = resolveMixedSide(
      ctx,
      CORE,
      {
        civ: 'Tupi',
        age: '4',
        techs: ['1393'],
        team: [],
        rows: [
          { uid: '6', qty: '10' },
          { uid: '185', qty: '10' },
        ],
      },
      'a',
    );
    expect(mixPureNeg.techs.some((o) => o.t.id === 1393)).toBe(false);
    expect(mixPureNeg.errors.some((e) => e.field === 'mix-a-techs')).toBe(true);

    const mixSplit = resolveMixedSide(
      ctx,
      CORE,
      {
        civ: 'Tupi',
        age: '4',
        techs: ['1393'],
        team: [],
        rows: [
          { uid: '2581', qty: '10' },
          { uid: '185', qty: '10' },
        ],
      },
      'a',
    );
    expect(mixSplit.errors).toEqual([]);
    expect(mixSplit.techs.find((o) => o.t.id === 1393)?.rows).toEqual([0]);
    const mixUnmodeled = collectDuelUnmodeled(
      mixSplit.rows.map((r, i) => ({
        side: 'a' as const,
        badge: `A${i + 1}`,
        unit: r.unit!,
        civ: 'Tupi',
        age: 4,
        selectedTechs: [...(r.resolved?.sel ?? [])].map((id) => techById[id]!).filter(Boolean),
      })),
    );
    expect(mixUnmodeled.map((x) => [x.badge, x.unit.id, x.mechanisms.map((m) => m.pill)])).toEqual([['A1', 2581, [expectedPill]]]);

    // #1387 单位跨文明对照：4/24/492（及 UX D.4 单文明领域层 2579/2581）出标签并带 1393；6/7/185 不触发
    for (const uid of [4, 24, 492, 2579, 2581]) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      const tupiRow = rank.rows.find((r) => r.civ === 'Tupi')!;
      expect(tupiRow.unmodeledPills, `rank ${uid}`).toContain(expectedPill);
      expect(tupiRow.activeUnmodeledTechIds, `rank duel id ${uid}`).toContain(1393);
    }
    for (const uid of [6, 7, 185]) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      const tupiRow = rank.rows.find((r) => r.civ === 'Tupi')!;
      expect(tupiRow.unmodeledPills, `rank neg ${uid}`).not.toContain(expectedPill);
      expect(tupiRow.activeUnmodeledTechIds, `rank neg id ${uid}`).not.toContain(1393);
    }

    // 建筑模拟器与 #1393 建筑跨文明对照：5 座有攻建筑命中且城堡 82 仅出现一次；598 哨站排除
    const expectedScopeNote = '研究后本建筑的攻击附带中毒持续伤害；面板数值未计入。';
    for (const bid of [79, 82, 109, 234, 235]) {
      const b = bldById[bid]!;
      const bTechs = buildingSimTechs(ctx, b, 'Tupi').filter((x) => x.t.id === 1393);
      expect(bTechs, `buildingSim ${bid}`).toHaveLength(1);
      expect(bTechs[0]).toMatchObject({ ef: null, scopeNote: expectedScopeNote });
      // 模拟数值不变
      expect(simulateBuilding(ctx, b, 'Tupi', 4, new Set([1393]))).toEqual(simulateBuilding(ctx, b, 'Tupi', 4, new Set()));
      // #1393 帝王时代出标签；可下切到城堡时代的建筑（79/82/109/234）在城堡时代不出（箭毒为帝王独科）；235 大型箭塔最低时代即帝王
      const rankImp = buildBuildingCivRank({ core: CORE, trees }, b, 4);
      expect(rankImp.rows.find((r) => r.civ === 'Tupi')?.tags, `bcr imp ${bid}`).toContain(`未计入：${expectedPill}`);
      const rankCas = buildBuildingCivRank({ core: CORE, trees }, b, 3);
      if (rankCas.age < 4) {
        expect(rankCas.rows.find((r) => r.civ === 'Tupi')?.tags ?? [], `bcr cas ${bid}`).not.toContain(`未计入：${expectedPill}`);
      } else {
        expect(bid).toBe(235);
      }
    }
    const outpost = bldById[598]!;
    expect(buildingSimTechs(ctx, outpost, 'Tupi').some((x) => x.t.id === 1393)).toBe(false);
    expect(buildBuildingCivRank({ core: CORE, trees }, outpost, 4).rows.find((r) => r.civ === 'Tupi')?.tags ?? []).not.toContain(`未计入：${expectedPill}`);
  });

  it('项 3b：穆伊斯卡格查战士（2562/2564）固有「同伴阵亡回血」提示，副形态与保加利亚骑兵零误报', () => {
    const auraUnits = CORE.units.filter((u) => u.deathHealAura === true).map((u) => u.id);
    expect(auraUnits).toEqual([2562, 2564]);
    expect(resolveUnitForm(CORE, 1980).rawTarget?.deathHealAura).toBeUndefined();
    // 突变敏感校验：主形态 1962 人工注入 deathHealAura: true 时，副形态 1980 仍须显式清除而不透传
    const syntheticOwner = { ...CORE.unitById[1962]!, deathHealAura: true };
    const syntheticCore = {
      ...CORE,
      units: CORE.units.map((u) => (u.id === 1962 ? syntheticOwner : u)),
      unitById: { ...CORE.unitById, 1962: syntheticOwner },
    };
    expect(resolveUnitForm(syntheticCore, 1980).rawTarget?.deathHealAura).toBeUndefined();

    for (const uid of [2562, 2564]) {
      const u = byId[uid]!;
      expect(detectUnitUnmodeled({ unit: u, civ: 'Muisca', age: 4, selectedTechs: [] })).toEqual([
        {
          kind: 'death-heal',
          pill: '同伴阵亡回血',
          detail: '当前未计入附近格查战士被击败时的生命回复；成群作战、持续减员时实际生存能力通常高于此处估算。',
        },
      ]);
      // UX D.4：单文明单位在 buildUnitCivRank 领域层产出该标签
      const rank = buildUnitCivRank(ctx, u, 4);
      expect(rank.rows.find((r) => r.civ === 'Muisca')?.unmodeledPills).toEqual(['同伴阵亡回血']);
    }

    // 保加利亚骑兵城堡与营垒版：仅下马，无同伴阵亡回血
    for (const uid of [1225, 1227, 1254, 1255]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Bulgarians', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['阵亡下马步兵阶段']);
    }
  });

  it('项 3c：拜占庭后勤学（61）与瓦兰吉哥瑟砍（1474）统一为勾选后触发，默认 4.f. 零无条件覆盖', () => {
    // 拜占庭精锐瓦兰吉卫队 2704 默认 4.f.：无加成说明行，无「相关加成是否计入」标题，仅留默认产金估算
    expect(varangianPkNotes(2704, 'Byzantines', 4)).toEqual([]);
    const byzVg = prepareVgDisplay([{ rowKey: 'a', k: 'a', unitId: 2704, civ: 'Byzantines', age: 4, rof: 2.0, seconds: 10 }]);
    expect(byzVg.lines).toEqual([]);
    expect(byzVg.gold).toHaveLength(1);
    const byzMarkup = html(createElement(VgNotes, { sides: [{ rowKey: 'a', k: 'a', unitId: 2704, civ: 'Byzantines', age: 4, rof: 2.0, seconds: 10 }] }));
    expect(byzMarkup).toContain('本场产生黄金');
    expect(byzMarkup).not.toContain('相关加成是否计入');
    expect(byzMarkup).not.toContain('后勤学');

    // 勾选 61 后由 DuelUnmodeledNotes 统一提示且只出现一次
    const withLogMarkup = html(
      createElement(DuelUnmodeledNotes, {
        entries: [{ side: 'a', badge: 'A', unit: byId[2704]!, civ: 'Byzantines', age: 4, selectedTechs: [techById[61]!] }],
        vgSides: [{ rowKey: 'a', k: 'a', unitId: 2704, civ: 'Byzantines', age: 4, rof: 2.0, seconds: 10 }],
      }),
    );
    expect(withLogMarkup).toContain('践踏 / 溅射伤害 · 后勤学');
    expect(withLogMarkup).toContain('本场产生黄金');

    // 瓦兰吉人 2704 默认仅保留攻速 + 产金两行，不含 vg-gothikon
    expect(varangianPkNotes(2704, 'Varangians', 4, 1.6).map((n) => n.id)).toEqual(['vg-rof', 'vg-gold']);
  });

  it('项 3d（UX D.3）：单位与建筑对照表共用 CivRankMechTag 语义分段，保留精确 textContent 与 .num 数字', () => {
    expect(splitMechTagSegments('未计入：命中后持续伤害 · 箭毒')).toEqual([
      { text: '未计入：', spaceAfter: false },
      { text: '命中后持续伤害 ·', spaceAfter: true },
      { text: '箭毒', spaceAfter: false },
    ]);
    expect(splitMechTagSegments('无视护甲 · 乌兹钢（已计入）')).toEqual([
      { text: '无视护甲 ·', spaceAfter: true },
      { text: '乌兹钢（已计入）', spaceAfter: false },
    ]);

    for (const sample of [
      '未计入：命中后持续伤害 · 箭毒',
      '额外箭矢 +2 · 箭垛（已计入箭数）',
      '未计入：每分钟回复 15 生命 · 堡垒',
      '未计入：训练速度 ×1.25 · 强征兵役',
    ]) {
      const markup = html(createElement(CivRankMechTag, { text: sample }));
      expect(markup).toContain('class="ucr-tag is-mech"');
      expect(markup).toContain('class="nw"');
      // 去除标签后精确还原文本内容
      const plain = markup.replace(/<[^>]+>/g, '');
      expect(plain).toBe(sample);
      if (/\d/.test(sample)) expect(markup).toContain('class="num"');
    }
  });

  it('项 4：哥特兵营近卫军（759/761）与匈奴马厩答刺罕（886/887）训练时间对齐且全库 248 单位零漂移', () => {
    expect(byId[759]!.tt).toBe(16);
    expect(byId[761]!.tt).toBe(16);
    expect(byId[886]!.tt).toBe(26);
    expect(byId[887]!.tt).toBe(24);
    // 城堡版不变
    expect(byId[41]!.tt).toBe(13);
    expect(byId[555]!.tt).toBe(13);
    expect(byId[755]!.tt).toBe(14);
    expect(byId[757]!.tt).toBe(14);

    // 全库 248 单位防漂移不变量
    expect(CORE.units).toHaveLength(248);
    const ecoUnits = eco.units as Record<string, { trainTime: number; timeAt?: Record<string, number> }>;
    for (const u of CORE.units) {
      const eu = ecoUnits[String(u.id)]!;
      const expected = eu.timeAt?.[String(u.b)] ?? eu.trainTime;
      expect(u.tt, `unit ${u.id} (${u.zh}) b=${u.b}`).toBe(expected);
    }
  });
});
