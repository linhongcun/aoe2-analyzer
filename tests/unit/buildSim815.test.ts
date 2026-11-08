import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CIV_MECHANISMS } from '../../src/domain/buildSimMechanisms';

describe('#815 buildSim 文明特化迁入注册表', () => {
  it('buildSim 主循环不再直接判断/调用六类文明特化', () => {
    const source = readFileSync('src/domain/buildSim.ts', 'utf8');
    for (const token of ['START_VILS', 'mapucheForagerFood', 'polishStoneGold', 'armenianResearchBonus', "civ === 'Chinese'", 'georgians?.start'])
      expect(source, token).not.toContain(token);
  });

  it('六类扩展点都登记在 CIV_MECHANISMS', () => {
    expect(CIV_MECHANISMS.Mayans?.startingVillagers).toBeTypeOf('function');
    expect(CIV_MECHANISMS.Chinese?.techCostRule).toBeTypeOf('function');
    expect(CIV_MECHANISMS.Georgians?.startingBuildings).toBeTypeOf('function');
    expect(CIV_MECHANISMS.Armenians?.researchRewards).toBeTypeOf('function');
    expect(CIV_MECHANISMS.Mapuche?.foragerFoodIncome).toBeTypeOf('function');
    expect(CIV_MECHANISMS.Poles?.stoneGoldIncome).toBeTypeOf('function');
  });
});
