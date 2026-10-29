import type { BuildOrder } from '../../domain/buildOrder';
import { openingBuildIds } from '../../domain/civOpening';
import type { Civ } from '../../domain/types';

/** Source membership takes priority over the existing troop-route keyword fallback. */
export function selectOpeningBuilds(civ: Pick<Civ, 'en' | 'op'>, orders: readonly BuildOrder[]) {
  const seen = new Set<string>();
  const unique = orders.filter((order) => {
    if (seen.has(order.id)) return false;
    seen.add(order.id);
    return true;
  });
  const listed = unique.filter((order) => order.civs.includes(civ.en));
  if (listed.length) return { kind: 'listed' as const, builds: listed };
  const ids = [...new Set(openingBuildIds(civ.op))];
  return { kind: 'generic' as const, builds: ids.flatMap((id) => unique.filter((order) => order.id === id)) };
}
