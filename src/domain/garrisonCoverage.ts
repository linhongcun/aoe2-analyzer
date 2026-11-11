/**
 * 驻军两套模型的覆盖契约（D6 / issue 905）。
 *
 * 建筑页的村民箭数模型只覆盖 `GARRISON_BUILDINGS` 与两个村民形态；通用驻军
 * 模型覆盖全部可驻军 host，并按 arrows / cannon / shelter / economic 四种模式输出。
 * 重叠范围由 `garrisonGeneral224.test.ts` 的全文明/全年龄/全科技对照测试锁定。
 *
 * 两套模型的免费科技来源不同：建筑页读 `garrison.json` 的 `civs[civ].free`，
 * 通用预览读 `garrison_techs.json` 的 `civs[civ].free`。当前已知差异是 Franks：
 * 建筑页为空，通用预览为磨坊科技 12/13/14；通用模型还额外列出启发 233。
 * 这两处是有意保留的数据边界，测试锁定，不强行合并。
 */
import hostIds from '../data/garrison_hosts.json';
import { GARRISON_BUILDINGS } from './garrison';
import type { GeneralGarrisonResult } from './garrisonGeneral';
import { FEMALE_VILLAGER_ID, VILLAGER_UNIT_ID } from './gameIds';

export const GARRISON_LEGACY_ARROW_BUILDINGS: readonly number[] = [...GARRISON_BUILDINGS].sort((a, b) => a - b);
export const GARRISON_LEGACY_VILLAGER_IDS = [VILLAGER_UNIT_ID, FEMALE_VILLAGER_ID] as const;
export const GARRISON_OVERLAP_BUILDINGS = GARRISON_LEGACY_ARROW_BUILDINGS.filter((id) => (hostIds as number[]).includes(id));

/** 新增 mode 时这里会因缺少 key 而类型报错。 */
export const GARRISON_MODE_COVERAGE: Record<GeneralGarrisonResult['mode'], 'overlap' | 'general-only'> = {
  arrows: 'overlap',
  cannon: 'general-only',
  shelter: 'general-only',
  economic: 'general-only',
};

export const GARRISON_GENERAL_ONLY_MODES = (Object.entries(GARRISON_MODE_COVERAGE) as [GeneralGarrisonResult['mode'], 'overlap' | 'general-only'][])
  .filter(([, kind]) => kind === 'general-only')
  .map(([mode]) => mode);

export const GARRISON_COVERAGE = {
  legacyArrowBuildings: GARRISON_LEGACY_ARROW_BUILDINGS,
  legacyVillagerIds: GARRISON_LEGACY_VILLAGER_IDS,
  overlapBuildings: GARRISON_OVERLAP_BUILDINGS,
  modeCoverage: GARRISON_MODE_COVERAGE,
  freeTechSources: { legacy: 'garrison.json', general: 'garrison_techs.json' },
  knownFreeTechDivergence: 'Franks',
} as const;
