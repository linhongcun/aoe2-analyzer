import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { civByEn } from '../../src/data';
import { CORE } from '../../src/data/core';
import { ageComparison } from '../../src/domain/ageComparison';
import { bonusLevel } from '../../src/domain/bonusUsage';
import { bonusAffects, bonusExample, civBonuses } from '../../src/domain/civBonus';
import { damageSources } from '../../src/domain/damageBreakdown';
import { canonDuelRelics, decodeDuelRelics } from '../../src/domain/duelParams';
import { activeRelicBonus, BONUS_SRC, bonusCoverage, CIV_BONUSES, civRelicBonus, unitRelicBonus } from '../../src/domain/effects';
import { decodeMixedDuel, encodeMixedDuel, mixedRawRelicsDirty } from '../../src/domain/mixedDuelParams';
import { MIXED_RULE } from '../../src/domain/mixedFight';
import { parseRelicCount, readQueryRelics, sameSearchIgnoringRelics, stripQueryRelics, withQueryRelics } from '../../src/domain/relicParams';
import { allNumeric, simTechs, simulate } from '../../src/domain/simulator';
import { replaceUnitCiv } from '../../src/domain/unitDetailView';
import { upgradeComparison, upgradePlan } from '../../src/domain/upgradeComparison';
import { buildEnterMixedParams, formatBreakEvenSide } from '../../src/features/duel/logic/duelKiteView';
import { resolve, type Resolved } from '../../src/features/duel/logic/duelSide';
import { swapSingleDuelParams } from '../../src/features/duel/logic/duelSwap';
import { mixedSideRelicMatchedUnits, resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { advanceUnitSimReturnState, createUnitSimReturnState, readUnitSimReturnSource } from '../../src/features/units/unitSimReturnProvenance';
import { BonusBodyContent } from '../../src/shared/ui/BonusBody';
import { ctx } from './helpers';

const byId = CORE.unitById;

function resolveMust(uid: number, civ: string, age: number, techs: 'f' | 'c' | number[] = 'f', relics = 0): Resolved {
  const res = resolve(ctx, byId, { uid, civ, age, ageSet: true, techs, team: [] }, uid, relics);
  if ('unavail' in res) throw new Error(`Unit ${uid} unavailable for ${civ}`);
  return res;
}

describe('#1383 立陶宛圣物加攻：数据隔离、模拟器、单位 PK、混编与加成百科', () => {
  it('常驻加成与条件加成严格隔离；目标单位按 .dat 推导且排除不可造萨瓦尔', () => {
    const paladin = byId[569]!;
    const leitis = byId[1236]!;
    const savar = byId[1813]!;
    const halberdier = byId[359]!;

    // 常驻 CIV_BONUSES 不含圣物加攻
    const permHitsPaladin = (CIV_BONUSES['Lithuanians'] ?? []).filter(([pred]) => pred(paladin));
    expect(permHitsPaladin).toHaveLength(0);
    expect(BONUS_SRC['Lithuanians']?.['2']).toBe('dat');
    expect(bonusCoverage().manual).toBe(0);

    const ltBonus = civRelicBonus('Lithuanians');
    expect(ltBonus).not.toBeNull();
    expect(ltBonus!.minAge).toBe(3);
    expect(ltBonus!.maxRelics).toBe(4);
    expect(ltBonus!.perRelicAtk).toBe(1);
    expect(ltBonus!.maxAtk).toBe(4);

    // 命中立陶宛骑士系与烈堤司（38/283/569/1234/1236），排除萨瓦尔 1813 与非目标单位/文明
    for (const id of [38, 283, 569, 1234, 1236]) {
      expect(unitRelicBonus('Lithuanians', byId[id]!), `uid=${id}`).not.toBeNull();
    }
    expect(unitRelicBonus('Lithuanians', savar)).toBeNull();
    expect(unitRelicBonus('Lithuanians', halberdier)).toBeNull();
    expect(unitRelicBonus('Franks', paladin)).toBeNull();
    expect(unitRelicBonus('Lithuanians', leitis)).not.toBeNull();
  });

  it('0–4 件档位、低时代门控与 damageSources 单行合并来源', () => {
    const paladin = byId[569]!;
    const leitis = byId[1236]!;
    const fullPaladin = allNumeric(simTechs(ctx, paladin, 'Lithuanians'));
    const fullLeitis = allNumeric(simTechs(ctx, leitis, 'Lithuanians'));

    // 0 件为基线（立陶宛无鼓风炉：游侠 14+2=16，精锐烈堤司 16+2=18），1–4 逐档 +1，超界钳位 4
    expect(simulate(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set()).atk).toBe(16);
    expect(simulate(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set(), undefined, 0).atk).toBe(16);
    expect(simulate(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set(), undefined, 1).atk).toBe(17);
    expect(simulate(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set(), undefined, 2).atk).toBe(18);
    expect(simulate(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set(), undefined, 3).atk).toBe(19);
    expect(simulate(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set(), undefined, 4).atk).toBe(20);
    expect(simulate(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set(), undefined, 99).atk).toBe(20);

    expect(simulate(ctx, leitis, 'Lithuanians', 4, fullLeitis, new Set(), undefined, 0).atk).toBe(18);
    expect(simulate(ctx, leitis, 'Lithuanians', 4, fullLeitis, new Set(), undefined, 2).atk).toBe(20);
    expect(simulate(ctx, leitis, 'Lithuanians', 4, fullLeitis, new Set(), undefined, 4).atk).toBe(22);

    // 低于城堡时代（age=2）门控：不生效、不写入 trace
    expect(activeRelicBonus('Lithuanians', byId[38]!, 2, 3)).toBeNull();
    expect(simulate(ctx, byId[38]!, 'Lithuanians', 2, new Set(), new Set(), undefined, 3).atk).toBe(byId[38]!.atk);
    const traceAge2 = damageSources(ctx, byId[38]!, 'Lithuanians', 2, new Set(), new Set(), 3);
    expect(traceAge2.sources.some((s) => s.source.includes('驻守圣物'))).toBe(false);

    // 0 件不写入 trace；2 件合并为单行排在科技之前
    const trace0 = damageSources(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set(), 0);
    expect(trace0.sources.some((s) => s.source.includes('驻守圣物'))).toBe(false);

    const trace2 = damageSources(ctx, paladin, 'Lithuanians', 4, fullPaladin, new Set(), 2);
    const relicIdx = trace2.sources.findIndex((s) => s.source === '文明加成：驻守圣物 2 件（每件 +1，最多 +4）');
    const firstTechIdx = trace2.sources.findIndex((s) => s.source.startsWith('科技：'));
    expect(relicIdx).toBe(0);
    expect(firstTechIdx).toBeGreaterThan(relicIdx);
    expect(trace2.sources.filter((s) => s.source.includes('驻守圣物'))).toHaveLength(1);
    expect(trace2.sources[relicIdx]!.changes).toEqual([{ stat: '攻击', before: 14, after: 16 }]);
  });

  it('relicParams / replaceUnitCiv / unitSimReturnProvenance 隐式文明与编码保持', () => {
    expect(parseRelicCount('0')).toBe(0);
    expect(parseRelicCount('4')).toBe(4);
    for (const bad of ['-1', '02', '+2', '2.5', ' 2 ', '1e1', '5', '', null, 2]) {
      expect(parseRelicCount(bad), String(bad)).toBe(0);
    }

    expect(readQueryRelics('?tab=sim')).toEqual({ value: 0, dirty: false });
    expect(readQueryRelics('?tab=sim&relics=2')).toEqual({ value: 2, dirty: false });
    expect(readQueryRelics('?tab=sim&relics=0')).toEqual({ value: 0, dirty: true });
    expect(readQueryRelics('?tab=sim&relics=2&relics=3')).toEqual({ value: 0, dirty: true });
    expect(readQueryRelics('?tab=sim&relics=2', 0)).toEqual({ value: 0, dirty: true });

    // 保留非 relics 参数顺序、重复键与 %23 编码
    const raw = '?foo=a%23b&foo=2&tab=sim';
    expect(withQueryRelics(raw, 3)).toBe('?foo=a%23b&foo=2&tab=sim&relics=3');
    expect(withQueryRelics('?foo=a%23b&relics=1&foo=2&relics=4', 2)).toBe('?foo=a%23b&relics=2&foo=2');
    expect(stripQueryRelics('?foo=a%23b&relics=2&foo=2')).toBe('?foo=a%23b&foo=2');
    expect(sameSearchIgnoringRelics('?foo=a%23b&foo=2&tab=sim', '?foo=a%23b&foo=2&tab=sim&relics=3')).toBe(true);

    // replaceUnitCiv 换文明或清空删 relics；同文明保留
    expect(replaceUnitCiv('/unit/569/Lithuanians/4', '?tab=sim&relics=2', 'Franks')).toEqual({
      pathname: '/unit/569/Franks/4',
      search: '?tab=sim',
    });
    expect(replaceUnitCiv('/unit/569/Lithuanians/4', '?tab=sim&relics=2', '')).toEqual({
      pathname: '/unit/569',
      search: '?tab=sim',
    });
    expect(replaceUnitCiv('/unit/569/Lithuanians/4', '?tab=sim&relics=2', 'Lithuanians')).toEqual({
      pathname: '/unit/569/Lithuanians/4',
      search: '?tab=sim&relics=2',
    });

    // 隐式文明（精锐烈堤司 1236，sourceCiv=null, expectedCiv=null）纯 search 切换 relics 保持返回来源
    const leitisCivs = byId[1236]!.civs;
    const src = { pathname: '/unit/1236', search: '?foo=a%23b&foo=2', hash: '' };
    const dst = { pathname: '/unit/1236', search: '?foo=a%23b&foo=2&tab=sim', hash: '' };
    const st0 = createUnitSimReturnState(src, dst, 1236, leitisCivs);
    // 默认 maxRelics=0 拒绝（守住 #1053）
    const dstRelic2 = { pathname: '/unit/1236', search: '?foo=a%23b&foo=2&tab=sim&relics=2', hash: '' };
    expect(advanceUnitSimReturnState(st0, dst, dstRelic2, 1236, leitisCivs, 'Lithuanians')).toBeUndefined();
    // 传入 maxRelics=4 允许并保持隐式 expectedCiv=null
    const st1 = advanceUnitSimReturnState(st0, dst, dstRelic2, 1236, leitisCivs, 'Lithuanians', 4);
    expect(st1).toBeDefined();
    expect(readUnitSimReturnSource(st1, dstRelic2, 1236, leitisCivs)).toEqual(src);
    // 切回 0 件（省略 relics）仍保持返回来源
    const st2 = advanceUnitSimReturnState(st1, dstRelic2, dst, 1236, leitisCivs, 'Lithuanians', 4);
    expect(readUnitSimReturnSource(st2, dst, 1236, leitisCivs)).toEqual(src);

    // 共享单位（游侠 569）经会话记忆继承立陶宛时，选正数圣物把路径写成显式文明，同时仍保留返回原无文明概览的来源
    const paladinCivs = byId[569]!.civs;
    const pSrc = { pathname: '/unit/569', search: '', hash: '' };
    const pDst = { pathname: '/unit/569', search: '?tab=sim', hash: '' };
    const pSt0 = createUnitSimReturnState(pSrc, pDst, 569, paladinCivs);
    const pDstExplicit = { pathname: '/unit/569/Lithuanians/4/', search: '?tab=sim&relics=3', hash: '' };
    const pSt1 = advanceUnitSimReturnState(pSt0, pDst, pDstExplicit, 569, paladinCivs, 'Lithuanians', 4);
    expect(pSt1).toBeDefined();
    expect(readUnitSimReturnSource(pSt1, pDstExplicit, 569, paladinCivs, 'Lithuanians')).toEqual(pSrc);
  });

  it('单兵 PK URL / swap / AgeComparison / UpgradeComparison 联动', () => {
    const sp = new URLSearchParams('a=569.Lithuanians.4.f.&b=569.Franks.4.f.&m=1&ra=3&rb=2');
    expect(decodeDuelRelics(sp)).toEqual({ a: 3, b: 2 });
    expect(decodeDuelRelics(new URLSearchParams('ra=1&ra=2&rb=5'))).toEqual({ a: 0, b: 0 });
    // 冷加载（maxBySide=undefined）保留合法 ra/rb；就绪后清除不命中的 rb
    expect(canonDuelRelics(sp, { a: 3, b: 2 }).toString()).toContain('ra=3&rb=2');
    const cleaned = canonDuelRelics(sp, { a: 3, b: 2 }, { a: 4, b: 0 });
    expect(cleaned.get('ra')).toBe('3');
    expect(cleaned.get('rb')).toBeNull();

    const a = resolveMust(569, 'Lithuanians', 4, 'f', 3);
    const b = resolveMust(569, 'Franks', 4, 'f', 0);
    const swapped = swapSingleDuelParams(new URLSearchParams('a=569.Lithuanians.4.f.&b=569.Franks.4.f.&m=1&ra=3'), a, b, {
      mode: '1',
      na: 10,
      nb: 10,
      bud: 3000,
      vils: 10,
      mins: 5,
    });
    expect(swapped.get('ra')).toBeNull();
    expect(swapped.get('rb')).toBe('3');
    expect(formatBreakEvenSide(a)).toContain('驻守 3 件圣物');

    // AgeComparison：城堡与帝王计入圣物，封建回溯不存在骑士且低于城堡时代不计
    const ages0 = ageComparison(ctx, byId, { uid: 569, civ: 'Lithuanians', team: [], relics: 0 }, { uid: 569, civ: 'Franks', team: [], relics: 0 });
    const ages2 = ageComparison(ctx, byId, { uid: 569, civ: 'Lithuanians', team: [], relics: 2 }, { uid: 569, civ: 'Franks', team: [], relics: 0 });
    expect(ages2[2]!.a!.stats.atk - ages0[2]!.a!.stats.atk).toBe(2);
    expect(ages2[3]!.a!.stats.atk - ages0[3]!.a!.stats.atk).toBe(2);

    // UpgradeComparison：sameContext 区分 relics，upgradePlan 归一化并应用
    const p0 = upgradePlan(ctx, byId, { uid: 569, civ: 'Lithuanians', age: 4, techs: [], team: [], relics: 2 });
    expect(p0.ok).toBe(true);
    if (p0.ok) {
      expect(p0.S.atk).toBe(16);
      expect(p0.spec.relics).toBe(2);
    }
    const cmpOk = upgradeComparison(
      ctx,
      byId,
      { uid: 569, civ: 'Lithuanians', age: 4, techs: [], team: [], relics: 2 },
      { uid: 569, civ: 'Lithuanians', age: 4, techs: [67], team: [], relics: 2 },
      { uid: 569, civ: 'Franks', age: 4, techs: 'f', team: [] },
      { uid: 569, civ: 'Franks', age: 4, techs: 'f', team: [] },
    );
    expect(cmpOk.ok).toBe(true);
    if (cmpOk.ok) {
      expect(cmpOk.before.S.atk).toBe(16);
      expect(cmpOk.current.S.atk).toBe(17);
    }
    const cmpMismatch = upgradeComparison(
      ctx,
      byId,
      { uid: 569, civ: 'Lithuanians', age: 4, techs: [], team: [], relics: 0 },
      { uid: 569, civ: 'Lithuanians', age: 4, techs: [67], team: [], relics: 2 },
      { uid: 569, civ: 'Franks', age: 4, techs: 'f', team: [] },
      { uid: 569, civ: 'Franks', age: 4, techs: 'f', team: [] },
    );
    expect(cmpMismatch.ok).toBe(false);
    if (!cmpMismatch.ok) expect(cmpMismatch.reason).toContain('圣物数');
    const cmpBMismatch = upgradeComparison(
      ctx,
      byId,
      { uid: 569, civ: 'Franks', age: 4, techs: [], team: [] },
      { uid: 569, civ: 'Franks', age: 4, techs: [67], team: [] },
      { uid: 569, civ: 'Lithuanians', age: 4, techs: 'f', team: [], relics: 1 },
      { uid: 569, civ: 'Lithuanians', age: 4, techs: 'f', team: [], relics: 3 },
    );
    expect(cmpBMismatch.ok).toBe(false);
  });

  it('混编对战协议容错、仅命中行生效、去重与单兵互转', () => {
    const base = {
      rule: MIXED_RULE,
      data: 'DE-188329',
      a: {
        civ: 'Lithuanians',
        age: '4',
        techs: [],
        team: [],
        rows: [
          { uid: '1236', qty: '15' },
          { uid: '569', qty: '10' },
          { uid: '359', qty: '5' },
        ],
        relics: '2',
      },
      b: { civ: 'Franks', age: '4', techs: [], team: [], rows: [{ uid: '569', qty: '15' }] },
    };
    const encoded = encodeMixedDuel(base);
    const decoded = decodeMixedDuel(encoded);
    expect(Object.keys(decoded).sort()).toEqual(['errors', 'input', 'legacy', 'sharedErrors', 'sideErrors']);
    expect(decoded.errors).toEqual([]);
    expect(decoded.input.a.relics).toBe('2');
    expect(decoded.input.b.relics).toBeUndefined();
    expect(mixedRawRelicsDirty(encoded)).toBe(false);

    // 非法 relics 绝不触发协议错误，由 mixedRawRelicsDirty 标记静默清理
    const badRelicParams = new URLSearchParams({
      m: 'mix',
      rule: MIXED_RULE,
      data: 'DE-188329',
      ma: JSON.stringify({ ...base.a, relics: '9' }),
      mb: JSON.stringify({ ...base.b, relics: 0 }),
    });
    const decodedBad = decodeMixedDuel(badRelicParams);
    expect(decodedBad.errors).toEqual([]);
    expect(decodedBad.input.a.relics).toBeUndefined();
    expect(decodedBad.input.b.relics).toBeUndefined();
    expect(mixedRawRelicsDirty(badRelicParams)).toBe(true);

    // 仅命中行吃 +2 攻击，长戟兵 359 不变
    const viewA = resolveMixedSide(ctx, CORE, base.a, 'a');
    expect(viewA.errors).toEqual([]);
    expect(viewA.rows[0]!.resolved!.S.atk).toBe(18); // 精锐烈堤司 16+2
    expect(viewA.rows[1]!.resolved!.S.atk).toBe(16); // 游侠 14+2
    expect(viewA.rows[2]!.resolved!.S.atk).toBe(byId[359]!.atk); // 长戟兵不变

    // 命中单位名单去重 & 低时代不依赖 resolved
    const lowAgeView = resolveMixedSide(
      ctx,
      CORE,
      {
        civ: 'Lithuanians',
        age: '2',
        techs: [],
        team: [],
        rows: [
          { uid: '1236', qty: '5' },
          { uid: '1236', qty: '5' },
        ],
        relics: '3',
      },
      'a',
    );
    expect(lowAgeView.rows[0]!.resolved).toBeUndefined();
    expect(mixedSideRelicMatchedUnits('Lithuanians', lowAgeView.rows)).toEqual(['精锐烈堤司']);

    // 单兵进入混编保留 relics
    const leitis2 = resolveMust(1236, 'Lithuanians', 4, 'f', 2);
    const franks0 = resolveMust(569, 'Franks', 4, 'f', 0);
    const enterParams = buildEnterMixedParams(leitis2, franks0, 'n', { na: 10, nb: 10, cntA: null, cntB: null }, { a: false, b: false });
    expect(decodeMixedDuel(enterParams).input.a.relics).toBe('2');
    expect(decodeMixedDuel(enterParams).input.b.relics).toBeUndefined();
  });

  it('加成百科与文明弹窗双变体：保留已计入、条件说明、0–4 件示例与原始条件（无资源号 7）', () => {
    const lt = civByEn('Lithuanians')!;
    const bonus2 = civBonuses(lt)[2]!;
    expect(bonus2.encoded).toBe(true);
    expect(bonus2.src).toBe('dat');
    expect(bonusLevel(bonus2)).toBe('all');
    expect(bonus2.relicFx).toBeDefined();

    const aff = bonusAffects(bonus2, CORE.units, CORE.buildings);
    const affIds = aff.flatMap((g) => g.rows.flatMap((r) => r.units.map((u) => u.id))).sort((a, b) => a - b);
    expect(affIds).toEqual([38, 283, 569, 1234, 1236]);

    const ex = bonusExample(bonus2, CORE.units, CORE.buildings);
    expect(ex?.id).toBe(569);
    expect(ex?.relicRows).toEqual([
      { relics: 0, stat: 'atk', before: 14, after: 14 },
      { relics: 1, stat: 'atk', before: 14, after: 15 },
      { relics: 2, stat: 'atk', before: 14, after: 16 },
      { relics: 3, stat: 'atk', before: 14, after: 17 },
      { relics: 4, stat: 'atk', before: 14, after: 18 },
    ]);

    for (const variant of ['default', 'evidence'] as const) {
      const html = renderToStaticMarkup(
        createElement(StaticRouter, { location: '/civ/Lithuanians' }, createElement(BonusBodyContent, { b: bonus2, core: CORE, variant })),
      );
      expect(html, variant).toContain('data-t="bonus-relic-condition-note"');
      expect(html, variant).toContain('条件计入');
      expect(html, variant).toContain('/unit/569/Lithuanians/4/?civ=Lithuanians&amp;tab=sim');
      expect(html, variant).toContain('/duel?a=569.Lithuanians.4.f.&amp;b=569.Franks.4.f.&amp;m=1');
      expect(html, variant).toContain('按驻守圣物件数，城堡时代起');
      expect(html, variant).toContain('驻守 0 件');
      expect(html, variant).toContain('14（默认）');
      expect(html, variant).toContain('驻守 4 件');
      expect(html, variant).toContain('驻守圣物 ≥');
      expect(html, variant).not.toContain('资源7');
      expect(html, variant).not.toContain('游戏资源 #7');
    }
  });
});
