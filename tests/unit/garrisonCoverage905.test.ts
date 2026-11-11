import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { GARRISON_DATA, calculateGarrison, garrisonTechs, type GarrisonContext } from '../../src/domain/garrison';
import { calculateGeneralGarrison, GENERAL_GARRISON_DATA, type GeneralGarrisonContext } from '../../src/domain/garrisonGeneral';
import { GARRISON_COVERAGE, GARRISON_GENERAL_ONLY_MODES } from '../../src/domain/garrisonCoverage';

let ctx: GarrisonContext & GeneralGarrisonContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

describe('驻军覆盖契约（issue 905）', () => {
  it('legacy 只覆盖四座箭塔/城镇中心与两个村民形态', () => {
    expect([...GARRISON_COVERAGE.legacyArrowBuildings]).toEqual([79, 109, 234, 235]);
    expect([...GARRISON_COVERAGE.legacyVillagerIds]).toEqual([83, 293]);
    expect(Object.keys(GARRISON_DATA.units).sort()).toEqual(['109', '234', '235', '293', '79', '83']);
  });

  it('重叠建筑同时存在于通用 host 与通用建筑表', () => {
    for (const id of GARRISON_COVERAGE.overlapBuildings) {
      expect(GENERAL_GARRISON_DATA.buildings[String(id)], `general building ${id}`).toBeDefined();
    }
    expect([...GARRISON_GENERAL_ONLY_MODES]).toEqual(['cannon', 'shelter', 'economic']);
  });

  it('四座重叠建筑的村民容量与箭数仍与通用模型一致', () => {
    for (const id of GARRISON_COVERAGE.overlapBuildings) {
      const b = ctx.core.buildingById[id];
      expect(b, `building ${id}`).toBeDefined();
      const civ = 'Britons';
      const age = 4;
      const techs = garrisonTechs(ctx, b!, civ, age).map((t) => t.id);
      const legacy = calculateGarrison(ctx, b!, { civ, age, techs, villagers: '5' });
      expect(legacy.errors, `legacy ${id}`).toEqual([]);
      const general = calculateGeneralGarrison(ctx, b!, {
        civ,
        age,
        techs,
        rows: [{ unitId: 83, count: '5', entry: 'enter' }],
      });
      expect(general.errors, `general ${id}`).toEqual([]);
      expect(general.capacity, `capacity ${id}`).toBe(legacy.capacity);
      expect(general.totalProjectiles, `arrows ${id}`).toBe(legacy.totalArrows);
      expect(general.maxProjectiles, `max ${id}`).toBe(legacy.maxArrows);
    }
  });
});
