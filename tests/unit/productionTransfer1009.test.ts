import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { applicableTrainingTechs } from '../../src/domain/duelTrainingCost';
import {
  DEFAULT_PRODUCTION,
  DEFAULT_PRODUCTION_COUNT,
  decodeProduction,
  productionBuildings,
  type ProductionConfig,
  type ProductionContext,
} from '../../src/domain/production';
import { duelToTrainTotal, isDefaultProduction, productionToTrainTotal, trainTotalToProduction } from '../../src/domain/productionTransfer';
import { makeSimContext } from '../../src/domain/simulator';
import { emptyTrainTotal, encodeTrainTotal, evaluateTrainTotal, type TrainTotalConfig } from '../../src/domain/trainTotal';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { decodeTrainTotal, trainTotalHrefFrom } from '../../src/features/production/trainTotalCodec';
import { pendingTrainQuantity } from '../../src/features/production/trainTotalCopy';
import { productionTransferState, readProductionTransfer, withoutProductionTransfer } from '../../src/shared/utils/productionTransferState';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});
const total = (fields: Partial<TrainTotalConfig> = {}): TrainTotalConfig => ({ ...emptyTrainTotal('Chinese', 4), ...fields });
const production = (fields: Partial<ProductionConfig> = {}): ProductionConfig => ({
  ...DEFAULT_PRODUCTION,
  rows: DEFAULT_PRODUCTION.rows.map((row) => ({ ...row })),
  ...fields,
});
const transferredSide = (uid: number, civ: string, techs: number[] | 'f' | 'c', count = 1, age = 4, side: 'a' | 'b' = 'a') => {
  const resolved = resolve(makeSimContext(ctx.core.techs, ctx.trees), ctx.core.unitById, { uid, civ, age, ageSet: true, techs, team: [] }, 569);
  return {
    resolved,
    transfer: duelToTrainTotal(ctx, {
      side,
      unit: resolved.u,
      civ: resolved.civ,
      age: resolved.age,
      count,
      techs: resolved.spec.techs,
      selected: isUnavail(resolved) ? undefined : resolved.sel,
    }),
  };
};

describe('#1009 PK to a new training scheme', () => {
  it('keeps resolved sides, exact shapes, counts including out-of-range values, and no duel fields', () => {
    for (const side of ['a', 'b'] as const)
      for (const count of [1, 30, 0, 1001, 9000]) {
        const { transfer, resolved } = transferredSide(559, 'Chinese', [], count, 4, side);
        expect(transfer.config).toMatchObject({ civ: resolved.civ, age: resolved.age, rows: [{ unit: resolved.u.id, qty: String(count) }] });
        expect(transfer.notice).toMatchObject({ source: 'duel', side, qty: String(count) });
        expect(decodeTrainTotal('?' + encodeTrainTotal(transfer.config)).config).toEqual(transfer.config);
        expect([...new URLSearchParams(encodeTrainTotal(transfer.config)).keys()]).toEqual(['mode', 'civ', 'age', 'units']);
      }
  });
  it('preserves explicit unlock 47 even when the normal PK numeric selection omits it', () => {
    const { resolved, transfer } = transferredSide(5, 'Hindustanis', [47]);
    expect(isUnavail(resolved)).toBe(false);
    if (isUnavail(resolved)) throw new Error('Expected normal PK card');
    expect(resolved.sel.has(47)).toBe(false);
    expect(transfer.config.techs).toContain(47);
    const result = evaluateTrainTotal(ctx, transfer.config);
    expect(result.lines[0]?.status).toBe('ok');
    expect(result.lines[0]?.cost).toEqual(resolved.training.price.cost);
  });
  it('does not invent an unlock for f/c, while target free unlocks remain automatic', () => {
    for (const preset of ['f', 'c'] as const) {
      const hindustanis = transferredSide(5, 'Hindustanis', preset).transfer.config;
      expect(hindustanis.techs).not.toContain(47);
      expect(evaluateTrainTotal(ctx, hindustanis).lines[0]?.status).toBe('unavail');
      const turks = transferredSide(5, 'Turks', preset).transfer.config;
      expect(turks.techs).not.toContain(47);
      expect(evaluateTrainTotal(ctx, turks).lines[0]?.status).toBe('ok');
    }
  });
  it('keeps unavailable cards and explicit legal unlocks without substituting a unit', () => {
    const { resolved, transfer } = transferredSide(291, 'Hindustanis', [47], 17);
    expect(isUnavail(resolved)).toBe(true);
    expect(transfer.config).toMatchObject({ civ: 'Hindustanis', rows: [{ unit: 291, qty: '17' }] });
    expect(transfer.config.techs).toContain(47);
    expect(evaluateTrainTotal(ctx, transfer.config).lines[0]?.status).toBe('unavail');
  });
  it('uses actual resolved fallback civilization/age/shape, not the raw request', () => {
    const { resolved, transfer } = transferredSide(999999, 'Nope', [], 1, 1);
    expect(resolved.u.id).toBe(569);
    expect(transfer.config).toMatchObject({ civ: resolved.civ, age: resolved.age, rows: [{ unit: 569, qty: '1' }] });
  });
  it('keeps explicit applicable cost choices, excludes combat/invalid IDs and agrees per resource', () => {
    const unit = ctx.core.unitById[441]!;
    const cost = applicableTrainingTechs(makeSimContext(ctx.core.techs, ctx.trees), unit, 'Gurjaras', 4).find((choice) => choice.supported)!;
    expect(cost).toBeTruthy();
    const { resolved, transfer } = transferredSide(unit.id, 'Gurjaras', [cost.tech.id, 67, 999999], 3);
    expect(transfer.config.techs).toContain(cost.tech.id);
    expect(transfer.config.techs).not.toContain(67);
    expect(transfer.config.techs).not.toContain(999999);
    if (isUnavail(resolved)) throw new Error('Expected trainable PK card');
    expect(evaluateTrainTotal(ctx, transfer.config).lines[0]?.cost).toEqual(resolved.training.price.cost);
  });
});

