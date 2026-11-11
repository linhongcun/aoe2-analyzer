import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { GARRISON_BUILDINGS, GARRISON_DATA, calculateGarrison, garrisonFreeTechs, garrisonTechs, type GarrisonContext } from '../../src/domain/garrison';
import {
  calculateGeneralGarrison,
  GENERAL_GARRISON_DATA,
  getFreeGarrisonTechs,
  getGarrisonBuildings,
  getGarrisonTechs,
  type GeneralGarrisonContext,
} from '../../src/domain/garrisonGeneral';
import { GARRISON_COVERAGE, GARRISON_GENERAL_ONLY_MODES, GARRISON_MODE_COVERAGE } from '../../src/domain/garrisonCoverage';
import { FEMALE_VILLAGER_ID, VILLAGER_UNIT_ID } from '../../src/domain/gameIds';

let ctx: GarrisonContext & GeneralGarrisonContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

describe('驻军覆盖契约（issue 905）', () => {
  it('legacy 覆盖范围来自实际常量，而不是另写一份', () => {
    expect(GARRISON_COVERAGE.legacyArrowBuildings).toEqual([...GARRISON_BUILDINGS].sort((a, b) => a - b));
    expect([...GARRISON_COVERAGE.legacyVillagerIds]).toEqual([VILLAGER_UNIT_ID, FEMALE_VILLAGER_ID]);
    expect(Object.keys(GARRISON_DATA.units).sort()).toEqual(['109', '234', '235', '293', '79', '83']);
  });

  it('重叠建筑同时存在于通用 host、通用建筑表和驻军 host 列表', () => {
    const hosts = new Set(getGarrisonBuildings(ctx).map((b) => b.id));
    for (const id of GARRISON_COVERAGE.overlapBuildings) {
      expect(GENERAL_GARRISON_DATA.buildings[String(id)], `general building ${id}`).toBeDefined();
      expect(hosts.has(id), `garrison host ${id}`).toBe(true);
    }
    expect([...GARRISON_GENERAL_ONLY_MODES]).toEqual(['cannon', 'shelter', 'economic']);
    expect(Object.keys(GARRISON_MODE_COVERAGE).sort()).toEqual(['arrows', 'cannon', 'economic', 'shelter']);
  });

  it('tech 47 的 4 个 attack 与 2 个 firepower 目标被锁定', () => {
    const tech = GARRISON_DATA.techs['47']!;
    expect(tech.effects.filter((e) => e.stat === 'attack')).toHaveLength(4);
    expect(tech.effects.filter((e) => e.stat === 'firepower')).toHaveLength(2);
  });

  it('Franks 免费科技来源差异被显式锁定', () => {
    const b = ctx.core.buildingById[109]!;
    const config = { civ: 'Franks', age: 4, techs: [], villagers: '0', rows: [] };
    const legacy = garrisonFreeTechs(ctx, b, config);
    const general = getFreeGarrisonTechs(ctx, b, config);
    expect(legacy).toEqual([]);
    expect([...general].sort((a, z) => a - z)).toEqual([12, 13, 14]);
    expect(GARRISON_COVERAGE.knownFreeTechDivergence).toBe('Franks');
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
      const general = calculateGeneralGarrison(ctx, b!, { civ, age, techs, rows: [{ unitId: 83, count: '5', entry: 'enter' }] });
      expect(general.errors, `general ${id}`).toEqual([]);
      expect(general.capacity, `capacity ${id}`).toBe(legacy.capacity);
      expect(general.totalProjectiles, `arrows ${id}`).toBe(legacy.totalArrows);
      expect(general.maxProjectiles, `max ${id}`).toBe(legacy.maxArrows);
      const legacyIds = garrisonTechs(ctx, b!, civ, age)
        .map((t) => t.id)
        .sort((a, z) => a - z);
      const generalIds = getGarrisonTechs(ctx, b!, { civ, age, techs: [], rows: [] })
        .map((t) => t.id)
        .sort((a, z) => a - z);
      expect(
        legacyIds.every((id) => generalIds.includes(id)),
        `tech subset ${id}`,
      ).toBe(true);
      // 通用模型额外提供启发 233；建筑页箭数模型不列该科技，属已声明覆盖差异。
      expect(
        generalIds.filter((id) => !legacyIds.includes(id)),
        `general-only tech ${id}`,
      ).toEqual([233]);
    }
  });
});
