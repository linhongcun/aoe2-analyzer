import ecoRaw from './raw/eco';
import type { EcoDataView } from '../domain/ecoTypes';
import { DATA_PATCH_BUILD } from './meta';

/** eco.json 的唯一类型化入口；原始读取仍只经 src/data/raw/eco.ts。 */
export const ECO: EcoDataView = ecoRaw as unknown as EcoDataView;
export const ECO_PATCH_BUILD = DATA_PATCH_BUILD;
export type { EcoDataView };
