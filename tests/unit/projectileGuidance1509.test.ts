import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { buildBuildingCivRank } from '../../src/domain/buildingCivRank';
import { buildingSimTechs, simulateBuilding } from '../../src/domain/buildingSim';
import { splitMechTagSegments } from '../../src/domain/civRankShared';
import { DAT, type DatFile, type DatProjectileGuidanceScope } from '../../src/domain/datEffects';
import { fighterFrom, groupFight, oneVOneFight } from '../../src/domain/duel';
import { applicableTrainingTechs, selectTrainingIds } from '../../src/domain/duelTrainingCost';
import { applicableUnmodeledTechIds, collectDuelUnmodeled, detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import {
  getProjectileGuidanceScope,
  projectileGuidanceBuildingScopeNote,
  projectileGuidanceDuelDetail,
  projectileGuidanceLabel,
  projectileGuidanceUnitScopeNote,
} from '../../src/domain/duelUnmodeledEco';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { classifyTechDataConsumption } from '../../src/domain/techDataConsumption';
import type { Tech } from '../../src/domain/types';
import { buildCivRankDuelHref, buildUnitCivRank } from '../../src/domain/unitCivRank';
import { upgradePlan } from '../../src/domain/upgradeComparison';
import { DuelUnmodeledNotes } from '../../src/features/duel/components/DuelUnmodeledNotes';
import { canonicalizeDuelSide, filterExplicitTechsForUnit, isUnavail, resolve, switchSideCiv, switchSideUnit } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { CivRankMechTag } from '../../src/shared/ui/CivRankMechTag';
import { ctx, techById, trees, units } from './helpers';

const byId = CORE.unitById;
const bldById = CORE.buildingById;
const prodCtx = { core: CORE, trees };
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

const ARQUEBUS_UNITS = [5, 36, 420, 691, 1001, 1003] as const;
const ARQUEBUS_UNIT_SCOPE_NOTE = '研究后该单位投射物具备移动目标追踪并提升飞行速度；面板数值（含移速）与 PK 伤害均未计入。';
const ARQUEBUS_BLD_SCOPE_NOTE = '研究后本建筑投射物具备移动目标追踪并提升飞行速度；面板数值未计入。';
const ARQUEBUS_PILL = '弹丸追踪与提速 · 火绳枪';
const ARQUEBUS_DETAIL =
  '当前未计入弹丸对移动目标的追踪提前量与弹丸飞行速度提升（已选科技「火绳枪」；未勾选该科技时本项不会触发）；面板与 PK 数值不变，对移动目标与拉扯作战的实际命中表现可能更优。';

function researchTotals(selected: ReadonlySet<number>) {
  const cost: Record<string, number> = {};
  let time = 0;
  for (const id of selected) {
    const t = techById[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.cost)) cost[k] = (cost[k] ?? 0) + v;
    time += t.rt;
  }
  return { cost, time };
}

