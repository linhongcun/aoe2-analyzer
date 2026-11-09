import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CIV_MECHANISM_KEYS } from '../../src/domain/buildSim';
import { BONUS_USAGE_CIVS } from '../../src/domain/bonusUsage';
import { BONUS_USAGE_EXCLUDED, PARITY_EXCLUDED } from '../../src/domain/mechanismExclusions';

const derived = (excluded: Readonly<Record<string, string>>) => CIV_MECHANISM_KEYS.filter((civ) => !Object.hasOwn(excluded, civ));

describe('#821 parity/bonusUsage 清单从 CIV_MECHANISMS 派生', () => {
  it('20 个机制文明，排除项都存在且派生结果保持 13/11', () => {
    expect(CIV_MECHANISM_KEYS).toHaveLength(20);
    for (const civ of [...Object.keys(PARITY_EXCLUDED), ...Object.keys(BONUS_USAGE_EXCLUDED)]) expect(CIV_MECHANISM_KEYS).toContain(civ);
    expect(derived(PARITY_EXCLUDED)).toHaveLength(13);
    expect(derived(BONUS_USAGE_EXCLUDED)).toHaveLength(11);
    expect(BONUS_USAGE_CIVS).toEqual(derived(BONUS_USAGE_EXCLUDED));
  });

  it('parity/bonusUsage 源码不再写完整文明数组', () => {
    const parity = readFileSync('scripts/build_mechanisms_parity.ts', 'utf8');
    expect(parity).toContain('sim.CIV_MECHANISM_KEYS.filter');
    expect(parity).not.toContain("const special = ['Portuguese'");
    const bonusUsage = readFileSync('src/domain/bonusUsage.ts', 'utf8');
    expect(bonusUsage).toContain('BONUS_USAGE_CIVS.includes(b.civ)');
    expect(bonusUsage).not.toContain("['Poles', 'Romans', 'Mapuche'");
  });
});
