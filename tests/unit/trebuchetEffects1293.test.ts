import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { CORE } from '../../src/data/core';
import { armyResearchChoices, emptyArmyCost } from '../../src/domain/armyCost';
import { civStatus } from '../../src/domain/civStatus';
import { DAT } from '../../src/domain/datEffects';
import { productionTechs } from '../../src/domain/production';
import { allNumeric, makeSimContext, simTechs, simulate } from '../../src/domain/simulator';
import { applyTechCivFilter, techEffectEntries } from '../../src/domain/techDetailView';
import { unitCost } from '../../src/domain/unitCost';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { fmtStat } from '../../src/shared/utils/simFormat';
import { trees } from './helpers';

const sim = makeSimContext(CORE.techs, trees);
const prodCtx = { core: CORE, trees };
const trebuchet = CORE.unitById[331]!;

describe('#1293 巨型投石机 331 在战狼号（461）与弹射器（59）中的映射与下游边界', () => {
  it('effects.json 中战狼号（461）与弹射器（59）正确命中 331 且无重复目标', () => {
    const warwolf = DAT.techs.Warwolf!;
    expect(warwolf.id).toBe(461);
    expect(warwolf.rules).toEqual([{ t: [331, 1942], fx: [{ op: 'set', s: 'acc', v: 100 }] }]);
    expect(warwolf.eco).toContainEqual({ a: 22, op: 'add', v: 0.5, t: [331], cls: null, unit: 331 });
    expect(warwolf.eco.filter((e) => e.t?.includes(331))).toHaveLength(1);

    const kataparuto = DAT.techs.Kataparuto!;
    expect(kataparuto.id).toBe(59);
    expect(kataparuto.rules).toEqual([{ t: [331, 1923, 1942], fx: [{ s: 'rof', v: 0.333333 }] }]);
    expect(kataparuto.eco).toEqual([{ a: 13, op: 'mul', v: 4, t: [331], cls: null, unit: 331 }]);

    for (const rule of [...warwolf.rules, ...kataparuto.rules]) {
      expect(new Set(rule.t).size).toBe(rule.t.length);
    }
  });

  it('无关科技 Torsion Engines（575）与 Drill（6）不含 331，匈奴巨投保持 92% 不出现 127% 失真', () => {
    for (const name of ['Torsion Engines', 'Drill'] as const) {
      const entry = DAT.techs[name]!;
      expect(entry.rules.some((r) => r.t.includes(331))).toBe(false);
      expect(entry.eco.some((e) => e.t?.includes(331))).toBe(false);
    }
    const hunsSim = simulate(sim, trebuchet, 'Huns', 4, allNumeric(simTechs(sim, trebuchet, 'Huns')), new Set());
    expect(hunsSim.acc).toBe(92);
    const hunsMixed = resolveMixedSide(sim, CORE, { civ: 'Huns', age: '4', techs: [], team: [], rows: [{ uid: '331', qty: '2' }] }, 'a');
    expect(hunsMixed.errors).toEqual([]);
  });

  it('模拟器实算：不列颠 331 + 战狼号准确度 100%，日本 331 + 弹射器攻击间隔 7.50s', () => {
    const britTechs = simTechs(sim, trebuchet, 'Britons');
    expect(britTechs.find(({ t }) => t.id === 461)?.ef).toEqual([{ s: 'acc', op: 'set', v: 100 }]);
    const britBase = simulate(sim, trebuchet, 'Britons', 4, new Set(), new Set());
    const britWarwolf = simulate(sim, trebuchet, 'Britons', 4, new Set([461]), new Set());
    const britFull = simulate(sim, trebuchet, 'Britons', 4, allNumeric(britTechs), new Set());
    expect(britBase.acc).toBe(92);
    expect(britWarwolf.acc).toBe(100);
    expect(britFull).toMatchObject({ atk: 201, rng: 17, los: 20, acc: 100, bonus: { 所有建筑: 300 } });

    const jpTechs = simTechs(sim, trebuchet, 'Japanese');
    expect(jpTechs.find(({ t }) => t.id === 59)?.ef).toEqual([{ s: 'rof', v: 0.333333 }]);
    const jpBase = simulate(sim, trebuchet, 'Japanese', 4, new Set(), new Set());
    const jpKata = simulate(sim, trebuchet, 'Japanese', 4, new Set([59]), new Set());
    expect(jpBase.rof).toBe(10);
    expect(jpKata.rof).toBeCloseTo(7.5, 4);
    expect(fmtStat('rof', jpKata.rof)).toBe('7.50s');
  });

  it('科技详情作用对象与文明筛选：461（Britons）和 59（Japanese）均命中巨型投石机 331', () => {
    const known = civs.map((c) => c.en);
    const warwolf = CORE.techById[461]!;
    const warwolfEntries = techEffectEntries(warwolf, CORE.units, CORE.buildings);
    const britFilter = applyTechCivFilter('Britons', warwolf.civs, known, warwolfEntries, civStatus(trees, 'Britons'));
    expect(britFilter.kind).toBe('narrowed');
    expect(britFilter.entries.flatMap((e) => e.units.map((u) => u.id))).toEqual([331]);

    const kataparuto = CORE.techById[59]!;
    const kataEntries = techEffectEntries(kataparuto, CORE.units, CORE.buildings);
    const jpFilter = applyTechCivFilter('Japanese', kataparuto.civs, known, kataEntries, civStatus(trees, 'Japanese'));
    expect(jpFilter.kind).toBe('narrowed');
    expect(jpFilter.entries.flatMap((e) => e.units.map((u) => u.id))).toEqual([331]);
  });

  it('全量 56 文明回归：不存在「非空单位 t[] 的独特科技对所属文明命中 0 个可用单位」', () => {
    expect(civs).toHaveLength(56);
    const uniqueTechs = CORE.techs.filter((t) => t.type === 'UniqueTech');
    expect(uniqueTechs.length).toBeGreaterThanOrEqual(112);

    const zeroHits: { id: number; en: string; civs: string[]; targets: number[] }[] = [];
    for (const tech of uniqueTechs) {
      const entry = DAT.techs[tech.en];
      if (!entry) continue;
      const targetUnits = new Set<number>([
        ...entry.rules.filter((r) => !r.b).flatMap((r) => r.t),
        ...entry.eco.flatMap((e) => e.t ?? []).filter((id) => Boolean(CORE.unitById[id])),
      ]);
      if (!targetUnits.size) continue;
      const matched = tech.civs.some((civ) => {
        const st = civStatus(trees, civ);
        return [...targetUnits].some((uid) => st['u' + uid] === 1 || CORE.unitById[uid]?.civs.includes(civ));
      });
      if (!matched) zeroHits.push({ id: tech.id, en: tech.en, civs: tech.civs, targets: [...targetUnits].sort((a, b) => a - b) });
    }
    expect(zeroHits).toEqual([]);
  });

  it('下游边界：unitCost / productionTechs / armyResearchChoices 无副作用，日本混编带 59 触发 fail-closed 且取消后可带入', () => {
    const warwolf = CORE.techById[461]!;
    const kataparuto = CORE.techById[59]!;

    const britCost = unitCost(trebuchet, 'Britons', 4, [{ id: warwolf.id, en: warwolf.en, zh: warwolf.zh }]);
    expect(britCost.cost).toEqual({ Wood: 200, Gold: 200 });
    expect(britCost.appliedTechs).toEqual([]);
    expect(britCost.undecoded).toEqual([]);

    const jpCost = unitCost(trebuchet, 'Japanese', 4, [{ id: kataparuto.id, en: kataparuto.en, zh: kataparuto.zh }]);
    expect(jpCost.cost).toEqual({ Wood: 200, Gold: 200 });
    expect(jpCost.appliedTechs).toEqual([]);
    expect(jpCost.undecoded).toEqual([]);

    expect(productionTechs(prodCtx, { civ: 'Britons', age: 4 }).map((t) => t.id)).not.toContain(461);
    expect(productionTechs(prodCtx, { civ: 'Japanese', age: 4 }).map((t) => t.id)).not.toContain(59);

    expect(armyResearchChoices(prodCtx, { ...emptyArmyCost('Britons'), rows: [{ unit: 331, qty: '1' }] })).toContain(461);
    expect(armyResearchChoices(prodCtx, { ...emptyArmyCost('Japanese'), rows: [{ unit: 331, qty: '1' }] })).toContain(59);

    // 日本混编带 59（弹射器含非建筑 a=13 工作效率）走现有 fail-closed 拦截；取消 59 后可正常带入训练总价
    const withKata = { civ: 'Japanese', age: '4', techs: ['47', '377', '59'], team: [], rows: [{ uid: '331', qty: '2' }] };
    const blocked = mixedTrainingTransfer(prodCtx, withKata, 'a', resolveMixedSide(sim, CORE, withKata, 'a'));
    expect(blocked).toMatchObject({ errors: [{ field: 'mix-a-techs', message: expect.stringContaining('弹射器') }] });

    const withoutKata = { ...withKata, techs: ['47', '377'] };
    const allowed = mixedTrainingTransfer(prodCtx, withoutKata, 'a', resolveMixedSide(sim, CORE, withoutKata, 'a'));
    expect(allowed).toHaveProperty('to');
  });
});
