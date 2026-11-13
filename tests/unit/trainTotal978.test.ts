import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { priceAge } from '../../src/domain/costDiscount';
import { applicableTrainingTechs } from '../../src/domain/duelTrainingCost';
import type { ProductionContext } from '../../src/domain/production';
import { makeSimContext } from '../../src/domain/simulator';
import { evaluateTrainTotal, pickNewUnit, type TrainTotalConfig } from '../../src/domain/trainTotal';
import { unitCost } from '../../src/domain/unitCost';
import { productionMode } from '../../src/features/production/productionMode';
import { decodeTrainTotal, encodeTrainTotal, legacyHrefFromTotal, trainTotalHrefFrom } from '../../src/features/production/trainTotalCodec';
import {
  TRAIN_TOTAL_EMPTY,
  TRAIN_TOTAL_ESTIMATE_SCOPE,
  TRAIN_TOTAL_FULL_SCOPE,
  TRAIN_TOTAL_NONE,
  TRAIN_TOTAL_PARTIAL_SCOPE,
  trainTotalSummary,
} from '../../src/features/production/trainTotalCopy';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

const config = (fields: Partial<TrainTotalConfig> = {}): TrainTotalConfig => ({ civ: 'Franks', age: 4, ageRaw: null, techs: [], rows: [], ...fields });
const food = (value: { Food?: number } | null | undefined) => value?.Food ?? 0;

describe('#978 train-total dispatch and raw quantity links', () => {
  it('keeps legacy and compare routes, and does not treat compare keys on train-total as compare', () => {
    expect(productionMode('?civ=Huns&age=3&walk=3&farm=1&rows=38:101:1')).toEqual({ kind: 'legacy', errors: [] });
    expect(productionMode('?mode=train-compare&v=1&unit=38&age=3&n=10')).toEqual({ kind: 'compare', errors: [] });
    expect(productionMode('?mode=train-total&v=1&unit=38&n=10&civs=Franks')).toEqual({ kind: 'total', errors: [] });
    expect(productionMode('?mode=bad').kind).toBe('error');
    expect(productionMode('?mode=train-total&mode=train-total')).toMatchObject({ kind: 'error', subject: 'total' });
  });

  it('defaults a new empty scheme to Franks and imperial age, and keeps an explicit legal age', () => {
    expect(decodeTrainTotal('?mode=train-total').config).toMatchObject({ civ: 'Franks', age: 4, techs: [], rows: [] });
    expect(decodeTrainTotal('?mode=train-total&age=3').config.age).toBe(3);
    expect(decodeTrainTotal('?mode=train-total&civ=Britons').config).toMatchObject({ civ: 'Britons', age: 4 });
    const badAge = decodeTrainTotal('?mode=train-total&age=9');
    expect(badAge.config.age).toBeNull();
    expect(badAge.config.ageRaw).toBe('9');
    expect(evaluateTrainTotal(ctx, badAge.config).blocked.join('')).toContain('时代无效');
  });

  it('preserves invalid quantities as the original text and ignores legacy keys', () => {
    const decoded = decodeTrainTotal('?mode=train-total&civ=Franks&age=4&rows=83:109:3&walk=1&farm=2&units=83:0,36:abc,nope');
    expect(decoded.config.rows.map((row) => row.qty)).toEqual(['0', 'abc']);
    expect(decoded.warnings.join('\n')).toContain('rows=83:109:3');
    expect(decoded.warnings.join('\n')).toContain('没有当成训练数量');
    expect(decoded.warnings.join('\n')).toContain('nope');
    const encoded = encodeTrainTotal(decoded.config);
    expect(decodeTrainTotal('?' + encoded).config.rows).toEqual(decoded.config.rows);
    expect(encoded).not.toContain('rows=');
    expect(trainTotalHrefFrom('?civ=Britons&age=2&rows=83:109:9')).toBe('/production?mode=train-total&civ=Britons&age=2');
    expect(trainTotalHrefFrom('?mode=train-compare&v=1&unit=38&age=3&n=10')).toBe('/production?mode=train-total&civ=Franks&age=3');
    expect(legacyHrefFromTotal('?mode=train-total&civ=Britons&age=2&units=83:4')).toBe('/production?civ=Britons&age=2');
  });

  it('does not invent a unit when nothing is trainable', () => {
    expect(pickNewUnit([])).toBe(0);
    expect(pickNewUnit([83, 441])).toBe(83);
  });
});

