import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  calculateGarrison,
  GARRISON_DATA,
  garrisonTechs,
  readGarrison,
  toggleGarrisonTech,
  writeGarrison,
  type GarrisonConfig,
  type GarrisonContext,
} from '../../src/domain/garrison';

let ctx: GarrisonContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const config = (changes: Partial<GarrisonConfig> = {}): GarrisonConfig => ({ civ: 'Franks', age: 4, techs: [], villagers: '0', ...changes });
const result = (building: number, changes: Partial<GarrisonConfig> = {}) => calculateGarrison(ctx, ctx.core.buildingById[building]!, config(changes));

describe('#218 fixed DE 185872 garrison cases', () => {
  it('exports actual flat villager firepower and the TC non-firing slot', () => {
    expect(GARRISON_DATA.units[83]!.firepower).toBe(-2.5);
    expect(GARRISON_DATA.units[83]).toEqual(GARRISON_DATA.units[293]);
    expect(GARRISON_DATA.units[109]).toMatchObject({ total: 1, max: 11, projectile: -1 });
  });
  it('empty TC does not fire; its first villager adds one actual secondary arrow', () => {
    expect(result(109)).toMatchObject({ errors: [], baseArrows: 0, totalArrows: 0, nextAt: 1, saturationAt: 10, capacity: 15, maxArrows: 10 });
    expect(result(109, { villagers: '1' })).toMatchObject({ totalArrows: 1, extraArrows: 1, nextAt: 2 });
  });
  it.each([9, 10, 15])('TC %i villagers respects the arrow cap independently of capacity', (n) => {
    expect(result(109, { villagers: String(n) }).totalArrows).toBe(Math.min(10, n));
  });
  it('tower fires its real primary arrow when empty and saturates before full capacity', () => {
    expect(result(79)).toMatchObject({ errors: [], baseArrows: 1, totalArrows: 1, nextAt: 1, capacity: 5, maxArrows: 5, saturationAt: 4 });
    expect(result(79, { villagers: '4' })).toMatchObject({ extraArrows: 4, totalArrows: 5, nextAt: null });
    expect(result(79, { villagers: '5' }).totalArrows).toBe(5);
  });
  it('Guard Tower threshold can require two villagers; capacity need not reach the arrow cap', () => {
    expect(result(234, { villagers: '1' })).toMatchObject({ totalArrows: 1, nextAt: 2 });
    expect(result(234, { villagers: '2' }).totalArrows).toBe(2);
    expect(result(234, { villagers: '5' })).toMatchObject({ totalArrows: 4, maxArrows: 5, nextAt: null, saturationAt: null, maxAtCapacity: 4 });
  });
  it('Keep is a distinct shape with its own contribution threshold', () => {
    expect(result(235, { civ: 'Britons', villagers: '5' })).toMatchObject({ errors: [], baseArrows: 1, extraArrows: 3, totalArrows: 4, saturationAt: null });
  });
  it('ranged attack upgrades also modify villager firepower, preserving one TC arrow per villager', () => {
    const upgraded = result(109, { civ: 'Britons', techs: [199, 200, 201, 47], villagers: '9' });
    expect(upgraded).toMatchObject({ errors: [], totalArrows: 9, villagerPower: 4.5, buildingPower: 4.5 });
  });
  it('Arrowslits does not strengthen villager contribution and changes the Watch Tower saturation threshold', () => {
    const upgraded = result(79, { civ: 'Britons', techs: [199, 200, 201, 47, 608], villagers: '1' });
    expect(upgraded).toMatchObject({ errors: [], totalArrows: 1, nextAt: 2, saturationAt: 5, villagerPower: 4.5, buildingPower: 5 });
  });
  it('Arrowslits conditional n-of effects follow Guard Tower and Keep form upgrades', () => {
    expect(result(234, { civ: 'Britons', techs: [608] }).buildingPower).toBe(4.5);
    expect(result(235, { civ: 'Britons', techs: [608] }).buildingPower).toBe(5.5);
  });
  it('Teuton TC has separately increased capacity and maximum arrows', () => {
    expect(result(109, { civ: 'Teutons', villagers: '25' })).toMatchObject({ errors: [], capacity: 25, maxArrows: 15, totalArrows: 15, saturationAt: 15 });
  });
  it('Teuton tower reaches its separate extra-arrow limit at eight villagers', () => {
    expect(result(79, { civ: 'Teutons', villagers: '10' })).toMatchObject({ errors: [], capacity: 10, maxArrows: 9, totalArrows: 9, saturationAt: 8 });
  });
  it('Saxon extra standing tower arrow starts in Castle Age', () => {
    expect(result(79, { civ: 'Saxons', age: 2 }).baseArrows).toBe(1);
    expect(result(79, { civ: 'Saxons', age: 3 })).toMatchObject({ errors: [], baseArrows: 2, maxArrows: 6, saturationAt: 4 });
  });
  it('Yasama changes standing arrows and the total cap without requiring a garrison', () => {
    expect(result(79, { civ: 'Japanese', age: 3, techs: [484] })).toMatchObject({ errors: [], baseArrows: 3, totalArrows: 3, maxArrows: 7, saturationAt: 4 });
  });
  it('Tigui supplies eight actual TC arrows, including when ungarrisoned', () => {
    expect(result(109, { civ: 'Malians', techs: [576] })).toMatchObject({ errors: [], baseArrows: 8, totalArrows: 8, maxArrows: 18 });
    expect(result(109, { civ: 'Malians', techs: [576], villagers: '10' }).totalArrows).toBe(18);
  });
  it('Stronghold uses the theoretical reload interval; faster fire need not add more arrows per volley', () => {
    expect(result(79, { civ: 'Celts', techs: [482], villagers: '4' })).toMatchObject({ errors: [], totalArrows: 4, maxAtCapacity: 4, saturationAt: null });
  });
  it('Yeomen increases the building attack denominator without a false villager buff', () => {
    expect(result(79, { civ: 'Britons', techs: [3], villagers: '3' })).toMatchObject({ errors: [], villagerPower: 2.5, buildingPower: 3.5, totalArrows: 3 });
  });
  it('Turkish Chemistry is free and automatically active only when available', () => {
    expect(result(109, { civ: 'Turks', age: 3 }).selected).not.toContain(47);
    expect(result(109, { civ: 'Turks', age: 4 })).toMatchObject({ errors: [], selected: [47], villagerPower: 3, buildingPower: 3 });
  });
  it('Bohemian early Chemistry uses the existing availability rule', () => {
    expect(result(109, { civ: 'Bohemians', age: 3, techs: [47] }).errors).toEqual([]);
    expect(result(109, { civ: 'Franks', age: 3, techs: [47] }).errors.length).toBeGreaterThan(0);
  });
});

