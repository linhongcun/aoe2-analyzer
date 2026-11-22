import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { catalogAccuracyAssumesHit, type CatalogTech } from '../../src/domain/accuracyBoundary';
import { oneReplay, replayAt } from '../../src/domain/battleReplay';
import { breakEven } from '../../src/domain/breakEven';
import { contactFighterError } from '../../src/domain/contactFight';
import { damageBreakdown } from '../../src/domain/damageBreakdown';
import {
  countForBudget,
  damageByClass,
  damagePerHit,
  DPS_UNAVAILABLE_REASON,
  duel,
  expectedHit,
  fighterCanAttack,
  fighterFrom,
  fighterUsesAssumeHit,
  groupFight,
  oneWay,
  unitHasNormalAttack,
  unitIsNonAttackingCaster,
} from '../../src/domain/duel';
import { mixedFight } from '../../src/domain/mixedFight';
import { countForTime, realCostOf } from '../../src/domain/realCost';
import { baseStats, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import type { Unit } from '../../src/domain/types';
import { upgradeCombatAvailable, upgradeComparison, type UpgradeSide } from '../../src/domain/upgradeComparison';
import { DuelUnmodeledNotes } from '../../src/features/duel/components/DuelUnmodeledNotes';
import { isUnavail, resolve, type Resolved } from '../../src/features/duel/logic/duelSide';
import { summarizeOneVOne } from '../../src/features/duel/logic/duelSummary';
import { AccuracyBoundaryNote } from '../../src/features/units/components/AccuracyBoundaryNote';
import { ctx, techs, units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u])) as Record<number, Unit>;
const catalogTechs = techs as unknown as CatalogTech[];
const ZERO_ACC_RANGED_IDS = [529, 532, 1001, 1003, 1103, 1302, 1911] as const;
const NO_ATTACK_IDS = [13, 17, 125, 128, 545, 775, 1105] as const;

const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

function resolveSide(uid: number, civ: string, age: number, techSpec: 'f' | 'c' | number[] = []): Resolved {
  const s = resolve(ctx, CORE.unitById, { uid, civ, age, ageSet: true, techs: techSpec, team: [] }, uid);
  if (isUnavail(s)) throw new Error(`unavailable fixture: ${uid} ${civ} age=${age}`);
  return s;
}

