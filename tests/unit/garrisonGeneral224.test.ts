import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { calculateGarrison, garrisonTechs } from '../../src/domain/garrison';
import {
  calculateGeneralGarrison,
  explainGeneralGarrison,
  GENERAL_GARRISON_DATA,
  getGarrisonCandidates,
  getGarrisonBuildingAge,
  getGarrisonBuildings,
  getGarrisonTechs,
  getFreeGarrisonTechs,
  garrisonUnitMask,
  partitionGarrisonTechs,
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
  it('#1051 亚美尼亚长矛兵时代1驻城镇中心，保留真实0弹丸及建筑时代校验', () => {
    const initial = { civ: 'Armenians', age: 1, techs: [], rows: [row(93, '0')] };
    expect(candidates(109, initial).find((u) => u.id === 93)?.canEnter).toBe(true);
    const capacity = calc(109, initial).capacity;
    const final = { ...initial, rows: [row(93, String(capacity))] };
    const result = calc(109, final);
    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ usedSlots: capacity, totalProjectiles: 0 });
    const decoded = readGeneralGarrison(writeGeneralGarrison(final), ctx.core.buildingById[109]!);
    expect(decoded).toEqual({ config: final, errors: [] });
    expect(calc(109, decoded.config)).toEqual(result);
    expect(candidates(109, { ...initial, civ: 'Franks' }).some((u) => u.id === 93 && u.canEnter)).toBe(false);
    expect(candidates(109, { ...initial, civ: 'Franks', age: 2 }).some((u) => u.id === 93 && u.canEnter)).toBe(true);
    for (const id of [79, 82]) expect(calc(id, initial).errors).toContain('时代无效或早于此建筑。');
  });
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
  it('#1262 exposes the exact floor and the effective secondary attack used by the shot model', () => {
    const threshold = 2.5;
    const unit = GENERAL_GARRISON_DATA.units[1903]!;
    const input = config({ civ: 'Jurchens', rows: [row(1903)] });
    for (const [difference, expected] of [
      [5e-10, 3],
      [2e-9, 2],
    ] as const) {
      const result = explainGeneralGarrison(ctx, ctx.core.buildingById[235]!, input, {
        ...GENERAL_GARRISON_DATA,
        units: { ...GENERAL_GARRISON_DATA.units, [unit.id]: { ...unit, firepower: -threshold * (3 - difference) } },
      });
      expect(result).toMatchObject({
        errors: [],
        buildingThreshold: { attack: 5, reload: 2, source: 'secondary' },
        buildingPower: threshold,
        totalProjectiles: 1 + expected,
        firingSteps: {
          quotient: 3 - difference,
          wholeSlots: expected,
          uncappedProjectiles: 1 + expected,
          nextThreshold: { slots: expected + 1, power: threshold * (expected + 1) },
        },
      });
    }
  });
  it('#1262 derives the next cannon shot after the primary weapon minimum', () => {
    const result = explainGeneralGarrison(ctx, ctx.core.buildingById[236]!, config({ civ: 'Teutons', rows: [row(5, '5')] }));
    expect(result).toMatchObject({
      errors: [],
      buildingThreshold: { attack: 120, reload: 6, source: 'primary' },
      baseProjectiles: 1,
      extraProjectiles: 0,
      totalProjectiles: 1,
      nextAt: 9,
      firingSteps: { wholeSlots: 1, uncappedProjectiles: 1, primaryMinimum: true, nextThreshold: { slots: 2, power: 40 } },
    });
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
  it.each(['Armenians', 'Georgians'])('keeps relic and villager contributions in sync with selected technologies for %s', (civ) => {
    const b = ctx.core.buildingById[1806]!;
    const techs = getGarrisonTechs(ctx, b, config({ civ })).map((t) => t.id);
    const relics = calc(1806, { civ, techs, rows: [row(285, '2', 'deposit')] });
    const villagers = calc(1806, { civ, techs, rows: [row(83, '2')] });
    expect(relics.errors).toEqual([]);
    expect(villagers.errors).toEqual([]);
    expect(relics.rows[0]!.powerEach).toBe(villagers.rows[0]!.powerEach);
    expect(relics.thresholds).toEqual(villagers.thresholds);
    expect(relics.maxAtCapacity).toBe(villagers.maxAtCapacity);
    expect(relics.nextByUnit[285]).toEqual(villagers.nextByUnit[83]);
    expect(candidates(1806, { civ }).find((u) => u.id === 285)!.reason).not.toContain('只计容量');
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
  it('keeps custom upgrade filtering aligned with the supplied garrison data', () => {
    const b = ctx.core.buildingById[109]!;
    const c = config({ civ: 'Turks' });
    const data = { ...GENERAL_GARRISON_DATA, unitUpgradeTechs: { [b.id]: [47] } };
    expect(getGarrisonTechs(ctx, b, c).map((t) => t.id)).toContain(47);
    expect(getGarrisonTechs(ctx, b, c, data).map((t) => t.id)).not.toContain(47);
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

describe('Issue 1505 garrison display free-tech partition', () => {
  const autoIds = (bid: number, civ: string, age: number, techs: number[] = []) => {
    const b = ctx.core.buildingById[bid]!;
    const c = config({ civ, age, techs });
    const available = getGarrisonTechs(ctx, b, c);
    const freeIds = getFreeGarrisonTechs(ctx, b, c);
    return partitionGarrisonTechs(available, freeIds);
  };

  it('全矩阵不变量：20 座驻军宿主 × 全可用文明 × 有效时代（空自选与全选）均精确满足 automatic = available ∩ free', () => {
    const hosts = getGarrisonBuildings(ctx);
    expect(hosts).toHaveLength(20);
    const nonGarrisonFreeCivs = new Set(['Slavs', 'Franks', 'Bohemians', 'Vikings', 'Magyars', 'Malay', 'Byzantines', 'Teutons', 'Vietnamese']);
    let checked = 0;

    for (const b of hosts) {
      for (const civ of b.civs) {
        const minAge = getGarrisonBuildingAge(b, civ, ctx.trees);
        for (let age = minAge; age <= 4; age++) {
          const emptyCfg = config({ civ, age, techs: [] });
          const available = getGarrisonTechs(ctx, b, emptyCfg);
          const freeBase = getFreeGarrisonTechs(ctx, b, emptyCfg);
          const freeBaseSet = new Set(freeBase);
          const partBase = partitionGarrisonTechs(available, freeBase);

          const expectedAutoBase = available.filter((t) => freeBaseSet.has(t.id));
          const expectedManualBase = available.filter((t) => !freeBaseSet.has(t.id));
          expect(partBase.automatic, `${civ}/${b.id}/age${age} empty auto`).toEqual(expectedAutoBase);
          expect(partBase.manual, `${civ}/${b.id}/age${age} empty manual`).toEqual(expectedManualBase);
          expect(partBase.manual.length + partBase.automatic.length).toBe(available.length);
          expect(new Set([...partBase.manual, ...partBase.automatic].map((t) => t.id)).size).toBe(available.length);

          // Simulate GeneralGarrisonPreview select-all (unlocks conditional free techs such as Koreans 64 on 47)
          const selectAllRaw = partBase.manual.map((t) => t.id);
          const freeAfterAll = getFreeGarrisonTechs(ctx, b, config({ civ, age, techs: selectAllRaw }));
          const freeAfterAllSet = new Set(freeAfterAll);
          const selectedManual = selectAllRaw.filter((id) => !freeAfterAllSet.has(id));
          const allCfg = config({ civ, age, techs: selectedManual });
          const availableAll = getGarrisonTechs(ctx, b, allCfg);
          const freeAll = getFreeGarrisonTechs(ctx, b, allCfg);
          const freeAllSet = new Set(freeAll);
          const partAll = partitionGarrisonTechs(availableAll, freeAllSet);

          expect(partAll.automatic, `${civ}/${b.id}/age${age} select-all auto`).toEqual(availableAll.filter((t) => freeAllSet.has(t.id)));
          expect(partAll.manual, `${civ}/${b.id}/age${age} select-all manual`).toEqual(availableAll.filter((t) => !freeAllSet.has(t.id)));
          expect(partAll.manual.length + partAll.automatic.length).toBe(availableAll.length);

          if (nonGarrisonFreeCivs.has(civ)) {
            expect(partBase.automatic, `${civ}/${b.id}/age${age} must hide non-garrison free techs`).toEqual([]);
            expect(partAll.automatic, `${civ}/${b.id}/age${age} select-all must hide non-garrison free techs`).toEqual([]);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(2200);
  }, 30_000);

  it('锁定 11 文明负例清零与土耳其 47 / 高丽 64 正反例边界，同时保持底层 getFreeGarrisonTechs 语义不变', () => {
    // 9 civs: raw getFreeGarrisonTechs retains shared free techs while display automatic is empty
    for (const [civ, rawFree] of [
      ['Slavs', [602, 875]],
      ['Franks', [12, 13, 14]],
      ['Bohemians', [55, 182, 278, 279]],
      ['Vikings', [213, 249]],
      ['Magyars', [67, 68, 75]],
      ['Malay', [74, 76, 77]],
      ['Byzantines', [8, 280]],
      ['Teutons', [441]],
      ['Vietnamese', [315]],
    ] as const) {
      const castle = ctx.core.buildingById[82]!;
      expect(getFreeGarrisonTechs(ctx, castle, config({ civ, age: 4 }))).toEqual(expect.arrayContaining([...rawFree]));
      expect(autoIds(82, civ, 4).automatic).toEqual([]);
      expect(autoIds(12, civ, 4).automatic).toEqual([]);
    }

    // Turks (age 4): Chemistry (47) kept on 9 relevant hosts (incl. 87/49 free-only), hidden on 6 non-relevant hosts
    for (const bid of [45, 49, 79, 82, 87, 109, 234, 235, 236]) {
      const part = autoIds(bid, 'Turks', 4);
      expect(
        part.automatic.map((t) => t.id),
        `Turks/${bid}`,
      ).toEqual([47]);
      if (bid === 87 || bid === 49) expect(part.manual, `Turks/${bid} manual`).toEqual([]);
    }
    for (const bid of [12, 68, 70, 84, 101, 104]) {
      expect(getFreeGarrisonTechs(ctx, ctx.core.buildingById[bid]!, config({ civ: 'Turks', age: 4 }))).toContain(47);
      expect(autoIds(bid, 'Turks', 4).automatic, `Turks/${bid}`).toEqual([]);
    }

    // Koreans (age 4): tower shape prereqs 63/140 hidden on 234/235; with 47 selected, only TC 109 shows free 64
    expect(getFreeGarrisonTechs(ctx, ctx.core.buildingById[235]!, config({ civ: 'Koreans', age: 4 }))).toEqual(expect.arrayContaining([63, 140]));
    expect(autoIds(234, 'Koreans', 4).automatic).toEqual([]);
    expect(autoIds(235, 'Koreans', 4).automatic).toEqual([]);
    const korTcEmpty = autoIds(109, 'Koreans', 4, []);
    expect(korTcEmpty.automatic).toEqual([]);
    expect(korTcEmpty.manual.map((t) => t.id)).toContain(64);
    const korTcWithChem = autoIds(109, 'Koreans', 4, [47]);
    expect(korTcWithChem.automatic.map((t) => t.id)).toEqual([64]);
    expect(korTcWithChem.manual.map((t) => t.id)).not.toContain(64);
    for (const bid of [45, 49, 79, 82, 87, 234, 235, 236]) {
      expect(getFreeGarrisonTechs(ctx, ctx.core.buildingById[bid]!, config({ civ: 'Koreans', age: 4, techs: [47] }))).toContain(64);
      expect(autoIds(bid, 'Koreans', 4, [47]).automatic, `Koreans/${bid} with 47`).toEqual([]);
    }
  });
});
