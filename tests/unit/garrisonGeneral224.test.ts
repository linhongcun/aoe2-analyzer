import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { calculateGarrison, garrisonTechs } from '../../src/domain/garrison';
import {
  calculateGeneralGarrison,
  GENERAL_GARRISON_DATA,
  getGarrisonCandidates,
  getGarrisonBuildings,
  getGarrisonTechs,
  getFreeGarrisonTechs,
  garrisonUnitMask,
  readGeneralGarrison,
  toggleGeneralGarrisonTech,
  unitGarrisonPower,
  writeGeneralGarrison,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
  type GeneralGarrisonRow,
} from '../../src/domain/garrisonGeneral';

let ctx: GeneralGarrisonContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const row = (unitId: number, count = '1', entry: GeneralGarrisonRow['entry'] = 'enter'): GeneralGarrisonRow => ({ unitId, count, entry });
const config = (extra: Partial<GeneralGarrisonConfig> = {}): GeneralGarrisonConfig => ({ civ: 'Franks', age: 4, techs: [], rows: [], ...extra });
const calc = (id: number, extra: Partial<GeneralGarrisonConfig> = {}) => calculateGeneralGarrison(ctx, ctx.core.buildingById[id]!, config(extra));
const candidates = (id: number, extra: Partial<GeneralGarrisonConfig> = {}) => getGarrisonCandidates(ctx, ctx.core.buildingById[id]!, config(extra));

