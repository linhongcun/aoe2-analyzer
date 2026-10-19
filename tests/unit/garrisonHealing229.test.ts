import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  DEFAULT_HEALING_CONFIG,
  GARRISON_HEALING_DATA,
  availableHealingTechs,
  calculateGarrisonHealing,
  freeHealingTechs,
  getHealingBuildings,
  getHealingCandidates,
  healingLink,
  maxHealingHp,
  readHealingConfig,
  toggleHealingTech,
  writeHealingConfig,
  type HealingConfig,
  type HealingContext,
} from '../../src/domain/garrisonHealing';

let ctx: HealingContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const config = (extra: Partial<HealingConfig> = {}): HealingConfig => ({ ...DEFAULT_HEALING_CONFIG, techs: [], ...extra });
const calc = (extra: Partial<HealingConfig> = {}) => calculateGarrisonHealing(ctx, config(extra));

describe('#229 static building healing', () => {
  it('retains all potential hosts while never marking the dataset engine verified', () => {
    expect(getHealingBuildings(ctx).map((b) => b.id)).toEqual(expect.arrayContaining([109, 82, 104, 1806, 70, 68, 45, 12, 101, 49]));
    expect(GARRISON_HEALING_DATA.meta.engineVerifiedInPinnedBuild).toBe(false);
  });
  it('computes ordinary villagers from fixed unrounded rates', () => {
    const r = calc();
    expect(r).toMatchObject({ status: 'valid', errors: [], maxHp: 25 });
    expect(r.hpPerMinute).toBeCloseTo(6);
    expect(r.seconds).toBeCloseTo(150);
    expect(r.warnings.join('')).toContain('自身再生');
  });
  it('makes 500 percent improvement six times the rate and one sixth the time', () => {
    const r = calc({ techs: [441] });
    expect(r.errors).toEqual([]);
    expect(r.hpPerMinute).toBeCloseTo(36);
    expect(r.seconds).toBeCloseTo(25);
    expect(r.beforeHerbal.seconds! / r.afterHerbal.seconds!).toBeCloseTo(6);
  });
  it.each([
    [79, 'Britons', 83, 'enter', 6],
    [82, 'Britons', 83, 'enter', 12],
    [1251, 'Bulgarians', 83, 'enter', 12],
    [1806, 'Armenians', 83, 'enter', 24],
    [104, 'Britons', 125, 'created', 90],
    [12, 'Britons', 74, 'created', 30],
    [87, 'Britons', 4, 'created', 30],
    [101, 'Britons', 38, 'created', 15],
  ] as const)('uses each host rate for %s/%s', (buildingId, civ, unitId, entry, rate) => {
    const r = calc({ buildingId, civ, unitId, entry });
    expect(r.errors).toEqual([]);
    expect(r.status).toBe('valid');
    expect(r.hpPerMinute).toBeCloseTo(rate);
    if (entry === 'created') expect(r.warnings.join('')).toContain('离开后');
  });
  it('does not turn production leave-ins into a route for external wounded monks', () => {
    const r = calc({ buildingId: 104, unitId: 125, entry: 'enter' });
    expect(r.status).toBe('ineligible');
    expect(r.seconds).toBeNull();
    expect(getHealingCandidates(ctx, config({ buildingId: 104, unitId: 125 })).find((u) => u.id === 125)).toMatchObject({ canCreate: true, canEnter: false });
  });
  it.each([
    [70, 'Khmer', 83, 'enter'],
    [68, 'Gurjaras', 594, 'enter'],
    [45, 'Gurjaras', 13, 'enter'],
    [49, 'Britons', 280, 'created'],
    [84, 'Britons', 128, 'created'],
  ] as const)('keeps a zero-rate host distinct from an unknown result: %s', (buildingId, civ, unitId, entry) => {
    const r = calc({ buildingId, civ, unitId, entry, currentHp: '1', targetHp: '2', techs: [441] });
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ status: 'zero-rate', hpPerSecond: 0, hpPerMinute: 0, seconds: null });
  });
  it('pauses the mule cart rather than inferring treatment from its religious size class', () => {
    const r = calc({ buildingId: 1806, civ: 'Armenians', unitId: 1808, currentHp: '10', targetHp: '20' });
    expect(r).toMatchObject({ errors: [], status: 'unverified', seconds: null, hpPerSecond: null, maxHp: null });
    expect(calc({ buildingId: 1806, civ: 'Armenians', unitId: 1808, currentHp: '300', targetHp: '300' }).seconds).toBeNull();
  });
  it('distinguishes relic deposits from injured units', () => {
    const r = calc({ buildingId: 104, unitId: 285, entry: 'deposit' });
    expect(r).toMatchObject({ errors: [], status: 'ineligible', seconds: null });
  });
  it('keeps female villager HP identical without changing her occupant id', () => {
    const r = calc({ unitId: 293, techs: [22], targetHp: '40' });
    expect(r).toMatchObject({ status: 'valid', maxHp: 40, errors: [] });
  });
  it('supports the mode-specific king with explicit warning', () => {
    const r = calc({ unitId: 434, currentHp: '20', targetHp: '75' });
    expect(r).toMatchObject({ status: 'valid', maxHp: 75, errors: [] });
    expect(r.warnings.join('')).toContain('国王');
  });
  it('offers all HP technologies including triggered Aztec monastery research', () => {
    const c = config({ civ: 'Aztecs', unitId: 125 });
    expect(availableHealingTechs(ctx, c).map((t) => t.id)).toEqual(expect.arrayContaining([231, 252, 441, 319]));
    expect(maxHealingHp(ctx, { ...c, techs: [231] })).toBe(50);
    expect(maxHealingHp(ctx, { ...c, techs: [231, 441] })).toBe(55);
    expect(maxHealingHp(ctx, { ...c, techs: [252, 441] })).toBe(40);
  });
  it('compares absolute HP values without clipping the no-herbal target', () => {
    const r = calc({ civ: 'Aztecs', unitId: 125, techs: [231, 441], currentHp: '10', targetHp: '55' });
    expect(r).toMatchObject({ errors: [], status: 'valid', maxHp: 55 });
    expect(r.beforeHerbal).toMatchObject({ status: 'invalid', maxHp: 50, seconds: null });
    expect(r.afterHerbal.seconds).not.toBeNull();
  });
  it('applies free Teuton herbal medicine once and only from Castle Age', () => {
    expect(freeHealingTechs(ctx, config({ civ: 'Teutons', age: 2 }))).not.toContain(441);
    const c = config({ civ: 'Teutons', age: 3 });
    expect(freeHealingTechs(ctx, c)).toContain(441);
    expect(toggleHealingTech(ctx, c, 441)).toContain(441);
    const r = calc(c);
    expect(r.hpPerMinute).toBeCloseTo(36);
    expect(calc({ ...c, techs: [441] }).hpPerMinute).toBeCloseTo(36);
    expect(r.beforeHerbal).toMatchObject({ status: 'ineligible', seconds: null });
  });
  it('does not expose unavailable herbal medicine for Turks', () => {
    const r = calc({ civ: 'Turks' });
    expect(availableHealingTechs(ctx, config({ civ: 'Turks' })).some((t) => t.id === 441)).toBe(false);
    expect(r.afterHerbal).toMatchObject({ status: 'ineligible', seconds: null });
  });
  it.each(['', '-1', '0', 'NaN', 'Infinity', '1e2', '12abc', ' 10 ', '1,5'])('rejects editable invalid HP %s', (currentHp) => {
    const r = calc({ currentHp });
    expect(r.status).toBe('invalid');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.seconds).toBeNull();
  });
  it('rejects above-maximum HP and duplicate or unavailable technologies', () => {
    expect(calc({ targetHp: '26' }).status).toBe('invalid');
    expect(calc({ techs: [441, 441] }).status).toBe('invalid');
    expect(calc({ age: 2, techs: [441] }).status).toBe('invalid');
    expect(calc({ techs: [999999] }).status).toBe('invalid');
  });
  it.each([
    ['25', '25'],
    ['25', '20'],
  ])('returns an explicit zero only after a valid target has been reached (%s/%s)', (currentHp, targetHp) => {
    expect(calc({ currentHp, targetHp })).toMatchObject({ errors: [], status: 'complete', seconds: 0 });
  });
  it('preserves fractional HP and uses the same missing-health formula', () => {
    const r = calc({ currentHp: '10.5', targetHp: '11.25' });
    expect(r.seconds).toBeCloseTo(7.5);
  });
  it('needs no healing when a known organic target is already reached in a zero-rate host', () => {
    const r = calc({ buildingId: 70, civ: 'Khmer', currentHp: '25', targetHp: '25' });
    expect(r).toMatchObject({ errors: [], status: 'complete', hpPerMinute: 0, seconds: 0 });
    expect(calc({ buildingId: 70, civ: 'Khmer', currentHp: '26', targetHp: '25' }).status).toBe('invalid');
  });
  it('toggling a dependent HP technology adds and removes its prerequisites', () => {
    const c = config({ civ: 'Aztecs', unitId: 125, age: 4 });
    expect(availableHealingTechs(ctx, c).some((t) => t.id === 45)).toBe(true);
    const selected = toggleHealingTech(ctx, c, 45);
    expect(selected).toEqual(expect.arrayContaining([45, 46]));
    expect(toggleHealingTech(ctx, { ...c, techs: selected }, 46)).not.toContain(45);
    expect(calc({ ...c, techs: [45] }).status).toBe('invalid');
  });
});

