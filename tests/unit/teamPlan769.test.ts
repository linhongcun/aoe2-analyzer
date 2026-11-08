import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import type { ProductionContext } from '../../src/domain/production';
import { addPlanPlayer, defaultTeamPlan, decodeTeamPlan, encodeTeamPlan, exampleTeamPlan, teamPlanErrors } from '../../src/domain/teamPlan';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

describe('#769 团战分工的默认文明是显式未选择', () => {
  it('默认计划与新增玩家都留空文明，不写入默认占位文明', () => {
    const plan = defaultTeamPlan();
    expect(plan.players.map((p) => p.civ)).toEqual(['', '']);
    expect(addPlanPlayer(plan).players.map((p) => p.civ)).toEqual(['', '', '']);
    // 内置范例仍带已核对过的文明，不因默认值改动而清空。
    expect(exampleTeamPlan().players.every((p) => p.civ)).toBe(true);
  });

  it('空文明是合法初始状态，不报「未知文明」引用错误', () => {
    expect(teamPlanErrors(defaultTeamPlan(), ctx)).toEqual([]);
    const broken = defaultTeamPlan();
    broken.players[0]!.civ = 'NotACiv';
    expect(teamPlanErrors(broken, ctx).join()).toContain('未知文明 NotACiv');
  });

  it('空文明经分享链接完整往返，不会被替换成默认文明', () => {
    const plan = defaultTeamPlan();
    expect(decodeTeamPlan('?' + encodeTeamPlan(plan)).plan?.players.map((p) => p.civ)).toEqual(['', '']);
  });
});
