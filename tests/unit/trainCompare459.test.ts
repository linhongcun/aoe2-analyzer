import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees } from '../../src/data';
import {
  calculateProduction,
  effectiveProductionTechs,
  productionBuildings,
  productionTechs,
  type ProductionConfig,
  type ProductionContext,
} from '../../src/domain/production';
import { productionMode } from '../../src/features/production/productionMode';
import { decodeTrainCompare, encodeTrainCompare, type TrainCompareConfig } from '../../src/features/production/trainCompareCodec';
import { compareTraining } from '../../src/features/production/trainCompareModel';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const query = 'mode=train-compare&v=1&unit=38&age=3&n=10';
const config = (fields: Partial<TrainCompareConfig> = {}): TrainCompareConfig => ({ unit: 38, age: 3, n: 10, civs: ['Franks', 'Huns'], ...fields });
const catalogueOrder = (names: readonly string[]) => civs.filter((civ) => names.includes(civ.en)).map((civ) => civ.en);
const production = (civ: string, unit = 38): ProductionConfig => ({
  civ,
  age: 3,
  walk: 3,
  farm: 1,
  techs: productionTechs(ctx, { civ, age: 3 }).map((tech) => tech.id),
  rows: [{ unit, building: 101, count: '1' }],
});

describe('#459 strict new-mode dispatch and URL codec', () => {
  it('leaves original production URLs on the old path and dispatches a real comparison separately', () => {
    for (const search of ['', '?', '?civ=Huns&age=3&walk=3&farm=1&techs=&rows=38:101:1'])
      expect(productionMode(search)).toEqual({ kind: 'legacy', errors: [] });
    expect(productionMode('?' + query)).toEqual({ kind: 'compare', errors: [] });
  });

  it.each([
    '?mode=',
    '?mode=unknown',
    '?mode=train-compare&mode=train-compare',
    '?mode=train-compare&mode=legacy',
    '?v=1',
    '?unit=38',
    '?n=10',
    '?civs=',
    '?%6dode=train-compare&mode=train-compare',
  ])('never sends malformed mode or orphan new keys to the legacy decoder: %s', (search) => {
    expect(productionMode(search).kind).toBe('error');
    expect(productionMode(search).errors.length).toBeGreaterThan(0);
  });

  it('distinguishes a missing civilization default from an explicit empty set', () => {
    expect(decodeTrainCompare('?' + query)).toEqual({ config: config({ civs: null }), errors: [] });
    expect(decodeTrainCompare('?' + query + '&civs=')).toEqual({ config: config({ civs: [] }), errors: [] });
  });

  it('normalizes a known set by stable catalogue order, with no unknown-civilization deletion', () => {
    const decoded = decodeTrainCompare('?' + query + '&civs=Huns,Franks,Huns');
    expect(decoded).toEqual({ config: config({ civs: catalogueOrder(['Franks', 'Huns']) }), errors: [] });
    for (const values of ['Franks,not-real', 'Franks,,Huns']) {
      const bad = decodeTrainCompare('?' + query + '&civs=' + values);
      expect(bad.config).toBeNull();
      expect(bad.errors.length).toBeGreaterThan(0);
    }
  });

  it('requires each fixed field exactly once and rejects unknown keys or damaged encoding', () => {
    for (const key of ['mode', 'v', 'unit', 'age', 'n']) {
      const missing = new URLSearchParams(query);
      missing.delete(key);
      expect(decodeTrainCompare('?' + missing).config, `missing ${key}`).toBeNull();
      const repeated = new URLSearchParams(query);
      repeated.append(key, repeated.get(key)!);
      expect(decodeTrainCompare('?' + repeated).config, `duplicate ${key}`).toBeNull();
    }
    for (const suffix of ['&civs=Franks&civs=Franks', '&rows=38:101:1', '&other=x', '&civs=%ZZ', '&civs=%E0%A4%A']) {
      const result = decodeTrainCompare('?' + query + suffix);
      expect(result.config, suffix).toBeNull();
      expect(result.errors.length, suffix).toBeGreaterThan(0);
    }
  });

  it.each([
    ['v', '2'],
    ['unit', '1813'],
    ['unit', '1944'],
    ['unit', '999999'],
    ['unit', '38.0'],
    ['age', '4'],
    ['age', '2'],
    ['n', ''],
    ['n', '0'],
    ['n', '-1'],
    ['n', '1.5'],
    ['n', '1e1'],
    ['n', '1001'],
    ['n', '9007199254740993'],
    ['n', 'NaN'],
    ['n', 'Infinity'],
  ])('rejects unsupported or noninteger %s=%s without partial calculation', (key, value) => {
    const params = new URLSearchParams(query);
    params.set(key, value);
    const decoded = decodeTrainCompare('?' + params);
    expect(decoded.config).toBeNull();
    expect(decoded.errors.length).toBeGreaterThan(0);
  });

  it('round-trips every approved exact form and both N bounds, while requiring resolved civilizations for sharing', () => {
    for (const unit of [38, 283, 569])
      for (const n of [1, 10, 1000]) {
        const input = config({ unit, n, civs: ['Huns', 'Franks', 'Huns'] });
        const encoded = encodeTrainCompare(input);
        expect(decodeTrainCompare('?' + encoded)).toEqual({ config: config({ unit, n, civs: catalogueOrder(['Huns', 'Franks']) }), errors: [] });
      }
    expect(decodeTrainCompare('?' + encodeTrainCompare(config({ civs: [] }))).config!.civs).toEqual([]);
    expect(() => encodeTrainCompare(config({ civs: null }))).toThrow();
    expect(() => encodeTrainCompare(config({ civs: ['not-real'] }))).toThrow();
  });
});

