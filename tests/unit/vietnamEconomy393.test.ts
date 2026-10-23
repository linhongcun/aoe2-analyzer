import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, simSupport, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import type { BuildOrder } from '../../src/domain/buildOrder';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const AXE = 202;
const opening = buildOrders.find((b) => b.id === 'scouts-18')!;
const run = (e: EcoData = E, bo: BuildOrder = opening, civ = 'Vietnamese') => simulateBuild(bo, civ, e, ups, { walkTiles: 4 });
const outcomes = (e: EcoData = E, bo: BuildOrder = opening, civ = 'Vietnamese') => run(e, bo, civ).steps.map((s) => [s.doneAt, s.stock]);
const withCost = (resource: 'Wood' | 'Food' | 'Gold', value: number, tech = AXE): EcoData => ({
  ...E,
  techs: { ...E.techs, [tech]: { ...E.techs[tech]!, cost: { ...E.techs[tech]!.cost, [resource]: value } } },
});

describe('#393 越南经济科技免木材', () => {
  it('保持实际支持越南，并保留木材设零与研究时间减半的独立效果', () => {
    expect(simSupport(E, 'Vietnamese', buildOrders)).toEqual({ supported: true, reasons: [] });
    const effects = E.civEco.Vietnamese!.flatMap((r) => r.effects);
    expect(effects).toContainEqual({ kind: 'techCost', tech: AXE, techName: 'Double Bit Axe', res: 'Wood', op: 'set', v: 0 });
    expect(effects).toContainEqual({ kind: 'techTime', tech: AXE, techName: 'Double Bit Axe', op: 'mul', v: 0.5 });
    expect(effects.filter((e) => e.kind === 'freeTech').map((e) => e.techName)).toEqual(['Conscription']);
  });

  it('抬高双刃斧木材标价不改变越南现有开局，食物费用仍然收取', () => {
    const normal = outcomes();
    expect(outcomes(withCost('Wood', 4000))).toEqual(normal);
    expect(outcomes(withCost('Food', 4000))).not.toEqual(normal);
    expect(outcomes(withCost('Wood', 4000), opening, 'Britons')).not.toEqual(outcomes(E, opening, 'Britons'));
  });

  it('未研究双刃斧时不提前获得它的采集效果，研究完成后才影响库存和时间', () => {
    const skipped: BuildOrder = {
      ...opening,
      steps: opening.steps.map((s) => ({ ...s, actions: s.actions.filter((a) => !(a.type === 'research' && a.tech === AXE)) })),
    };
    const disabled: EcoData = { ...E, ecoTechs: { ...E.ecoTechs, [AXE]: { ...E.ecoTechs[AXE]!, effects: [] } } };
    expect(outcomes(E, skipped)).toEqual(outcomes(disabled, skipped));
    // scouts-18 在这批研究完成后就结束；用后面仍有采集步骤的现有开局观察研究收益。
    const continued = buildOrders.find((b) => b.id === 'fast-castle-knights')!;
    expect(outcomes(E, continued)).not.toEqual(outcomes(disabled, continued));
  });

  it('双刃斧研究时间仍按原始数据的一半计算', () => {
    // 同一步原本还研究马轭并建农田；隔离双刃斧，避免用整步工期冒充它的研究耗时。
    const isolated: BuildOrder = {
      ...opening,
      steps: opening.steps.map((s) => ({
        ...s,
        actions: s.actions.some((a) => a.type === 'research' && a.tech === AXE) ? [{ type: 'research', tech: AXE }] : s.actions,
      })),
    };
    const result = run(E, isolated);
    const research = result.steps.find((s) => s.entity?.kind === 'tech' && s.entity.id === String(AXE));
    expect(research).toBeDefined();
    expect(research!.researchAt).toBeDefined();
    // 模型在开始研究的当前 tick 就推进一次，完成时刻允许相差一个 0.1 秒步长。
    expect(Math.abs(research!.doneAt - research!.researchAt! - E.techs[AXE]!.researchTime * 0.5)).toBeLessThanOrEqual(0.100001);
  });

  it('同一导出错误的西班牙铁匠铺科技只免黄金，三个现有开局不读取原价黄金', () => {
    const fletching = 199;
    for (const id of ['archers-19', 'drush-fc', 'maa-archers-18']) {
      const bo = buildOrders.find((b) => b.id === id)!;
      const normal = outcomes(E, bo, 'Spanish');
      expect(outcomes(withCost('Gold', 4000, fletching), bo, 'Spanish'), id).toEqual(normal);
      expect(outcomes(withCost('Food', 4000, fletching), bo, 'Spanish'), id).not.toEqual(normal);
    }
  });
});
