import { describe, expect, it } from 'vitest';
import buildings from '../../data/game/buildings.json';
import { buildFamilies } from '../../src/domain/family';
import { filterUnitFamilies } from '../../src/domain/unitFilters';
import { catalogueTrainingUnit, trainingAtBuilding, trainingSites } from '../../src/domain/unitTrainingSites';
import { techs, trees, units } from './helpers';

const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));
const families = buildFamilies(units, byId);

describe('#1230 training sites', () => {
  it('matches the available monk node in every civilization tree', () => {
    const monk = byId[125]!;
    expect([monk.b, monk.bz, monk.ben]).toEqual([104, '修道院', 'Monastery']);
    expect(trainingSites(monk)).toEqual({
      kind: 'available',
      primary: { building: 104 },
      exceptions: [
        { building: 1806, civ: 'Armenians' },
        { building: 1806, civ: 'Georgians' },
      ],
    });
    expect(monk.civs).toHaveLength(56);
    for (const civ of monk.civs) {
      const matches = trees.t[civ]!.filter((block) => block[3].some((cell) => cell[2] === 'u' && cell[3] === monk.id && cell[4] !== 0));
      expect(matches).toHaveLength(1);
      const building = matches[0]![0];
      expect(trainingSites(monk, civ)).toEqual({ kind: 'available', primary: { building, civ } });
      expect(trainingAtBuilding(monk, building)?.civs).toContain(civ);
    }
    expect(trainingAtBuilding(monk, 104)?.civs).toHaveLength(54);
    expect(trainingAtBuilding(monk, 1806)?.civs).toEqual(['Armenians', 'Georgians']);
  });

  it('keeps the Warrior Priest only in the Armenian Fortified Church', () => {
    const priest = byId[1811]!;
    expect([priest.b, ...priest.civs]).toEqual([1806, 'Armenians']);
    expect(trainingSites(priest, 'Armenians')).toEqual({ kind: 'available', primary: { building: 1806, civ: 'Armenians' } });
    expect(trainingSites(priest, 'Georgians')).toEqual({ kind: 'unavailable' });
    expect(trainingAtBuilding(priest, 1806)).toEqual({ civs: ['Armenians'] });
    expect(trainingAtBuilding(priest, 104)).toEqual({ civs: [] });
  });

  it.each([
    { civ: 'Goths', primary: 41, secondary: 759, elite: 555, secondaryElite: 761, building: 12, tech: 16 },
    { civ: 'Huns', primary: 755, secondary: 886, elite: 757, secondaryElite: 887, building: 101, tech: 483 },
  ])('retains each exact base and elite unit in the $civ training branches', ({ civ, primary, secondary, elite, secondaryElite, building, tech }) => {
    expect(techs.find((item) => item.id === tech)?.civs).toEqual([civ]);
    expect(families.eliteOf[primary]?.id).toBe(elite);
    expect(families.eliteOf[secondary]?.id).toBe(secondaryElite);
    for (const id of [primary, secondary, elite, secondaryElite]) {
      expect(trainingSites(byId[id]!, civ)).toEqual({
        kind: 'available',
        primary: { building: 82, civ },
        conditional: { building, civ, tech },
      });
      expect(trainingSites(byId[id]!, 'Britons')).toEqual({ kind: 'unavailable' });
    }
    for (const id of [primary, elite]) {
      expect(buildings.find((item) => item.id === 82)?.units).toContain(id);
      expect(trainingAtBuilding(byId[id]!, 82)).toEqual({ civs: [civ] });
      expect(trainingAtBuilding(byId[id]!, building)).toEqual({ civs: [] });
    }
    for (const id of [secondary, secondaryElite]) {
      expect(buildings.find((item) => item.id === building)?.units).toContain(id);
      expect(trainingAtBuilding(byId[id]!, building)).toEqual({ civs: [civ], tech });
      expect(trainingAtBuilding(byId[id]!, 82)?.civs).toEqual([]);
    }
  });

  it('prefers the normal building only on the catalogue entry and keeps filter matches exact', () => {
    const filters = { query: 'Huskarl', type: '', age: '', dlc: '', civ: 'Goths' };
    expect(filterUnitFamilies(units, families, filters)).toEqual([{ u: byId[759], elite: byId[761] }]);
    expect(filterUnitFamilies(units, families, filters, catalogueTrainingUnit)).toEqual([{ u: byId[41], elite: byId[555] }]);
    expect(filterUnitFamilies(units, families, { ...filters, query: 'Elite Huskarl' }, catalogueTrainingUnit)).toEqual([{ u: byId[555] }]);
    expect(filterUnitFamilies(units, families, { ...filters, query: 'Elite Huskarl', age: '3' }, catalogueTrainingUnit)).toEqual([]);
    expect(filterUnitFamilies(units, families, { ...filters, civ: 'Britons' }, catalogueTrainingUnit)).toEqual([]);
    expect(trainingSites(byId[38]!)).toBeNull();
  });
});