describe('#229 strict share configuration', () => {
  it('defaults only a truly empty query', () => {
    expect(readHealingConfig(new URLSearchParams(), ctx)).toEqual({ config: config(), errors: [] });
    expect(readHealingConfig(new URLSearchParams('b=109'), ctx).errors.length).toBeGreaterThan(0);
  });
  it('roundtrips every configured field', () => {
    const c = config({ buildingId: 1806, civ: 'Armenians', unitId: 83, techs: [22, 441], currentHp: '12.5', targetHp: '40' });
    expect(readHealingConfig(writeHealingConfig(c), ctx)).toEqual({ config: c, errors: [] });
  });
  it.each([
    ['hv', '2'],
    ['b', '-1'],
    ['age', '1.5'],
    ['u', 'bogus'],
    ['entry', 'train'],
    ['techs', '441,441'],
    ['techs', '441,'],
    ['current', 'Infinity'],
    ['target', '99999'],
    ['civ', 'NoSuchCiv'],
  ])('locks malformed %s parameters', (key, value) => {
    const params = writeHealingConfig(config());
    params.set(key, value);
    expect(readHealingConfig(params, ctx).errors.length).toBeGreaterThan(0);
  });
  it('rejects duplicate, missing, unknown, and excessive parameters', () => {
    const duplicate = writeHealingConfig(config());
    duplicate.append('b', '82');
    expect(readHealingConfig(duplicate, ctx).errors.join('')).toContain('重复');
    const missing = writeHealingConfig(config());
    missing.delete('techs');
    expect(readHealingConfig(missing, ctx).errors.join('')).toContain('缺失');
    const unknown = writeHealingConfig(config());
    unknown.set('future', '1');
    expect(readHealingConfig(unknown, ctx).errors.join('')).toContain('未知');
    unknown.set('future', 'x'.repeat(4097));
    expect(readHealingConfig(unknown, ctx).errors.join('')).toContain('过长');
  });
  it('retains bad numeric strings for correction but reports a bad URL separately', () => {
    const c = config({ currentHp: '-3' });
    const decoded = readHealingConfig(writeHealingConfig(c), ctx);
    expect(decoded.config.currentHp).toBe('-3');
    expect(decoded.errors.length).toBeGreaterThan(0);
    expect(calculateGarrisonHealing(ctx, { ...decoded.config, currentHp: '10' }).status).toBe('valid');
    expect(decoded.errors.length).toBeGreaterThan(0);
  });
  it.each(['%FF', '%C0%AF', '%E2%82', '%ZZ', '%'])('rejects malformed escaping and UTF-8 %s before normalization', (value) => {
    const source = writeHealingConfig(config()).toString().replace('Britons', value);
    expect(readHealingConfig(new URLSearchParams(source), ctx, source).errors.length).toBeGreaterThan(0);
    if (value !== '%ZZ' && value !== '%') expect(readHealingConfig(new URLSearchParams(source), ctx).errors.join('')).toContain('UTF-8');
  });
  it('does not allow a share URL to reinterpret external entry as production leave-in', () => {
    const decoded = readHealingConfig(writeHealingConfig(config({ buildingId: 104, unitId: 125, entry: 'enter' })), ctx);
    expect(decoded.errors.length).toBeGreaterThan(0);
    expect(decoded.config.entry).toBe('enter');
  });
  it('transfers one legal occupant, mode and applicable technology without unrelated projectile settings', () => {
    const link = healingLink(ctx, { buildingId: 1806, civ: 'Armenians', age: 3, unitId: 83, entry: 'enter', techs: [22, 441, 200] });
    expect(link).toMatch(/^\/garrison-healing\?/);
    const decoded = readHealingConfig(new URLSearchParams(link!.split('?')[1]), ctx);
    expect(decoded.errors).toEqual([]);
    expect(decoded.config).toMatchObject({ buildingId: 1806, civ: 'Armenians', unitId: 83, entry: 'enter', currentHp: '1', targetHp: '40', techs: [22, 441] });
  });
  it('chooses a fresh legal default and keeps zero-rate and unknown hosts reachable', () => {
    for (const input of [
      { buildingId: 70, civ: 'Khmer', age: 3 },
      { buildingId: 104, civ: 'Britons', age: 3 },
      { buildingId: 1806, civ: 'Armenians', age: 3, unitId: 1808 },
    ]) {
      const link = healingLink(ctx, input);
      expect(link).not.toBeNull();
      expect(readHealingConfig(new URLSearchParams(link!.split('?')[1]), ctx).errors).toEqual([]);
    }
    expect(healingLink(ctx, { buildingId: 104, civ: 'Britons', age: 3, unitId: 125, entry: 'enter' })).toBeNull();
    expect(healingLink(ctx, { buildingId: 1806, civ: 'Britons', age: 3 })).toBeNull();
    expect(healingLink(ctx, { buildingId: 999999, civ: 'Britons', age: 3 })).toBeNull();
  });
});