describe('#459 wrapper preserves the existing fixed-data production results', () => {
  it('keeps the actual Castle knight cost, interval and ten-unit oracle values', () => {
    const result = compareTraining(ctx, config({ civs: ['Franks', 'Huns', 'Berbers', 'Portuguese', 'Poles'] }));
    expect(result.errors).toEqual([]);
    expect(result.unavailable).toEqual([]);
    for (const [civ, seconds, food, gold, total] of [
      ['Franks', 30, 60, 75, 300],
      ['Huns', 25, 60, 75, 250],
      ['Berbers', 30, 51, 64, 300],
      ['Portuguese', 30, 60, 60, 300],
      ['Poles', 30, 60, 30, 300],
    ] as const) {
      const row = result.rows.find((entry) => entry.civ === civ)!;
      expect(row.line.unit.id, civ).toBe(38);
      expect(row.line.building, civ).toBe(101);
      expect(row.line.count, civ).toBe(1);
      expect(row.line.seconds, civ).toBeCloseTo(seconds, 10);
      expect(row.line.cost, civ).toEqual({ Food: food, Gold: gold });
      expect(row.total, civ).toBeCloseTo(total, 10);
      expect(row.techs, civ).not.toContain(315);
      expect(row.techs, civ).not.toContain(493);
      expect(new Set(row.techs), civ).toEqual(effectiveProductionTechs(ctx, production(civ)));
    }
    const poles = result.rows.find((row) => row.civ === 'Poles')!;
    expect(poles.techs).toContain(782);
    expect(poles.line.applied).toContain(ctx.core.techById[782]!.zh);
    expect(result.rows.find((row) => row.civ === 'Huns')!.line.applied).toContain('本文明团队训练加成');
  });

  it('changes target N without changing the one-building line, interval or single-unit price', () => {
    const one = compareTraining(ctx, config({ n: 1 }));
    const thousand = compareTraining(ctx, config({ n: 1000 }));
    for (const row of one.rows) {
      const more = thousand.rows.find((entry) => entry.civ === row.civ)!;
      expect(more.line).toEqual(row.line);
      expect(more.total).toBeCloseTo(row.total * 1000, 8);
      expect(more.line.count).toBe(1);
    }
  });

  it('retains the exact requested shape and unavailable selections instead of substituting another unit or civilization', () => {
    const knight = compareTraining(ctx, config({ civs: ['Aztecs', 'Franks'] }));
    expect(knight.rows.map((row) => row.civ)).toEqual(['Franks']);
    expect(knight.unavailable.map((row) => row.civ)).toEqual(['Aztecs']);
    expect(knight.unavailable[0]!.reason).not.toBe('');
    const cavalier = compareTraining(ctx, config({ unit: 283, civs: ['Burgundians', 'Franks'] }));
    expect(cavalier.rows.map((row) => [row.civ, row.line.unit.id])).toEqual([['Burgundians', 283]]);
    expect(cavalier.unavailable.map((row) => row.civ)).toEqual(['Franks']);
    const paladin = compareTraining(ctx, config({ unit: 569, civs: ['Burgundians', 'Franks'] }));
    expect(paladin.rows).toEqual([]);
    expect(paladin.unavailable.map((row) => row.civ)).toEqual(catalogueOrder(['Burgundians', 'Franks']));
  });

  it('resolves only a missing civilization set from actual eligibility and preserves an explicitly empty set', () => {
    const expected = civs.filter((civ) => productionBuildings(ctx, production(civ.en), ctx.core.unitById[38]!).includes(101)).map((civ) => civ.en);
    const defaults = compareTraining(ctx, config({ civs: null }));
    expect(defaults.civs).toEqual(expected);
    expect(defaults.rows).toHaveLength(expected.length);
    expect(compareTraining(ctx, config({ civs: [] }))).toMatchObject({ rows: [], unavailable: [], civs: [], errors: [] });
  });

  it('sorts raw total times first and equal totals by immutable civilization catalogue order', () => {
    const chosen = ['Portuguese', 'Franks', 'Berbers', 'Huns'];
    const result = compareTraining(ctx, config({ civs: chosen }));
    expect(result.rows[0]!.civ).toBe('Huns');
    expect(result.rows.slice(1).map((row) => row.civ)).toEqual(catalogueOrder(chosen.filter((civ) => civ !== 'Huns')));
    expect(compareTraining(ctx, config({ civs: [...chosen].reverse() })).rows).toEqual(result.rows);
  });

  it('keeps every original warning on valid lines and uses line.applied for training attribution', () => {
    for (const civ of ['Franks', 'Huns', 'Poles', 'Danes']) {
      const original = calculateProduction(ctx, production(civ));
      const row = compareTraining(ctx, config({ civs: [civ] })).rows[0]!;
      expect(original.errors, civ).toEqual([]);
      expect(original.warnings.length, civ).toBeGreaterThan(0);
      expect(row.warnings, civ).toEqual(original.warnings);
      expect(row.line, civ).toEqual(original.lines[0]);
      expect(row.line.applied, civ).toEqual(original.lines[0]!.applied);
    }
  });

  it('does not mutate choices or context and rejects invalid programmatic requests without NaN or fallback rows', () => {
    const input = config({ civs: ['Huns', 'Franks'] });
    const before = JSON.stringify({ input, core: ctx.core, trees: ctx.trees });
    compareTraining(ctx, input);
    expect(JSON.stringify({ input, core: ctx.core, trees: ctx.trees })).toBe(before);
    for (const fields of [{ unit: 1813 }, { n: 0 }, { n: NaN }, { n: 1001 }, { civs: ['not-real'] }]) {
      const result = compareTraining(ctx, config(fields));
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.rows).toEqual([]);
    }
  });
});