describe('#978 training total uses unitCost and excludes research', () => {
  it('multiplies the current unit price and does not apply chemistry to the price', () => {
    const hussar = ctx.core.unitById[441];
    const gun = ctx.core.unitById[5];
    expect(hussar).toBeTruthy();
    expect(gun).toBeTruthy();
    const plain = evaluateTrainTotal(ctx, config({ civ: 'Hindustanis', rows: [{ unit: 441, qty: '3' }] }));
    const priced = unitCost({ id: 441, cost: hussar!.cost }, 'Hindustanis', priceAge(hussar!.age, 4), []);
    expect(plain.lines[0]?.status).toBe('ok');
    expect(plain.lines[0]?.cost).toEqual(priced.cost);
    expect(food(plain.lines[0]?.cost)).toBe(food(hussar!.cost));
    expect(food(plain.total)).toBe(food(priced.cost) * 3);
    const locked = evaluateTrainTotal(ctx, config({ civ: 'Hindustanis', rows: [{ unit: 5, qty: '4' }] }));
    expect(locked.lines[0]?.status).toBe('unavail');
    expect(locked.lines[0]?.unlockSelectable).toBe(true);
    expect(locked.validCount).toBe(0);
    const opened = evaluateTrainTotal(ctx, config({ civ: 'Hindustanis', techs: [47], rows: [{ unit: 5, qty: '4' }] }));
    const gunPrice = unitCost({ id: 5, cost: gun!.cost }, 'Hindustanis', priceAge(gun!.age, 4), []);
    expect(opened.lines[0]?.status).toBe('ok');
    expect(opened.lines[0]?.cost).toEqual(gunPrice.cost);
    expect(opened.incomplete).toBe(false);
  });

  it('keeps an unavailable row and an invalid selected tech instead of rewriting them', () => {
    const foreign = ctx.core.techs.find((tech) => tech.civs.length > 0 && !tech.civs.includes('Franks'));
    expect(foreign).toBeTruthy();
    const kept = evaluateTrainTotal(ctx, config({ civ: 'Franks', techs: [foreign!.id], rows: [{ unit: 441, qty: '2' }] }));
    expect(kept.lines[0]?.status).toBe('unavail');
    expect(kept.lines[0]?.unit?.id).toBe(441);
    expect(kept.techs.some((tech) => tech.id === foreign!.id && tech.selected && tech.invalidReason)).toBe(true);
    expect(kept.validCount).toBe(0);
  });

  it('applies one shared cost tech only to the units it actually prices', () => {
    const hussar = ctx.core.unitById[441]!;
    const bombard = ctx.core.unitById[36]!;
    const sim = makeSimContext(ctx.core.techs, ctx.trees);
    const choices = applicableTrainingTechs(sim, hussar, 'Gurjaras', 4);
    const tech = choices.find((item) => {
      const onHussar = unitCost({ id: hussar.id, cost: hussar.cost }, 'Gurjaras', 4, [{ id: item.tech.id, en: item.tech.en, zh: item.tech.zh }]);
      const onBombard = unitCost({ id: bombard.id, cost: bombard.cost }, 'Gurjaras', 4, [{ id: item.tech.id, en: item.tech.en, zh: item.tech.zh }]);
      return (
        item.supported &&
        onHussar.appliedTechs.some((applied) => applied.id === item.tech.id) &&
        !onBombard.appliedTechs.some((applied) => applied.id === item.tech.id)
      );
    });
    expect(tech).toBeTruthy();
    const total = evaluateTrainTotal(
      ctx,
      config({
        civ: 'Gurjaras',
        techs: [47, tech!.tech.id],
        rows: [
          { unit: 441, qty: '2' },
          { unit: 36, qty: '1' },
        ],
      }),
    );
    expect(total.lines[0]?.cost).toEqual(
      unitCost({ id: 441, cost: hussar.cost }, 'Gurjaras', 4, [{ id: tech!.tech.id, en: tech!.tech.en, zh: tech!.tech.zh }]).cost,
    );
    expect(total.lines[1]?.cost).toEqual(
      unitCost({ id: 36, cost: bombard.cost }, 'Gurjaras', 4, [{ id: tech!.tech.id, en: tech!.tech.en, zh: tech!.tech.zh }]).cost,
    );
    expect(total.lines[0]?.notes.join('\n')).toContain('已计入');
    expect(total.lines[1]?.notes.join('\n')).toContain('不作用于该单位');
    expect(food(total.total)).toBe(food(total.lines[0]?.subtotal) + food(total.lines[1]?.subtotal));
  });

  it('names partial, empty, zero-valid and estimate states without calling an estimate a full total', () => {
    expect(trainTotalSummary({ blocked: false, rowCount: 0, validCount: 0, incomplete: false })).toMatchObject({
      title: '训练总价',
      marks: [],
      empty: TRAIN_TOTAL_EMPTY,
      showCards: false,
    });
    expect(trainTotalSummary({ blocked: false, rowCount: 2, validCount: 0, incomplete: true })).toMatchObject({
      title: '训练总价',
      marks: [],
      none: TRAIN_TOTAL_NONE,
      showCards: false,
    });
    expect(trainTotalSummary({ blocked: false, rowCount: 3, validCount: 3, incomplete: false }).scopes).toEqual([TRAIN_TOTAL_FULL_SCOPE]);
    const partial = trainTotalSummary({ blocked: false, rowCount: 3, validCount: 1, incomplete: true });
    expect(partial.title).toBe('已计入行小计');
    expect(partial.marks).toEqual(['部分训练费用', '估算，未完整计入']);
    expect(partial.count).toBe('已计入 1 / 3 行');
    expect(partial.scopes).toEqual([TRAIN_TOTAL_PARTIAL_SCOPE, TRAIN_TOTAL_ESTIMATE_SCOPE]);
  });
});
