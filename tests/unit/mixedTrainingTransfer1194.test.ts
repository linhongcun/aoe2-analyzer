import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { CORE } from '../../src/data/core';
import { militaryTechAge } from '../../src/domain/availabilityAge';
import { TEAM_BONUSES } from '../../src/domain/effects';
import type { MixedSideInput } from '../../src/domain/mixedDuelParams';
import { makeSimContext } from '../../src/domain/simulator';
import { evaluateTrainTotal, type TrainTotalConfig } from '../../src/domain/trainTotal';
import type { Trees } from '../../src/domain/types';
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

  it('auto-adds an available non-free unlock when omitted and stays idempotent when already selected', () => {
    const source = {
      ...a,
      civ: 'Hindustanis',
      techs: [],
      rows: [
        { uid: '5', qty: '12' },
        { uid: '24', qty: '2' },
      ],
    };
    const auto = transfer(source);
    expect(auto).toMatchObject({ notice: { unlocks: ['化学'], pricing: [] } });
    expect(auto).toHaveProperty('to', expect.stringContaining('techs=47'));
    if (!('to' in auto)) throw new Error(JSON.stringify(auto.errors));
    const decoded = decodeTrainTotal(new URL(auto.to, 'https://example.test').search);
    expect(decoded.warnings).toEqual([]);
    expect(decoded.config.techs).toEqual([47]);
    const evaluated = evaluateTrainTotal(context, decoded.config);
    expect(evaluated.lines.every((line) => line.status === 'ok')).toBe(true);
    expect(evaluated).toEqual(
      evaluateTrainTotal(context, {
        civ: 'Hindustanis',
        age: 4,
        ageRaw: null,
        techs: [47],
        rows: [
          { unit: 5, qty: '12' },
          { unit: 24, qty: '2' },
        ],
      }),
    );

    const explicit = transfer({ ...source, techs: ['47'] });
    expect(explicit).toMatchObject({ to: auto.to, notice: { unlocks: ['化学'], pricing: [] } });
  });

  it('blocks a selected team bonus with fixed-data cost effects outside the target model', () => {
    const sicilians = TEAM_BONUSES.findIndex(([civ]) => civ === 'Sicilians');
    expect(sicilians).toBeGreaterThanOrEqual(0);
    expect(transfer({ ...b, team: [String(sicilians)] }, 'b')).toMatchObject({
      errors: [{ field: 'mix-b-team', message: expect.stringContaining('西西里') }],
    });
  });
});

function buildPreset(civ: string, age: number, rows: MixedSideInput['rows'], mode: 'full' | 'current' | 'none'): MixedSideInput {
  const targetAge = mode === 'full' ? 4 : age;
  const base: MixedSideInput = { civ, age: String(targetAge), techs: [], team: [], rows };
  if (mode === 'none') return base;
  const view = resolveMixedSide(simulation, CORE, base, 'a');
  const selected = view.techs
    .filter((option) => (option.numeric || (option.cost && !option.partial)) && militaryTechAge(civ, option.t.id, option.t.age) <= targetAge)
    .map((option) => String(option.t.id));
  return { ...base, techs: selected };
}

function expectTransferMatchesManual(input: MixedSideInput, expectedUnlockIds: readonly number[], expectedUnlockNames: readonly string[]) {
  const plan = transfer(input);
  expect(plan).toHaveProperty('to');
  if (!('to' in plan)) throw new Error(JSON.stringify(plan.errors));
  expect(plan.notice.unlocks).toEqual(expectedUnlockNames);
  const decoded = decodeTrainTotal(new URL(plan.to, 'https://example.test').search);
  expect(decoded.warnings).toEqual([]);
  for (const id of expectedUnlockIds) expect(decoded.config.techs).toContain(id);
  const transferred = evaluateTrainTotal(context, decoded.config);
  const manual = evaluateTrainTotal(context, {
    civ: input.civ,
    age: Number(input.age),
    ageRaw: null,
    techs: decoded.config.techs,
    rows: input.rows.map((row) => ({ unit: Number(row.uid), qty: row.qty })),
  });
  expect(transferred.blocked).toEqual([]);
  expect(transferred.incomplete).toBe(false);
  expect(transferred.validCount).toBe(input.rows.length);
  expect(transferred.lines.every((line) => line.status === 'ok')).toBe(true);
  expect(transferred).toEqual(manual);
  return { plan, decoded, transferred };
}

