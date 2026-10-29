import { describe, expect, it } from 'vitest';
import civs from '../../src/data/civs.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { COUNTER_EXTRA } from '../../src/domain/ratings';
import type { Trees } from '../../src/domain/types';
import { counterExtra, rushDrill, techAvailable, unavailableBuildUnits, unitAvailable, type MatchupData } from '../../src/features/matchup/availability';
import { techById, trees, units } from './helpers';

const data: MatchupData = { core: { unitById: Object.fromEntries(units.map((unit) => [unit.id, unit])), techById }, trees };
const order = (id: string) => buildOrders.find((entry) => entry.id === id)!;
const guides = [
  { id: 'militia', a: 4, b: 74, na: 2, nb: 3 },
  { id: 'scouts', a: 93, b: 448, na: 2, nb: 3 },
  { id: 'archers', a: 7, b: 4, na: 4, nb: 4 },
  { id: 'towers', a: 83, b: 83, na: 6, nb: 5 },
];
const query = (url: string) => new URLSearchParams(url.split('?')[1]);

function withoutCell(civ: string, kind: 'u' | 't', id: number): MatchupData {
  const changed: Trees = structuredClone(trees);
  for (const block of changed.t[civ]!) block[3] = block[3].filter((cell) => cell[2] !== kind || cell[3] !== id);
  return { core: data.core, trees: changed };
}

describe('#469 actual typed unit and technology availability', () => {
  it('respects the real Spearman tree epoch, including Armenian Dark Age access', () => {
    expect(data.core.unitById[93]!.age).toBe(1);
    expect(unitAvailable(data, 'Britons', 93, 1)).toBe(false);
    expect(unitAvailable(data, 'Britons', 93, 2)).toBe(true);
    expect(unitAvailable(data, 'Armenians', 93, 1)).toBe(true);
    // Existing shared early-unit overrides remain authoritative over layout rows.
    expect(unitAvailable(data, 'Armenians', 75, 1)).toBe(true);
    expect(unitAvailable(data, 'Armenians', 77, 2)).toBe(true);
    expect(unitAvailable(data, 'Britons', 77, 2)).toBe(false);
  });

  it('does not confuse unavailable Incas unit 74 with the available technology of the same ID', () => {
    const cells = trees.t.Incas!.flatMap((block) => block[3]);
    expect(cells.some((cell) => cell[2] === 'u' && cell[3] === 74 && cell[4] === 0)).toBe(true);
    expect(cells.some((cell) => cell[2] === 't' && cell[3] === 74 && cell[4] === 1)).toBe(true);
    expect(unitAvailable(data, 'Incas', 74, 2)).toBe(false);
    const changed: MatchupData = {
      core: { ...data.core, unitById: { ...data.core.unitById, 74: { ...data.core.unitById[74]!, civs: [...data.core.unitById[74]!.civs, 'Incas'] } } },
      trees,
    };
    expect(unitAvailable(changed, 'Incas', 74, 2)).toBe(false);
  });

  it('requires a real typed cell and catalogue membership, without an unknown-civilization fallback', () => {
    expect(unitAvailable(withoutCell('Mayans', 'u', 4), 'Mayans', 4, 4)).toBe(false);
    expect(techAvailable(withoutCell('Franks', 't', 22), 'Franks', 22, 2)).toBe(false);
    expect(unitAvailable(data, 'Mayans', 448, 2)).toBe(false);
    expect(unitAvailable(data, 'Nobody', 4, 2)).toBe(false);
    expect(techAvailable(data, 'Nobody', 22, 2)).toBe(false);
    expect(unitAvailable(data, 'Franks', 999999, 4)).toBe(false);
    expect(techAvailable(data, 'Franks', 999999, 4)).toBe(false);
    for (const age of [0, 5, 1.5, NaN]) {
      expect(unitAvailable(data, 'Franks', 4, age)).toBe(false);
      expect(techAvailable(data, 'Franks', 22, age)).toBe(false);
    }
  });

  it('checks technology epochs independently from unit IDs and retains legal Loom', () => {
    expect(techAvailable(data, 'Franks', 22, 1)).toBe(true);
    expect(techAvailable(data, 'Incas', 22, 2)).toBe(true);
    expect(techAvailable(data, 'Franks', 93, 2)).toBe(false);
    expect(techAvailable(data, 'Franks', 93, 3)).toBe(true);
  });

  it('all 56 civilizations retain the four common Feudal defensive units from the actual catalogue and tree', () => {
    expect(civs).toHaveLength(56);
    for (const civ of civs) for (const id of [4, 7, 93, 83]) expect(unitAvailable(data, civ.en, id, 2), `${civ.en} u${id}`).toBe(true);
  });
});

