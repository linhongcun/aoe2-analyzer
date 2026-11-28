import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { CORE } from '../../src/data/core';
import { militaryTechAge } from '../../src/domain/availabilityAge';
import { DAT, toEffects, type DatEco } from '../../src/domain/datEffects';
import type { MixedSideInput } from '../../src/domain/mixedDuelParams';
import { makeSimContext } from '../../src/domain/simulator';
import { evaluateTrainTotal } from '../../src/domain/trainTotal';
import { isUnitCostAttribute } from '../../src/domain/unitCost';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import {
  hasUnsupportedTransferResourceOrCost,
  isUnclassifiedTransferEcoEffect,
  mixedTrainingTransfer,
} from '../../src/features/duel/logic/mixedTrainingTransfer';
import { decodeTrainTotal } from '../../src/features/production/trainTotalCodec';
import { trees } from './helpers';

const context = { core: CORE, trees };
const simulation = makeSimContext(CORE.techs, trees);

function presetInput(civ: string, age: number, uid: number, scope: 'full' | 'current', qty = '5'): MixedSideInput {
  const targetAge = scope === 'full' ? 4 : age;
  const base: MixedSideInput = {
    civ,
    age: String(targetAge),
    techs: [],
    team: [],
    rows: [{ uid: String(uid), qty }],
  };
  const view = resolveMixedSide(simulation, CORE, base, 'a');
  const selected = view.techs
    .filter((option) => (option.numeric || (option.cost && !option.partial)) && militaryTechAge(civ, option.t.id, option.t.age) <= targetAge)
    .map((option) => String(option.t.id));
  return { ...base, techs: selected };
}

function runTransfer(input: MixedSideInput, side: 'a' | 'b' = 'a') {
  return mixedTrainingTransfer(context, input, side, resolveMixedSide(simulation, CORE, input, side));
}

function assertMatchesManualTotal(input: MixedSideInput, expectedOmitted: readonly string[], expectedPricing: readonly string[] = []) {
  const plan = runTransfer(input);
  expect(plan).toHaveProperty('to');
  if (!('to' in plan)) throw new Error(JSON.stringify(plan.errors));

  for (const note of expectedOmitted) {
    expect(plan.notice.omitted).toContain(note);
  }
  expect(plan.notice.pricing).toEqual(expectedPricing);

  const decoded = decodeTrainTotal(new URL(plan.to, 'https://example.test').search);
  expect(decoded.warnings).toEqual([]);
  const transferred = evaluateTrainTotal(context, decoded.config);
  const manual = evaluateTrainTotal(context, {
    civ: input.civ,
    age: Number(input.age),
    ageRaw: null,
    techs: decoded.config.techs,
    rows: input.rows.map((row) => ({ unit: Number(row.uid), qty: row.qty })),
  });
  expect(transferred).toEqual(manual);
  expect(transferred.blocked).toEqual([]);
  expect(transferred.incomplete).toBe(false);
  return { plan, decoded, transferred };
}

// Legacy pre-#1334 tech-stage classifier for before/after full-scan comparison.
const legacyCombatAttrs = new Set([10, 22, 24, 102, 107, 108, 109]);
function legacyBlocksTech(id: number): boolean {
  const tech = CORE.techById[id]!;
  const data = DAT.techs[tech.en];
  if (data?.id !== id || data.eco.some((effect) => effect.res !== undefined || (isUnitCostAttribute(effect.a) && !effect.t?.length))) return true;
  const unclassified =
    data.eco.some((effect) => {
      if (isUnitCostAttribute(effect.a) || (effect.a !== undefined && legacyCombatAttrs.has(effect.a))) return false;
      return effect.a !== 13 || !effect.t?.length || !effect.t.every((target) => CORE.buildingById[target]);
    }) || data.rules.some((rule) => toEffects(rule.fx).length !== rule.fx.length);
  return unclassified || (!data.rules.length && !data.eco.length && tech.en !== 'Ballistics');
}