describe('#1468 混编 PK 自动补齐可用非免费训练解锁前置', () => {
  it('验收 1：原报两份印度斯坦存量分享链接（不含 47）与三档预设均可直接带入且与手填化学同价', () => {
    const stockInputs: MixedSideInput[] = [
      {
        civ: 'Hindustanis',
        age: '4',
        techs: ['67', '81', '211', '435', '39', '68', '82', '212', '75', '80', '219', '377', '507'],
        team: [],
        rows: [
          { uid: '1746', qty: '6' },
          { uid: '5', qty: '28' },
        ],
      },
      {
        civ: 'Hindustanis',
        age: '4',
        techs: ['67', '81', '211', '435', '39', '68', '82', '212', '75', '80', '219', '507'],
        team: [],
        rows: [
          { uid: '441', qty: '25' },
          { uid: '5', qty: '21' },
        ],
      },
    ];

    for (const stock of stockInputs) {
      const stockRes = expectTransferMatchesManual(stock, [47], ['化学']);
      const manualWithChem = evaluateTrainTotal(context, {
        civ: stock.civ,
        age: 4,
        ageRaw: null,
        techs: [47],
        rows: stock.rows.map((row) => ({ unit: Number(row.uid), qty: row.qty })),
      });
      expect(stockRes.transferred.total).toEqual(manualWithChem.total);

      for (const mode of ['full', 'current', 'none'] as const) {
        const preset = buildPreset(stock.civ, 4, stock.rows, mode);
        expect(preset.techs).not.toContain('47');
        const presetRes = expectTransferMatchesManual(preset, [47], ['化学']);
        expect(presetRes.transferred.total).toEqual(manualWithChem.total);
      }
    }
  });

  it('验收 2：波希米亚城堡提前化学自动补齐 47；土耳其免费化学不写入 techs=47 且 unlocks 为空', () => {
    const bohemianRows = [
      { uid: '358', qty: '10' },
      { uid: '5', qty: '10' },
    ];
    for (const mode of ['current', 'none'] as const) {
      const input = buildPreset('Bohemians', 3, bohemianRows, mode);
      expect(input.techs).not.toContain('47');
      expectTransferMatchesManual(input, [47], ['化学']);
    }

    const turkRows = [
      { uid: '441', qty: '10' },
      { uid: '5', qty: '10' },
    ];
    for (const mode of ['full', 'none'] as const) {
      const input = buildPreset('Turks', 4, turkRows, mode);
      const { decoded } = expectTransferMatchesManual(input, [], []);
      expect(decoded.config.techs).not.toContain(47);
    }

    const turkWithArcher = expectTransferMatchesManual(
      {
        civ: 'Turks',
        age: '4',
        techs: ['47'],
        team: [],
        rows: [
          { uid: '5', qty: '5' },
          { uid: '24', qty: '5' },
        ],
      },
      [],
      [],
    );
    expect(turkWithArcher.decoded.config.techs).not.toContain(47);
    expect(turkWithArcher.plan.notice.omitted).toContain('化学（仅影响战斗）');
  });

  it('验收 3：哥特 759/761（无政府 16）与匈奴 886/887（掠夺者 483）在满科技与无科技下自动补齐且手选幂等', () => {
    const unlockFixtures = [
      { civ: 'Goths', age: 3, uid: '759', techId: 16, techZh: '无政府' },
      { civ: 'Goths', age: 4, uid: '759', techId: 16, techZh: '无政府' },
      { civ: 'Goths', age: 4, uid: '761', techId: 16, techZh: '无政府' },
      { civ: 'Huns', age: 3, uid: '886', techId: 483, techZh: '掠夺者' },
      { civ: 'Huns', age: 4, uid: '886', techId: 483, techZh: '掠夺者' },
      { civ: 'Huns', age: 4, uid: '887', techId: 483, techZh: '掠夺者' },
    ] as const;

    for (const item of unlockFixtures) {
      const rows = [{ uid: item.uid, qty: '8' }];
      const modes = item.age === 4 ? (['full', 'none'] as const) : (['current', 'none'] as const);
      for (const mode of modes) {
        const input = buildPreset(item.civ, item.age, rows, mode);
        expectTransferMatchesManual(input, [item.techId], [item.techZh]);
      }

      const manual = expectTransferMatchesManual(
        { civ: item.civ, age: String(item.age), techs: [String(item.techId)], team: [], rows },
        [item.techId],
        [item.techZh],
      );
      expect(manual.decoded.config.techs.filter((id) => id === item.techId)).toHaveLength(1);
    }

    // 城堡原生近卫军（41）与城堡答刺罕（755）无需无政府/掠夺者
    const castleHuskarl = expectTransferMatchesManual({ civ: 'Goths', age: '3', techs: [], team: [], rows: [{ uid: '41', qty: '6' }] }, [], []);
    expect(castleHuskarl.decoded.config.techs).not.toContain(16);
    const castleTarkan = expectTransferMatchesManual({ civ: 'Huns', age: '3', techs: [], team: [], rows: [{ uid: '755', qty: '6' }] }, [], []);
    expect(castleTarkan.decoded.config.techs).not.toContain(483);

    // 同侧多解锁前置（哥特 5 火枪 + 759 兵营近卫军）同时补齐 16 与 47
    const dual = expectTransferMatchesManual(
      {
        civ: 'Goths',
        age: '4',
        techs: [],
        team: [],
        rows: [
          { uid: '5', qty: '10' },
          { uid: '759', qty: '10' },
        ],
      },
      [16, 47],
      ['无政府', '化学'],
    );
    expect(dual.decoded.config.techs).toEqual([16, 47]);
  });

  it('验收 4：全站 56 文明 × [5, 36, 420, 691] 合法火药组合在满科技与无科技下零拦截且总价一致', () => {
    expect(civs).toHaveLength(56);
    const gunpowderIds = [5, 36, 420, 691] as const;
    const gunpowderCivs = new Set<string>();
    let checked = 0;

    for (const civ of civs) {
      for (const age of [3, 4] as const) {
        for (const uid of gunpowderIds) {
          const rows = [{ uid: String(uid), qty: '5' }];
          const noneInput: MixedSideInput = { civ: civ.en, age: String(age), techs: [], team: [], rows };
          const noneView = resolveMixedSide(simulation, CORE, noneInput, 'a');
          if (!noneView.army) continue;
          gunpowderCivs.add(civ.en);

          const expectedIds = civ.en === 'Turks' ? [] : [47];
          const expectedNames = civ.en === 'Turks' ? [] : ['化学'];
          const nonePlan = mixedTrainingTransfer(context, noneInput, 'a', noneView);
          expect(nonePlan, `${civ.en}:${age}:${uid}:none`).toHaveProperty('to');
          if (!('to' in nonePlan)) throw new Error(JSON.stringify(nonePlan.errors));
          expect(nonePlan.notice.unlocks).toEqual(expectedNames);
          const noneDecoded = decodeTrainTotal(new URL(nonePlan.to, 'https://example.test').search);
          expect(noneDecoded.warnings).toEqual([]);
          expect(noneDecoded.config).toEqual({
            civ: civ.en,
            age,
            ageRaw: null,
            techs: expectedIds,
            rows: [{ unit: uid, qty: '5' }],
          });
          const noneResult = evaluateTrainTotal(context, noneDecoded.config);
          expect(noneResult.blocked).toEqual([]);
          expect(noneResult.incomplete).toBe(false);
          expect(noneResult.validCount).toBe(1);
          expect(noneResult.lines[0]?.status).toBe('ok');
          checked++;

          const fullTechs = noneView.techs
            .filter((option) => (option.numeric || (option.cost && !option.partial)) && militaryTechAge(civ.en, option.t.id, option.t.age) <= age)
            .map((option) => String(option.t.id));
          const fullInput: MixedSideInput = { ...noneInput, techs: fullTechs };
          const fullView = resolveMixedSide(simulation, CORE, fullInput, 'a');
          const fullPlan = mixedTrainingTransfer(context, fullInput, 'a', fullView);
          expect(fullPlan, `${civ.en}:${age}:${uid}:full`).toHaveProperty('to');
          if (!('to' in fullPlan)) throw new Error(JSON.stringify(fullPlan.errors));
          expect(fullPlan.notice.unlocks).toEqual(expectedNames);
          const fullDecoded = decodeTrainTotal(new URL(fullPlan.to, 'https://example.test').search);
          expect(fullDecoded.warnings).toEqual([]);
          if (civ.en === 'Turks') expect(fullDecoded.config.techs).not.toContain(47);
          else expect(fullDecoded.config.techs).toContain(47);
          if (fullDecoded.config.techs.join(',') !== noneDecoded.config.techs.join(',')) {
            const fullResult = evaluateTrainTotal(context, fullDecoded.config);
            expect(fullResult.blocked).toEqual([]);
            expect(fullResult.incomplete).toBe(false);
            expect(fullResult.validCount).toBe(1);
            expect(fullResult.lines[0]?.status).toBe('ok');
          }
          checked++;
        }
      }
    }

    expect(gunpowderCivs.size).toBe(38);
    expect(gunpowderCivs.has('Turks')).toBe(true);
    expect(gunpowderCivs.size - 1).toBe(37);
    expect(checked).toBeGreaterThan(0);
  });

  it('验收 5：所需解锁科技在当前文明/时代不可用时维持 fail-closed 拦截', () => {
    // 场景 A：文明科技树未点亮 47 化学
    const disabledChemTrees: Trees = {
      ...trees,
      t: {
        ...trees.t,
        Hindustanis: trees.t.Hindustanis!.map((block) => [
          block[0],
          block[1],
          block[2],
          block[3].map((cell) => (cell[2] === 't' && cell[3] === 47 ? [cell[0], cell[1], cell[2], cell[3], 0, cell[5]] : cell)),
        ]),
      },
    };
    const disabledContext = { core: CORE, trees: disabledChemTrees };
    const disabledSim = makeSimContext(CORE.techs, disabledChemTrees);
    const input: MixedSideInput = {
      civ: 'Hindustanis',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '5', qty: '10' }],
    };
    const view = resolveMixedSide(disabledSim, CORE, input, 'a');
    expect(view.errors).toEqual([]);
    expect(view.army).not.toBeNull();
    expect(mixedTrainingTransfer(disabledContext, input, 'a', view)).toMatchObject({
      errors: [{ field: 'mix-a-unit-0', message: expect.stringContaining('当前条件下不可训练') }],
    });

    // 场景 B：当前时代低于解锁科技时代（印度斯坦城堡时代无化学）
    const imperialView = resolveMixedSide(simulation, CORE, input, 'a');
    expect(imperialView.army).not.toBeNull();
    expect(mixedTrainingTransfer(context, { ...input, age: '3' }, 'a', imperialView)).toMatchObject({
      errors: [{ field: 'mix-a-unit-0', message: expect.stringContaining('化学') }],
    });
  });
});
