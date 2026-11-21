import type { Unit } from './types';

const MONK = 125;
const WARRIOR_PRIEST = 1811;
const MONASTERY = 104;
const FORTIFIED_CHURCH = 1806;
const CASTLE = 82;
const CHURCH_CIVS = ['Armenians', 'Georgians'] as const;

// DE 188329 的哥特与匈奴文明树把这些次要节点标为 ResearchRequired。
// 普通、精锐及各建筑节点仍保留独立 ID。
const GATED_FAMILIES = [
  {
    civ: 'Goths',
    building: 12,
    tech: 16,
    pairs: [
      [41, 759],
      [555, 761],
    ],
  },
  {
    civ: 'Huns',
    building: 101,
    tech: 483,
    pairs: [
      [755, 886],
      [757, 887],
    ],
  },
] as const;

const variants = new Map<number, { primary: number; alternate: number; civ: string; building: number; tech: number }>();
for (const { civ, building, tech, pairs } of GATED_FAMILIES) {
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

type TrainingSites =
  | { kind: 'unavailable' }
  | {
      kind: 'available';
      primary: Site;
      exceptions?: Site[];
      conditional?: ConditionalSite;
    };

/** Prefer the castle form of the matching ordinary or elite unit in the one-row catalogue. */
export function catalogueTrainingUnit(id: number): number {
  return variants.get(id)?.primary ?? id;
}

/** 只补充已经按固定文明树核对的训练地点。 */
export function trainingSites(unit: Pick<Unit, 'id' | 'civs'>, civ?: string): TrainingSites | null {
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