function currentBlocksTech(id: number, armyUnitIds: ReadonlySet<number>): boolean {
  const tech = CORE.techById[id]!;
  const data = DAT.techs[tech.en];
  if (data?.id !== id || hasUnsupportedTransferResourceOrCost(data.eco)) return true;
  const unclassified =
    data.eco.some((effect) => isUnclassifiedTransferEcoEffect(effect, armyUnitIds, CORE.unitById)) ||
    data.rules.some((rule) => toEffects(rule.fx).length !== rule.fx.length);
  const guidance = DAT.projectileGuidance?.[tech.en];
  const hasGuidance = Boolean(guidance && (guidance.tracking || guidance.speed));
  return unclassified || (!data.rules.length && !data.eco.length && tech.en !== 'Ballistics' && !hasGuidance);
}

describe('#1334 混编 PK 训练费用带入对无关科技效果的拦截收紧', () => {
  it('验收 1：日本巨型投石机（满科技/当前时代）、亚美尼亚冠军剑士、不列颠箭船与村民（封建/帝王）均放行且总价与手配一致', () => {
    // 日本 / 巨型投石机（331）帝王「满科技」与「当前时代科技」
    for (const scope of ['full', 'current'] as const) {
      const input = presetInput('Japanese', 4, 331, scope);
      expect(input.techs).toContain('59');
      const { decoded, transferred } = assertMatchesManualTotal(input, ['弹射器（不改变本方训练单价或解锁）']);
      expect(decoded.config.techs).toEqual([]);
      expect(transferred.total).toEqual({ Wood: 1000, Gold: 1000 });
    }

    // 亚美尼亚 / 冠军剑士（567）帝王「满科技」
    const armChamp = presetInput('Armenians', 4, 567, 'full');
    expect(armChamp.techs).toContain('921');
    const armChampRes = assertMatchesManualTotal(armChamp, ['费雷特斯（不改变本方训练单价或解锁）']);
    expect(armChampRes.decoded.config.techs).toEqual([]);
    expect(armChampRes.transferred.total).toEqual({ Food: 250, Gold: 100 });

    // 亚美尼亚民兵系其余形态（74/75/77/473）帝王「满科技」同步放行
    for (const uid of [74, 75, 77, 473]) {
      const militia = presetInput('Armenians', 4, uid, 'full');
      expect(militia.techs).toContain('921');
      assertMatchesManualTotal(militia, ['费雷特斯（不改变本方训练单价或解锁）']);
    }

    // 不列颠 / 箭船（539）帝王「满科技」（含造船匠 373 计入单价，908/907 进入未带入）
    const britGalleon = presetInput('Britons', 4, 539, 'full');
    expect(britGalleon.techs).toEqual(expect.arrayContaining(['908', '907', '373']));
    const britGalleonRes = assertMatchesManualTotal(
      britGalleon,
      ['鱼鳞式建造法（不改变本方训练单价或解锁）', '外板平接船体（不改变本方训练单价或解锁）'],
      ['造船匠'],
    );
    expect(britGalleonRes.decoded.config.techs).toEqual([373]);
    expect(britGalleonRes.transferred.total).toEqual({ Wood: 360, Gold: 150 });

    // 不列颠 / 村民（83）封建「当前时代科技」与帝王「满科技」
    const vilFeudal = presetInput('Britons', 2, 83, 'current');
    expect(vilFeudal.techs).toContain('213');
    expect(vilFeudal.techs).not.toContain('249');
    const vilFeudalRes = assertMatchesManualTotal(vilFeudal, ['独轮推车（不改变本方训练单价或解锁）']);
    expect(vilFeudalRes.transferred.total).toEqual({ Food: 250 });

    const vilImp = presetInput('Britons', 4, 83, 'full');
    expect(vilImp.techs).toEqual(expect.arrayContaining(['213', '249']));
    const vilImpRes = assertMatchesManualTotal(vilImp, ['独轮推车（不改变本方训练单价或解锁）', '手推车（不改变本方训练单价或解锁）']);
    expect(vilImpRes.transferred.total).toEqual({ Food: 250 });
  });

  it('验收 2：亚美尼亚牧师战士（1811）帝王满科技/当前时代经 #1326 强化教堂端到端带入训练总价，费雷特斯入未带入', () => {
    for (const scope of ['full', 'current'] as const) {
      const input = presetInput('Armenians', 4, 1811, scope);
      expect(input.techs).toContain('921');
      const { decoded, transferred } = assertMatchesManualTotal(input, ['费雷特斯（不改变本方训练单价或解锁）']);
      expect(decoded.config.techs).toEqual([]);
      expect(transferred.total).toEqual({ Food: 200, Gold: 250 });
    }
  });

  it('验收 3：不列颠巨型投石机（331）帝王满科技对照结果不变', () => {
    const britTreb = presetInput('Britons', 4, 331, 'full');
    expect(britTreb.techs).toContain('461');
    const { decoded, transferred } = assertMatchesManualTotal(britTreb, ['战狼号（不改变本方训练单价或解锁）']);
    expect(decoded.config.techs).toEqual([]);
    expect(transferred.total).toEqual({ Wood: 1000, Gold: 1000 });
  });

  it('按固定来源证据放行：葡萄牙环游世界（1404，res=203 地图探索）与属性 63 三项战斗科技（832/997/1081）', () => {
    // 葡萄牙 / 卡拉维尔（1004）城堡「当前时代科技」与帝王「满科技」
    const portCastle = presetInput('Portuguese', 3, 1004, 'current');
    expect(portCastle.techs).toEqual(expect.arrayContaining(['908', '1404']));
    const portCastleRes = assertMatchesManualTotal(portCastle, ['鱼鳞式建造法（不改变本方训练单价或解锁）', '环游世界（不改变本方训练单价或解锁）']);
    expect(portCastleRes.decoded.config.techs).toEqual([]);

    const portImp = presetInput('Portuguese', 4, 1004, 'full');
    expect(portImp.techs).toEqual(expect.arrayContaining(['908', '907', '1404']));
    const portImpRes = assertMatchesManualTotal(portImp, [
      '鱼鳞式建造法（不改变本方训练单价或解锁）',
      '外板平接船体（不改变本方训练单价或解锁）',
      '环游世界（不改变本方训练单价或解锁）',
    ]);
    expect(portImpRes.transferred.total).toEqual(
      evaluateTrainTotal(context, { civ: 'Portuguese', age: 4, ageRaw: null, techs: [], rows: [{ unit: 1004, qty: '5' }] }).total,
    );

    // 达罗毗荼 / 冠军剑士（567）手动勾选乌兹钢（832，a=63 Combat Ability）
    const wootzInput: MixedSideInput = { civ: 'Dravidians', age: '4', techs: ['832'], team: [], rows: [{ uid: '567', qty: '5' }] };
    assertMatchesManualTotal(wootzInput, ['乌兹钢（不改变本方训练单价或解锁）']);

    // 女真 / 楼船（1948）手动勾选霹雳炸弹（997，a=63 Combat Ability）
    const thunderInput: MixedSideInput = { civ: 'Jurchens', age: '4', techs: ['997'], team: [], rows: [{ uid: '1948', qty: '3' }] };
    assertMatchesManualTotal(thunderInput, ['霹雳炸弹（不改变本方训练单价或解锁）']);

    // 吴 / 牵引抛石机（1942）与楼船（1948）手动勾选卧虎（1081，a=63 + a=102/107）
    for (const uid of [1942, 1948]) {
      const tigerInput: MixedSideInput = { civ: 'Wu', age: '4', techs: ['1081'], team: [], rows: [{ uid: String(uid), qty: '3' }] };
      assertMatchesManualTotal(tigerInput, ['卧虎（不改变本方训练单价或解锁）']);
    }
  });

  it('验收 5：保守拦截仍在——未登记属性、空目标/建筑目标未知属性、未知资源与真实未解码科技继续被拦', () => {
    const army = new Set([331]);
    // 纯规则单测：未登记属性 999
    expect(isUnclassifiedTransferEcoEffect({ a: 999, op: 'add', v: 1, t: [331] }, army, CORE.unitById)).toBe(true);
    expect(isUnclassifiedTransferEcoEffect({ a: 999, op: 'add', v: 1, t: [17, 331] }, army, CORE.unitById)).toBe(true);
    expect(isUnclassifiedTransferEcoEffect({ a: 999, op: 'add', v: 1, t: [] }, army, CORE.unitById)).toBe(true);
    expect(isUnclassifiedTransferEcoEffect({ a: 999, op: 'add', v: 1, t: [82] }, army, CORE.unitById)).toBe(true);
    // 目标为明确目录单位且不在本方阵容（贸易船 17）不拦截
    expect(isUnclassifiedTransferEcoEffect({ a: 999, op: 'add', v: 1, t: [17] }, army, CORE.unitById)).toBe(false);
    // 未登记资源与科技费用修改仍拦截
    expect(hasUnsupportedTransferResourceOrCost([{ res: 999, op: 'set', v: 1 }])).toBe(true);
    expect(hasUnsupportedTransferResourceOrCost([{ res: 33, op: 'set', v: 51 }])).toBe(true);
    expect(hasUnsupportedTransferResourceOrCost([{ res: 203, op: 'set', v: -1 }])).toBe(false);
    expect(isUnclassifiedTransferEcoEffect({ tech: 'Faith', tid: 45, what: '黄金', op: 'add', v: -750 }, army, CORE.unitById)).toBe(true);

    // 端到端通过 mixedTrainingTransfer 断言未登记属性与未登记资源保持原提示文案
    const originalKata = DAT.techs.Kataparuto!;
    const jpInput: MixedSideInput = { civ: 'Japanese', age: '4', techs: ['59'], team: [], rows: [{ uid: '331', qty: '2' }] };
    try {
      const unknownOnSelf: DatEco = { a: 999, op: 'add', v: 1, t: [331], cls: null, unit: 331 };
      DAT.techs.Kataparuto = { ...originalKata, eco: [unknownOnSelf] };
      expect(runTransfer(jpInput)).toMatchObject({
        errors: [{ field: 'mix-a-techs', message: '弹射器有尚未核实的训练条件。' }],
      });

      const unknownOnBuilding: DatEco = { a: 999, op: 'add', v: 1, t: [82], cls: null, unit: 82 };
      DAT.techs.Kataparuto = { ...originalKata, eco: [unknownOnBuilding] };
      expect(runTransfer(jpInput)).toMatchObject({
        errors: [{ field: 'mix-a-techs', message: '弹射器有尚未核实的训练条件。' }],
      });

      const unknownEmptyTarget: DatEco = { a: 999, op: 'add', v: 1, t: [], cls: 54, unit: null };
      DAT.techs.Kataparuto = { ...originalKata, eco: [unknownEmptyTarget] };
      expect(runTransfer(jpInput)).toMatchObject({
        errors: [{ field: 'mix-a-techs', message: '弹射器有尚未核实的训练条件。' }],
      });

      const unknownOutsideUnit: DatEco = { a: 999, op: 'add', v: 1, t: [17], cls: 2, unit: null };
      DAT.techs.Kataparuto = { ...originalKata, eco: [unknownOutsideUnit] };
      expect(runTransfer(jpInput)).toHaveProperty('to');

      const unknownResource: DatEco = { res: 999, name: '资源999', op: 'set', v: 1 };
      DAT.techs.Kataparuto = { ...originalKata, eco: [unknownResource] };
      expect(runTransfer(jpInput)).toMatchObject({
        errors: [{ field: 'mix-a-techs', message: '弹射器的条件无法完整换算为训练计价。' }],
      });
    } finally {
      DAT.techs.Kataparuto = originalKata;
    }

    // 真实未核实科技仍拦截：马普切布图马普（res=33）、蒙古游牧（487，真为空 rules/eco 且非投射物引导）
    expect(runTransfer({ civ: 'Mapuche', age: '4', techs: ['1380'], team: [], rows: [{ uid: '2569', qty: '2' }] })).toMatchObject({
      errors: [{ field: 'mix-a-techs', message: '布图马普的条件无法完整换算为训练计价。' }],
    });
    expect(runTransfer({ civ: 'Mongols', age: '4', techs: ['487'], team: [], rows: [{ uid: '11', qty: '2' }] })).toMatchObject({
      errors: [{ field: 'mix-a-techs', message: '游牧有尚未核实的训练条件。' }],
    });

    // #1509：葡萄牙火枪手勾选火绳枪（573）按纯战斗投射物引导放行并归入未带入项（仅影响战斗；化学 47 由 #1468 自动补齐解锁）
    assertMatchesManualTotal({ civ: 'Portuguese', age: '4', techs: ['573'], team: [], rows: [{ uid: '5', qty: '5' }] }, ['火绳枪（仅影响战斗）']);
  });

  it('验收 6：全量 56 文明扫描前后对比——科技分类拦截在帝王（2,291 组合）从 631 降至 0，城堡 391 降至 0，封建 56 降至 0，黑暗 0 降至 0', () => {
    expect(civs).toHaveLength(56);

    const scanAge = (age: number) => {
      let valid = 0;
      let legacyBlocked = 0;
      let currentBlocked = 0;
      for (const civ of civs) {
        for (const unit of CORE.units) {
          if (!unit.civs.includes(civ.en)) continue;
          const base: MixedSideInput = { civ: civ.en, age: String(age), techs: [], team: [], rows: [{ uid: String(unit.id), qty: '5' }] };
          const view = resolveMixedSide(simulation, CORE, base, 'a');
          if (!view.army) continue;
          valid++;
          const selected = view.techs
            .filter((t) => (t.numeric || (t.cost && !t.partial)) && militaryTechAge(civ.en, t.t.id, t.t.age) <= age)
            .map((t) => t.t.id);
          const armyIds = new Set([unit.id]);
          if (selected.some((id) => legacyBlocksTech(id))) legacyBlocked++;
          if (selected.some((id) => currentBlocksTech(id, armyIds))) currentBlocked++;
        }
      }
      return { valid, legacyBlocked, currentBlocked };
    };

    // #1368：混编 PK 移除零造价库曼雇佣兵精锐钦察（1260）(-1 → 2291)
    // #1366：乌兹钢（832）纳入达罗毗荼 15 个步兵/骑兵单位帝王数值预设，旧基线未含属性 63 故 legacyBlocked 由 616 增至 631，currentBlocked 保持 0
    // #1482：effects.json 新增近战反伤（a:118）与科技充能（a:59–62），箭羽/锥子箭/护腕/攻城技师/野战军等携带新属性，旧基线未含 59–62/118 故 legacyBlocked 升至 1330/691/224，currentBlocked 全时代保持 0
    expect(scanAge(4)).toEqual({ valid: 2291, legacyBlocked: 1330, currentBlocked: 0 });
    // #1325：城堡新增亚美尼亚冠军剑士（567）与契丹重装骑射手（474）(+2 → 1378)，黑暗移除误放行的亚美尼亚武士（75）(-1 → 113)
    expect(scanAge(3)).toEqual({ valid: 1378, legacyBlocked: 691, currentBlocked: 0 });
    expect(scanAge(2)).toEqual({ valid: 563, legacyBlocked: 224, currentBlocked: 0 });
    expect(scanAge(1)).toEqual({ valid: 113, legacyBlocked: 0, currentBlocked: 0 });
  });
});
