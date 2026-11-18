import { describe, expect, it } from 'vitest';
import { civFormationContent } from '../../src/data/civFormations';
import { DATA_PATCH } from '../../src/data/sources';
import { loadCore, loadTrees } from '../../src/data';
import { projectFormation } from '../../src/domain/civFormations';

const pairedVariants = [
  {
    civ: 'Malians',
    routeId: 'malians-light-cavalry-gbeto',
    entities: [
      { kind: 'building', id: 109 },
      { kind: 'unit', id: 83 },
    ],
  },
  {
    civ: 'Lithuanians',
    routeId: 'lithuanians-leitis-skirmisher',
    entities: [
      { kind: 'building', id: 109 },
      { kind: 'unit', id: 83 },
    ],
  },
  {
    civ: 'Sicilians',
    routeId: 'sicilians-serjeant-light-cavalry',
    entities: [
      { kind: 'building', id: 1665 },
      { kind: 'unit', id: 1661 },
    ],
  },
  {
    civ: 'Bohemians',
    routeId: 'bohemians-handcannon-halberdier',
    entities: [
      { kind: 'building', id: 235 },
      { kind: 'unit', id: 1704 },
    ],
  },
] as const;

type Core = Awaited<ReturnType<typeof loadCore>>;
type EntityRef = { kind: 'unit' | 'building' | 'tech'; id: number };

const entry = (civ: string) => civFormationContent.find((item) => item.civ === civ)!;
const route = (civ: string, id: string) => entry(civ).routes.find((item) => item.id === id)!;

const removeEntity = (core: Core, ref: EntityRef): Core => {
  if (ref.kind === 'unit') {
    const unitById = { ...core.unitById };
    delete unitById[ref.id];
    return { ...core, unitById };
  }
  if (ref.kind === 'building') {
    const buildingById = { ...core.buildingById };
    delete buildingById[ref.id];
    return { ...core, buildingById };
  }
  const techById = { ...core.techById };
  delete techById[ref.id];
  return { ...core, techById };
};

const project = (civ: string, routeId: string, core: Core, trees: Awaited<ReturnType<typeof loadTrees>>) => {
  const source = entry(civ);
  const formation = route(civ, routeId);
  return projectFormation(formation, civ, DATA_PATCH, { core, trees }, source.routes, source.source);
};

describe('position-variant supplement projection', () => {
  it('hides each paired position variant if either optional member is unavailable', async () => {
    const core = await loadCore();
    const trees = await loadTrees();

    for (const item of pairedVariants) {
      const formation = route(item.civ, item.routeId);
      const rawGroup = formation.supplements.find(({ mode }) => mode === 'position-variant')!;
      expect(rawGroup.entities.map(({ kind, id }) => [kind, id])).toEqual(item.entities.map(({ kind, id }) => [kind, id]));

      const complete = project(item.civ, item.routeId, core, trees);
      expect(complete.status).toBe('current');
      if (complete.status === 'current') {
        expect(complete.supplements.find(({ mode }) => mode === 'position-variant')?.entities.map(({ kind, entity }) => [kind, entity.id])).toEqual(
          item.entities.map(({ kind, id }) => [kind, id]),
        );
      }

      for (const missing of item.entities) {
        const view = project(item.civ, item.routeId, removeEntity(core, missing), trees);
        expect(view.status, item.civ + ' missing ' + missing.kind + ' ' + missing.id).toBe('current');
        if (view.status === 'current') {
          expect(view.required.map(({ entity }) => entity.id)).toEqual(formation.required.map(({ id }) => id));
          expect(view.supplements.some(({ mode }) => mode === 'position-variant')).toBe(false);
        }
      }
    }
  });

  it('keeps a route unavailable when a missing entity is also required', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const sicilian = route('Sicilians', 'sicilians-serjeant-light-cavalry');

    expect(project('Sicilians', sicilian.id, removeEntity(core, { kind: 'unit', id: 546 }), trees).status).toBe('unavailable');
  });

  it('continues filtering choice and conditional members independently', async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    const goth = route('Goths', 'goths-huskarl-halberdier');

    for (const [missingId, remainingId] of [
      [36, 331],
      [331, 36],
    ] as const) {
      const view = project('Goths', goth.id, removeEntity(core, { kind: 'unit', id: missingId }), trees);
      expect(view.status).toBe('current');
      if (view.status === 'current') {
        expect(view.supplements.find(({ mode }) => mode === 'choice')?.entities.map(({ entity }) => entity.id)).toEqual([remainingId]);
      }
    }

    const vietnamese = route('Vietnamese', 'vietnamese-defensive-tower');
    for (const [missingId, remainingId] of [
      [1134, 359],
      [359, 1134],
    ] as const) {
      const view = project('Vietnamese', vietnamese.id, removeEntity(core, { kind: 'unit', id: missingId }), trees);
      expect(view.status).toBe('current');
      if (view.status === 'current') {
        expect(
          view.supplements
            .find(({ mode, entities }) => mode === 'conditional' && entities.some(({ entity }) => entity.id === remainingId))
            ?.entities.map(({ entity }) => entity.id),
        ).toContain(remainingId);
      }
    }
  });
});
