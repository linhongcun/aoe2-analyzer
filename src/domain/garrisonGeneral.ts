/** Issue 224/1526: building capacity, entry compatibility and a documented projectile model. Coverage: ./garrisonCoverage.ts. */
export { writeGeneralGarrison, type GarrisonEntry, type GeneralGarrisonConfig, type GeneralGarrisonRow } from './garrisonUrl';
export { buildingAge as getGarrisonBuildingAge } from './availabilityAge';
export {
  GENERAL_GARRISON_DATA,
  GENERAL_GARRISON_LIMIT,
  garrisonUnitMask,
  getGarrisonBuildings,
  unitGarrisonPower,
  type GarrisonCandidate,
  type GarrisonRowResult,
  type GeneralGarrisonContext,
  type GeneralGarrisonData,
  type GeneralGarrisonEffect,
  type GeneralGarrisonResult,
  type GeneralGarrisonRule,
  type GeneralGarrisonUnit,
} from './garrison/types';
export { getGarrisonCandidates } from './garrison/snapshot';
export { getGarrisonTechs } from './garrison/techFilter';
export {
  calculateGeneralGarrison,
  explainGeneralGarrison,
  getFreeGarrisonTechs,
  partitionGarrisonTechs,
  readGeneralGarrison,
  toggleGeneralGarrisonTech,
} from './garrison/calculate';
