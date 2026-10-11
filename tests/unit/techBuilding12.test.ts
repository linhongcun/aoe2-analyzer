import { describe, expect, it } from 'vitest';
import { techById } from './helpers';

// #12：主研究建筑取 .dat ResearchAt 首项，不能是文明专属替代建筑（骡车 1808 / 强化教堂 1806）
const LUMBER_CAMP = 562;
const MINING_CAMP = 584;
const MONASTERY = 104;

describe('#12 科技主研究建筑', () => {
  it('7 项采集科技为伐木场 / 采矿场', () => {
    const want: Record<number, number> = {
      202: LUMBER_CAMP,
      203: LUMBER_CAMP,
      221: LUMBER_CAMP,
      55: MINING_CAMP,
      182: MINING_CAMP,
      278: MINING_CAMP,
      279: MINING_CAMP,
    };
    for (const [id, b] of Object.entries(want)) expect(techById[+id]!.b).toBe(b);
  });
  it('同根因：修道院科技为修道院而非强化教堂', () => {
    for (const id of [45, 46, 230, 231, 233, 252, 316, 319, 438, 439, 441]) expect(techById[id]!.b).toBe(MONASTERY);
  });
  it('没有科技以骡车或强化教堂为主研究建筑', () => {
    for (const t of Object.values(techById)) expect([1806, 1808]).not.toContain(t.b);
  });
});
