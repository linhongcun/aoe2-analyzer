import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ECO, ECO_PATCH_BUILD } from '../../src/data/eco';
import pins from '../../scripts/data_sources.json';

const FEATURE_FILES = [
  'src/features/builds/BuildTimelineView.tsx',
  'src/features/builds/listMeta.ts',
  'src/features/builds/shareCard.ts',
  'src/features/buildings/foodAmount.ts',
  'src/features/buildings/marketFees.ts',
  'src/features/buildings/repairCost.ts',
  'src/features/civs/arenaCastleGold.ts',
  'src/features/gameGuide/elevation.ts',
  'src/features/gameGuide/housing.ts',
  'src/features/units/fishingGather.ts',
  'src/features/units/villagerGather.ts',
] as const;

describe('#814 features 走 eco 类型化入口', () => {
  it('feature 不直读 raw/eco，也不再把整表强转成 EcoData', () => {
    for (const file of FEATURE_FILES) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toContain('data/raw/eco');
      expect(source, file).not.toContain('as unknown as EcoData');
      expect(source, file).toContain("from '../../data/eco'");
    }
  });

  it('ECO 是带 meta 的类型化视图，版本与 pin 一致', () => {
    expect(ECO_PATCH_BUILD).toBe(pins.patch.build);
    expect(ECO.meta?.patch).toContain(`DE Update ${pins.patch.build}`);
    expect(Object.keys(ECO.civEco)).toHaveLength(56);
    expect(Object.keys(ECO.villager.tasks).length).toBeGreaterThan(0);
  });
});