describe('#1322 单位 PK 零准确度特殊远程估算与无普通攻击单位 1v1 修正', () => {
  it('全库 248 单位清单核验：精确 7 个 0% 准确度远程单位、7 个无普通攻击单位、2 个无普攻僧侣施法单位', () => {
    const zeroAccRanged = units
      .filter((u) => unitHasNormalAttack(u) && u.rng > 1 && u.acc === 0)
      .map((u) => u.id)
      .sort((a, b) => a - b);
    expect(zeroAccRanged).toEqual([...ZERO_ACC_RANGED_IDS]);

    const noAttack = units
      .filter((u) => !unitHasNormalAttack(u))
      .map((u) => u.id)
      .sort((a, b) => a - b);
    expect(noAttack).toEqual([...NO_ATTACK_IDS]);

    const casters = units
      .filter((u) => unitIsNonAttackingCaster(u))
      .map((u) => u.id)
      .sort((a, b) => a - b);
    expect(casters).toEqual([125, 775]);

    // 7 个 0% 准确度单位在所有可用文明与满科技下均无有效准确度科技覆盖（烟火之术 902 仅意大利可用，掷弹兵 1911 仅女真可用）
    for (const id of ZERO_ACC_RANGED_IDS) {
      const u = byId[id]!;
      for (const civ of u.civs) {
        const avail = simTechs(ctx, u, civ);
        const full = simulate(ctx, u, civ, 4, presetUpTo(avail, 4, civ), new Set());
        expect(full.acc, `unit ${id} civ ${civ}`).toBe(0);
        const f = fighterFrom(u, full);
        expect(f.accuracyMode, `unit ${id} civ ${civ}`).toBe('assume-hit');
        expect(fighterUsesAssumeHit(f)).toBe(true);
      }
    }
  });

  it('全部 7 个 0% 准确度远程单位：期望每击等于每击伤害，1v1 与群战均能打出真实输出', () => {
    const archer = resolveSide(4, 'Britons', 3, []).F;
    const galley = resolveSide(539, 'Britons', 2, []).F;

    for (const id of ZERO_ACC_RANGED_IDS) {
      const u = byId[id]!;
      const civ = u.civs[0]!;
      const s = resolveSide(id, civ, u.age, []);
      const target = id === 1103 || id === 529 || id === 532 || id === 1302 ? galley : archer;

      expect(s.F.canAttack).toBe(true);
      expect(s.F.acc).toBe(0);
      expect(s.F.accuracyMode).toBe('assume-hit');
      expect(fighterUsesAssumeHit(s.F)).toBe(true);

      const perHit = damagePerHit(s.F, target);
      const exp = expectedHit(s.F, target);
      expect(perHit, `unit ${id}`).toBeGreaterThan(0);
      expect(exp, `unit ${id}`).toBe(perHit);

      const d = duel(s.F, target);
      expect(d.ab.canAttack).toBe(true);
      expect(d.ab.dmg).toBe(perHit);
      expect(d.ab.expDmg).toBe(perHit);
      expect(d.ab.dps).toBeGreaterThan(0);
      expect(d.ab.time).not.toBeNull();
      expect(Number.isFinite(d.ab.time)).toBe(true);

      const g = groupFight(s.F, 5, target, 5);
      expect(g.status, `unit ${id} groupFight`).not.toBe('error');
      if (g.status === 'error') throw new Error(g.reason);
      // 绝不因 0% 相乘而让 5 个目标无伤全活
      const targetFullHp = 5 * target.hp;
      const targetRemainingHp = g.winner === 'b' ? g.hpLeft : 0;
      expect(targetRemainingHp, `unit ${id} must damage targets`).toBeLessThan(targetFullHp);
    }
  });

  it('验收 2 & 3：5 火艨艟 vs 5 箭船在全部 6 种 PK 模式下使用同一口径，火艨艟获胜而非箭船 5 剩 550 血', () => {
    const fg = resolveSide(1103, 'Britons', 2, []);
    const gal = resolveSide(539, 'Britons', 2, []);

    // 1) 1v1
    const d1 = duel(fg.F, gal.F);
    expect(d1.ab.dmg).toBe(3);
    expect(d1.ab.expDmg).toBe(3);
    expect(d1.ab.hits).toBe(37);
    expect(d1.ab.dps).toBeCloseTo(12, 6);
    expect(d1.winner).toBe('a');

    // 2) N vs M (5 vs 5)
    const nm = groupFight(fg.F, 5, gal.F, 5);
    expect(nm.status).toBe('win');
    if (nm.status !== 'win') throw new Error(`unexpected: ${nm.status}`);
    expect(nm.winner).toBe('a');
    expect(nm.aAlive).toBe(5);
    expect(nm.bAlive).toBe(0);
    expect(nm.hpLeft).toBeCloseTo(520, 1);
    expect(nm.duration).toBeCloseTo(11.2, 1);

    // 3) 等资源 (bud = 1200)
    const naRes = countForBudget(fg.training.price.cost, 1200);
    const nbRes = countForBudget(gal.training.price.cost, 1200);
    const eqRes = groupFight(fg.F, naRes, gal.F, nbRes);
    expect(eqRes.status).toBe('win');
    if (eqRes.status === 'win') expect(eqRes.winner).toBe('a');

    // 4) 等采集时间 (10 村民 × 10 分钟)
    const naTime = Math.max(
      1,
      countForTime(realCostOf({ ...fg.disc, cost: fg.training.price.cost, exact: fg.training.price.exact }, fg.age, fg.civ).rc.total, 10, 10),
    );
    const nbTime = Math.max(
      1,
      countForTime(realCostOf({ ...gal.disc, cost: gal.training.price.cost, exact: gal.training.price.exact }, gal.age, gal.civ).rc.total, 10, 10),
    );
    const eqTime = groupFight(fg.F, naTime, gal.F, nbTime);
    expect(eqTime.status).toBe('win');
    if (eqTime.status === 'win') expect(eqTime.winner).toBe('a');

    // 5) 盈亏平衡（固定 5 箭船，能找到确定胜出的火艨艟门槛，不再 200 内无解）
    const be = breakEven(fg.F, gal.F, 5);
    expect(be.capReached).toBe(false);
    expect(be.n).not.toBeNull();
    expect(be.n!).toBeLessThanOrEqual(5);

    // 6) 混编（与 5 vs 5 群战逐字段一致）
    const mix = mixedFight([{ uid: 1103, count: 5, fighter: fg.F }], [{ uid: 539, count: 5, fighter: gal.F }]);
    expect(mix.status).toBe('win');
    if (mix.status !== 'win') throw new Error(`unexpected: ${mix.status}`);
    expect(mix.winner).toBe(nm.winner);
    expect(mix.a.total.alive).toBe(nm.aAlive);
    expect(mix.b.total.alive).toBe(nm.bAlive);
    expect(mix.a.total.hp).toBeCloseTo(nm.hpLeft, 6);
    expect(mix.duration).toBeCloseTo(nm.duration, 6);
  });

  it('验收 4：全部 7 个无普通攻击单位 1v1 不造成任何伤害，对手保持满血，群战与混编维持拒算', () => {
    const archer = resolveSide(4, 'Britons', 3, []);

    for (const id of NO_ATTACK_IDS) {
      const u = byId[id]!;
      const civ = id === 775 ? 'Spanish' : 'Britons';
      const side = resolveSide(id, civ, Math.max(3, u.age), []);

      expect(side.F.canAttack, `unit ${id}`).toBe(false);
      expect(fighterCanAttack(side.F), `unit ${id}`).toBe(false);
      expect(fighterUsesAssumeHit(side.F), `unit ${id}`).toBe(false);
      expect(side.F.attack, `unit ${id}`).toEqual({});
      expect(side.F.contact?.repeatableAttack, `unit ${id}`).toBe(false);

      expect(damageByClass(side.F, archer.F), `unit ${id}`).toEqual([]);
      expect(damagePerHit(side.F, archer.F), `unit ${id}`).toBe(0);
      expect(expectedHit(side.F, archer.F), `unit ${id}`).toBe(0);
      expect(damageBreakdown(side.F, archer.F), `unit ${id}`).toEqual({
        canAttack: false,
        rows: [],
        subtotal: 0,
        minimum: 0,
        total: 0,
        expected: 0,
      });

      const ow = oneWay(side.F, archer.F);
      expect(ow, `unit ${id}`).toEqual({
        canAttack: false,
        dmg: 0,
        expDmg: 0,
        hits: Number.POSITIVE_INFINITY,
        time: null,
        dps: null,
      });

      const d = duel(side.F, archer.F);
      expect(d.outcome, `unit ${id}`).toBe('win');
      expect(d.winner, `unit ${id}`).toBe('b');
      expect(d.remaining, `unit ${id}`).toBe(30);
      expect(d.ab.canAttack).toBe(false);
      expect(d.ba.canAttack).toBe(true);
      expect(d.ba.dmg).toBeGreaterThanOrEqual(1);

      // 僧侣 125 / 传教士 775 vs 步弓手 4 精确数值核对
      if (id === 125 || id === 775) {
        expect(d.ba.dmg).toBe(4);
        expect(d.ba.expDmg).toBeCloseTo(3.2, 6);
        expect(d.ba.hits).toBe(10);
        expect(d.ba.time).toBe(18);
        expect(d.ba.dps).toBeCloseTo(1.6, 6);
        expect(d.duration).toBe(18);
      }

      // 回放全程对手不掉血
      const frames = oneReplay(side.F, archer.F, d);
      expect(
        frames.every((f) => f.b === 30),
        `unit ${id} replay`,
      ).toBe(true);
      expect(replayAt(frames, d.duration)).toEqual({ time: d.duration, a: 0, b: 30 });

      // 群战与 #1294 单挑降级守卫：contactFighterError 仍拦截，维持既有文案
      expect(contactFighterError(side.F), `unit ${id}`).toBe('没有可重复的普通攻击。请更换该单位后重算。');
      expect(groupFight(side.F, 5, archer.F, 5)).toEqual({
        status: 'error',
        winner: null,
        reason: `A 方的${u.zh}没有可重复的普通攻击。请更换该单位后重算。`,
      });
    }
  });

  it('双方均无普通攻击不判胜负；无普攻对自爆单位不凭空判胜且保留自爆原表达', () => {
    const monk = resolveSide(125, 'Spanish', 3, []);
    const missionary = resolveSide(775, 'Spanish', 3, []);
    const fishing = resolveSide(13, 'Britons', 3, []);
    const tradeCart = resolveSide(128, 'Britons', 3, []);

    for (const [a, b] of [
      [monk, missionary],
      [monk, monk],
      [fishing, tradeCart],
    ] as const) {
      const d = duel(a.F, b.F);
      expect(d.outcome).toBe('both-no-attack');
      expect(d.winner).toBe('draw');
      expect(d.duration).toBe(0);
      expect(d.remaining).toBe(0);
      expect(d.ab.canAttack).toBe(false);
      expect(d.ba.canAttack).toBe(false);
      const summary = summarizeOneVOne(a, b, d);
      expect(summary).toEqual({
        winner: 'draw',
        icon: 'info',
        headline: '双方均无普通攻击',
        metrics: [{ prefix: '无法通过普通攻击分出胜负', value: '' }],
      });
    }

    // 爆破兵（440，25 攻，无法一击炸死 30 血僧侣）vs 僧侣：不凭空判爆破兵获胜，也不判平局同时击杀
    const petard = resolveSide(440, 'Britons', 3, []);
    const pvM = duel(petard.F, monk.F);
    expect(pvM.outcome).toBe('no-kill');
    expect(pvM.winner).toBe('draw');
    expect(pvM.ab).toMatchObject({ canAttack: true, dmg: 25, hits: 2, time: null, dps: null, dpsReason: DPS_UNAVAILABLE_REASON });
    expect(pvM.ba).toMatchObject({ canAttack: false, dmg: 0, expDmg: 0, hits: Number.POSITIVE_INFINITY, time: null, dps: null });
    expect(pvM.ba.dpsReason).toBeUndefined();
    expect(summarizeOneVOne(petard, monk, pvM)).toMatchObject({ winner: 'draw', icon: 'info', headline: '暂无法分出胜负' });
    const pvMFrames = oneReplay(petard.F, monk.F, pvM);
    expect(replayAt(pvMFrames, 0)).toEqual({ time: 0, a: 50, b: 5 });

    // 爆破筏（1104，75 攻，单发可炸死 30 血僧侣）vs 僧侣：沿用既有单发自爆判定与 DPS/用时表达
    const demoRaft = resolveSide(1104, 'Britons', 2, []);
    const dvM = duel(demoRaft.F, monk.F);
    expect(dvM.outcome).toBe('win');
    expect(dvM.winner).toBe('a');
    expect(dvM.remaining).toBe(demoRaft.F.hp);
    expect(dvM.ab).toMatchObject({ canAttack: true, hits: 1, time: null, dps: null, dpsReason: DPS_UNAVAILABLE_REASON });
  });

  it('升级前后对比：单侧无普通攻击保持 combatAvailable 并保留精确胜负与时长，双无普攻与自爆仍隐藏', () => {
    const mk = (uid: number, civ: string, age: number, techs: number[] = []): UpgradeSide => ({ uid, civ, age, techs, team: [] });
    // 拜占庭僧侣（基准 30 HP -> 圣洁 231 后 45 HP）vs 拜占庭骑士（10 攻、1.8s 间隔）：3 击 3.6s -> 5 击 7.2s
    const monkSanctity = upgradeComparison(
      ctx,
      byId,
      mk(125, 'Byzantines', 3),
      mk(125, 'Byzantines', 3, [231]),
      mk(38, 'Byzantines', 3),
      mk(38, 'Byzantines', 3),
    );
    expect(monkSanctity.ok).toBe(true);
    if (monkSanctity.ok) {
      expect(upgradeCombatAvailable(monkSanctity)).toBe(true);
      expect(monkSanctity.beforeResult.ab.canAttack).toBe(false);
      expect(monkSanctity.beforeResult.ab.hits).toBe(Number.POSITIVE_INFINITY);
      expect(monkSanctity.currentResult.ab.hits).toBe(Number.POSITIVE_INFINITY);
      expect([monkSanctity.beforeResult.winner, monkSanctity.currentResult.winner]).toEqual(['b', 'b']);
      expect(monkSanctity.beforeResult.duration).toBeCloseTo(3.6, 6);
      expect(monkSanctity.currentResult.duration).toBeCloseTo(7.2, 6);
      expect([monkSanctity.beforeResult.remaining, monkSanctity.currentResult.remaining]).toEqual([100, 100]);
    }

    // 拜占庭骑士（基准 -> 锻造 67）vs 拜占庭僧侣 / 渔船：单侧无普攻同样可比较胜负与时长
    for (const targetUid of [125, 13] as const) {
      const kVsNoAtk = upgradeComparison(
        ctx,
        byId,
        mk(38, 'Byzantines', 3),
        mk(38, 'Byzantines', 3, [67]),
        mk(targetUid, 'Byzantines', 3),
        mk(targetUid, 'Byzantines', 3),
      );
      expect(kVsNoAtk.ok, `target ${targetUid}`).toBe(true);
      if (kVsNoAtk.ok) {
        expect(upgradeCombatAvailable(kVsNoAtk), `target ${targetUid}`).toBe(true);
        expect(kVsNoAtk.beforeResult.ba.canAttack).toBe(false);
        expect(kVsNoAtk.beforeResult.ba.hits).toBe(Number.POSITIVE_INFINITY);
        expect([kVsNoAtk.beforeResult.winner, kVsNoAtk.currentResult.winner]).toEqual(['a', 'a']);
        expect([kVsNoAtk.beforeResult.remaining, kVsNoAtk.currentResult.remaining]).toEqual([100, 100]);
      }
    }

    // 双方无普攻 / 爆破兵 vs 僧侣 / 爆破筏（单发自爆）vs 僧侣 / 烈焰骆驼 vs 骑士：combatAvailable 均为 false
    const hiddenCases: [UpgradeSide, UpgradeSide, UpgradeSide][] = [
      [mk(125, 'Byzantines', 3), mk(125, 'Byzantines', 3, [231]), mk(125, 'Byzantines', 3)],
      [mk(440, 'Byzantines', 3), mk(440, 'Byzantines', 3), mk(125, 'Byzantines', 3)],
      [mk(1104, 'Byzantines', 2), mk(1104, 'Byzantines', 2), mk(13, 'Byzantines', 2)],
      [mk(1263, 'Tatars', 4), mk(1263, 'Tatars', 4), mk(38, 'Byzantines', 3)],
    ];
    for (const [b0, c1, opp] of hiddenCases) {
      const res = upgradeComparison(ctx, byId, b0, c1, opp, opp);
      expect(res.ok).toBe(true);
      if (res.ok) expect(upgradeCombatAvailable(res)).toBe(false);
    }
  });

  it('验收 5 & #1323 交叉核验：常规远程仍乘准确度，近战保底 1 伤，显式零攻击遇负护甲叠加且按全中估算', () => {
    // 常规远程：步弓手 80% 仍乘准确度
    const archer = resolveSide(4, 'Britons', 3, []).F;
    const knight = resolveSide(38, 'Franks', 3, []).F;
    expect(archer.accuracyMode).toBe('catalog');
    expect(fighterUsesAssumeHit(archer)).toBe(false);
    expect(expectedHit(archer, knight)).toBeCloseTo(damagePerHit(archer, knight) * 0.8, 6);

    // 近战保底 1 伤
    const villager = resolveSide(83, 'Britons', 3, []).F;
    const tk = resolveSide(554, 'Teutons', 4, 'f').F;
    expect(damagePerHit(villager, tk)).toBe(1);
    expect(expectedHit(villager, tk)).toBe(1);

    // #1323 交叉验证：火艨艟含显式 ['船只', 0]，遇负船只护甲目标累加额外伤害且 expectedHit 不再乘 0
    const fg = resolveSide(1103, 'Britons', 2, []).F;
    const negShipTarget = { ...resolveSide(539, 'Britons', 2, []).F, armor: { 近战: 0, 穿刺: 3, 船只: -2, 远程战船: 0 } };
    // 近战 2 - 0 = 2，船只 0 - (-2) = 2，远程战船 1 - 0 = 1 → 合计 5
    expect(damagePerHit(fg, negShipTarget)).toBe(5);
    expect(expectedHit(fg, negShipTarget)).toBe(5);

    // #1323 原用例不回归：掷矛手 7 vs 精锐骑象射手 875 仍是 7 / 6.3
    const sk = fighterFrom(byId[7]!, baseStats(byId[7]!));
    const ele = fighterFrom(byId[875]!, baseStats(byId[875]!));
    expect(damagePerHit(sk, ele)).toBe(7);
    expect(expectedHit(sk, ele)).toBeCloseTo(6.3, 6);
  });

  it('验收 6 & 7：单位详情准确度文案与 DuelUnmodeledNotes 并存/独立呈现精准对齐设计稿', () => {
    // 7 个 0% 单位详情改写 PK 口径，保留目录 0%
    for (const id of ZERO_ACC_RANGED_IDS) {
      expect(catalogAccuracyAssumesHit(byId[id]!)).toBe(true);
      const rendered = html(createElement(AccuracyBoundaryNote, { unit: byId[id]!, techs: catalogTechs }));
      expect(rendered, `unit ${id}`).toContain('data-accuracy="percent">0%</span>');
      expect(rendered, `unit ${id}`).toContain('不表示打不中。单位 PK 把每次主弹都算作命中主目标，这是主弹对单个目标的输出上限。');
      expect(rendered, `unit ${id}`).not.toContain('进入单位 PK 的期望命中');
    }
    // 常规远程维持原文
    for (const id of [4, 539, 46, 331]) {
      expect(catalogAccuracyAssumesHit(byId[id]!)).toBe(false);
      const rendered = html(createElement(AccuracyBoundaryNote, { unit: byId[id]!, techs: catalogTechs }));
      expect(rendered, `unit ${id}`).toContain('进入单位 PK 的期望命中');
    }

    // 图 1 独立态：火艨艟 vs 箭船只渲染蓝色按每击命中估算卡，无未计入机制告警
    const fgNotes = html(
      createElement(DuelUnmodeledNotes, {
        group: true,
        entries: [
          { side: 'a', badge: 'A', unit: byId[1103]!, civ: 'Britons', age: 2, selectedTechs: [], assumeHit: true },
          { side: 'b', badge: 'B', unit: byId[539]!, civ: 'Britons', age: 2, selectedTechs: [], assumeHit: false },
        ],
        vgSides: [],
      }),
    );
    expect(fgNotes).toContain('data-t="pk-assume-hit"');
    expect(fgNotes).toContain('A 方火艨艟 · 按每击命中估算');
    expect(fgNotes).not.toContain('data-t="pk-unmodeled"');

    // 图 2 并存态：风琴炮 + 掷弹兵在未计入机制卡内首段给出主弹估算上限，独立换段保留额外弹丸/波及伤害
    const coexist = html(
      createElement(DuelUnmodeledNotes, {
        group: true,
        entries: [
          { side: 'a', badge: 'A', unit: byId[1001]!, civ: 'Portuguese', age: 3, selectedTechs: [], assumeHit: true },
          { side: 'b', badge: 'B', unit: byId[1911]!, civ: 'Jurchens', age: 3, selectedTechs: [], assumeHit: true },
        ],
        vgSides: [],
      }),
    );
    expect(coexist).toContain('data-t="pk-unmodeled"');
    expect(coexist).not.toContain('data-t="pk-assume-hit"');
    expect(coexist).toContain('主弹 · 按每击命中估算：');
    expect(coexist).toContain('额外弹丸未计入：');
    expect(coexist).toContain('额外弹丸造成的伤害未计入；因此上面的上限只指主弹对单个目标。');
    expect(coexist).toContain('波及伤害未计入：');
    expect(coexist).toContain('落点周围受波及的伤害未计入；因此上面的上限只指主弹对单个目标。');
  });
});
