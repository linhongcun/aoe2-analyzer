/**
 * 驻军预览 URL 序列化与默认驻军行（零 JSON 依赖）。
 * 供建筑对照表等不需要 777 KB garrison_general.json 的调用方生成合法 ?tab=garrison 链接。
 */
import { TC_BY_AGE, VILLAGER_UNIT_ID } from './gameIds';

export type GarrisonEntry = 'enter' | 'created' | 'deposit';

export interface GeneralGarrisonRow {
  unitId: number;
  count: string;
  entry: GarrisonEntry;
}

export interface GeneralGarrisonConfig {
  civ: string;
  age: number;
  techs: number[];
  rows: GeneralGarrisonRow[];
}

const uniqueSorted = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);

const DEFAULT_VILLAGER_GARRISON_HOSTS = new Set<number>([TC_BY_AGE[0]!, 79, 234, 235]);

/** 与 BuildingSimulator / GeneralGarrisonPreview 一致的默认空驻军行。 */
export function defaultGarrisonRows(buildingId: number): GeneralGarrisonRow[] {
  return DEFAULT_VILLAGER_GARRISON_HOSTS.has(buildingId) ? [{ unitId: VILLAGER_UNIT_ID, count: '0', entry: 'enter' }] : [];
}

export function writeGeneralGarrison(config: GeneralGarrisonConfig): URLSearchParams {
  return new URLSearchParams({
    tab: 'garrison',
    gv: '2',
    civ: config.civ,
    age: String(config.age),
    gtechs: uniqueSorted(config.techs).join(','),
    army: config.rows.map((r) => `${r.unitId}:${r.count}:${r.entry === 'enter' ? 'e' : r.entry === 'deposit' ? 'd' : 'c'}`).join(','),
  });
}