describe('#469 current-matchup drills and executable reference flows', () => {
  it('preserves all four fixed drill counts while encoding the actual two civilizations', () => {
    for (const guide of guides) {
      const drill = rushDrill(data, 'Franks', 'Britons', guide);
      expect(drill.unavailable).toEqual([]);
      const params = query(drill.url!);
      const techs = guide.id === 'towers' ? '22' : '';
      expect(params.get('a')).toBe(`${guide.a}.Franks.2.${techs}.`);
      expect(params.get('b')).toBe(`${guide.b}.Britons.2.${techs}.`);
      expect(params.get('na')).toBe(String(guide.na));
      expect(params.get('nb')).toBe(String(guide.nb));
      expect(params.get('m')).toBe('n');
    }
  });

  it('rejects an unavailable enemy or own unit without substituting unit, civilization or pressure', () => {
    const militia = guides[0]!;
    expect(rushDrill(data, 'Franks', 'Incas', militia)).toMatchObject({ url: null, unavailable: [{ side: 'enemy', id: 74 }] });
    expect(rushDrill(data, 'Franks', 'Mayans', guides[1]!)).toMatchObject({ url: null, unavailable: [{ side: 'enemy', id: 448 }] });
    expect(rushDrill(withoutCell('Franks', 'u', 4), 'Franks', 'Britons', militia)).toMatchObject({ url: null, unavailable: [{ side: 'own', id: 4 }] });
  });

  it('a missing Loom tree cell prevents the tower preset instead of silently dropping its technology', () => {
    expect(rushDrill(withoutCell('Britons', 't', 22), 'Franks', 'Britons', guides[3]!)).toMatchObject({ url: null, unavailable: [{ side: 'enemy', id: 22 }] });
    const legal = query(rushDrill(data, 'Mayans', 'Incas', guides[3]!).url!);
    expect(legal.get('a')).toBe('83.Mayans.2.22.');
    expect(legal.get('b')).toBe('83.Incas.2.22.');
  });

  it('filters the real Mayans scout flow by explicit trained units, while allowing the real archer flow', () => {
    expect(unavailableBuildUnits(data, 'Mayans', order('scouts-18'))).toEqual([448]);
    expect(unavailableBuildUnits(data, 'Mayans', order('archers-19'))).toEqual([]);
    expect(unavailableBuildUnits(data, 'Franks', order('scouts-18'))).toEqual([]);
    // This guard is unit eligibility, independent of economic simulation support.
    expect(unavailableBuildUnits(data, 'Chinese', order('archers-19'))).toEqual([]);
  });

  it('checks upgrade target forms against the target age, with stable deduplication', () => {
    const upgrade: BuildOrder = {
      ...order('archers-19'),
      target: { age: 2, vils: 19 },
      steps: [
        {
          vils: 19,
          actions: [
            { type: 'train', unit: 74 },
            { type: 'upgrade', unit: 77 },
            { type: 'upgrade', unit: 77 },
          ],
        },
      ],
    };
    expect(unavailableBuildUnits(data, 'Franks', upgrade)).toEqual([77]);
    expect(unavailableBuildUnits(data, 'Armenians', upgrade)).toEqual([]);
    expect(unavailableBuildUnits(data, 'Incas', upgrade)).toEqual([74, 77]);
  });

  it('uses actual tree legality for all civilizations and leaves all inputs unchanged', () => {
    const before = JSON.stringify({ data, buildOrders, guides });
    for (const civ of civs)
      for (const guide of guides) {
        const result = rushDrill(data, civ.en, 'Britons', guide);
        if (unitAvailable(data, civ.en, guide.a, 2)) expect(result.url, `${civ.en} ${guide.id}`).not.toBeNull();
        else expect(result.url).toBeNull();
      }
    expect(JSON.stringify({ data, buildOrders, guides })).toBe(before);
  });
});

describe('#469 supplemental counter advice', () => {
  it('keeps legal Franks clauses and does not recommend Mayans cavalry omitted from the actual tree', () => {
    expect(counterExtra(data, 'Franks', 'arch')).toBe(COUNTER_EXTRA.arch);
    expect(counterExtra(data, 'Mayans', 'arch')).toContain('冲车/投石压阵地');
    expect(counterExtra(data, 'Mayans', 'arch')).not.toMatch(/骑兵|轻骑|骑射/);
    expect(counterExtra(data, 'Mayans', 'inf')).not.toMatch(/骑兵|轻骑|骑射/);
    expect(counterExtra(data, 'Mayans', 'siege')).not.toMatch(/骑兵|轻骑|骑射/);
    expect(counterExtra(data, 'Franks', 'def')).toBe(COUNTER_EXTRA.def);
  });

  it('filters absent cavalry-archer, Castle scorpion and light-cavalry families without deleting legal clauses', () => {
    for (const id of [39, 474]) expect(data.core.unitById[id]!.civs).not.toContain('Franks');
    expect(counterExtra(data, 'Franks', 'inf')).not.toContain('骑射');
    expect(counterExtra(data, 'Franks', 'inf')).toContain('骑兵');
    expect(data.core.unitById[279]!.civs).not.toContain('Shu');
    expect(counterExtra(data, 'Shu', 'inf')).not.toContain('城堡期蝎子');
    for (const id of [546, 441, 1707]) expect(data.core.unitById[id]!.civs).not.toContain('Teutons');
    expect(counterExtra(data, 'Teutons', 'arch')).not.toContain('轻骑');
    expect(counterExtra(data, 'Teutons', 'arch')).toContain('骑兵');
  });

  it.each(['Chinese', 'Jurchens', 'Khitans', 'Koreans'])('%s does not inherit a missing Mangonel family through a regional replacement', (civ) => {
    for (const id of [280, 550, 588]) {
      expect(data.core.unitById[id]!.civs).not.toContain(civ);
      expect(trees.t[civ]!.flatMap((block) => block[3]).some((cell) => cell[2] === 'u' && cell[3] === id && cell[4] === 1)).toBe(false);
    }
    expect(counterExtra(data, civ, 'arch')).not.toContain('投石');
  });
});