describe('#224 general garrison model', () => {
  it('includes civilization-enabled hosts and production leave-ins', () => {
    const ids = getGarrisonBuildings(ctx).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining([70, 68, 2556, 82, 1251, 1665, 1806, 236, 45, 1189, 12, 104]));
    expect(ids).not.toContain(1808);
  });
  it.each([
    [109, 'Franks', 4, [], '10'],
    [79, 'Britons', 2, [], '4'],
    [234, 'Britons', 4, [608], '5'],
    [235, 'Britons', 4, [199, 200, 201, 47, 608], '5'],
    [109, 'Teutons', 4, [], '25'],
    [79, 'Teutons', 4, [], '10'],
    [79, 'Japanese', 3, [484], '3'],
    [109, 'Malians', 4, [576], '10'],
    [79, 'Celts', 4, [482], '4'],
    [234, 'Georgians', 3, [923], '4'],
  ] as const)('preserves #218 village results for %s/%s', (id, civ, age, techs, villagers) => {
    const b = ctx.core.buildingById[id]!;
    const previous = calculateGarrison(ctx, b, { civ, age, techs: [...techs], villagers });
    const current = calc(id, { civ, age, techs: [...techs], rows: [row(83, villagers)] });
    expect(current.errors).toEqual([]);
    expect(current).toMatchObject({
      capacity: previous.capacity,
      baseProjectiles: previous.baseArrows,
      extraProjectiles: previous.extraArrows,
      totalProjectiles: previous.totalArrows,
      maxProjectiles: previous.maxArrows,
      nextAt: previous.nextAt,
      singleUnitSaturationAt: previous.saturationAt,
      maxAtCapacity: previous.maxAtCapacity,
    });
  });
  it('sums mixed contributions before flooring once', () => {
    const one = calc(82, { rows: [row(83), row(4)] });
    expect(one.errors).toEqual([]);
    expect(one).toMatchObject({ usedSlots: 2, garrisonPower: 4.5, totalProjectiles: 5 });
    const two = calc(82, { rows: [row(83), row(4, '2')] });
    expect(two).toMatchObject({ usedSlots: 3, garrisonPower: 6.5, totalProjectiles: 6 });
  });
  it('matches the legacy villager engine across every available civilization, age and full relevant-tech preset', () => {
    let compared = 0;
    for (const bid of [109, 79, 234, 235]) {
      const b = ctx.core.buildingById[bid]!;
      for (const civ of b.civs)
        for (let age = b.age; age <= 4; age++)
          for (const techs of [[], garrisonTechs(ctx, b, civ, age).map((t) => t.id)]) {
            const previous = calculateGarrison(ctx, b, { civ, age, techs, villagers: '5' });
            if (previous.errors.length) continue;
            const current = calc(bid, { civ, age, techs, rows: [row(83, '5')] });
            const label = `${bid}/${civ}/age${age}/${techs.join(',')}`;
            expect(current.errors, label).toEqual([]);
            expect(current.capacity, label).toBe(previous.capacity);
            // The pinned Korean free Bombard Tower effect adds 0.5 to TC projectile 54.
            // The general documented secondary-DPS model therefore corrects the old building-panel denominator.
            if (bid === 109 && civ === 'Koreans' && age === 4 && techs.includes(47)) {
              expect(current).toMatchObject({ totalProjectiles: 4, buildingPower: 4.75 });
              expect(current.warnings.join(' ')).toContain('副弹丸攻击与建筑面板不同');
            } else expect(current.totalProjectiles, label).toBe(previous.totalArrows);
            expect(current.maxProjectiles, label).toBe(previous.maxArrows);
            compared++;
          }
    }
    expect(compared).toBeGreaterThan(600);
  });
  it('supports noncontributing melee and cavalry only in compatible buildings', () => {
    expect(calc(82, { rows: [row(38)] })).toMatchObject({ errors: [], garrisonPower: 0, totalProjectiles: 5 });
    expect(calc(109, { rows: [row(38)] }).errors).not.toEqual([]);
    expect(calc(79, { rows: [row(74)] })).toMatchObject({ errors: [], garrisonPower: 0, totalProjectiles: 1 });
  });
  it('uses modern size-class overrides for religious and mounted units', () => {
    expect(garrisonUnitMask(GENERAL_GARRISON_DATA.units[1811]!)).toBe(8);
    expect(garrisonUnitMask(GENERAL_GARRISON_DATA.units[775]!)).toBe(4);
    expect(garrisonUnitMask(GENERAL_GARRISON_DATA.units[1263]!)).toBe(4);
    expect(candidates(109, { civ: 'Spanish' }).some((u) => u.id === 775)).toBe(false);
    expect(candidates(1806, { civ: 'Armenians' }).some((u) => u.id === 1811 && u.canEnter)).toBe(true);
  });
  it('applies Crenellations to infantry contribution without changing its melee attack', () => {
    const no = calc(82, { civ: 'Teutons', rows: [row(25, '3')] });
    const yes = calc(82, { civ: 'Teutons', techs: [11], rows: [row(25, '3')] });
    expect(no).toMatchObject({ errors: [], garrisonPower: 0, totalProjectiles: 5 });
    expect(yes).toMatchObject({ errors: [], garrisonPower: 7.5, totalProjectiles: 6 });
  });
  it('normalizes bombard primary after applying Teuton capacity and maximum', () => {
    expect(calc(236, { civ: 'Byzantines', rows: [] })).toMatchObject({ errors: [], mode: 'cannon', capacity: 5, baseProjectiles: 1, maxProjectiles: 1 });
    const two = calc(236, { civ: 'Teutons', techs: [47], rows: [row(5, '10')] });
    expect(two).toMatchObject({ errors: [], capacity: 10, baseProjectiles: 1, totalProjectiles: 2, maxProjectiles: 4 });
    expect(calc(236, { civ: 'Teutons', techs: [47], rows: [row(5, '5')] }).totalProjectiles).toBe(1);
  });
  it.each([
    [2, 1, 5],
    [3, 2, 8],
    [4, 3, 12],
  ])('applies Donjon age %i automatic projectile rules', (age, baseProjectiles, maxProjectiles) => {
    expect(calc(1665, { civ: 'Sicilians', age })).toMatchObject({ errors: [], baseProjectiles, maxProjectiles });
  });
  it('separates shelter capacity from weapon stats', () => {
    expect(calc(70, { civ: 'Khmer', rows: [row(83, '5')] })).toMatchObject({ errors: [], mode: 'shelter', capacity: 5, totalProjectiles: 0 });
    expect(calc(70, { civ: 'Franks', rows: [row(83)] }).errors).not.toEqual([]);
    expect(calc(2556, { civ: 'Tupi', rows: [row(83, '5')] })).toMatchObject({ errors: [], capacity: 5, totalProjectiles: 0 });
  });
  it('supports herdables in Gurjara Mills without inventing arrows', () => {
    const result = calc(68, { civ: 'Gurjaras', rows: [row(594, '8')] });
    expect(result).toMatchObject({ errors: [], mode: 'economic', capacity: 10, usedSlots: 8, totalProjectiles: 0 });
    expect(calc(68, { civ: 'Franks', rows: [row(594)] }).errors).not.toEqual([]);
  });
  it.each([
    [1, 0, 0],
    [2, 0, 3],
    [3, 0, 4],
    [4, 0, 5],
  ])('resolves Dock age %i and excludes its nonfiring slot', (age, baseProjectiles, maxProjectiles) => {
    expect(calc(45, { age })).toMatchObject({ errors: [], baseProjectiles, maxProjectiles });
    const items = candidates(45, { age });
    expect(items.some((u) => u.id === 13 && u.canEnter)).toBe(true);
    expect(items.filter((u) => u.id !== 13).every((u) => !u.canEnter)).toBe(true);
  });
  it('distinguishes external entry from produced leave-ins', () => {
    expect(calc(12, { age: 2, rows: [row(74, '2', 'created')] })).toMatchObject({ errors: [], capacity: 10, totalProjectiles: 0 });
    expect(calc(12, { age: 2, rows: [row(74, '2')] }).errors).not.toEqual([]);
    expect(calc(12, { age: 2, rows: [row(4, '2', 'created')] }).errors).not.toEqual([]);
    expect(candidates(45).some((u) => u.id === 17 && u.canCreate && !u.canEnter)).toBe(true);
  });
  it('does not treat scenario sheep train locations as normal Town Center production', () => {
    expect(GENERAL_GARRISON_DATA.units[594]!.trainLocations).toEqual([{ unitId: 109, time: 15 }]);
    expect(GENERAL_GARRISON_DATA.buildings[109]!.produces).toEqual([83]);
    expect(candidates(109, { civ: 'Franks' }).some((u) => u.id === 594)).toBe(false);
    expect(calc(109, { civ: 'Franks', rows: [row(594, '1', 'created')] }).errors.length).toBeGreaterThan(0);
    expect(calc(68, { civ: 'Gurjaras', rows: [row(594, '8')] })).toMatchObject({ errors: [], usedSlots: 8, capacity: 10, totalProjectiles: 0 });
    for (const civ of ctx.core.buildingById[109]!.civs)
      expect(
        candidates(109, { civ }).some((u) => GENERAL_GARRISON_DATA.herdableIds.includes(u.id)),
        civ,
      ).toBe(false);
  });
  it('preserves normal production, female villager production and inherited Harbor production', () => {
    expect(calc(109, { rows: [row(83, '2', 'created'), row(293, '3', 'created')] })).toMatchObject({ errors: [], usedSlots: 5, totalProjectiles: 5 });
    expect(calc(1189, { civ: 'Malay', rows: [row(539, '2', 'created')] })).toMatchObject({ errors: [], usedSlots: 2 });
    expect(candidates(109, { civ: 'Armenians' }).find((u) => u.id === 1808)).toMatchObject({ canEnter: true, canCreate: false });
  });
  it.each(['Aztecs', 'Mayans'])('allows the starting Eagle Scout to enter a Dark Age TC for %s without allowing Dark Age production', (civ) => {
    expect(ctx.core.unitById[751]!.age).toBe(2);
    expect(GENERAL_GARRISON_DATA.civs[civ]!.startingScoutId).toBe(751);
    expect(candidates(109, { civ, age: 1 }).find((u) => u.id === 751)).toMatchObject({ age: 1, canEnter: true, canCreate: false });
    expect(calc(109, { civ, age: 1, rows: [row(751)] })).toMatchObject({ errors: [], usedSlots: 1, totalProjectiles: 0 });
    expect(calc(12, { civ, age: 1, rows: [row(751, '1', 'created')] }).errors.length).toBeGreaterThan(0);
    expect(calc(12, { civ, age: 2, rows: [row(751, '1', 'created')] })).toMatchObject({ errors: [], usedSlots: 1 });
  });
  it('does not grant the old Eagle Scout starting-unit exception to Incas or other civilizations', () => {
    expect(GENERAL_GARRISON_DATA.civs.Incas!.startingScoutId).toBe(2550);
    expect(candidates(109, { civ: 'Incas', age: 1 }).find((u) => u.id === 2550)).toMatchObject({ age: 1, canEnter: true });
    expect(candidates(109, { civ: 'Incas', age: 1 }).some((u) => u.id === 751)).toBe(false);
    expect(candidates(109, { civ: 'Franks', age: 1 }).some((u) => u.id === 751)).toBe(false);
  });
  it('uses technology-dependent extra production locations instead of granting them from the unit name', () => {
    expect(calc(12, { civ: 'Goths', rows: [row(41, '1', 'created')] }).errors.length).toBeGreaterThan(0);
    expect(calc(12, { civ: 'Goths', techs: [16], rows: [row(41, '1', 'created')] })).toMatchObject({ errors: [], totalProjectiles: 0 });
    expect(calc(101, { civ: 'Huns', rows: [row(755, '1', 'created')] }).errors.length).toBeGreaterThan(0);
    expect(calc(101, { civ: 'Huns', techs: [483], rows: [row(755, '1', 'created')] })).toMatchObject({ errors: [], totalProjectiles: 0 });
  });
  it('keeps stored relics apart from the carrying-monk representation', () => {
    expect(candidates(104).some((u) => u.id === 285 && u.canDeposit)).toBe(true);
    expect(candidates(1806, { civ: 'Armenians' }).some((u) => u.id === 285 && u.canDeposit)).toBe(true);
    expect(calc(104, { rows: [row(285, '2', 'deposit')] })).toMatchObject({ errors: [], usedSlots: 2, totalProjectiles: 0 });
    expect(calc(104, { rows: [row(286)] }).errors).not.toEqual([]);
    expect(calc(104, { rows: [row(285)] }).errors).not.toEqual([]);
  });
  it('includes the movable Mule Cart as an occupant for its own civilizations', () => {
    expect(candidates(109, { civ: 'Armenians' }).some((u) => u.id === 1808 && u.canEnter)).toBe(true);
    expect(candidates(109, { civ: 'Franks' }).some((u) => u.id === 1808)).toBe(false);
  });
  it('includes the real King record through the civilian legacy flag and keeps host restrictions', () => {
    expect(GENERAL_GARRISON_DATA.units[434]).toMatchObject({ class: 59, sizeClass: 0, firepower: 0 });
    expect(garrisonUnitMask(GENERAL_GARRISON_DATA.units[434]!)).toBe(1);
    expect(candidates(109, { civ: 'Franks', age: 3 }).some((u) => u.id === 434 && u.canEnter)).toBe(true);
    const tc = calc(109, { civ: 'Franks', age: 3, rows: [row(434)] });
    expect(tc).toMatchObject({ errors: [], capacity: 15, usedSlots: 1, totalProjectiles: 0, garrisonPower: 0 });
    expect(tc.warnings.join(' ')).toContain('国王驻军仅适用于');
    expect(calc(70, { civ: 'Khmer', age: 1, rows: [row(434)] })).toMatchObject({ errors: [], capacity: 5, usedSlots: 1, totalProjectiles: 0 });
    expect(calc(70, { civ: 'Franks', rows: [row(434)] }).errors.length).toBeGreaterThan(0);
    expect(calc(68, { civ: 'Gurjaras', rows: [row(434)] }).errors.length).toBeGreaterThan(0);
    expect(calc(45, { rows: [row(434)] }).errors.length).toBeGreaterThan(0);
  });
  it('reports public multi-projectile theory as an estimate', () => {
    const result = calc(82, { civ: 'Chinese', rows: [row(73, '4')] });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.powerEach).toBeCloseTo(3.84, 5);
    expect(result.warnings.join(' ')).toContain('公开公式估算');
    expect(result.totalProjectiles).toBe(7);
  });
  it('uses ordinary shots for charged units rather than max-count charge ceilings', () => {
    const result = calc(82, { civ: 'Wei', rows: [row(1952)] });
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.powerEach).toBeCloseTo((5 * 1.1) / 1.8, 5);
    expect(result.warnings.join(' ')).toContain('未充能');
  });
  it('retains War Chariot capacity while identifying its unmodeled normal multi-projectile form', () => {
    const result = calc(82, { civ: 'Shu', rows: [row(1962, '5')] });
    expect(result).toMatchObject({ errors: [], capacity: 20, usedSlots: 5, totalProjectiles: null });
    expect(result.warnings.join(' ')).toContain('当前多弹丸形式尚未建模');
    expect(result.warnings.join(' ')).not.toContain('副弹丸数据缺失');
  });
  it('adds negative firepower before requiring reload, and keeps zero as zero', () => {
    const v = GENERAL_GARRISON_DATA.units[83]!;
    expect(unitGarrisonPower({ ...v, attack: 4, firepower: -2.5, reload: 2 }, {}).power).toBe(4.5);
    expect(unitGarrisonPower(GENERAL_GARRISON_DATA.units[13]!, {}).power).toBe(1);
    expect(unitGarrisonPower({ ...v, attack: 10, firepower: 0 }, {}).power).toBe(0);
  });
  it('rejects invalid or over-capacity mixtures without a plausible shot total', () => {
    for (const rows of [[row(83, '16')], [row(83, '10'), row(4, '6')], [row(83, '-1')], [row(83, '1.5')], [row(83), row(83)], [row(999999)]])
      expect(calc(109, { rows }).errors.length).toBeGreaterThan(0);
    expect(calc(109, { age: 0 }).errors.length).toBeGreaterThan(0);
    expect(calc(109, { civ: 'missing' }).errors.length).toBeGreaterThan(0);
  });
  it('retains strict research prerequisite handling and free technologies', () => {
    const b = ctx.core.buildingById[109]!;
    expect(calc(109, { civ: 'Britons', techs: [201] }).errors.length).toBeGreaterThan(0);
    const ids = toggleGeneralGarrisonTech(ctx, b, config({ civ: 'Britons' }), 201);
    expect(ids).toEqual(expect.arrayContaining([199, 200, 201]));
    expect(toggleGeneralGarrisonTech(ctx, b, config({ civ: 'Britons', techs: ids }), 199)).not.toContain(201);
    expect(getGarrisonTechs(ctx, b, config({ civ: 'Turks' })).some((t) => t.id === 47)).toBe(true);
    expect(getFreeGarrisonTechs(ctx, b, config({ civ: 'Turks' }))).toContain(47);
  });
  it('does not mutate generated data, input rows or selected technologies', () => {
    const before = JSON.stringify(GENERAL_GARRISON_DATA),
      c = config({ rows: [row(83)], techs: [] });
    const input = JSON.stringify(c);
    calc(109, c);
    calc(79, { ...c, civ: 'Teutons' });
    expect(JSON.stringify(GENERAL_GARRISON_DATA)).toBe(before);
    expect(JSON.stringify(c)).toBe(input);
  });
});

