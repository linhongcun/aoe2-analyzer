import { describe, expect, it } from 'vitest';
import { simTechs, simulate } from '../../src/domain/simulator';
// 修正 Kent 草稿：units 从 helpers 取；simTechs 返回 {t, ef}，取 t.id
import { ctx, units } from './helpers';

const u = (id: number) => units.find((x) => x.id === id)!;
const full = (id: number, civ: string) => {
  const x = u(id);
  const sel = new Set(simTechs(ctx, x, civ).map(({ t }) => t.id));
  return simulate(ctx, x, civ, 4, sel, new Set()) as { rng: number; rngB?: number };
};

/** #38 Kent 回归草稿（修正 import 后在 main 上按预期失败：rngB 为 undefined） */
describe('P0 对建筑射程随射程科技变化（.dat Range 属性 12）', () => {
  it('火焰弓箭手 1968 满科技：对单位 8 / 对建筑 12', () => {
    const s = full(1968, 'Wu');
    expect([s.rng, s.rngB]).toEqual([8, 12]);
  });
  it('精锐火焰弓箭手 1970 满科技：9 / 13', () => {
    const s = full(1970, 'Wu');
    expect([s.rng, s.rngB]).toEqual([9, 13]);
  });
  it('楼船 1948：吴没有攻城工程师，保持 10 / 13', () => {
    const s = full(1948, 'Wu');
    expect([s.rng, s.rngB]).toEqual([10, 13]);
  });
  it('楼船 1948：蜀、女真有攻城工程师，11 / 14', () => {
    for (const c of ['Shu', 'Jurchens']) expect([full(1948, c).rng, full(1948, c).rngB]).toEqual([11, 14]);
  });
  it('基础值不变（不选科技）', () => {
    const s = simulate(ctx, u(1968), 'Wu', 4, new Set(), new Set()) as { rngB?: number };
    expect(s.rngB).toBe(9);
  });
});
