import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { TEAM_BONUSES } from '../../src/domain/effects';
import type { MixedSideInput } from '../../src/domain/mixedDuelParams';
import { makeSimContext } from '../../src/domain/simulator';
import { evaluateTrainTotal, type TrainTotalConfig } from '../../src/domain/trainTotal';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { decodeTrainTotal } from '../../src/features/production/trainTotalCodec';
import { trees } from './helpers';

const context = { core: CORE, trees };
const simulation = makeSimContext(CORE.techs, trees);
const a: MixedSideInput = {
  civ: 'Gurjaras',
  age: '4',
  techs: ['835', '67'],
  team: [],
  rows: [
    { uid: '330', qty: '12' },
    { uid: '1743', qty: '8' },
  ],
};
const b: MixedSideInput = {
  civ: 'Franks',
  age: '3',
  techs: [],
  team: [],
  rows: [
    { uid: '38', qty: '10' },
    { uid: '281', qty: '6' },
  ],
};
function transfer(input: MixedSideInput, side: 'a' | 'b' = 'a') {
  return mixedTrainingTransfer(context, input, side, resolveMixedSide(simulation, CORE, input, side));
}

describe('#1194 mixed duel training transfer', () => {
  const fixtures: { side: 'a' | 'b'; source: MixedSideInput; manual: TrainTotalConfig; total: object; prices: object[] }[] = [
    {
      side: 'a',
      source: a,
      manual: {
        civ: 'Gurjaras',
        age: 4,
        ageRaw: null,
        techs: [835],
        rows: [
          { unit: 330, qty: '12' },
          { unit: 1743, qty: '8' },
        ],
      },
      total: { Food: 884, Gold: 960 },
      prices: [
        { Food: 41, Gold: 60 },
        { Food: 49, Gold: 30 },
      ],
    },
    {
      side: 'b',
      source: b,
      manual: {
        civ: 'Franks',
        age: 3,
        ageRaw: null,
        techs: [],
        rows: [
          { unit: 38, qty: '10' },
          { unit: 281, qty: '6' },
        ],
      },
      total: { Food: 930, Gold: 900 },
      prices: [
        { Food: 60, Gold: 75 },
        { Food: 55, Gold: 25 },
      ],
    },
  ];
  it.each(fixtures)('preserves $side context, exact rows and prices in the durable target', ({ side, source, manual, total, prices }) => {
    const plan = transfer(source, side);
    expect(plan).toHaveProperty('to');
    if (!('to' in plan)) throw new Error(JSON.stringify(plan.errors));
    const { config, warnings } = decodeTrainTotal(new URL(plan.to, 'https://example.test').search);
    expect(warnings).toEqual([]);
    expect(config).toEqual(manual);
    const result = evaluateTrainTotal(context, config);
    expect(result).toEqual(evaluateTrainTotal(context, manual));
    expect(result.lines.map((line) => line.cost)).toEqual(prices);
    expect(result.total).toEqual(total);
    expect(plan.notice.side).toBe(side);
    expect(plan.notice.count).toBe(2);
    if (side === 'a') {
      expect(plan.notice.pricing).toEqual(['刹帝利']);
      expect(plan.notice.omitted).toEqual(['锻造（仅影响战斗）']);
    }
  });

  it('fails the invalid side with the exact quantity field and leaves the other side valid', () => {
    const damaged = { ...a, rows: [a.rows[0]!, { ...a.rows[1]!, qty: '0' }] };
    expect(transfer(damaged)).toMatchObject({ errors: [{ field: 'mix-a-qty-1' }] });
    expect(transfer(b, 'b')).toHaveProperty('to');
  });

  it('fails closed on a real unimplemented resource modifier and names the technology', () => {
    const mapuche = {
      civ: 'Mapuche',
      age: '4',
      team: [],
      techs: ['1380'],
      rows: [
        { uid: '2569', qty: '2' },
        { uid: '93', qty: '1' },
      ],
    };
    expect(resolveMixedSide(simulation, CORE, mapuche, 'a').errors).toEqual([]);
    expect(transfer(mapuche)).toMatchObject({ errors: [{ field: 'mix-a-techs', message: expect.stringContaining('布图马普') }] });
  });

  it('requires an explicitly selected unlock when the fixed gunpowder form depends on it', () => {
    const source = {
      ...a,
      civ: 'Hindustanis',
      techs: [],
      rows: [
        { uid: '5', qty: '12' },
        { uid: '24', qty: '2' },
      ],
    };
    expect(transfer(source)).toMatchObject({ errors: [{ field: 'mix-a-unit-0', message: expect.stringContaining('化学') }] });
    const opened = transfer({ ...source, techs: ['47'] });
    expect(opened).toMatchObject({ notice: { unlocks: ['化学'], pricing: [] } });
    expect(opened).toHaveProperty('to', expect.stringContaining('techs=47'));
  });

  it('blocks a selected team bonus with fixed-data cost effects outside the target model', () => {
    const sicilians = TEAM_BONUSES.findIndex(([civ]) => civ === 'Sicilians');
    expect(sicilians).toBeGreaterThanOrEqual(0);
    expect(transfer({ ...b, team: [String(sicilians)] }, 'b')).toMatchObject({
      errors: [{ field: 'mix-b-team', message: expect.stringContaining('西西里') }],
    });
  });
});