describe('#224 strict v2 and legacy links', () => {
  it('round-trips mixed entries and stored relic records', () => {
    const c = config({ rows: [row(83, '2'), row(4, '3', 'created'), row(285, '1', 'deposit')], techs: [200, 199] });
    const parsed = readGeneralGarrison(writeGeneralGarrison(c), ctx.core.buildingById[82]!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.config).toEqual({ ...c, techs: [199, 200] });
  });
  it('migrates old villager links exactly', () => {
    const parsed = readGeneralGarrison(new URLSearchParams('tab=garrison&civ=Britons&age=4&gtechs=199,200&garrison=9'), ctx.core.buildingById[109]!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.config.rows).toEqual([row(83, '9')]);
    expect(parsed.config.techs).toEqual([199, 200]);
  });
  it('retains old default village controls while new hosts start with an empty army', () => {
    expect(readGeneralGarrison(new URLSearchParams(), ctx.core.buildingById[109]!).config.rows).toEqual([row(83, '0')]);
    expect(readGeneralGarrison(new URLSearchParams(), ctx.core.buildingById[45]!).config.rows).toEqual([]);
  });
  it.each(['', '-1', '1.5', 'abc', '9007199254740992'])('keeps a structurally valid draft quantity editable: %s', (count) => {
    const parsed = readGeneralGarrison(new URLSearchParams({ gv: '2', army: `83:${count}:e` }), ctx.core.buildingById[109]!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.config.rows[0]!.count).toBe(count);
    expect(calculateGeneralGarrison(ctx, ctx.core.buildingById[109]!, parsed.config).errors.length).toBeGreaterThan(0);
  });
  it.each([
    'gv=3&army=',
    'gv=2',
    'army=83:2:e',
    'gv=2&army=83:2:e&garrison=3',
    'gv=2&gv=2&army=',
    'gv=2&army=83:2:e,83:2:e',
    'gv=2&army=83:2:x',
    'gv=2&army=NaN:2:e',
    'garrison=3&garrison=4',
    'garrison=-1',
    'gtechs=199,,200',
    'gtechs=199,199',
    'age=-1',
    'civ=Franks&civ=Britons',
  ])('rejects malformed parameters: %s', (query) => {
    expect(readGeneralGarrison(new URLSearchParams(query), ctx.core.buildingById[109]!).errors.length).toBeGreaterThan(0);
  });
});
