import { describe, expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { openingBuildIds } from '../../src/domain/civOpening';
import { selectOpeningBuilds } from '../../src/features/civs/openingBuildChoices';

const civ = (en: string) => civs.find((entry) => entry.en === en)!;
const ids = (orders: readonly BuildOrder[]) => orders.map((order) => order.id);
const order = (id: string) => buildOrders.find((entry) => entry.id === id)!;

describe('#480 source membership takes priority over route-text examples', () => {
  it.each(['Tatars', 'Mayans'])('%s exposes the actual listed archer flow', (en) => {
    const result = selectOpeningBuilds(civ(en), buildOrders);
    expect(result.kind).toBe('listed');
    expect(ids(result.builds)).toEqual(['archers-19']);
  });

  it('Varangians falls back to the original scouts example, explicitly generic', () => {
    const result = selectOpeningBuilds(civ('Varangians'), buildOrders);
    expect(result.kind).toBe('generic');
    expect(ids(result.builds)).toEqual(['scouts-18']);
  });

  it('keeps multiple explicit Franks flows and does not mix a Slavs fallback into its listed flow', () => {
    const franks = selectOpeningBuilds(civ('Franks'), buildOrders);
    expect(franks.kind).toBe('listed');
    expect(ids(franks.builds)).toEqual(buildOrders.filter((candidate) => candidate.civs.includes('Franks')).map((candidate) => candidate.id));
    expect(ids(franks.builds)).toEqual(expect.arrayContaining(['scouts-18', 'fast-castle-knights']));
    const slavs = selectOpeningBuilds(civ('Slavs'), buildOrders);
    expect(slavs.kind).toBe('listed');
    expect(ids(slavs.builds)).toEqual(['fast-castle-knights']);
  });

  it('all 56 civilizations get every source membership, otherwise only original first-stage examples', () => {
    expect(civs).toHaveLength(56);
    for (const entry of civs) {
      const original = JSON.stringify({ entry, buildOrders });
      const result = selectOpeningBuilds(entry, buildOrders);
      const listed = buildOrders.filter((candidate) => candidate.civs.includes(entry.en));
      expect(new Set(ids(result.builds)).size, entry.en).toBe(result.builds.length);
      if (listed.length) {
        expect(result.kind, entry.en).toBe('listed');
        expect(ids(result.builds), entry.en).toEqual(ids(listed));
        for (const candidate of result.builds) expect(candidate.civs, entry.en).toContain(entry.en);
      } else {
        expect(result.kind, entry.en).toBe('generic');
        const expected = openingBuildIds(entry.op).filter((id) => buildOrders.some((candidate) => candidate.id === id));
        expect(ids(result.builds), entry.en).toEqual(expected);
      }
      expect(JSON.stringify({ entry, buildOrders }), entry.en).toBe(original);
    }
  });

  it('returns all explicit matches in input order and deduplicates identities before any fallback', () => {
    // Synthetic catalogue entries isolate selection; production BO data stays unchanged.
    const first = { ...order('archers-19'), id: 'first-listed' };
    const second = { ...order('archers-19'), id: 'second-listed' };
    const result = selectOpeningBuilds({ en: 'Tatars', op: '斥候 -> 城堡骑士' }, [second, order('scouts-18'), first, second]);
    expect(result.kind).toBe('listed');
    expect(ids(result.builds)).toEqual(['second-listed', 'first-listed']);
  });

  it('generic examples preserve first-stage order and do not use castle-stage words', () => {
    const input = { en: 'NotListed', op: '民兵/弓手 -> 城堡骑士' };
    expect(ids(selectOpeningBuilds(input, buildOrders).builds)).toEqual(['maa-archers-18', 'archers-19']);
    expect(selectOpeningBuilds({ en: 'NotListed', op: '鹰侦察 -> 城堡弓手' }, buildOrders)).toEqual({ kind: 'generic', builds: [] });
  });

  it('handles absent catalogue entries, no matches and repeated fallback entries without inventing a flow', () => {
    expect(selectOpeningBuilds(civ('Tatars'), [])).toEqual({ kind: 'generic', builds: [] });
    expect(selectOpeningBuilds({ en: 'NotListed', op: '无匹配路线' }, buildOrders)).toEqual({ kind: 'generic', builds: [] });
    expect(ids(selectOpeningBuilds(civ('Varangians'), [order('scouts-18'), order('scouts-18')]).builds)).toEqual(['scouts-18']);
  });
});