describe('#218 strict configuration and URL handling', () => {
  it.each(['-1', '1.5', '', '1e2', 'Infinity', '9'.repeat(400), '16'])('blocks invalid TC villager count %s', (villagers) => {
    expect(result(109, { villagers }).errors.length).toBeGreaterThan(0);
  });
  it.each([{ civ: 'Unknown' }, { civ: '' }, { age: 0 }, { age: 5 }, { techs: [99999] }, { techs: [200] }, { techs: [482] }])(
    'does not silently broaden invalid config %j',
    (changes) => {
      expect(result(109, changes).errors.length).toBeGreaterThan(0);
    },
  );
  it('rejects a building/civilization combination unavailable in the catalog', () => {
    expect(result(235, { civ: 'Franks' }).errors.length).toBeGreaterThan(0);
    expect(result(82).errors.length).toBeGreaterThan(0);
  });
  it('unknown firepower modes stop calculation instead of assuming a flat baseline', () => {
    const data = structuredClone(GARRISON_DATA);
    data.units[83]!.firepower = 0;
    expect(calculateGarrison(ctx, ctx.core.buildingById[109]!, config(), data).errors.length).toBeGreaterThan(0);
  });
  it('checkbox prerequisites add recursively and dependent upgrades are removed', () => {
    const b = ctx.core.buildingById[109]!;
    const techs = toggleGarrisonTech(ctx, b, config({ civ: 'Britons' }), 201);
    expect(techs).toEqual([199, 200, 201]);
    expect(toggleGarrisonTech(ctx, b, config({ civ: 'Britons', techs }), 199)).toEqual([]);
  });
  it('free Chemistry cannot be toggled off', () => {
    const b = ctx.core.buildingById[109]!;
    expect(toggleGarrisonTech(ctx, b, config({ civ: 'Turks' }), 47)).toEqual([47]);
  });
  it('does not offer irrelevant or unavailable technologies', () => {
    const b = ctx.core.buildingById[109]!;
    const choices = garrisonTechs(ctx, b, 'Franks', 4).map((t) => t.id);
    expect(choices).not.toContain(608);
    expect(choices).not.toContain(201);
    expect(choices).not.toContain(482);
  });
  it.each([
    'age=1e2',
    'age=',
    'age=' + '9'.repeat(400),
    'gtechs=199,,200',
    'gtechs=199,NaN',
    'gtechs=' + '9'.repeat(400),
    'civ=Franks&civ=Britons',
    'garrison=0&garrison=4',
  ])('rejects malformed URL %s', (query) => {
    expect(readGarrison(new URLSearchParams(query), ctx.core.buildingById[109]!).errors.length).toBeGreaterThan(0);
  });
  it('shares exactly the selected configuration and calculation', () => {
    const b = ctx.core.buildingById[79]!;
    const original = config({ civ: 'Japanese', age: 3, techs: [199, 200, 484], villagers: '4' });
    const parsed = readGarrison(writeGarrison(original), b);
    expect(parsed).toEqual({ config: original, errors: [] });
    expect(calculateGarrison(ctx, b, parsed.config)).toEqual(calculateGarrison(ctx, b, original));
  });
});