describe('Issue 1509 葡萄牙火绳枪（573）投射物追踪与弹速全链路口径', () => {
  it('验收 1 & 零硬编码：projectileGuidance 精确仅含 Arquebus，且业务代码零硬编码 573', () => {
    const files = [
      'src/domain/duelUnmodeledEco.ts',
      'src/domain/duelUnmodeled.ts',
      'src/domain/simulator.ts',
      'src/domain/buildingSim.ts',
      'src/domain/buildingCivRank.ts',
      'src/domain/techDataConsumption.ts',
      'src/features/duel/logic/mixedTrainingTransfer.ts',
    ];
    for (const f of files) {
      const codeOnly = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(codeOnly, `${f} must not hardcode 573 or Arquebus`).not.toMatch(/\b573\b|Arquebus/);
    }

    expect(DAT.projectileGuidance).toEqual({
      Arquebus: {
        units: [5, 36, 420, 691, 1001, 1003],
        buildings: [236],
        tracking: true,
        speed: true,
      },
    });
    expect(DAT.techs.Arquebus).toEqual({ id: 573, combat: true, rules: [], eco: [] });
  });

  it('验收 2 & 合成边界：techDataConsumption 对 #/tech/573 及 tracking-only / speed-only / false-false 均准确分类', () => {
    const t573 = techById[573]!;
    const res573 = classifyTechDataConsumption(t573, false, {
      unitById: CORE.unitById,
      buildingById: CORE.buildingById,
    });
    expect(res573.kind).toBe('consumed');
    expect(res573.domains).toEqual(['unit-sim-notice', 'duel-unmodeled', 'unit-civ-rank-notice', 'building-sim-notice', 'building-combat-notice']);
    expect(res573.sourceNote).toBe(
      '本页不逐条模拟属性；单位科技模拟器、单位 PK、单位满科技对照、建筑模拟器与建筑满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准',
    );

    // 合成 tracking-only / speed-only / false-false 逐字短语与注入 dat 边界
    expect(projectileGuidanceLabel({ tracking: true, speed: true })).toBe('弹丸追踪与提速');
    expect(projectileGuidanceLabel({ tracking: true, speed: false })).toBe('弹丸追踪');
    expect(projectileGuidanceLabel({ tracking: false, speed: true })).toBe('弹丸提速');
    expect(projectileGuidanceLabel({ tracking: false, speed: false })).toBeNull();

    expect(projectileGuidanceUnitScopeNote({ tracking: true, speed: false })).toBe('研究后该单位投射物具备移动目标追踪；面板数值与 PK 伤害均未计入。');
    expect(projectileGuidanceUnitScopeNote({ tracking: false, speed: true })).toBe('研究后该单位投射物飞行速度提升；面板数值（含移速）与 PK 伤害均未计入。');
    expect(projectileGuidanceUnitScopeNote({ tracking: false, speed: false })).toBeNull();

    expect(projectileGuidanceBuildingScopeNote({ tracking: true, speed: false })).toBe('研究后本建筑投射物具备移动目标追踪；面板数值未计入。');
    expect(projectileGuidanceBuildingScopeNote({ tracking: false, speed: true })).toBe('研究后本建筑投射物飞行速度提升；面板数值未计入。');
    expect(projectileGuidanceBuildingScopeNote({ tracking: false, speed: false })).toBeNull();

    expect(projectileGuidanceDuelDetail({ tracking: true, speed: false }, '火绳枪')).toBe(
      '当前未计入弹丸对移动目标的追踪提前量（已选科技「火绳枪」；未勾选该科技时本项不会触发）；面板与 PK 数值不变，对移动目标与拉扯作战的实际命中表现可能更优。',
    );
    expect(projectileGuidanceDuelDetail({ tracking: false, speed: true }, '火绳枪')).toBe(
      '当前未计入弹丸飞行速度提升（已选科技「火绳枪」；未勾选该科技时本项不会触发）；面板与 PK 数值不变，对移动目标与远距离交火的实际命中表现可能更优。',
    );
    expect(projectileGuidanceDuelDetail({ tracking: false, speed: false }, '火绳枪')).toBeNull();

    const fakeDat = (scope: DatProjectileGuidanceScope): DatFile => ({
      ...DAT,
      techs: { ...DAT.techs, __FakeGuidance__: { id: 99509, combat: true, rules: [], eco: [] } },
      projectileGuidance: { ...(DAT.projectileGuidance ?? {}), __FakeGuidance__: scope },
    });
    const fakeTech: Pick<Tech, 'id' | 'en' | 'type' | 'civs'> = { id: 99509, en: '__FakeGuidance__', type: 'UniqueTech', civs: ['Portuguese'] };

    // tracking=false && speed=false 视为无效，保持 unencoded
    expect(getProjectileGuidanceScope('__FakeGuidance__', fakeDat({ units: [5], buildings: [236], tracking: false, speed: false }))).toBeUndefined();
    expect(
      classifyTechDataConsumption(fakeTech, false, {
        dat: fakeDat({ units: [5], buildings: [236], tracking: false, speed: false }),
        unitById: CORE.unitById,
        buildingById: CORE.buildingById,
      }).kind,
    ).toBe('unencoded');

    // 单文明单位（1003）+ 无建筑：只出单位科技模拟器与单位 PK，不出单位满科技对照或建筑域
    const singleUnitRes = classifyTechDataConsumption(fakeTech, false, {
      dat: fakeDat({ units: [1003], buildings: [], tracking: true, speed: false }),
      unitById: CORE.unitById,
      buildingById: CORE.buildingById,
    });
    expect(singleUnitRes.domains).toEqual(['unit-sim-notice', 'duel-unmodeled']);
    expect(singleUnitRes.sourceNote).toBe('本页不逐条模拟属性；单位科技模拟器与单位 PK 已读取固定数据编码作机制提示，其余效果以游戏说明为准');
  });

  it('验收 3：建筑模拟器与建筑满科技对照（236 炮塔正例 vs 82 城堡与无攻/箭塔/非葡萄牙反例）', () => {
    const b236 = bldById[236]!;
    const b236Techs = buildingSimTechs(ctx, b236, 'Portuguese').filter((x) => x.t.id === 573);
    expect(b236Techs).toHaveLength(1);
    expect(b236Techs[0]).toMatchObject({ ef: null, scopeNote: ARQUEBUS_BLD_SCOPE_NOTE });
    expect(simulateBuilding(ctx, b236, 'Portuguese', 4, new Set([573]))).toEqual(simulateBuilding(ctx, b236, 'Portuguese', 4, new Set()));

    // 炮塔满科技对照：葡萄牙行新增「未计入：弹丸追踪与提速 · 火绳枪」，他国（如拜占庭/土耳其）无火绳枪
    const rank236 = buildBuildingCivRank(prodCtx, b236, 4);
    expect(rank236.rows.find((r) => r.civ === 'Portuguese')?.tags).toContain(`未计入：${ARQUEBUS_PILL}`);
    for (const row of rank236.rows) {
      if (row.civ !== 'Portuguese') {
        expect(
          row.tags.some((tag) => tag.includes('火绳枪')),
          `other civ ${row.civ}`,
        ).toBe(false);
      }
    }

    // 反例 1：82 城堡模拟器保留 b.techs 研究地点独科兜底（无火绳枪 scopeNote），对照表无火绳枪标签
    const b82 = bldById[82]!;
    const b82Techs = buildingSimTechs(ctx, b82, 'Portuguese').filter((x) => x.t.id === 573);
    expect(b82Techs).toHaveLength(1);
    expect(b82Techs[0]!.ef).toBeNull();
    expect(b82Techs[0]!.scopeNote).toBeUndefined();
    expect(buildBuildingCivRank(prodCtx, b82, 4).rows.find((r) => r.civ === 'Portuguese')?.tags ?? []).not.toContain(`未计入：${ARQUEBUS_PILL}`);

    // 反例 2：598 哨站、79/234/235 箭塔系、109 城镇中心在模拟器与对照表均零挂载 573
    for (const bid of [598, 79, 234, 235, 109]) {
      const b = bldById[bid]!;
      expect(
        buildingSimTechs(ctx, b, 'Portuguese').some((x) => x.t.id === 573),
        `bldSim ${bid}`,
      ).toBe(false);
      expect(
        buildBuildingCivRank(prodCtx, b, 4)
          .rows.find((r) => r.civ === 'Portuguese')
          ?.tags.some((tag) => tag.includes('火绳枪')) ?? false,
        `bldRank ${bid}`,
      ).toBe(false);
    }

    // 非葡萄牙炮塔（土耳其/拜占庭）模拟器无 573
    for (const civ of ['Turks', 'Byzantines']) {
      expect(buildingSimTechs(ctx, b236, civ).some((x) => x.t.id === 573)).toBe(false);
    }
  });

  it('验收 4：单位科技模拟器精准挂载 6 火药正例、彻底清理全部 42 个葡萄牙非火药反例且不改面板属性', () => {
    const portUnits = units.filter((u) => u.civs.includes('Portuguese'));
    expect(portUnits).toHaveLength(48);
    const gunpowderSet = new Set<number>(ARQUEBUS_UNITS);
    const nonGunpowder = portUnits.filter((u) => !gunpowderSet.has(u.id));
    expect(nonGunpowder).toHaveLength(42);

    // 6 个火药单位：精确挂载唯一 573 + scopeNote，且模拟属性（含 spd）零变化
    for (const uid of ARQUEBUS_UNITS) {
      const u = byId[uid]!;
      const avail = simTechs(ctx, u, 'Portuguese');
      const hits = avail.filter((x) => x.t.id === 573);
      expect(hits, `unit ${uid}`).toHaveLength(1);
      expect(hits[0]).toMatchObject({ ef: null, scopeNote: ARQUEBUS_UNIT_SCOPE_NOTE });

      const preset = presetUpTo(avail, 4, 'Portuguese');
      expect(preset.has(573), `not in preset ${uid}`).toBe(false);
      const sOff = simulate(ctx, u, 'Portuguese', 4, preset, new Set());
      const sOn = simulate(ctx, u, 'Portuguese', 4, new Set([...preset, 573]), new Set());
      expect(sOn).toEqual(sOff);
      expect(sOn.spd).toBe(sOff.spd);
    }

    // 42 个非火药单位（含 283 重装骑士、492 劲弩手、1004 卡拉维尔战舰）：simTechs 彻底移除 573
    for (const u of nonGunpowder) {
      expect(
        simTechs(ctx, u, 'Portuguese').some((x) => x.t.id === 573),
        `non-gunpowder ${u.id} (${u.zh})`,
      ).toBe(false);
    }
    expect(nonGunpowder.map((u) => u.id)).toEqual(expect.arrayContaining([283, 492, 1004]));

    // 非葡萄牙同弹丸单位（46/557、771/773、1704/1706/1709）及他国 5/36/420/691 不受影响
    for (const [uid, civ] of [
      [46, 'Turks'],
      [557, 'Turks'],
      [771, 'Spanish'],
      [773, 'Spanish'],
      [1704, 'Bohemians'],
      [1706, 'Bohemians'],
      [1709, 'Bohemians'],
      [5, 'Italians'],
      [36, 'Turks'],
      [691, 'Spanish'],
    ] as const) {
      const u = byId[uid]!;
      expect(
        simTechs(ctx, u, civ).some((x) => x.t.id === 573),
        `other ${civ} ${uid}`,
      ).toBe(false);
      expect(detectUnitUnmodeled({ unit: u, civ, age: 4, selectedTechs: [techById[573]!] }).some((m) => m.techId === 573)).toBe(false);
    }
  });

  it('验收 5：单兵三态闭环、URL 规范化与 upgradePlan 拒收、混编行匹配/训练带入、满科技对照与零内部字段泄漏', () => {
    const opp = byId[567]!;
    const oppF = fighterFrom(opp, simulate(ctx, opp, 'Japanese', 4, presetUpTo(simTechs(ctx, opp, 'Japanese'), 4, 'Japanese'), new Set()));

    // 1) 单兵三态闭环（6 个火药单位）：默认 f/c 不勾 573 → 手动勾选 +700食 +400金 / +40s、战果不变、出胶囊与说明 → 取消恢复
    for (const uid of ARQUEBUS_UNITS) {
      const u = byId[uid]!;
      const avail = simTechs(ctx, u, 'Portuguese');
      expect(applicableUnmodeledTechIds(avail, uid, u.combatAbility ?? 0, u.chargeType ?? 0).has(573), `applicable ${uid}`).toBe(true);
      const preset4 = presetUpTo(avail, 4, 'Portuguese');
      const preset3 = presetUpTo(avail, 3, 'Portuguese');
      expect(preset4.has(573)).toBe(false);
      expect(preset3.has(573)).toBe(false);

      const selBefore = new Set(preset4);
      const selChecked = new Set([...preset4, 573]);
      const selUnchecked = new Set([...selChecked].filter((id) => id !== 573));
      expect([...selUnchecked].sort((a, b) => a - b)).toEqual([...selBefore].sort((a, b) => a - b));

      const mechsBefore = detectUnitUnmodeled({ unit: u, civ: 'Portuguese', age: 4, selectedTechs: [...selBefore].map((id) => techById[id]!) });
      const mechsChecked = detectUnitUnmodeled({ unit: u, civ: 'Portuguese', age: 4, selectedTechs: [...selChecked].map((id) => techById[id]!) });
      const mechsUnchecked = detectUnitUnmodeled({ unit: u, civ: 'Portuguese', age: 4, selectedTechs: [...selUnchecked].map((id) => techById[id]!) });

      expect(mechsBefore.some((m) => m.kind === 'projectile-guidance')).toBe(false);
      expect(mechsChecked.find((m) => m.kind === 'projectile-guidance')).toEqual({
        kind: 'projectile-guidance',
        pill: ARQUEBUS_PILL,
        detail: ARQUEBUS_DETAIL,
        techId: 573,
        techEn: 'Arquebus',
      });
      expect(mechsUnchecked).toEqual(mechsBefore);

      // 研究费与时间严格 +700 食 +400 金 / +40s，取消精确恢复
      const totBefore = researchTotals(selBefore);
      const totChecked = researchTotals(selChecked);
      const totUnchecked = researchTotals(selUnchecked);
      expect((totChecked.cost.Food ?? 0) - (totBefore.cost.Food ?? 0)).toBe(700);
      expect((totChecked.cost.Gold ?? 0) - (totBefore.cost.Gold ?? 0)).toBe(400);
      expect(totChecked.time - totBefore.time).toBe(40);
      expect(totUnchecked).toEqual(totBefore);

      // 1v1 与群战结果完全一致
      const sBefore = simulate(ctx, u, 'Portuguese', 4, selBefore, new Set());
      const sChecked = simulate(ctx, u, 'Portuguese', 4, selChecked, new Set());
      expect(sChecked).toEqual(sBefore);
      expect(oneVOneFight(fighterFrom(u, sChecked), oppF)).toEqual(oneVOneFight(fighterFrom(u, sBefore), oppF));
      expect(groupFight(fighterFrom(u, sChecked), 10, oppF, 10)).toEqual(groupFight(fighterFrom(u, sBefore), 10, oppF, 10));
    }

    // 精锐风琴炮（1003，assumeHit + 多弹丸 + 火绳枪）与手推炮（36，溅射 + 火绳枪）在 DuelUnmodeledNotes 正确共存渲染
    const organHtml = html(
      createElement(DuelUnmodeledNotes, {
        entries: [{ side: 'a', badge: 'A', unit: byId[1003]!, civ: 'Portuguese', age: 4, selectedTechs: [techById[573]!], assumeHit: true }],
        vgSides: [],
      }),
    );
    expect(organHtml).toContain('主弹 · 按每击命中估算：');
    expect(organHtml).toContain('额外弹丸未计入：');
    expect(organHtml).toContain(`<strong>${ARQUEBUS_PILL}：</strong>`);
    expect(organHtml).toContain(ARQUEBUS_DETAIL);

    // 2) 单兵 URL 规范化、切换裁剪与 upgradePlan 严格拒收
    const sideData = { byId, techById, trees };
    const fallback = { uid: 569, civ: 'Franks', age: 4, ageSet: true, techs: 'f' as const, team: [] };
    for (const [uid, civ] of [
      [5, 'Turks'],
      [36, 'Italians'],
      [283, 'Portuguese'],
      [492, 'Portuguese'],
      [1004, 'Portuguese'],
    ] as const) {
      const rawSpec = { uid, civ, age: 4, ageSet: true, techs: [573] as number[], team: [] };
      const canon = canonicalizeDuelSide(CORE, rawSpec, fallback);
      expect(canon.techs, `canon ${uid}.${civ}`).toEqual([]);
      expect(upgradePlan(ctx, byId, canon).ok, `upgradePlan after canon ${uid}.${civ}`).toBe(true);
      expect(upgradePlan(ctx, byId, rawSpec).ok, `strict upgradePlan ${uid}.${civ}`).toBe(false);

      const resolved = resolve(ctx, byId, rawSpec, uid);
      expect(isUnavail(resolved)).toBe(false);
      if (!isUnavail(resolved)) {
        expect(resolved.spec.techs).toEqual([]);
        expect(resolved.sel.has(573)).toBe(false);
      }

      const u = byId[uid]!;
      const avail = simTechs(ctx, u, civ);
      const costs = applicableTrainingTechs(ctx, u, civ, 4);
      expect(selectTrainingIds([573], avail, 4, costs, civ, uid, u.chargeType ?? 0).has(573)).toBe(false);
    }

    // 切文明与切单位裁剪且切回不复活
    const portHc = { uid: 5, civ: 'Portuguese', age: 4, ageSet: true, techs: [211, 573] as number[], team: [] };
    const turkHc = switchSideCiv(sideData, portHc, byId[5]!, 'Turks');
    expect(turkHc.techs).toEqual([211]);
    expect(switchSideCiv(sideData, turkHc, byId[5]!, 'Portuguese').techs).toEqual([211]);

    const portCav = switchSideUnit(techById, portHc, 283, byId[283]!.chargeType ?? 0);
    expect(portCav.techs).toEqual([211]);
    expect(switchSideUnit(techById, portCav, 5, byId[5]!.chargeType ?? 0).techs).toEqual([211]);
    expect(filterExplicitTechsForUnit([211, 573], techById, 283, 'Portuguese')).toEqual([211]);
    expect(filterExplicitTechsForUnit([211, 573], techById, 5, 'Turks')).toEqual([211]);
    expect(filterExplicitTechsForUnit([211, 573], techById, 5, 'Portuguese')).toEqual([211, 573]);

    // 3) 混编 PK 按行匹配与训练费用带入
    const mixInput = {
      civ: 'Portuguese',
      age: '4',
      techs: ['573'],
      team: [] as string[],
      rows: [
        { uid: '5', qty: '10' },
        { uid: '283', qty: '10' },
      ],
    };
    const mixView = resolveMixedSide(ctx, CORE, mixInput, 'a');
    expect(mixView.errors).toEqual([]);
    expect(mixView.techs.find((o) => o.t.id === 573)).toMatchObject({ numeric: false, rows: [0] });
    expect(mixView.rows[0]!.resolved!.sel.has(573)).toBe(true);
    expect(mixView.rows[1]!.resolved!.sel.has(573)).toBe(false);
    const mixUnm = collectDuelUnmodeled(
      mixView.rows.map((r, i) => ({
        side: 'a' as const,
        badge: `A${i + 1}`,
        unit: r.resolved!.u,
        civ: 'Portuguese',
        age: 4,
        selectedTechs: [...r.resolved!.sel].map((id) => techById[id]!),
      })),
    );
    expect(mixUnm.map((e) => [e.badge, e.unit.id, e.mechanisms.map((m) => m.pill)])).toEqual([['A1', 5, [ARQUEBUS_PILL]]]);

    const transfer = mixedTrainingTransfer(prodCtx, mixInput, 'a', mixView);
    expect('to' in transfer).toBe(true);
    if ('to' in transfer) {
      expect(transfer.notice.omitted).toContain('火绳枪（仅影响战斗）');
    }

    // 纯非火药 [283] / [492] / [1004] 显式 573 拒收
    for (const badUid of ['283', '492', '1004']) {
      const badMix = resolveMixedSide(ctx, CORE, { civ: 'Portuguese', age: '4', techs: ['573'], team: [], rows: [{ uid: badUid, qty: '10' }] }, 'a');
      expect(
        badMix.techs.some((o) => o.t.id === 573),
        `mixed neg ${badUid}`,
      ).toBe(false);
      expect(badMix.errors).toContainEqual({ field: 'mix-a-techs', message: 'A 方科技无效或对本方全部单位不适用：573' });
    }

    // 4) 单位满科技对照（多文明 5/36/420/691 出标签并显式带 573 进 PK；单文明 1001/1003 领域层保留标签）
    for (const [uid, oppCiv] of [
      [5, 'Italians'],
      [36, 'Turks'],
      [420, 'Spanish'],
      [691, 'Spanish'],
    ] as const) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      const portRow = rank.rows.find((r) => r.civ === 'Portuguese')!;
      const oppRow = rank.rows.find((r) => r.civ === oppCiv)!;
      expect(portRow.unmodeledPills, `rank ${uid}`).toContain(ARQUEBUS_PILL);
      expect(portRow.selTechIds).not.toContain(573);
      expect(portRow.activeUnmodeledTechIds).toContain(573);
      const href = buildCivRankDuelHref(uid, portRow, oppRow, 4, rank.combatKind);
      const aParam = new URLSearchParams(href.split('?')[1]).get('a')!;
      expect(aParam).not.toContain('.f.');
      expect(aParam.split('.')[3]!.split('-').map(Number)).toContain(573);
    }
    for (const uid of [1001, 1003]) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      expect(rank.totalCivCount).toBe(1);
      expect(rank.rows[0]!.unmodeledPills).toContain(ARQUEBUS_PILL);
    }

    // 5) CivRankMechTag 三段 .nw 语义分段
    expect(splitMechTagSegments(`未计入：${ARQUEBUS_PILL}`)).toEqual([
      { text: '未计入：', spaceAfter: false },
      { text: '弹丸追踪与提速 ·', spaceAfter: true },
      { text: '火绳枪', spaceAfter: false },
    ]);
    const tagMarkup = html(createElement(CivRankMechTag, { text: `未计入：${ARQUEBUS_PILL}` }));
    expect(tagMarkup).toContain('<span class="nw">未计入：</span>');
    expect(tagMarkup).toContain('<span class="nw">弹丸追踪与提速 ·</span>');
    expect(tagMarkup).toContain('<span class="nw">火绳枪</span>');
    expect(tagMarkup.replace(/<[^>]+>/g, '')).toBe(`未计入：${ARQUEBUS_PILL}`);

    // 6) 零内部字段名/属性号泄漏
    const forbidden = /C=19|C=5|a:5|a:19|projectileGuidance|ProjectileSmartMode/i;
    for (const text of [
      ARQUEBUS_UNIT_SCOPE_NOTE,
      ARQUEBUS_BLD_SCOPE_NOTE,
      ARQUEBUS_PILL,
      ARQUEBUS_DETAIL,
      classifyTechDataConsumption(techById[573]!, false, { unitById: CORE.unitById, buildingById: CORE.buildingById }).sourceNote,
    ]) {
      expect(forbidden.test(text), `leak in: ${text}`).toBe(false);
    }
  });
});
