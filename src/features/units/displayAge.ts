import type { Unit } from '../../domain/types';

/**
 * Catalog display only. The pinned trees put Spearman in Feudal for the common
 * case and Dark Age for Armenians; the generated record retains the latter.
 * Source: docs/design/spearman-display-age-475-sources.json. Never use this
 * projection for production, costs, combat or the build simulator.
 */
export function unitDisplayAge(unit: Pick<Unit, 'id' | 'age'>, civ = ''): number {
  return unit.id === 93 ? (civ === 'Armenians' ? 1 : 2) : unit.age;
}

/** Keep the original unit data and family indexes intact; copy only an exception. */
export function projectUnitDisplayAges(units: readonly Unit[], civ = ''): Unit[] {
  return units.map((unit) => {
    const age = unitDisplayAge(unit, civ);
    return age === unit.age ? unit : { ...unit, age };
  });
}
