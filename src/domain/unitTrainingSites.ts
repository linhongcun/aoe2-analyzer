import type { Unit } from './types';
import { CONDITIONAL_TRAINING_FAMILIES } from './trainingUnlocks';

const MONK = 125;
const WARRIOR_PRIEST = 1811;
const MONASTERY = 104;
const FORTIFIED_CHURCH = 1806;
const CASTLE = 82;
const ARCHERY_RANGE = 87;
const BARRACKS = 12;
const CHURCH_CIVS = ['Armenians', 'Georgians'] as const;

export const SETTLEMENT = 2556;
export const MAPUCHE_CIV = 'Mapuche';
/** DE 188329 马普切文明树聚落（2556）格下列出的 5 个可训练单位及常规主训练建筑（不含 1155）。 */
export const MAPUCHE_SETTLEMENT_UNITS = [
  { id: 7, primary: ARCHERY_RANGE },
  { id: 6, primary: ARCHERY_RANGE },
  { id: 93, primary: BARRACKS },
  { id: 358, primary: BARRACKS },
  { id: 359, primary: BARRACKS },
] as const;

const mapucheSettlementById = new Map<number, number>(MAPUCHE_SETTLEMENT_UNITS.map(({ id, primary }) => [id, primary]));

const variants = new Map<number, { primary: number; alternate: number; civ: string; building: number; tech: number }>();
for (const { civ, building, tech, pairs } of CONDITIONAL_TRAINING_FAMILIES) {
  for (const [primary, alternate] of pairs) {
    const variant = { primary, alternate, civ, building, tech };
    variants.set(primary, variant);
    variants.set(alternate, variant);
  }
}

interface Site {
  building: number;
  civ?: string;
}

interface ConditionalSite extends Site {
  tech: number;
}

interface AdditionalSite {
  building: number;
  civ: string;
}

type TrainingSites =
  | { kind: 'unavailable' }
  | {
      kind: 'available';
      primary: Site;
      exceptions?: Site[];
      conditional?: ConditionalSite;
      additional?: AdditionalSite[];
    };

/** Prefer the castle form of the matching ordinary or elite unit in the one-row catalogue. */
export function catalogueTrainingUnit(id: number): number {
  return variants.get(id)?.primary ?? id;
}

/** 只补充已经按固定文明树核对的训练地点。 */
export function trainingSites(unit: Pick<Unit, 'id' | 'civs'>, civ?: string): TrainingSites | null {
  const settlementPrimary = mapucheSettlementById.get(unit.id);
  if (settlementPrimary !== undefined) {
    if (civ && civ !== MAPUCHE_CIV) return null;
    const hasMapuche = unit.civs.includes(MAPUCHE_CIV);
    if (civ === MAPUCHE_CIV && !hasMapuche) return { kind: 'unavailable' };
    return {
      kind: 'available',
      primary: civ ? { building: settlementPrimary, civ } : { building: settlementPrimary },
      additional: hasMapuche ? [{ building: SETTLEMENT, civ: MAPUCHE_CIV }] : [],
    };
  }
  const variant = variants.get(unit.id);
  if (unit.id !== MONK && unit.id !== WARRIOR_PRIEST && !variant) return null;
  if (civ && !unit.civs.includes(civ)) return { kind: 'unavailable' };

  if (variant) {
    return {
      kind: 'available',
      primary: { building: CASTLE, civ: variant.civ },
      conditional: { building: variant.building, civ: variant.civ, tech: variant.tech },
    };
  }
  if (unit.id === WARRIOR_PRIEST) {
    return { kind: 'available', primary: { building: FORTIFIED_CHURCH, civ: 'Armenians' } };
  }
  if (civ) {
    const building = CHURCH_CIVS.some((owner) => owner === civ) ? FORTIFIED_CHURCH : MONASTERY;
    return { kind: 'available', primary: { building, civ } };
  }
  return {
    kind: 'available',
    primary: { building: MONASTERY },
    exceptions: CHURCH_CIVS.filter((owner) => unit.civs.includes(owner)).map((owner) => ({ building: FORTIFIED_CHURCH, civ: owner })),
  };
}

/** Scope this reverse row to the buildings and entity IDs that actually train the unit. */
export function trainingAtBuilding(unit: Pick<Unit, 'id' | 'civs'>, building: number): { civs: string[]; tech?: number; onlyInOwner?: true } | null {
  if (mapucheSettlementById.has(unit.id)) {
    if (building !== SETTLEMENT) return null;
    return { civs: unit.civs.includes(MAPUCHE_CIV) ? [MAPUCHE_CIV] : [] };
  }
  if (!trainingSites(unit)) return null;
  const variant = variants.get(unit.id);
  const tech = variant?.alternate === unit.id ? variant.tech : undefined;
  const civs = unit.civs.filter((civ) => {
    const sites = trainingSites(unit, civ);
    if (sites?.kind !== 'available') return false;
    return tech === undefined ? sites.primary.building === building : sites.conditional?.building === building;
  });
  return {
    civs,
    ...(tech === undefined ? {} : { tech }),
    ...(unit.id === WARRIOR_PRIEST ? { onlyInOwner: true } : {}),
  };
}
