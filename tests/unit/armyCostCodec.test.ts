import { describe, expect, it } from 'vitest';
import { emptyArmyCost, ARMY_COST_DATA } from '../../src/domain/armyCostConfig';
import { decodeArmyCost, encodeArmyCost, armyContextQuery } from '../../src/features/production/armyCostCodec';
import { productionMode } from '../../src/features/production/productionMode';
import { evaluateArmyCost } from '../../src/domain/armyCost';
import { CORE } from '../../src/data/core';
import { loadTrees } from '../../src/data';

const ctx = { core: CORE, trees: await loadTrees() };
describe('independent army protocol', () => {
  it('round-trips row order and invalid raw quantities; canonicalizes each research set', () => {
    const config = {
      ...emptyArmyCost('Sicilians'),
      rows: [
        { unit: 1659, qty: '10' },
        { unit: 546, qty: '1001' },
      ],
      done: ['t:68', 't:67', 't:68'],
      targets: ['t:99999', 't:753', 't:753'],
    };
    const r = decodeArmyCost(encodeArmyCost(config));
    expect(r.errors).toEqual([]);
    expect(r.config).toEqual({ ...config, done: ['t:67', 't:68'], targets: ['t:753', 't:99999'] });
    expect(evaluateArmyCost(ctx, { ...r.config!, targets: ['t:753'] }).training.lines[1]?.status).toBe('badqty');
    expect(encodeArmyCost(r.config!)).toBe(encodeArmyCost(config));
  });
  it('starts empty from a bare army entry and does not interpret legacy rows or techs', () => {
    expect(decodeArmyCost('mode=army-cost&rows=1659:20&techs=753').config).toEqual(emptyArmyCost());
    expect(armyContextQuery('civ=Goths&age=4&rows=555:20&techs=16')).toBe('civ=Goths&age=4');
  });
  it.each(['mode', 'civ', 'age', 'acv', 'acdata', 'acunits', 'acdone', 'actargets', 'acfuture'])(
    'rejects duplicate %s fields instead of choosing a value',
    (field) => {
      const params = new URLSearchParams(encodeArmyCost(emptyArmyCost()));
      params.append(field, params.get(field) ?? 'a');
      if (field === 'acfuture') params.append(field, 'b');
      expect(decodeArmyCost(params.toString()).config).toBe(null);
      expect(productionMode(params.toString()).kind).toBe('army');
    },
  );
  it.each([
    'mode=army-cost&acv=99',
    'mode=army-cost&acv=1',
    'mode=army-cost&acunits=%ZZ',
    'mode=army-cost&acv=1&acdata=188329&acunits=null',
    'mode=army-cost&acv=1&acdata=188329&acunits={}',
  ])('keeps malformed input out of the permissive legacy decoder: %s', (query) => {
    expect(productionMode(query).kind).toBe('army');
    expect(decodeArmyCost(query).config).toBe(null);
  });
  it('does not dispatch an unrelated legacy note to the army codec', () => {
    expect(productionMode('mode=train-total&note=army-cost').kind).toBe('total');
    expect(productionMode('note=army-cost').kind).toBe('legacy');
    expect(productionMode('mode=army-cost%ZZ').kind).toBe('army');
  });
  it('rejects oversized row arrays and malformed row structures', () => {
    const params = new URLSearchParams(encodeArmyCost(emptyArmyCost()));
    for (const value of [Array.from({ length: 13 }, () => ({ unit: 546, qty: '1' })), [{ unit: '546', qty: '1' }], [{ unit: 546, qty: 1 }]]) {
      params.set('acunits', JSON.stringify(value));
      expect(decodeArmyCost(params.toString()).config).toBe(null);
    }
  });
  it('preserves old-version inputs and does not accept an ordinary edit as version approval', () => {
    const query = encodeArmyCost({ ...emptyArmyCost(), targets: ['t:753'] }, 'old');
    const old = decodeArmyCost(query);
    expect(old.dataChanged).toBe(true);
    expect(old.config?.targets).toEqual(['t:753']);
    expect(decodeArmyCost(encodeArmyCost(old.config!, 'old')).dataChanged).toBe(true);
    expect(decodeArmyCost(encodeArmyCost(old.config!, ARMY_COST_DATA)).dataChanged).toBe(false);
    expect(productionMode('acv=1').kind).toBe('army');
    expect(decodeArmyCost('acv=1').config).toBe(null);
  });
});
