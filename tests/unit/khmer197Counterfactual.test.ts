/** Whole654 removal retains physical supply without advertising no-return-walk. */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { civSimNotes, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const PREREQ = '当前开局免建筑前置已计入，显式建筑照常付费建造';
const FARM = '农田按免回仓与供给上限连续估算，结果可能低于原通用估算，不代表游戏内加成减益';
const DETAIL = '取消的是回仓往返，田内走点、食物池启动和瞬态、耗尽与续种未模拟；不绑定完成田块与农民人数。';
const without654 = () => {
  const e = structuredClone(E);
  e.civEco.Khmer = e.civEco.Khmer!.filter((r) => r.tech !== 654);
  return e;
};
describe('Khmer whole654 counterfactual disclosure', () => {
  it('public notes retain638 but do not advertise no-return-walk after the whole654 group is removed', () => {
    expect(civSimNotes(without654(), 'Khmer', 'fast-castle-boom')).toEqual([PREREQ]);
  });
  it('the public real timeline assumptions omit the no-return-walk note and detail after whole654 removal', () => {
    const b = buildOrders.find((order) => order.id === 'fast-castle-boom')!;
    const assumptions = simulateBuild(b, 'Khmer', without654(), ups, { autoHouses: false }).model.assumptions;
    expect(assumptions).toContain(PREREQ);
    expect(assumptions).not.toContain(FARM);
    expect(assumptions).not.toContain(DETAIL);
  });
});
