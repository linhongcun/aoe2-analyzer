import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { civs, loadTrees } from '../../src/data';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { CORE } from '../../src/data/core';
import {
  armyResearchChoices,
  emptyArmyCost as makeArmyCost,
  evaluateArmyCost,
  hasDecimalCost,
  researchPrice,
  researchResolver,
  type ResearchEntry,
} from '../../src/domain/armyCost';
import { AGE_TECH_IDS } from '../../src/domain/gameIds';
import { evalConditionNode } from '../../src/domain/armyResearchRules';
import { productionUnits, PRODUCTION_UNLOCK_TECH_IDS } from '../../src/domain/production';
import { ArmyLedger } from '../../src/features/production/ArmyLedger';

const ctx = { core: CORE, trees: await loadTrees() };

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, '');
}

describe('#1409 Chinese res:85 global research discount, unreachable count>requires nodes, and age tech noise filter', () => {
  it('AC1: applies Chinese res:85 as age SET override (1.0/0.95/0.90/0.85), preserves 2 decimals, and excludes age techs', () => {
    // 1. Fletching (base 100F + 50G) across all 4 ages: SET override, not stacked multiplication
    const byAge = [
      { age: 1, cost: { Food: 100, Gold: 50 }, active: 304, superseded: [], label: '中国文明加成（黑暗时代）t:304' },
      { age: 2, cost: { Food: 95, Gold: 47.5 }, active: 350, superseded: [304], label: '中国文明加成（封建时代）t:350' },
      { age: 3, cost: { Food: 90, Gold: 45 }, active: 351, superseded: [304, 350], label: '中国文明加成（城堡时代）t:351' },
      { age: 4, cost: { Food: 85, Gold: 42.5 }, active: 352, superseded: [304, 350, 351], label: '中国文明加成（帝王时代）t:352' },
    ] as const;
    for (const tc of byAge) {
      const p = researchPrice(ARMY_RESEARCH, 'Chinese', tc.age, 199, new Set());
      expect(p.cost, `age ${tc.age}`).toEqual(tc.cost);
      expect(p.reason, `age ${tc.age}`).toBe('');
      expect(p.sources, `age ${tc.age}`).toEqual([tc.label]);
      const applied = p.modifiers.filter((m) => m.applied);
      const superseded = p.modifiers.filter((m) => m.superseded);
      expect(
        applied.map((m) => m.nodeId),
        `age ${tc.age} applied`,
      ).toEqual([tc.active]);
      expect(
        superseded.map((m) => m.nodeId),
        `age ${tc.age} superseded`,
      ).toEqual(tc.superseded);
    }

    // 2. Age techs 101/102/103 are NEVER affected by res:85 and never include res:85 modifiers
    for (const [ageTid, expectedCost] of [
      [101, { Food: 500 }],
      [102, { Food: 800, Gold: 200 }],
      [103, { Food: 1000, Gold: 800 }],
    ] as const) {
      const p = researchPrice(ARMY_RESEARCH, 'Chinese', 4, ageTid, new Set());
      expect(p.cost, `t:${ageTid}`).toEqual(expectedCost);
      expect(
        p.modifiers.some((m) => m.command.A === 85),
        `t:${ageTid} res:85 modifier`,
      ).toBe(false);
    }

    // 3. UX Fig 1: Chinese Imperial Elite Chu Ko Nu x10 + Light Cav x10, done Forging (67), target Fletching (199)
    const fig1 = evaluateArmyCost(ctx, {
      ...makeArmyCost('Chinese', '4'),
      rows: [
        { unit: 559, qty: '10' },
        { unit: 546, qty: '10' },
      ],
      done: ['t:67'],
      targets: ['t:199'],
    });
    expect(fig1.partial).toBe(false);
    expect(fig1.total).toEqual({ Food: 2117.5, Wood: 400, Gold: 1540, Stone: 0 });
    expect(fig1.researchTotal).toEqual({ Food: 1317.5, Wood: 0, Gold: 1190, Stone: 0 });
    expect(fig1.ledger.find((e) => e.id === 67)?.quote?.cost).toEqual({ Food: 127.5 });
    expect(fig1.ledger.find((e) => e.id === 199)?.cost).toEqual({ Food: 85, Gold: 42.5 });
    expect(fig1.ledger.find((e) => e.id === 254)?.cost).toEqual({ Food: 127.5, Gold: 42.5 });
    expect(fig1.ledger.find((e) => e.id === 362)?.cost).toEqual({ Food: 1105, Gold: 1105 });
    expect(hasDecimalCost(fig1.ledger.find((e) => e.id === 362)?.cost)).toBe(false);
    expect(
      fig1.ledger
        .filter((e) => e.status === 'planned' && hasDecimalCost(e.cost))
        .map((e) => e.id)
        .sort((a, b) => a! - b!),
    ).toEqual([199, 254]);

    // 4. UX Fig 3: Chinese Castle Crossbowman x15 + Pikeman x10, target Fletching (199)
    const fig3 = evaluateArmyCost(ctx, {
      ...makeArmyCost('Chinese', '3'),
      rows: [
        { unit: 24, qty: '15' },
        { unit: 358, qty: '10' },
      ],
      targets: ['t:199'],
    });
    expect(fig3.partial).toBe(false);
    expect(fig3.ledger.find((e) => e.id === 199)?.cost).toEqual({ Food: 90, Gold: 45 });
    expect(fig3.ledger.find((e) => e.id === 197)?.cost).toEqual({ Food: 144, Gold: 81 });
    expect(fig3.ledger.find((e) => e.id === 100)?.cost).toEqual({ Food: 157.5, Gold: 90 });
    expect(fig3.ledger.filter((e) => e.status === 'planned' && hasDecimalCost(e.cost)).map((e) => e.id)).toEqual([100]);

    // 5. UX Fig 6: Chinese Imperial Dragon Ship x5
    const fig6 = evaluateArmyCost(ctx, { ...makeArmyCost('Chinese', '4'), rows: [{ unit: 1302, qty: '5' }] });
    expect(fig6.partial).toBe(false);
    expect(fig6.trainingTotal).toEqual({ Food: 0, Wood: 375, Gold: 225, Stone: 0 });
    expect(fig6.researchTotal).toEqual({ Food: 0, Wood: 467.5, Gold: 352.75, Stone: 0 });
    expect(fig6.ledger.find((e) => e.id === 34)?.cost).toEqual({ Wood: 127.5, Gold: 85 });
    expect(fig6.ledger.find((e) => e.id === 35)?.cost).toEqual({ Wood: 340, Gold: 267.75 });
    expect(fig6.ledger.find((e) => e.id === 1010)?.status).toBe('free');

    // 6. Full Chinese Imperial research sweep: every scoped choice quotes cleanly (0 invalid)
    const chUnits = productionUnits(ctx, { civ: 'Chinese', age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
    const chChoices = armyResearchChoices(ctx, { ...makeArmyCost('Chinese', '4'), rows: chUnits.map((u) => ({ unit: u.id, qty: '1' })) }, false);
    expect(chChoices.length).toBeGreaterThan(40);
    for (const tid of chChoices) {
      const p = researchPrice(ARMY_RESEARCH, 'Chinese', 4, tid, new Set());
      expect(p.cost, `Chinese t:${tid}: ${p.reason}`).not.toBe(null);
    }

    // 7. Fail-closed negative cases & commutativity checks on synthetic fixtures
    const badMul = structuredClone(ARMY_RESEARCH);
    badMul.nodes[352]!.mods = [{ Type: 6, A: 85, B: 0, C: -1, D: 0.85 }];
    expect(researchPrice(badMul, 'Chinese', 4, 199, new Set()).cost).toBe(null);

    const badAdd = structuredClone(ARMY_RESEARCH);
    badAdd.nodes[352]!.mods = [{ Type: 1, A: 85, B: 1, C: -1, D: -0.15 }];
    expect(researchPrice(badAdd, 'Chinese', 4, 199, new Set()).cost).toBe(null);

    const dupAge = structuredClone(ARMY_RESEARCH);
    dupAge.nodes[351]!.requires = [103];
    expect(researchPrice(dupAge, 'Chinese', 4, 199, new Set()).cost).toBe(null);

    // Single res:85 node with unknown (non-age) trigger must fail closed
    const unknownAgeSingle = structuredClone(ARMY_RESEARCH);
    unknownAgeSingle.nodes[304]!.requires = [67];
    unknownAgeSingle.nodes[304]!.count = 1;
    expect(researchPrice(unknownAgeSingle, 'Chinese', 1, 199, new Set([67]))).toMatchObject({
      cost: null,
      reason: '本文明全局研究费用倍率尚未核实',
    });

    const nonCommutative = structuredClone(ARMY_RESEARCH);
    nonCommutative.civs.Chinese!.mods.push({ Type: 101, A: 199, B: 0, C: 1, D: 20 });
    expect(researchPrice(nonCommutative, 'Chinese', 4, 199, new Set())).toMatchObject({ cost: null, reason: '多项研究修正的生效顺序尚未核实' });

    // Same node emitting both res:85 and non-commutative Type=101 (+20) must still fail closed
    const sameNodeConflict = structuredClone(ARMY_RESEARCH);
    sameNodeConflict.nodes[352]!.mods.push({ Type: 101, A: 199, B: 0, C: 1, D: 20 });
    expect(researchPrice(sameNodeConflict, 'Chinese', 4, 199, new Set())).toMatchObject({ cost: null, reason: '多项研究修正的生效顺序尚未核实' });

    // Same group emitting +20 then x0.5 must NOT erase the earlier +20 from commutativity history before res:85
    const addThenMulConflict = structuredClone(ARMY_RESEARCH);
    addThenMulConflict.civs.Chinese!.mods.push({ Type: 101, A: 199, B: 0, C: 1, D: 20 }, { Type: 101, A: 199, B: 0, C: 2, D: 0.5 });
    expect(researchPrice(addThenMulConflict, 'Chinese', 4, 199, new Set())).toMatchObject({ cost: null, reason: '多项研究修正的生效顺序尚未核实' });

    const commutativeMul = structuredClone(ARMY_RESEARCH);
    commutativeMul.civs.Chinese!.mods.push({ Type: 101, A: 199, B: 0, C: 2, D: 0.5 });
    expect(researchPrice(commutativeMul, 'Chinese', 4, 199, new Set()).cost).toEqual({ Food: 42.5, Gold: 42.5 });

    const commutativeFree = structuredClone(ARMY_RESEARCH);
    commutativeFree.civs.Chinese!.mods.push({ Type: 101, A: 199, B: -1, C: 0, D: 0 });
    expect(researchPrice(commutativeFree, 'Chinese', 4, 199, new Set()).cost).toEqual({ Food: 0, Wood: 0, Gold: 0, Stone: 0 });
  });

  it('AC2: ArmyLedger renders exact UX copy for res:85 without float32 residue or mislabeled Food+Add', () => {
    const renderEntry = (civ: string, age: string, entry: ResearchEntry, ledger: ResearchEntry[]) =>
      renderToStaticMarkup(
        createElement(ArmyLedger, {
          entry,
          entries: ledger,
          config: { ...makeArmyCost(civ, age), rows: [] },
          onRemove: () => {},
        }),
      );

    // Imperial Chinese Fletching: exact verbatim active + superseded lines
    const imp = evaluateArmyCost(ctx, { ...makeArmyCost('Chinese', '4'), rows: [{ unit: 559, qty: '10' }], targets: ['t:199'] });
    const impHtml = renderEntry(
      'Chinese',
      '4',
      imp.ledger.find((e) => e.id === 199)!,
      imp.ledger,
    );
    const impText = stripHtml(impHtml);
    expect(impText).toContain(
      '中国文明加成（帝王时代）t:352：研究费用倍率设为 0.85（升时代除外）。已计入；生效依据：自动条件：前置 t:103，需满足 1 项。类型 1，资源 85。',
    );
    expect(impText).toContain('较早时代的同类倍率 t:304（1）、t:350（0.95）、t:351（0.9）已被本时代倍率覆盖，不叠乘。');
    expect(impText).not.toContain('食物加上');
    expect(impText).not.toContain('0.8500000238418579');
    expect(impText).not.toContain('0.899999976');
    expect(impText).not.toContain('操作 -1');
    expect(impHtml).toContain('<span class="nw"><span class="num">t:304</span>（<span class="num">1</span>）</span>');
    expect(impHtml).toContain('<span class="nw">资源 <span class="num">85</span></span>');

    // Castle Chinese Crossbowman: t:351 active, only t:304 & t:350 superseded (no t:352)
    const cas = evaluateArmyCost(ctx, { ...makeArmyCost('Chinese', '3'), rows: [{ unit: 24, qty: '15' }] });
    const casText = stripHtml(
      renderEntry(
        'Chinese',
        '3',
        cas.ledger.find((e) => e.id === 100)!,
        cas.ledger,
      ),
    );
    expect(casText).toContain(
      '中国文明加成（城堡时代）t:351：研究费用倍率设为 0.9（升时代除外）。已计入；生效依据：自动条件：前置 t:102，需满足 1 项。类型 1，资源 85。',
    );
    expect(casText).toContain('较早时代的同类倍率 t:304（1）、t:350（0.95）已被本时代倍率覆盖，不叠乘。');
    expect(casText).not.toContain('t:352');

    // Feudal Chinese Fletching: single superseded item t:304
    const feu = evaluateArmyCost(ctx, { ...makeArmyCost('Chinese', '2'), rows: [{ unit: 4, qty: '1' }], targets: ['t:199'] });
    const feuText = stripHtml(
      renderEntry(
        'Chinese',
        '2',
        feu.ledger.find((e) => e.id === 199)!,
        feu.ledger,
      ),
    );
    expect(feuText).toContain('较早时代的同类倍率 t:304（1）已被本时代倍率覆盖，不叠乘。');

    // Dark Chinese: no superseded line at all
    const darkQuote = researchPrice(ARMY_RESEARCH, 'Chinese', 1, 199, new Set());
    const darkEntry: ResearchEntry = {
      key: 't:199',
      id: 199,
      name: '箭羽',
      reason: '本次手动目标',
      beneficiaries: [],
      status: 'planned',
      manual: true,
      cost: darkQuote.cost,
      sources: darkQuote.sources,
      origins: [{ kind: 'target', key: 't:199' }],
      quote: darkQuote,
    };
    const darkText = stripHtml(renderEntry('Chinese', '1', darkEntry, [darkEntry]));
    expect(darkText).toContain('中国文明加成（黑暗时代）t:304：研究费用倍率设为 1（升时代除外）。已计入');
    expect(darkText).not.toContain('较早时代的同类倍率');

    // Synthetic unapplied Type=6 & Type=1 B=1 still format cleanly
    const synthData = structuredClone(ARMY_RESEARCH);
    synthData.nodes[352]!.name = '自定义倍率';
    synthData.nodes[352]!.mods = [{ Type: 6, A: 85, B: 0, C: -1, D: 0.85 }];
    const mulQuote = researchPrice(synthData, 'Chinese', 4, 199, new Set());
    const mulText = stripHtml(renderEntry('Chinese', '4', { ...darkEntry, status: 'invalid', cost: null, quote: mulQuote }, []));
    expect(mulText).toContain('自定义倍率 t:352：研究费用倍率乘以 0.85（升时代除外）。未计入');
    expect(mulText).toContain('类型 6，资源 85。');

    synthData.nodes[352]!.mods = [{ Type: 1, A: 85, B: 1, C: -1, D: -0.15 }];
    const addQuote = researchPrice(synthData, 'Chinese', 4, 199, new Set());
    const addText = stripHtml(renderEntry('Chinese', '4', { ...darkEntry, status: 'invalid', cost: null, quote: addQuote }, []));
    expect(addText).toContain('自定义倍率 t:352：研究费用倍率加上 -0.15（升时代除外）。未计入');
  });

  it('AC3: restores all 94 Fire Ship / Fast Fire Ship / Dragon Ship combinations and clears all 12 count>requires nodes', () => {
    const navalUnits = [529, 532, 1302] as const;
    let navalCount = 0;
    const failures: string[] = [];
    for (const c of civs) {
      const units = productionUnits(ctx, { civ: c.en, age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
      for (const uid of navalUnits) {
        if (!units.some((u) => u.id === uid)) continue;
        navalCount += 1;
        const r = evaluateArmyCost(ctx, { ...makeArmyCost(c.en, '4'), rows: [{ unit: uid, qty: '1' }] });
        if (r.training.lines[0]?.status !== 'ok' || r.partial) {
          failures.push(`${c.en}:${uid}:status=${r.training.lines[0]?.status}(${r.training.lines[0]?.reason}):partial=${r.partial}`);
        }
      }
    }
    expect(navalCount).toBe(94);
    expect(failures).toEqual([]);

    // UX Fig 5: Byzantines Fire Ship x5 + Fast Fire Ship x5
    const byz = evaluateArmyCost(ctx, {
      ...makeArmyCost('Byzantines', '4'),
      rows: [
        { unit: 529, qty: '5' },
        { unit: 532, qty: '5' },
      ],
    });
    expect(byz.partial).toBe(false);
    expect(byz.trainingTotal).toEqual({ Food: 0, Wood: 750, Gold: 450, Stone: 0 });
    expect(byz.researchTotal).toEqual({ Food: 0, Wood: 550, Gold: 415, Stone: 0 });
    expect(byz.total).toEqual({ Food: 0, Wood: 1300, Gold: 865, Stone: 0 });
    expect(byz.ledger.find((e) => e.id === 246)?.status).toBe('free');

    // All 12 count>requires nodes: 3 dead nodes stripped & runtime-guarded, 9 BuildTech nodes clean without error
    for (const tid of [243, 490, 598]) {
      const node = ARMY_RESEARCH.nodes[tid]!;
      expect(node.enables, `t:${tid}`).toEqual([]);
      expect(node.upgrades, `t:${tid}`).toEqual([]);
      expect(node.mods, `t:${tid}`).toEqual([]);
      expect(researchResolver(ARMY_RESEARCH, 'Byzantines', 4).resolve(tid).state, `t:${tid}`).toBe('unavailable');
      const civName = tid === 490 ? 'Saracens' : tid === 598 ? 'Berbers' : 'Byzantines';
      const ctxCiv = ARMY_RESEARCH.civs[civName]!;
      expect(researchPrice(ARMY_RESEARCH, civName, 4, tid, new Set()), `direct price t:${tid}`).toMatchObject({ cost: null, free: false });
      expect(evalConditionNode(ARMY_RESEARCH, ctxCiv, 4, 199, new Set([tid]), new Set([tid]), tid), `evalConditionNode before t:${tid}`).toBe(false);
      expect(evalConditionNode(ARMY_RESEARCH, ctxCiv, 4, 199, new Set([tid]), new Set(), tid), `evalConditionNode active t:${tid}`).toBe(false);
    }
    // Effect-triggered tech t:707 is preserved as non-dead (ready when completed, unknown otherwise)
    expect(ARMY_RESEARCH.fxTriggeredTechs).toContain(707);
    expect(researchResolver(ARMY_RESEARCH, 'Cumans', 4, new Set([707])).resolve(707).state).toBe('ready');
    expect(researchResolver(ARMY_RESEARCH, 'Cumans', 4).resolve(707).state).toBe('unknown');
    for (const tid of [128, 242, 1210, 1211, 1212, 1213, 1220, 1497, 1498]) {
      expect(ARMY_RESEARCH.buildingTechs, `t:${tid}`).toContain(tid);
      expect(ARMY_RESEARCH.nodes[tid]!.enables, `t:${tid}`).toEqual([]);
      expect(ARMY_RESEARCH.nodes[tid]!.upgrades, `t:${tid}`).toEqual([]);
      const civ = tid === 242 ? 'Huns' : 'Byzantines';
      expect(researchResolver(ARMY_RESEARCH, civ, 4).resolve(tid).state, `t:${tid}`).toBe('ready');
    }

    // Defense-in-depth runtime guard: even if t:243 still carries enables:[529], Fire Ship still evaluates cleanly
    const rawLike = structuredClone(ARMY_RESEARCH);
    rawLike.nodes[243]!.enables = [529];
    const guarded = evaluateArmyCost(ctx, { ...makeArmyCost('Byzantines', '4'), rows: [{ unit: 529, qty: '5' }] }, rawLike);
    expect(guarded.partial).toBe(false);
    expect(guarded.training.lines[0]?.status).toBe('ok');

    // Negative control: valid age-gated enabler (Hand Cannoneer t:188 in Castle Age) must stay unavailable
    const castleHc = evaluateArmyCost(ctx, { ...makeArmyCost('Turks', '3'), rows: [{ unit: 36, qty: '1' }] });
    expect(castleHc.partial).toBe(true);
    expect(castleHc.training.lines[0]?.status).toBe('unavail');
  });

  it('AC4: excludes age techs 101/102/103 from armyCombatResearch across all 56 civs and keeps legacy URL out-of-scope handling', () => {
    const ageTechSet = new Set<number>([...AGE_TECH_IDS, 104]);
    const leaks: string[] = [];
    for (const c of civs) {
      const units = productionUnits(ctx, { civ: c.en, age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
      const cfg = { ...makeArmyCost(c.en, '4'), rows: units.map((u) => ({ unit: u.id, qty: '1' })) };
      // includeUnverified=true is a strict superset of false (adds UniqueTechs on top of the same unit-scoped choices).
      const choices = armyResearchChoices(ctx, cfg, true);
      const found = choices.filter((id) => ageTechSet.has(id));
      if (found.length) leaks.push(`${c.en}:${found.join(',')}`);
    }
    expect(leaks).toEqual([]);
    for (const civ of ['Turks', 'Poles', 'Magyars', 'Byzantines', 'Italians']) {
      const uid = civ === 'Poles' ? 1707 : 441;
      const scoped = armyResearchChoices(ctx, { ...makeArmyCost(civ, '4'), rows: [{ unit: uid, qty: '1' }] }, false);
      expect(
        scoped.filter((id) => ageTechSet.has(id)),
        civ,
      ).toEqual([]);
    }

    // Turks Hussar (441) has no t:102 / t:103 in choices or ledger
    const turks = evaluateArmyCost(ctx, { ...makeArmyCost('Turks', '4'), rows: [{ unit: 441, qty: '10' }] });
    expect(turks.partial).toBe(false);
    expect(turks.ledger.map((e) => e.id)).not.toContain(102);
    expect(turks.ledger.map((e) => e.id)).not.toContain(103);

    // UX Fig 8: legacy URL with explicit actargets=['t:102','t:103'] marks them out-of-scope invalid without breaking Hussar training
    const legacy = evaluateArmyCost(ctx, {
      ...makeArmyCost('Turks', '4'),
      rows: [{ unit: 441, qty: '10' }],
      targets: ['t:102', 't:103'],
    });
    expect(legacy.partial).toBe(true);
    expect(legacy.training.lines[0]?.status).toBe('ok');
    for (const id of [102, 103]) {
      expect(legacy.ledger.find((e) => e.id === id)).toMatchObject({
        status: 'invalid',
        manual: true,
        cost: null,
        reason: '不属于当前阵容的战斗、训练费用或形态研究；未计入',
      });
    }
  });
});
