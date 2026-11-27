import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import { DAT, type DatGeneric } from '../../src/domain/datEffects';
import { CIV_BONUSES } from '../../src/domain/effects';
import { calculateProduction, DEFAULT_PRODUCTION, type ProductionContext } from '../../src/domain/production';
import { makeSimContext, simulate, type SimContext } from '../../src/domain/simulator';
import type { Trees, Unit } from '../../src/domain/types';
import {
  earliestUnitAge,
  entryMatchesCiv,
  formatAutoStatDelta,
  formatAutoStatValue,
  unitAgeChanges,
  type UnitAgeChangesDeps,
} from '../../src/domain/unitAgeChanges';

let core: Core;
let trees: Trees;
let simCtx: SimContext;
let prodCtx: ProductionContext;

beforeAll(async () => {
  core = await loadCore();
  trees = await loadTrees();
  simCtx = makeSimContext(core.techs, trees);
  prodCtx = { core, trees };
});

function expectedEligibleAges(unit: Unit, civ?: string): number[] {
  const ages = new Set<number>();
  for (const entry of DAT.generic) {
    if (entry.req.length !== 0 || entry.any) continue;
    if (!entryMatchesCiv(entry, unit, civ)) continue;
    if (entry.rules.some((rule) => !rule.b && rule.t.includes(unit.id) && rule.fx.length > 0)) {
      ages.add(entry.age);
    }
  }
  return [...ages].sort((a, b) => a - b);
}

function readSimStat(unit: Unit, sim: ReturnType<typeof simulate>, key: string): number {
  if (key.startsWith('bonus:')) return sim.bonus[key.slice('bonus:'.length)] ?? 0;
  if (key === 'gar') return (unit.garrisonCapacity ?? 0) + sim.gar;
  return sim[key as 'hp' | 'atk' | 'ma' | 'pa' | 'los' | 'spd' | 'bt'];
}

/** 选取对该单位无文明加成的模拟文明；对 17 个唯一且自带文明加成的单位传空串，751 传 Mayans（有 387 无文明加成）。 */
function pickNoBonusCiv(unit: Unit): string {
  const needsCivScoped = DAT.generic.some(
    (entry) => entry.req.length === 0 && !entry.any && (entry.civs?.length ?? 0) > 0 && entry.rules.some((rule) => !rule.b && rule.t.includes(unit.id)),
  );
  const candidates = needsCivScoped
    ? unit.civs.filter((c) => DAT.generic.every((e) => !e.civs || !e.rules.some((r) => !r.b && r.t.includes(unit.id)) || e.civs.includes(c)))
    : unit.civs;
  const clean = candidates.find((civ) => !(CIV_BONUSES[civ] ?? []).some(([pred]) => pred(unit)));
  return clean ?? '';
}

