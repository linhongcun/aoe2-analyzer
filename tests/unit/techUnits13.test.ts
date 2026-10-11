import { describe, expect, it } from 'vitest';
import { techAffects } from '../../src/domain/affects';
import { affectedUnits, buildFamilies } from '../../src/domain/family';
import type { Building, Unit } from '../../src/domain/types';
import buildingsJson from '../../src/data/buildings.json';
import { tech, units } from './helpers';

const buildings = buildingsJson as unknown as Building[];
const byId: Record<number, Unit> = Object.fromEntries(units.map((u) => [u.id, u]));
const fam = buildFamilies(units, byId);
const rel = (en: string) => affectedUnits(techAffects(tech(en), units, buildings), fam);

describe('#13 科技涉及单位来自结构化效果', () => {
  it('鼓风炉涉及骑士和长剑士', () => {
    const ids = rel('Blast Furnace').map((u) => u.id);
    expect(ids).toContain(38); // 骑士
    expect(ids).toContain(77); // 长剑士
  });
  it('同一单位只出现一次', () => {
    const ids = rel('Blast Furnace').map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
