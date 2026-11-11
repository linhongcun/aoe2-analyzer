/**
 * 城镇中心建造时间的唯一口径说明（D12 / issue 910）。
 *
 * 两个数字来自不同数据层，不能静默合并：
 * - eco.json / aoe2techtree：开局模拟使用的 100 秒；
 * - .dat construction 导出：施工页使用的 150 秒（城镇中心四种形态一致）。
 *
 * 本模块只暴露两个有名字的读取和一句说明，页面不再手写 100/150。
 */
import { ECO, type EcoDataView } from '../data/eco';
import { CONSTRUCTION_DATA, type ConstructionData } from '../data/construction';
import { TOWN_CENTER_ID } from './gameIds';
export { TOWN_CENTER_ID } from './gameIds';

export function openingTownCenterBuildTime(eco: EcoDataView = ECO): number | null {
  const value = eco.buildings[TOWN_CENTER_ID]?.buildTime;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function constructionTownCenterBuildTime(data: ConstructionData = CONSTRUCTION_DATA): number | null {
  const forms = data.buildings[String(TOWN_CENTER_ID)]?.forms ?? [];
  const times = new Set<number>();
  for (const civ of Object.values(data.civs)) {
    for (const form of forms) {
      const value = civ.units[String(form)]?.time;
      if (typeof value === 'number' && Number.isFinite(value)) times.add(value);
    }
  }
  return times.size === 1 ? [...times][0]! : null;
}

export interface TownCenterBuildTimes {
  opening: number | null;
  construction: number | null;
}

export function townCenterBuildTimes(eco: EcoDataView = ECO, data: ConstructionData = CONSTRUCTION_DATA): TownCenterBuildTimes {
  return { opening: openingTownCenterBuildTime(eco), construction: constructionTownCenterBuildTime(data) };
}

/** 施工页 warning 文本；两个值都从数据读取。 */
export function townCenterBuildTimeNote(eco: EcoDataView = ECO, data: ConstructionData = CONSTRUCTION_DATA): string | null {
  const { opening, construction } = townCenterBuildTimes(eco, data);
  if (opening === null || construction === null || opening === construction) return null;
  return `按游戏里实际建造城镇中心的 ${construction} 秒计算，和其他页面里的 ${opening} 秒不是同一个口径。`;
}
