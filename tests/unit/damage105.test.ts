import { describe, expect, it } from 'vitest';
import { damageBreakdown, damageSources } from '../../src/domain/damageBreakdown';
import { damagePerHit, fighterFrom } from '../../src/domain/duel';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { ctx, units } from './helpers';

describe('逐击来源与战斗引擎一致', () => {
  it.each([
    [567, 'Japanese'],
    [569, 'Franks'],
    [4, 'Britons'],
    [93, 'Byzantines'],
    [83, 'Incas'],
  ] as const)('%s %s 的来源按实际效果顺序累加', (id, civ) => {
    const u = units.find((u) => u.id === id)!;
    const sel = presetUpTo(simTechs(ctx, u, civ), 4);
    const trace = damageSources(ctx, u, civ, 4, sel, new Set());
    expect(trace.fighter).toEqual(fighterFrom(u, simulate(ctx, u, civ, 4, sel, new Set())));
    for (const [stat, base, final] of [
      ['攻击', u.atk, Object.values(trace.fighter.attack)[0]!],
      ['近战护甲', u.ma, trace.fighter.armor['近战']!],
      ['穿刺护甲', u.pa, trace.fighter.armor['穿刺']!],
    ] as const) {
      const delta = trace.sources
        .flatMap((s) => s.changes)
        .filter((c) => c.stat === stat)
        .reduce((sum, c) => sum + c.after - c.before, 0);
      expect(base + delta).toBeCloseTo(final);
    }
    const d = damageBreakdown(trace.fighter, trace.fighter);
    expect(d.rows.reduce((sum, row) => sum + row.damage, 0) + d.minimum).toBeCloseTo(damagePerHit(trace.fighter, trace.fighter));
  });
  it('锻造来源有科技名称与链接 ID', () => {
    const u = units.find((u) => u.id === 74)!;
    const forge = ctx.techs.find((t) => t.en === 'Forging')!;
    const trace = damageSources(ctx, u, 'Japanese', 2, new Set([forge.id]), new Set());
    expect(trace.sources.find((s) => s.techId === forge.id)).toMatchObject({
      source: `科技：${forge.zh}`,
      changes: [{ stat: '攻击', before: u.atk, after: u.atk + 1 }],
    });
  });
  it('负攻击和最低伤害补足都显式保留', () => {
    const u = units.find((u) => u.id === 74)!;
    const f = damageSources(ctx, u, 'Japanese', 1, new Set(), new Set()).fighter;
    const d = damageBreakdown({ ...f, attack: { 近战: 2, 村民: -3 } }, { ...f, armor: { 近战: 0, 村民: 0 } });
    expect(d).toMatchObject({ subtotal: -1, minimum: 2, total: 1 });
  });
});