describe('#1339 单位详情升时代自动变化领域逻辑', () => {
  it('遍历全部 248 个目录单位：仅命中通用/全文明限定规则的 82 个单位出现，段数与时代完全由数据推导', () => {
    expect(core.units).toHaveLength(248);
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const unit of core.units) {
      const ages = expectedEligibleAges(unit);
      const res = unitAgeChanges(unit);
      if (ages.length === 0) {
        expect(res, `${unit.id} ${unit.zh} 不应出现自动变化区`).toBeNull();
        unmatchedCount++;
        continue;
      }
      matchedCount++;
      expect(res?.state, `${unit.id} ${unit.zh} 应就绪`).toBe('ready');
      if (res?.state !== 'ready') throw new Error(`unexpected pending for ${unit.id}`);

      const earliest = earliestUnitAge(unit);
      const expectedActiveAges = ages.filter((a) => a <= earliest);
      const expectedUpgradeAges = ages.filter((a) => a > earliest);

      expect(res.earliestAge).toBe(earliest);
      expect(res.activeRows.length > 0).toBe(expectedActiveAges.length > 0);
      expect(res.upgradeStages.map((s) => s.age)).toEqual(expectedUpgradeAges);

      const totalRows = res.activeRows.length + res.upgradeStages.reduce((sum, s) => sum + s.rows.length, 0);
      expect(res.layout).toBe(totalRows === 1 ? 'compact' : 'cards');
    }

    expect(matchedCount).toBe(82);
    expect(unmatchedCount).toBe(166);
  });

  it('全量 82 个命中单位各段变化后数值与科技模拟器同龄、无科技、无文明加成读数一致', () => {
    const empty = new Set<number>();
    let checkedUnits = 0;

    for (const unit of core.units) {
      const res = unitAgeChanges(unit);
      if (!res) continue;
      expect(res.state).toBe('ready');
      if (res.state !== 'ready') continue;
      checkedUnits++;

      const simCiv = pickNoBonusCiv(unit);
      if (res.activeRows.length > 0) {
        const sim = simulate(simCtx, unit, simCiv, res.earliestAge, empty, empty);
        for (const row of res.activeRows) {
          expect(row.after, `${unit.id} ${unit.zh} active ${row.key}`).toBeCloseTo(readSimStat(unit, sim, row.key), 5);
        }
      }
      for (const stage of res.upgradeStages) {
        const sim = simulate(simCtx, unit, simCiv, stage.age, empty, empty);
        for (const row of stage.rows) {
          expect(row.after, `${unit.id} ${unit.zh} age=${stage.age} ${row.key}`).toBeCloseTo(readSimStat(unit, sim, row.key), 5);
        }
      }
    }

    expect(checkedUnits).toBe(82);
  });

  it('关键样例读数、固定行序、出现时已生效与紧凑形态准确匹配规格与设计图', () => {
    // 斥候骑兵 448：黑暗开局，封建/城堡/帝王三张升时代卡
    const scout = unitAgeChanges(core.unitById[448]!);
    expect(scout?.state).toBe('ready');
    if (scout?.state !== 'ready') throw new Error('448 missing');
    expect(scout.layout).toBe('cards');
    expect(scout.activeRows).toEqual([]);
    expect(scout.upgradeStages.map((s) => s.age)).toEqual([2, 3, 4]);
    expect(scout.upgradeStages[0]!.rows.map((r) => [r.key, r.before, Number(r.after.toFixed(3)), Number(r.delta.toFixed(3))])).toEqual([
      ['atk', 3, 5, 2],
      ['los', 4, 6, 2],
      ['spd', 1.2, 1.55, 0.35],
    ]);
    expect(scout.upgradeStages[1]!.rows.map((r) => [r.key, r.before, r.after, r.delta])).toEqual([['los', 6, 8, 2]]);
    expect(scout.upgradeStages[2]!.rows.map((r) => [r.key, r.before, r.after, r.delta])).toEqual([['los', 8, 10, 2]]);

    // 骆驼斥候 1755：封建 6 行（含三项克制加成，顺序固定为 船只/骆驼/骑兵）
    const camel = unitAgeChanges(core.unitById[1755]!);
    expect(camel?.state).toBe('ready');
    if (camel?.state !== 'ready') throw new Error('1755 missing');
    expect(camel.layout).toBe('cards');
    expect(camel.activeRows).toEqual([]);
    expect(camel.upgradeStages.map((s) => s.age)).toEqual([2]);
    expect(camel.upgradeStages[0]!.rows.map((r) => [r.key, r.before, Number(r.after.toFixed(3)), Number(r.delta.toFixed(3))])).toEqual([
      ['atk', 2, 5, 3],
      ['bonus:船只', 0, 2, 2],
      ['bonus:骆驼', 0, 2, 2],
      ['bonus:骑兵', 0, 4, 4],
      ['los', 4, 5, 1],
      ['spd', 1.2, 1.45, 0.25],
    ]);

    // 鹰斥候 751：封建合并 20(+1) 与 90(+2) 为单行视野 5→8(+3)；城堡 387 含攻/克制/训练时间
    const eagle = unitAgeChanges(core.unitById[751]!);
    expect(eagle?.state).toBe('ready');
    if (eagle?.state !== 'ready') throw new Error('751 missing');
    expect(eagle.layout).toBe('cards');
    expect(eagle.activeRows).toEqual([]);
    expect(eagle.upgradeStages.map((s) => s.age)).toEqual([2, 3]);
    expect(eagle.upgradeStages[0]!.rows.map((r) => [r.key, r.before, r.after, r.delta])).toEqual([['los', 5, 8, 3]]);
    expect(eagle.upgradeStages[1]!.rows.map((r) => [r.key, r.before, Number(r.after.toFixed(3)), Number(r.delta.toFixed(3))])).toEqual([
      ['atk', 4, 7, 3],
      ['bonus:船只', 0, 1, 1],
      ['bonus:骆驼', 0, 1, 1],
      ['bonus:骑兵', 0, 2, 2],
      ['bt', 46, 34.96, -11.04],
    ]);

    // 城堡版萨金特卫兵 1658：仅「城堡时代出现时已生效」卡，无「进入城堡时代」卡
    const serjeantCastle = unitAgeChanges(core.unitById[1658]!);
    expect(serjeantCastle?.state).toBe('ready');
    if (serjeantCastle?.state !== 'ready') throw new Error('1658 missing');
    expect(serjeantCastle.layout).toBe('cards');
    expect(serjeantCastle.earliestAge).toBe(3);
    expect(serjeantCastle.upgradeStages).toEqual([]);
    expect(serjeantCastle.activeRows.map((r) => [r.key, r.before, r.after, r.sources])).toEqual([
      ['hp', 50, 75, [{ age: 3, delta: 25 }]],
      ['atk', 5, 8, [{ age: 3, delta: 3 }]],
      ['ma', 2, 4, [{ age: 3, delta: 2 }]],
      ['pa', 1, 2, [{ age: 3, delta: 1 }]],
      ['los', 3, 5, [{ age: 2, delta: 2 }]],
    ]);

    // 城楼版萨金特卫兵 1660：封建出现时已生效 + 进入城堡（含 16 → 12 秒）
    const serjeantDonjon = unitAgeChanges(core.unitById[1660]!);
    expect(serjeantDonjon?.state).toBe('ready');
    if (serjeantDonjon?.state !== 'ready') throw new Error('1660 missing');
    expect(serjeantDonjon.layout).toBe('cards');
    expect(serjeantDonjon.activeRows.map((r) => [r.key, r.before, r.after])).toEqual([['los', 3, 5]]);
    expect(serjeantDonjon.upgradeStages[0]!.rows.map((r) => [r.key, r.before, r.after, r.delta])).toEqual([
      ['hp', 50, 75, 25],
      ['atk', 5, 8, 3],
      ['ma', 2, 4, 2],
      ['pa', 1, 2, 1],
      ['bt', 16, 12, -4],
    ]);

    // 弗拉芒民兵 1699：封建出现时已生效 + 城堡 6 行 + 帝王 5 行
    const flemish = unitAgeChanges(core.unitById[1699]!);
    expect(flemish?.state).toBe('ready');
    if (flemish?.state !== 'ready') throw new Error('1699 missing');
    expect(flemish.activeRows.map((r) => [r.key, r.before, r.after])).toEqual([['los', 5, 7]]);
    expect(flemish.upgradeStages.map((s) => s.age)).toEqual([3, 4]);
    expect(flemish.upgradeStages[0]!.rows.map((r) => [r.key, r.before, r.after, r.delta])).toEqual([
      ['hp', 40, 55, 15],
      ['atk', 5, 8, 3],
      ['bonus:船只', 4, 5, 1],
      ['bonus:骆驼', 4, 5, 1],
      ['bonus:骑兵', 6, 7, 1],
      ['bt', 16, 14, -2],
    ]);
    expect(flemish.upgradeStages[1]!.rows.map((r) => [r.key, r.before, r.after, r.delta])).toEqual([
      ['hp', 55, 60, 5],
      ['atk', 8, 11, 3],
      ['bonus:船只', 5, 6, 1],
      ['bonus:骆驼', 5, 6, 1],
      ['bonus:骑兵', 7, 8, 1],
    ]);

    // 运输船 545：载量起点 20（非 baseStats 的 0）→ 25 → 35
    const transport = unitAgeChanges(core.unitById[545]!);
    expect(transport?.state).toBe('ready');
    if (transport?.state !== 'ready') throw new Error('545 missing');
    expect(transport.layout).toBe('cards');
    expect(transport.upgradeStages.map((s) => [s.fromAge, s.age, s.rows[0]!.before, s.rows[0]!.after, s.rows[0]!.delta])).toEqual([
      [2, 3, 20, 25, 5],
      [3, 4, 25, 35, 10],
    ]);

    // 轻型骑兵 546：出现时已生效多时代来源（封建 +2；城堡 +2）+ 帝王 8→10
    const lightCav = unitAgeChanges(core.unitById[546]!);
    expect(lightCav?.state).toBe('ready');
    if (lightCav?.state !== 'ready') throw new Error('546 missing');
    expect(lightCav.layout).toBe('cards');
    expect(lightCav.activeRows[0]!.sources).toEqual([
      { age: 2, delta: 2 },
      { age: 3, delta: 2 },
    ]);
    expect(lightCav.activeRows[0]!.before).toBe(4);
    expect(lightCav.activeRows[0]!.after).toBe(8);
    expect(lightCav.upgradeStages[0]!.rows[0]!.before).toBe(8);
    expect(lightCav.upgradeStages[0]!.rows[0]!.after).toBe(10);

    // 翼骑兵 441 / 波兰翼骑兵 1707：帝王出现时已生效单行紧凑形态（4→10，含三时代来源）
    for (const id of [441, 1707]) {
      const hussar = unitAgeChanges(core.unitById[id]!);
      expect(hussar?.state).toBe('ready');
      if (hussar?.state !== 'ready') throw new Error(`${id} missing`);
      expect(hussar.layout).toBe('compact');
      expect(hussar.upgradeStages).toEqual([]);
      expect(hussar.activeRows).toHaveLength(1);
      expect(hussar.activeRows[0]!.before).toBe(4);
      expect(hussar.activeRows[0]!.after).toBe(10);
      expect(hussar.activeRows[0]!.sources).toEqual([
        { age: 2, delta: 2 },
        { age: 3, delta: 2 },
        { age: 4, delta: 2 },
      ]);
    }

    // 长剑士 77（紧凑出现时已生效）与民兵 74（紧凑升时代变化）
    const ls = unitAgeChanges(core.unitById[77]!);
    expect(ls?.state).toBe('ready');
    if (ls?.state === 'ready') {
      expect(ls.layout).toBe('compact');
      expect(ls.earliestAge).toBe(3);
      expect(ls.activeRows).toHaveLength(1);
      expect(ls.upgradeStages).toEqual([]);
    }
    const militia = unitAgeChanges(core.unitById[74]!);
    expect(militia?.state).toBe('ready');
    if (militia?.state === 'ready') {
      expect(militia.layout).toBe('compact');
      expect(militia.earliestAge).toBe(1);
      expect(militia.activeRows).toEqual([]);
      expect(militia.upgradeStages).toHaveLength(1);
    }
  });

  it('训练时间变化与持续生产同龄同单位读数完全一致，且不混入阿兹特克文明加速加成', () => {
    const eagleBt = (unitAgeChanges(core.unitById[751]!, 'Mayans') as Extract<ReturnType<typeof unitAgeChanges>, { state: 'ready' }>).upgradeStages
      .find((s) => s.age === 3)!
      .rows.find((r) => r.key === 'bt')!;
    const mayanProd = calculateProduction(prodCtx, {
      ...DEFAULT_PRODUCTION,
      civ: 'Mayans',
      age: 3,
      techs: [],
      rows: [{ unit: 751, building: 12, count: '1' }],
    });
    expect(mayanProd.errors).toEqual([]);
    expect(eagleBt.after).toBeCloseTo(mayanProd.lines[0]!.seconds, 6);

    // 阿兹特克语境下本区不含文明加成，仍为 46 → 34.96 秒
    const aztecEagle = unitAgeChanges(core.unitById[751]!, 'Aztecs');
    expect(aztecEagle?.state).toBe('ready');
    if (aztecEagle?.state === 'ready') {
      const bt = aztecEagle.upgradeStages.find((s) => s.age === 3)!.rows.find((r) => r.key === 'bt')!;
      expect(bt.before).toBe(46);
      expect(bt.after).toBeCloseTo(34.96, 6);
    }

    const donjonBt = (unitAgeChanges(core.unitById[1660]!, 'Sicilians') as Extract<ReturnType<typeof unitAgeChanges>, { state: 'ready' }>).upgradeStages
      .find((s) => s.age === 3)!
      .rows.find((r) => r.key === 'bt')!;
    const donjonProd = calculateProduction(prodCtx, {
      ...DEFAULT_PRODUCTION,
      civ: 'Sicilians',
      age: 3,
      techs: [],
      rows: [{ unit: 1660, building: 1665, count: '1' }],
    });
    expect(donjonProd.errors).toEqual([]);
    expect(donjonBt.after).toBeCloseTo(donjonProd.lines[0]!.seconds, 6);

    // 弗拉芒民兵 1699 自封建时代起可直接在兵营训练，城堡/帝王自动应用 16s → 14s（无需 755）
    const flemishBt = (unitAgeChanges(core.unitById[1699]!, 'Burgundians') as Extract<ReturnType<typeof unitAgeChanges>, { state: 'ready' }>).upgradeStages
      .find((s) => s.age === 3)!
      .rows.find((r) => r.key === 'bt')!;
    for (const age of [3, 4]) {
      const flemishProd = calculateProduction(prodCtx, {
        ...DEFAULT_PRODUCTION,
        civ: 'Burgundians',
        age,
        techs: [],
        rows: [{ unit: 1699, building: 12, count: '1' }],
      });
      expect(flemishProd.errors).toEqual([]);
      expect(flemishBt.after).toBeCloseTo(flemishProd.lines[0]!.seconds, 6);
    }
    expect(flemishBt.after).toBe(14);
  });

  it('#1323 显式零值攻击类别在未受 generic 改动时不产生零增量噪声行', () => {
    const militia = core.unitById[74]!;
    const scout = core.unitById[448]!;
    expect(militia.atks.some(([, v]) => v === 0)).toBe(true);
    expect(scout.atks.some(([, v]) => v === 0)).toBe(true);

    const militiaRes = unitAgeChanges(militia);
    expect(militiaRes?.state).toBe('ready');
    if (militiaRes?.state === 'ready') {
      expect(militiaRes.upgradeStages[0]!.rows.map((r) => r.key)).toEqual(['los']);
    }

    const scoutRes = unitAgeChanges(scout);
    expect(scoutRes?.state).toBe('ready');
    if (scoutRes?.state === 'ready') {
      expect(scoutRes.upgradeStages.flatMap((s) => s.rows.map((r) => r.key))).toEqual(['atk', 'los', 'spd', 'los', 'los']);
    }
  });

  it('文明语境、开局单位、提前解锁、空串与原型键防御准确生效', () => {
    const eagle = core.unitById[751]!;
    // undefined 与 '' 均视为无文明语境，命中 387
    for (const civ of [undefined, '', 'Mayans', 'Aztecs'] as const) {
      const r = unitAgeChanges(eagle, civ);
      expect(r?.state).toBe('ready');
      if (r?.state === 'ready') {
        expect(r.earliestAge).toBe(1);
        expect(r.upgradeStages.map((s) => s.age)).toEqual([2, 3]);
      }
    }
    const scout = core.unitById[448]!;
    const camel = core.unitById[1755]!;
    const castleSerjeant = core.unitById[1658]!;

    // 显式选择不可训练且非开局拥有该单位的文明：fail-closed 返回 null，不合成虚假「出现时已生效」状态
    expect(unitAgeChanges(eagle, 'Incas')).toBeNull();
    expect(unitAgeChanges(eagle, 'Franks')).toBeNull();
    expect(unitAgeChanges(scout, 'Aztecs')).toBeNull();
    expect(unitAgeChanges(camel, 'Franks')).toBeNull();
    expect(unitAgeChanges(castleSerjeant, 'Franks')).toBeNull();

    // 开局拥有该单位但不在 unit.civs 的合成边界：仍允许推导，且最早出现时代为黑暗时代（1）
    const startingOnly = unitAgeChanges({ ...scout, civs: [] }, 'Franks', {
      garrisonCivs: { Franks: { startingScoutId: scout.id } },
    });
    expect(startingOnly?.state).toBe('ready');
    if (startingOnly?.state === 'ready') {
      expect(startingOnly.earliestAge).toBe(1);
      expect(startingOnly.activeRows).toEqual([]);
      expect(startingOnly.upgradeStages.map((s) => s.age)).toEqual([2, 3, 4]);
    }

    // 文明限定规则 387 与局部文明子集规则在 entryMatchesCiv 下严格按集合语义判定
    const tech387 = DAT.generic.find((entry) => entry.tech === 387)!;
    expect(entryMatchesCiv(tech387, eagle, undefined)).toBe(true);
    expect(entryMatchesCiv(tech387, eagle, '')).toBe(true);
    expect(entryMatchesCiv(tech387, eagle, 'Mayans')).toBe(true);
    expect(entryMatchesCiv(tech387, eagle, 'Aztecs')).toBe(true);
    expect(entryMatchesCiv(tech387, eagle, 'Incas')).toBe(false);
    expect(entryMatchesCiv(tech387, eagle, 'Franks')).toBe(false);

    const partialCivRule: DatGeneric = {
      tech: -999,
      name: 'Partial civ test',
      age: 3,
      req: [],
      any: false,
      civs: ['Franks'],
      rules: [{ t: [448], fx: [{ s: 'atk', v: 1 }] }],
    };
    expect(entryMatchesCiv(partialCivRule, scout, undefined)).toBe(false);
    expect(entryMatchesCiv(partialCivRule, scout, '')).toBe(false);
    expect(entryMatchesCiv(partialCivRule, scout, 'Britons')).toBe(false);
    expect(entryMatchesCiv(partialCivRule, scout, 'Franks')).toBe(true);

    // 瞿折罗：骆驼斥候（1755）黑暗开局（仅封建 6 项自动变化），斥候骑兵（448）最早在封建出现
    const gurjarasCamel = unitAgeChanges(camel, 'Gurjaras');
    expect(gurjarasCamel?.state).toBe('ready');
    if (gurjarasCamel?.state === 'ready') {
      expect(gurjarasCamel.earliestAge).toBe(1);
      expect(gurjarasCamel.activeRows).toEqual([]);
      expect(gurjarasCamel.upgradeStages.map((s) => s.age)).toEqual([2]);
      expect(gurjarasCamel.upgradeStages[0]!.rows).toHaveLength(6);
    }
    const gurjarasScout = unitAgeChanges(scout, 'Gurjaras');
    expect(gurjarasScout?.state).toBe('ready');
    if (gurjarasScout?.state === 'ready') {
      expect(gurjarasScout.earliestAge).toBe(2);
      expect(gurjarasScout.activeRows.map((r) => r.key)).toEqual(['atk', 'los', 'spd']);
      expect(gurjarasScout.upgradeStages.map((s) => s.age)).toEqual([3, 4]);
    }

    // 亚美尼亚提前解锁：长矛兵 93（无文明封建出现时已生效 vs 亚美尼亚进入封建）与长剑士 77（亚美尼亚封建出现时已生效）
    const spearGeneric = unitAgeChanges(core.unitById[93]!);
    const spearArm = unitAgeChanges(core.unitById[93]!, 'Armenians');
    expect(spearGeneric?.state === 'ready' && spearGeneric.earliestAge === 2 && spearGeneric.activeRows.length === 1).toBe(true);
    expect(spearArm?.state === 'ready' && spearArm.earliestAge === 1 && spearArm.upgradeStages.length === 1).toBe(true);

    const lsArm = unitAgeChanges(core.unitById[77]!, 'Armenians');
    expect(lsArm?.state === 'ready' && lsArm.earliestAge === 2 && lsArm.layout === 'compact').toBe(true);

    // 原型属性名作为 civ 不越界读取 Object.prototype
    expect(unitAgeChanges(scout, 'toString')).toBeNull();
    expect(unitAgeChanges(scout, 'constructor')).toBeNull();
    expect(earliestUnitAge(scout, 'toString')).toBe(2);
    expect(earliestUnitAge(scout, 'constructor')).toBe(2);
    expect(earliestUnitAge(scout, '')).toBe(1);
  });

  it('非目标单位、组合触发、损坏数值与未映射属性键严格按 fail-closed 契约处理', () => {
    expect(unitAgeChanges(core.unitById[38]!)).toBeNull();
    expect(unitAgeChanges(core.unitById[569]!)).toBeNull();

    const scout = core.unitById[448]!;
    const transport = core.unitById[545]!;

    const run = (unit: Unit, deps: UnitAgeChangesDeps) => unitAgeChanges(unit, undefined, deps);

    // 未知/未在体验设计映射的 Effect 键 fail-closed 返回 pending，不静默丢行
    for (const fx of [
      { s: 'rng', v: 1 },
      { s: 'rof', v: 0.1 },
      { s: 'armc', vs: '步兵', v: 1 },
      { s: 'unknown_stat', v: 1 },
      { s: 'bonus', v: 1 },
    ]) {
      const generic: DatGeneric[] = [{ tech: -1, name: 'unmapped', age: 3, req: [], any: false, rules: [{ t: [448], fx: [fx] }] }];
      expect(run(scout, { generic })).toEqual({ state: 'pending' });
    }

    // 非法时代、非有限值、非法 gar、非法 bt 均返回 pending
    expect(run(scout, { generic: [{ tech: -2, name: 'bad age', age: 1, req: [], any: false, rules: [{ t: [448], fx: [{ s: 'los', v: 2 }] }] }] })).toEqual({
      state: 'pending',
    });
    expect(run(scout, { generic: [{ tech: -3, name: 'nan', age: 2, req: [], any: false, rules: [{ t: [448], fx: [{ s: 'atk', v: Number.NaN }] }] }] })).toEqual(
      { state: 'pending' },
    );
    expect(run({ ...transport, garrisonCapacity: undefined }, {})).toEqual({ state: 'pending' });
    expect(run({ ...transport, garrisonCapacity: -1 }, {})).toEqual({ state: 'pending' });
    expect(
      run(scout, {
        generic: [{ tech: -4, name: 'bad bt', age: 3, req: [], any: false, rules: [{ t: [448], fx: [{ s: 'bt', op: 'mul', v: 0 }] }] }],
      }),
    ).toEqual({ state: 'pending' });
    expect(
      run(core.unitById[1660]!, {
        ecoUnits: { '1660': { trainTime: 0 } },
      }),
    ).toEqual({ state: 'pending' });

    // 统一格式化函数校验
    expect(formatAutoStatValue(34.960000001, 'bt')).toBe('34.96 秒');
    expect(formatAutoStatDelta(-11.040000001, 'bt')).toBe('-11.04 秒');
    expect(formatAutoStatDelta(-2, 'bt')).toBe('-2 秒');
    expect(formatAutoStatDelta(0.3500000001, 'spd')).toBe('+0.35');
    expect(formatAutoStatValue(75, 'hp')).toBe('75');
    expect(formatAutoStatDelta(25, 'hp')).toBe('+25');
  });
});
