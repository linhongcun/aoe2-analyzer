/** Kent 在 #39 的回归草稿：house=0 时卡人口不能报成超时（main 上失败，本 PR 修复 buildSim 后通过） */
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const run = (id: string) =>
  simulateBuild(
    buildOrders.find((b) => b.id === id)!,
    'Britons',
    eco as unknown as EcoData,
    ups,
    { autoHouses: false },
  );

describe('house=0 卡人口不能报成超时', () => {
  it('scouts-18：第 12 步（长矛兵）人口 20/20 卡住，有 pop_block，起点就是该步开始时间', () => {
    const r = run('scouts-18');
    const s = r.steps[12]!;
    expect(s.pop).toEqual({ used: 20, cap: 20 });
    const pb = s.anomalies.find((a) => a.type === 'pop_block');
    expect(pb).toBeDefined();
    expect(pb!.reasonZh).toMatch(/^卡人口/);
    expect(pb!.from).toBeCloseTo(s.startAt, 0);
  });
  it('scouts-18：第一个卡点是卡人口，而且早于超时', () => {
    const r = run('scouts-18');
    const all = r.steps.flatMap((s) => s.anomalies.map((a) => ({ ...a, step: s.index })));
    const pb = all.find((a) => a.type === 'pop_block')!;
    const to = all.find((a) => a.type === 'timeout');
    expect(pb.step).toBe(12);
    if (to) expect(pb.from).toBeLessThan(to.from);
  });
});
