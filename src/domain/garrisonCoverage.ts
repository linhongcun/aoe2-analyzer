/**
 * 驻军两套模型的覆盖契约（D6 / issue 905）。
 *
 * 建筑页的村民箭数模型只覆盖四座会射箭的建筑和两个村民形态；通用驻军模型
 * 覆盖全部可驻军 host，并按 arrows / cannon / shelter / economic 四种模式输出。
 * 重叠范围由 `garrisonGeneral224.test.ts` 的全文明/全年龄/全科技对照测试锁定；
 * 本模块把「哪些 id 属于哪套模型」写成可执行常量，避免以后新增建筑时只改一边。
 */
export const GARRISON_LEGACY_ARROW_BUILDINGS = [79, 109, 234, 235] as const;
export const GARRISON_LEGACY_VILLAGER_IDS = [83, 293] as const;

/** 通用模型独有、建筑页箭数模型不覆盖的展示模式。 */
export const GARRISON_GENERAL_ONLY_MODES = ['cannon', 'shelter', 'economic'] as const;

export const GARRISON_OVERLAP_BUILDINGS = GARRISON_LEGACY_ARROW_BUILDINGS;

export const GARRISON_COVERAGE = {
  legacyArrowBuildings: GARRISON_LEGACY_ARROW_BUILDINGS,
  legacyVillagerIds: GARRISON_LEGACY_VILLAGER_IDS,
  overlapBuildings: GARRISON_OVERLAP_BUILDINGS,
  generalOnlyModes: GARRISON_GENERAL_ONLY_MODES,
} as const;

export const isLegacyGarrisonBuilding = (id: number): boolean => (GARRISON_LEGACY_ARROW_BUILDINGS as readonly number[]).includes(id);
export const isGarrisonOverlapBuilding = (id: number): boolean => (GARRISON_OVERLAP_BUILDINGS as readonly number[]).includes(id);
