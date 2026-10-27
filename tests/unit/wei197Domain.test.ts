import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import { weiRewardFamily, weiRewardsForCompletedResearch } from '../../src/domain/weiEconomy';
import validateSpawn from '../../src/content/schema/compiled/wei-spawn.mjs';
import { validateDocument } from '../../scripts/content-schema.mjs';

describe('#197 魏有界纯奖励入口与实际compiled schema', () => {
  it.each([0, 1, 2, 3])('completedTCs%s obeys source cap1 and never creates a phantom TC', (tc) => {
    const family = weiRewardFamily(eco.civEco.Wei);
    expect(family).not.toBeNull();
    const rewards = weiRewardsForCompletedResearch(family, new Set([202]), 2, tc, new Set());
    expect(rewards.map((r) => ({ tech: r.tech, count: r.count }))).toEqual(tc === 0 ? [] : [{ tech: 1039, count: 1 }]);
  });
  it('completed prerequisites, actual age and once-per-source reward are required together', () => {
    const family = weiRewardFamily(eco.civEco.Wei);
    expect(weiRewardsForCompletedResearch(family, new Set(), 2, 1, new Set())).toEqual([]);
    expect(weiRewardsForCompletedResearch(family, new Set([202]), 1, 1, new Set())).toEqual([]);
    expect(weiRewardsForCompletedResearch(family, new Set([202]), 2, 1, new Set([1039]))).toEqual([]);
    for (const tc of [-1, 0.5, NaN, Infinity]) expect(weiRewardsForCompletedResearch(family, new Set([202]), 2, tc, new Set())).toEqual([]);
  });
  it('data-eco and actual compiled validator share one structural schema including unknown commands', () => {
    const original = eco.civEco.Wei[0]!.spawn;
    expect(validateSpawn(original)).toBe(true);
    for (const mutate of [
      (s: Record<string, unknown>) => {
        delete s.commands;
      },
      (s: Record<string, unknown>) => {
        s.effectId = '1039';
      },
      (s: Record<string, unknown>) => {
        s.extra = 1;
      },
      (s: Record<string, unknown>) => {
        s.researchAt = [[109]];
      },
      (s: Record<string, unknown>) => {
        s.commands = [{ Type: 7, A: 83, B: 109, C: NaN, D: 0 }];
      },
    ]) {
      const e = structuredClone(eco);
      mutate(e.civEco.Wei[0]!.spawn as unknown as Record<string, unknown>);
      expect(validateSpawn(e.civEco.Wei[0]!.spawn)).toBe(false);
      expect(validateDocument('src/data/eco.json', e).valid).toBe(false);
    }
    const e = structuredClone(eco);
    e.civEco.Wei[0]!.spawn!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
    expect(validateSpawn(e.civEco.Wei[0]!.spawn)).toBe(true);
    expect(validateDocument('src/data/eco.json', e).valid).toBe(true);
    expect(weiRewardFamily(e.civEco.Wei)).toBeNull();
  });
});
