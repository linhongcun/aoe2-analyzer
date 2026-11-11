import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ECO } from '../../src/data/eco';
import pins from '../../scripts/data_sources.json';

const FEATURE_FILES = [
  'src/features/builds/BuildTimelineView.tsx',
  'src/features/builds/listMeta.ts',
  'src/features/builds/shareCard.ts',
  'src/features/buildings/repairCost.ts',
  'src/features/civs/arenaCastleGold.ts',
] as const;

const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));
const FEATURE_SOURCES = walk('src/features').filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));

describe('#814 features 走 eco 类型化入口', () => {
  it('整个 features 目录不直读 raw/eco，也不再把整表强转成 EcoData', () => {
    for (const file of FEATURE_SOURCES) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toContain('data/raw/eco');
      expect(source, file).not.toContain('as unknown as EcoData');
    }
  });

  it('仍直接读 eco 的已知页面从 data/eco 读取类型化 ECO', () => {
    for (const file of FEATURE_FILES) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain("from '../../data/eco'");
    }
  });

  it('下沉的数值事实在 domain 内使用类型化 data/eco', () => {
    for (const file of [
      'src/domain/villagerGatherFacts.ts',
      'src/domain/fishingGatherFacts.ts',
      'src/domain/foodAmountFacts.ts',
      'src/domain/housingFacts.ts',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toContain("from '../data/eco'");
      expect(source, file).not.toContain('data/raw/eco');
    }
  });

  it('marketFeeFacts 在 domain 内使用类型化 data/eco', () => {
    const source = readFileSync('src/domain/marketFeeFacts.ts', 'utf8');
    expect(source).toContain("from '../data/eco'");
    expect(source).not.toContain('data/raw/eco');
  });

  it('elevation 在 domain 内使用类型化 data/eco', () => {
    const source = readFileSync('src/domain/elevation.ts', 'utf8');
    expect(source).toContain("from '../data/eco'");
    expect(source).not.toContain('data/raw/eco');
  });

  it('ECO 是带 meta 的类型化视图，版本与 pin 一致', () => {
    expect(ECO.meta?.patch).toContain(`DE Update ${pins.patch.build}`);
    expect(Object.keys(ECO.civEco)).toHaveLength(56);
    expect(Object.keys(ECO.villager.tasks).length).toBeGreaterThan(0);
  });
});
