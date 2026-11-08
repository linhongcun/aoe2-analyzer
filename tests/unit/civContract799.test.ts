import { describe, expect, it } from 'vitest';
import unitsRaw from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { ECO } from '../../src/data/eco';
import { simulateBuild, type UpgradeData } from '../../src/domain/buildSim';
import { chineseModel } from '../../src/domain/chineseEconomy';
import { khmerModel } from '../../src/domain/khmerEconomy';
import fixture from './__fixtures__/civContractEquivalence.json';

const units = unitsRaw as unknown as { id: number; up?: unknown }[];
const upgrades = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;

describe('#799 文明机制契约样板', () => {
  it('Chinese/Khmer 实现同一 CivModel 契约', () => {
    expect(chineseModel.civ).toBe('Chinese');
    expect(khmerModel.civ).toBe('Khmer');
    expect(Array.isArray(chineseModel.context(ECO).reasons)).toBe(true);
    expect(Array.isArray(khmerModel.context(ECO).reasons)).toBe(true);
    expect(typeof chineseModel.assumptions).toBe('function');
    expect(typeof khmerModel.assumptions).toBe('function');
  });

  it('迁移前后 8 套开局输出逐项相同', () => {
    const expected = fixture as Record<string, Record<string, unknown>>;
    for (const civ of ['Chinese', 'Khmer'] as const) {
      for (const bo of buildOrders) {
        expect(simulateBuild(bo, civ, ECO, upgrades), `${civ}/${bo.id}`).toEqual(expected[civ]![bo.id]);
      }
    }
  });
});