describe('#1009 production mode transfers without quantity conversion', () => {
  it('B1 retains source order and merges valid duplicates regardless of quantity errors', () => {
    const mapped = trainTotalToProduction(
      ctx,
      total({
        rows: [
          { unit: 559, qty: '' },
          { unit: 559, qty: 'abc' },
          { unit: 83, qty: '1001' },
        ],
      }),
    );
    expect(mapped.config.rows.map((row) => row.unit)).toEqual([559, 83]);
    expect(mapped.config.rows.map((row) => row.count)).toEqual([DEFAULT_PRODUCTION_COUNT, DEFAULT_PRODUCTION_COUNT]);
    expect(mapped.config.rows[0]?.building).toBe(productionBuildings(ctx, mapped.config, ctx.core.unitById[559]!)[0]);
    expect(mapped.notice).toEqual({ source: 'total', count: 2, skipped: [] });
    expect(mapped.config).toMatchObject({ walk: DEFAULT_PRODUCTION.walk, farm: DEFAULT_PRODUCTION.farm });
  });
  it('B1 filters technologies before shape availability, including early chemistry and invalid choices', () => {
    const mapped = trainTotalToProduction(ctx, total({ civ: 'Bohemians', age: 3, techs: [47, 67, 999999], rows: [{ unit: 5, qty: '' }] }));
    expect(mapped.config.techs).toEqual([47]);
    expect(mapped.config.rows.map((row) => row.unit)).toEqual([5]);
    expect(mapped.notice).toMatchObject({ count: 1, skipped: [] });
  });
  it('B1 records every skipped source row before deduplication, and all-skipped defaults keep civilization and age', () => {
    const mapped = trainTotalToProduction(
      ctx,
      total({
        age: 3,
        rows: [
          { unit: 359, qty: '1' },
          { unit: 0, qty: '' },
          { unit: 359, qty: 'abc' },
        ],
      }),
    );
    expect(mapped.config).toMatchObject({ civ: 'Chinese', age: 3, rows: DEFAULT_PRODUCTION.rows });
    expect(mapped.notice).toEqual({
      source: 'total',
      count: 0,
      skipped: [
        { name: ctx.core.unitById[359]!.zh, reason: 'current' },
        { name: '', reason: 'pending' },
        { name: ctx.core.unitById[359]!.zh, reason: 'current' },
      ],
    });
  });
  it('B2 carries units with zero or invalid building count, merges in order, and leaves training quantities empty', () => {
    const mapped = productionToTrainTotal(
      ctx,
      production({
        civ: 'Chinese',
        age: 4,
        walk: 7,
        farm: 5,
        rows: [
          { unit: 559, building: 82, count: '0' },
          { unit: 83, building: 109, count: 'abc' },
          { unit: 559, building: 999, count: '100' },
        ],
      }),
    );
    expect(mapped.config.rows).toEqual([
      { unit: 559, qty: '' },
      { unit: 83, qty: '' },
    ]);
    expect(mapped.notice).toEqual({ source: 'production', count: 2, skipped: [] });
    const evaluated = evaluateTrainTotal(ctx, mapped.config);
    expect(evaluated.validCount).toBe(0);
    expect(evaluated.total).toEqual({});
    expect(evaluated.lines.every(pendingTrainQuantity)).toBe(true);
  });
  it('B2 keeps common unlock/cost techs but never economy choices; unavailable rows are not silently substituted', () => {
    const mapped = productionToTrainTotal(
      ctx,
      production({
        civ: 'Bohemians',
        age: 3,
        techs: [47, 213, 999999],
        rows: [
          { unit: 5, building: 87, count: '2' },
          { unit: 359, building: 82, count: '1' },
        ],
      }),
    );
    expect(mapped.config.techs).toEqual([47]);
    expect(mapped.config.rows).toEqual([{ unit: 5, qty: '' }]);
    expect(mapped.notice).toMatchObject({ count: 1, skipped: [{ name: ctx.core.unitById[359]!.zh, reason: 'current' }] });
    expect(pendingTrainQuantity(evaluateTrainTotal(ctx, mapped.config).lines[0]!)).toBe(true);
  });
  it('free chemistry remains automatic in both directions', () => {
    const a = trainTotalToProduction(ctx, total({ civ: 'Turks', techs: [], rows: [{ unit: 5, qty: '' }] }));
    expect(a.config.techs).not.toContain(47);
    expect(a.config.rows.map((row) => row.unit)).toEqual([5]);
    const b = productionToTrainTotal(ctx, a.config);
    expect(b.config.techs).not.toContain(47);
    expect(b.config.rows).toEqual([{ unit: 5, qty: '' }]);
  });
  it('has a narrow, fully semantic default exception with strict count text and original age helper behavior', () => {
    for (const search of ['', '?age=3', '?age=03', '?age=nope', '?rows=83:109:1']) {
      const decoded = decodeProduction(search).config;
      expect(isDefaultProduction(decoded)).toBe(true);
      expect(productionToTrainTotal(ctx, decoded)).toMatchObject({ config: { rows: [] }, notice: null });
      expect(new URLSearchParams(trainTotalHrefFrom(search).split('?')[1]).get('age')).toBe(search === '?age=3' ? '3' : '4');
    }
    for (const fields of [{ civ: 'Chinese' }, { age: 4 }, { walk: 4 }, { farm: 2 }, { techs: [47] }, { rows: [] }])
      expect(isDefaultProduction(production(fields))).toBe(false);
    for (const count of ['0', '01', '1.0', ' 1', '1 ']) {
      const config = production({ rows: [{ ...DEFAULT_PRODUCTION.rows[0]!, count }] });
      expect(isDefaultProduction(config)).toBe(false);
      expect(productionToTrainTotal(ctx, config).config).toMatchObject({ age: 3, rows: [{ unit: 83, qty: '' }] });
    }
    const empty = productionToTrainTotal(ctx, production({ rows: [] }));
    expect(empty).toMatchObject({ config: { rows: [] }, notice: null });
  });
  it('derives pending only from an available shape and strict empty quantity, including direct URLs', () => {
    for (const qty of ['', ' ', '0', 'abc', '1001']) {
      const config = decodeTrainTotal('?' + encodeTrainTotal(total({ rows: [{ unit: 559, qty }] }))).config;
      expect(pendingTrainQuantity(evaluateTrainTotal(ctx, config).lines[0]!)).toBe(qty === '');
    }
    expect(pendingTrainQuantity(evaluateTrainTotal(ctx, total({ rows: [{ unit: 291, qty: '' }] })).lines[0]!)).toBe(false);
    expect(pendingTrainQuantity(evaluateTrainTotal(ctx, total({ rows: [{ unit: 0, qty: '' }] })).lines[0]!)).toBe(false);
  });
  it('keeps only a serializable entry notice and dismisses it without removing unrelated router state', () => {
    const mapped = trainTotalToProduction(ctx, total({ rows: [{ unit: 559, qty: '7' }] }));
    const state = { ...productionTransferState(mapped.notice), unrelated: { keep: true } };
    expect(readProductionTransfer(JSON.parse(JSON.stringify(state)))).toEqual(mapped.notice);
    expect(withoutProductionTransfer(state)).toEqual({ unrelated: { keep: true } });
    expect(readProductionTransfer(withoutProductionTransfer(state))).toBeNull();
    expect(readProductionTransfer({ productionTransfer: { source: 'production', count: 1, skipped: [null] } })).toBeNull();
  });
});
