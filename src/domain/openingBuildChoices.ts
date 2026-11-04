import type { BuildOrder } from './buildOrder';
import { openingBuildIds } from './civOpening';
import type { Civ } from './types';

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

/** 本局路位只从该文明的真实候选选择，不改变文明页完整候选。 */
export function selectStartOpening(civ: Pick<Civ, 'en' | 'op'>, orders: readonly BuildOrder[], lane: 'flank' | 'pocket') {
  const selection = selectOpeningBuilds(civ, orders);
  const order =
    lane === 'flank'
      ? selection.builds.find((b) => b.style === 'archers')
      : (selection.builds.find((b) => b.style === 'scouts') ?? selection.builds.find((b) => b.id === 'fast-castle-knights'));
  return { kind: selection.kind, order };
}
