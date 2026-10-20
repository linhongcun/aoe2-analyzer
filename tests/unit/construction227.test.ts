import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  calculateConstruction,
  constructionLink,
  decodeConstruction,
  encodeConstruction,
  idealConstructionSeconds,
  toggleConstructionTech,
  CONSTRUCTION_DATA,
  DEFAULT_CONSTRUCTION,
  type ConstructionConfig,
  type ConstructionContext,
} from '../../src/domain/construction';
import eco from '../../src/data/eco.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData } from '../../src/domain/buildSim';
import { GENERAL_GARRISON_DATA } from '../../src/domain/garrisonGeneral';
import { gatherModel } from '../../src/domain/realCost';
let ctx: ConstructionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const config = (extra: Partial<ConstructionConfig> = {}): ConstructionConfig => ({ ...DEFAULT_CONSTRUCTION, techs: [], ...extra });
const calc = (extra: Partial<ConstructionConfig> = {}) => calculateConstruction(ctx, config(extra));
describe('#227 construction', () => {
  it('uses nonlinear simultaneous construction and total occupied villager time', () => {
    const r = calc();
    expect(r.errors).toEqual([]);
    expect(r.single).toBe(25);
    expect(r.target).toMatchObject({ seconds: 12.5, saved: 12.5, villagerSeconds: 50, forgone: null });
    expect(r.target!.seconds).not.toBe(25 / 4);
    expect(r.target!.marginalSeconds).toBeCloseTo(12.5 - 75 / 7);
    expect(r.target!.marginalVillagerSeconds).toBeCloseTo(375 / 7 - 50);
  });
  it('distinguishes fewer builders, equal comparison and a changed baseline', () => {
    expect(calc({ builders: '1', baseline: '4' }).target!.saved).toBe(-12.5);
    expect(calc({ baseline: '4' }).target!.saved).toBe(0);
    expect(calc({ baseline: '10' }).target!.seconds).toBe(calc().target!.seconds);
  });
  it.each([1, 2, 3])('matches the historical opening engine generic baseline for %s simultaneous builders', (builders) => {
    const source = buildOrders[0]!;
    const bo = {
      ...source,
      id: 'construction-check',
      steps: [
        {
          vils: 3,
          actions: [
            { type: 'gather' as const, task: 'build' as const, count: builders },
            { type: 'build' as const, building: 70 },
          ],
        },
      ],
    };
    const timeline = simulateBuild(bo, 'Generic', eco as unknown as EcoData, {}, { autoHouses: false });
    const done = timeline.buildingsDone.find((b) => b.building === 70)!;
    expect(done).toBeDefined();
    expect(Math.abs(done.at - idealConstructionSeconds(25, builders)!)).toBeLessThanOrEqual(0.10000001);
  });
  it('increasing builders reduces time but increases total occupied work', () => {
    for (let n = 1; n < 200; n++) {
      const a = idealConstructionSeconds(200, n)!,
        b = idealConstructionSeconds(200, n + 1)!;
      expect(b).toBeLessThan(a);
      expect((n + 1) * b).toBeGreaterThan(n * a);
    }
    expect(calc({ builders: '200' }).target!.marginalSeconds).toBeNull();
  });
  it.each(['0', '-1', '1.5', '', 'NaN', 'Infinity', '201', '100000000000000000000', '1e2', '01'])('rejects invalid builders %s', (builders) => {
    const r = calc({ builders });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.target).toBeNull();
  });
  it.each(['-1', 'Infinity', '10.001', '', '11'])('rejects invalid gather distance %s', (walk) => expect(calc({ walk }).target).toBeNull());
  it('exports a complete ordinary-villager support matrix', () => {
    const rows = Object.entries(CONSTRUCTION_DATA.buildings);
    expect(rows).toHaveLength(38);
    expect(rows.filter(([, b]) => b.supported)).toHaveLength(37);
    expect(calc({ buildingId: 199 }).errors.join()).toContain('渔船');
  });
  it('calculates every civilization-enabled ordinary construction shape once prerequisites are selected', () => {
    let checked = 0;
    for (const b of ctx.core.buildings) {
      if (b.id === 199) continue;
      for (const civ of b.civs) {
        const techs = b.id === 236 ? [64] : (GENERAL_GARRISON_DATA.unitUpgradeTechs?.[b.id] ?? []);
        const r = calc({ civ, age: 4, buildingId: b.id, techs: [...techs] });
        expect(r.errors, `${civ}/${b.id}`).toEqual([]);
        expect(r.target!.seconds).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBe(1417);
  }, 30000);
  it.each([
    ['Spanish', 82, 3, true, 200 / 1.3],
    ['Romans', 70, 3, true, 25 / 1.05],
    ['Sicilians', 82, 3, true, 200 * 0.6666669845581055],
    ['Sicilians', 82, 3, false, 200],
  ] as const)('applies audited %s construction modifiers', (civ, buildingId, age, hasTownCenter, single) => {
    const r = calc({ civ, buildingId, age, hasTownCenter });
    expect(r.errors).toEqual([]);
    expect(r.single).toBeCloseTo(single, 4);
  });
  it('keeps the Spanish wonder exception separate from builder speed', () => {
    const r = calc({ civ: 'Spanish', age: 4, buildingId: 276 });
    expect(r.errors).toEqual([]);
    expect(r.single).toBeCloseTo((3500 * 1.0833300352096558) / 1.2999999523162842, 5);
  });
  it('uses TC annex150 rather than completed TC100, with starting-TC gates', () => {
    expect(calc({ buildingId: 109 }).single).toBe(150);
    for (const civ of ['Spanish', 'Sicilians']) {
      const r = calc({ civ, buildingId: 109, age: 1, hasTownCenter: false });
      expect(r.errors).toEqual([]);
      expect(r.single).toBeCloseTo(150, 4);
    }
    expect(calc({ civ: 'Sicilians', buildingId: 109 }).single).toBe(75);
    expect(calc({ civ: 'Spanish', buildingId: 109 }).single).toBeCloseTo(150 / 1.3, 4);
  });
  it('separates Cuman Feudal additional TC and its Castle restoration', () => {
    expect(calc({ civ: 'Cumans', age: 2, buildingId: 109 }).single).toBeCloseTo(270, 4);
    expect(calc({ civ: 'Cumans', age: 3, buildingId: 109 }).single).toBeCloseTo(150 * 1.7999999523162842 * 0.5555599927902222, 5);
    expect(calc({ civ: 'Cumans', age: 1, buildingId: 109, hasTownCenter: false }).single).toBe(150);
    expect(calc({ civ: 'Franks', age: 2, buildingId: 109 }).target).toBeNull();
    expect(calc({ age: 3, buildingId: 109, hasTownCenter: false }).target).toBeNull();
  });
  it('supports Cuman Feudal workshop and respects civilization building roster', () => {
    expect(calc({ civ: 'Cumans', age: 2, buildingId: 49 }).errors).toEqual([]);
    expect(calc({ civ: 'Franks', buildingId: 1665 }).target).toBeNull();
  });
  it('applies Crane once and rejects unavailable or premature research', () => {
    expect(calc({ techs: [54] }).single).toBeCloseTo(25 / 1.2, 5);
    for (const civ of ['Spanish', 'Sicilians', 'Romans', 'Cumans']) expect(calc({ civ, techs: [54] }).target).toBeNull();
    expect(calc({ age: 2, techs: [54] }).target).toBeNull();
    expect(calc({ techs: [54, 54] }).target).toBeNull();
  });
  it('applies own Wu team house modifier only once', () => {
    const r = calc({ civ: 'Wu' });
    expect(r.errors).toEqual([]);
    expect(r.single).toBe(12.5);
  });
  it('does not activate unreachable Vedic Teachings conditional rules', () => {
    expect(calc({ civ: 'Romans', age: 4, techs: [50, 51, 47, 93] }).single).toBeCloseTo(25 / 1.05, 5);
  });
  it('requires shape unlocks and adds legal prerequisites', () => {
    expect(calc({ civ: 'Britons', buildingId: 235, age: 4 }).target).toBeNull();
    const ids = toggleConstructionTech(ctx, config({ civ: 'Britons', buildingId: 235, age: 4 }), 63);
    expect(ids).toContain(140);
    expect(calc({ civ: 'Britons', buildingId: 235, age: 4, techs: ids }).errors).toEqual([]);
    expect(calc({ civ: 'Franks', buildingId: 236, age: 4 }).target).toBeNull();
  });
  it('free Korean shape upgrades and Chemistry prerequisite apply exactly once', () => {
    const a = calc({ civ: 'Koreans', buildingId: 235, age: 4 });
    expect(a.errors).toEqual([]);
    expect(a.free.has(140)).toBe(true);
    expect(a.free.has(63)).toBe(true);
    const b = calc({ civ: 'Koreans', buildingId: 236, age: 4, techs: [47] });
    expect(b.errors).toEqual([]);
    expect(b.free.has(64)).toBe(true);
    expect(b.single).toBe(80);
  });
  it('treats selected gathering as total occupied loss and computes baseline incremental loss', () => {
    const r = calc({ task: 'wood' }),
      rate = gatherModel(3, 'Franks', { techIds: new Set(), walkTiles: 3, farmTiles: 0 }).rate.wood;
    expect(r.target!.forgone).toBeCloseTo(50 * rate, 8);
    expect(r.target!.extraForgone).toBeCloseTo(25 * rate, 8);
    const far = calc({ task: 'wood', walk: '10' });
    expect(far.target!.forgone).toBeLessThan(r.target!.forgone!);
    expect(far.target!.seconds).toBe(r.target!.seconds);
    const improved = calc({ task: 'wood', techs: [202] });
    expect(improved.target!.forgone).toBeGreaterThan(r.target!.forgone!);
  });
  it('preserves all explicit settings in a share round trip', () => {
    const c = config({
      buildingId: 109,
      civ: 'Cumans',
      age: 2,
      builders: '8',
      baseline: '3',
      task: 'gold',
      walk: '2.5',
      farm: '1',
      hasTownCenter: true,
      techs: [55],
    });
    expect(decodeConstruction('?' + encodeConstruction(c))).toEqual({ config: c, errors: [] });
  });
  it.each(['?cv=1', '?cv=2&building=70', '?cv=1&cv=1', '?mystery=x'])('marks malformed shares %s', (url) =>
    expect(decodeConstruction(url).errors.length).toBeGreaterThan(0),
  );
  it.each([{ builders: '-1' }, { baseline: '0' }, { builders: '1.5' }, { builders: '201' }, { walk: 'Infinity' }, { farm: '-1' }])(
    'locks malformed numeric shares %s',
    (fields) => expect(decodeConstruction(encodeConstruction(config(fields))).errors.length).toBeGreaterThan(0),
  );
  it.each(['%FF', '%ZZ', '%E0%A4%A'])('rejects malformed URI encoding %s', (value) =>
    expect(decodeConstruction(encodeConstruction(config()) + '&bad=' + value).errors.length).toBeGreaterThan(0),
  );
  it('locks unknown catalog or illegal technology context in an incoming share', () => {
    expect(decodeConstruction(encodeConstruction(config({ civ: 'Unknown' })), ctx).errors.length).toBeGreaterThan(0);
    expect(decodeConstruction(encodeConstruction(config({ civ: 'Spanish', techs: [54] })), ctx).errors.length).toBeGreaterThan(0);
  });
  it('rejects duplicate technology fields and lists', () => {
    const url = encodeConstruction(config());
    expect(decodeConstruction(url + '&techs=54').errors.length).toBeGreaterThan(0);
    expect(decodeConstruction(encodeConstruction(config({ techs: [54, 54] }))).errors.length).toBeGreaterThan(0);
  });
  it('makes a complete contextual building entry and preserves valid simulator selections', () => {
    const href = constructionLink(ctx, { buildingId: 82, civ: 'Spanish', age: 3, techs: [50, 54] });
    expect(href).toMatch(/^\/construction\?/);
    const parsed = decodeConstruction(href.split('?')[1]!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.config.techs).toEqual([50]);
    expect(parsed.config.buildingId).toBe(82);
  });
});
