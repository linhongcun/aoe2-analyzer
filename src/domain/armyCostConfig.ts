import type { TrainTotalRow } from './trainTotal';
export interface ArmyCostConfig {
  civ: string;
  age: string;
  rows: TrainTotalRow[];
  done: string[];
  targets: string[];
}
export const ARMY_COST_VERSION = '1';
export const ARMY_COST_DATA = String(__DATA_SOURCES__.patch.build);
export const emptyArmyCost = (civ = 'Franks', age = '4'): ArmyCostConfig => ({ civ, age, rows: [], done: [], targets: [] });
