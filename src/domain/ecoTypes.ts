import type { EcoData, EffectRow } from './buildSim';

/** eco.json 的类型化视图；字段定义仍以 buildSim.ts 的 EcoData 为唯一来源。 */
export type EcoRow = EffectRow;
export type CivEcoRow = EcoRow & { name: string };
export type EcoMeta = {
  patch?: string;
  tasks?: string;
  units?: string;
  generated_by?: string;
  source?: string;
};
export type EcoDataView = Omit<EcoData, 'civEco'> & { civEco: Record<string, CivEcoRow[]>; meta?: EcoMeta };
export type EcoTech = EcoData['techs'][string];
export type EcoBuilding = EcoData['buildings'][string];
