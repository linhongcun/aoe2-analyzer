import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { loadTrees } from '../../src/data';
import { civs } from '../../src/data';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { emptyArmyCost as makeArmyCost, evaluateArmyCost, researchPrice, researchResolver, armyResearchChoices, researchKey } from '../../src/domain/armyCost';
import { evaluateTrainTotal } from '../../src/domain/trainTotal';
import { armyResearchConditions } from '../../src/domain/armyResearchEvidence';

const ctx = { core: CORE, trees: await loadTrees() };
const emptyArmyCost = (civ = 'Sicilians') => makeArmyCost(civ);
describe('army research pinned data', () => {
  it('retains every root reason, real prerequisite state and applied research-price command', () => {
    const config = {
      ...emptyArmyCost(),
      rows: [
        { unit: 1659, qty: '1' },
        { unit: 1661, qty: '1' },
      ],
      targets: ['t:753'],
    };
    const r = evaluateArmyCost(ctx, config);
    const elite = r.ledger.find((e) => e.id === 753)!;
    expect(elite.origins.map((o) => o.kind)).toEqual(['target', 'shape', 'shape']);
    const conditions = armyResearchConditions(ARMY_RESEARCH, config, r.ledger, 753);
    expect(conditions.find((c) => c.id === 103)?.state).toBe('已到达时代条件');
    expect(conditions.find((c) => c.id === 752)?.state).toBe('文明自动条件已满足');
    const price = researchPrice(ARMY_RESEARCH, 'Burgundians', 4, 254, new Set());
    expect(price.baseCost).toEqual({ Food: 150, Gold: 50 });
    expect(price.modifiers.filter((m) => m.applied).map((m) => m.command.D)).toEqual([0.5, 0.5]);
    expect(researchPrice(ARMY_RESEARCH, 'Chinese', 4, 67, new Set()).modifiers.some((m) => !m.applied && m.command.A === 85)).toBe(true);
  });
  it('quotes Flemish militia training independently of its unlock resource marker', () => {
    const r = evaluateArmyCost(ctx, { ...makeArmyCost('Burgundians'), rows: [{ unit: 1699, qty: '2' }] });
    expect(r.training.lines[0]?.status).toBe('ok');
    expect(r.trainingTotal).toMatchObject({ Food: 70, Gold: 50 });
    expect(r.ledger.find((e) => e.id === 755)?.status).toBe('planned');
  });
  it('offers scoped text combat research but excludes pure production speed', () => {
    const config = { ...makeArmyCost('Britons'), rows: [{ unit: 4, qty: '1' }] };
    expect(armyResearchChoices(ctx, config)).toContain(93);
    expect(armyResearchChoices(ctx, config)).not.toContain(315);
    const r = evaluateArmyCost(ctx, { ...config, targets: ['t:93'] });
    expect(r.ledger.find((e) => e.id === 93)?.beneficiaries).toEqual([0]);
    expect(r.researchTotal).toMatchObject({ Wood: 300, Gold: 175 });
  });
  it.each([
    ['Slavs', 359, 513],
    ['Ethiopians', 550, 575],
  ] as const)('offers unit-scoped splash research for %s', (civ, unit, id) => {
    const config = { ...makeArmyCost(civ), rows: [{ unit, qty: '1' }], targets: [researchKey(id)] };
    expect(armyResearchChoices(ctx, config)).toContain(id);
    const result = evaluateArmyCost(ctx, config);
    expect(result.ledger.find((e) => e.id === id)?.beneficiaries).toEqual([0]);
    expect(result.ledger.find((e) => e.id === id)?.status).toBe('planned');
  });
  it('uses fixed projectile effects rather than range to scope Ballistics', () => {
    const monk = { ...makeArmyCost('Britons'), rows: [{ unit: 125, qty: '1' }] };
    expect(ARMY_RESEARCH.nodes[93]!.combatUnits).toContain(4);
    expect(ARMY_RESEARCH.nodes[93]!.combatUnits).not.toContain(125);
    expect(armyResearchChoices(ctx, monk)).not.toContain(93);
    const result = evaluateArmyCost(ctx, { ...monk, targets: ['t:93'] });
    expect(result.partial).toBe(true);
    expect(result.ledger.find((e) => e.id === 93)?.cost).toBe(null);
  });
  it('includes public monk mechanics without relying on an extra numeric civilization bonus', () => {
    const config = { ...makeArmyCost('Byzantines'), rows: [{ unit: 125, qty: '1' }], targets: ['t:45', 't:233', 't:316'] };
    expect(armyResearchChoices(ctx, config)).toEqual(expect.arrayContaining([45, 46, 316, 319, 439, 438, 233]));
    const result = evaluateArmyCost(ctx, config);
    for (const id of [45, 233, 316]) expect(result.ledger.find((e) => e.id === id)?.beneficiaries).toEqual([0]);
  });
  it('follows fixed building-transform and projectile relations for text combat mechanics', () => {
    const config = { ...makeArmyCost('Britons'), rows: [{ unit: 331, qty: '1' }], targets: ['t:461'] };
    expect(ARMY_RESEARCH.nodes[461]!.combatUnits).toContain(331);
    expect(armyResearchChoices(ctx, config)).toContain(461);
    expect(evaluateArmyCost(ctx, config).ledger.find((e) => e.id === 461)?.beneficiaries).toEqual([0]);
    expect(armyResearchChoices(ctx, { ...makeArmyCost('Portuguese'), rows: [{ unit: 36, qty: '1' }] })).toContain(573);
  });
  it.each([315, 202])('retains out-of-scope target %i without charging it or invalidating independent training', (id) => {
    const base = { ...makeArmyCost('Britons'), rows: [{ unit: 4, qty: '1' }] };
    const result = evaluateArmyCost(ctx, { ...base, targets: [researchKey(id)] });
    expect(result.partial).toBe(true);
    expect(result.ledger.find((e) => e.id === id)).toMatchObject({ status: 'invalid', cost: null });
    expect(result.training.lines[0]?.status).toBe('ok');
    expect(evaluateArmyCost(ctx, { ...base, done: [researchKey(id)] }).partial).toBe(false);
  });
  it('merges equal and dominated paid prerequisite sets without discarding unknown alternatives', () => {
    const longsword = evaluateArmyCost(ctx, { ...makeArmyCost('Armenians', '3'), rows: [{ unit: 77, qty: '1' }] });
    expect(longsword.partial).toBe(false);
    const halb = evaluateArmyCost(ctx, { ...makeArmyCost('Armenians'), rows: [{ unit: 359, qty: '1' }] });
    expect(halb.partial).toBe(false);
    expect(
      halb.ledger
        .filter((e) => e.status === 'planned')
        .map((e) => e.id)
        .sort(),
    ).toEqual([197, 429]);
    const data = structuredClone(ARMY_RESEARCH);
    data.nodes[68]!.requires = [67, 99999];
    data.nodes[68]!.count = 1;
    const unknown = evaluateArmyCost(ctx, { ...emptyArmyCost(), targets: ['t:68'] }, data);
    expect(unknown.partial).toBe(true);
    expect(unknown.hasValue).toBe(false);
    expect(evaluateArmyCost(ctx, { ...emptyArmyCost(), done: ['t:67'], targets: ['t:68'] }, data).partial).toBe(false);
  });
  it('does not treat the nonfree Paphos shadow event as an automatic condition', () => {
    expect(researchResolver(ARMY_RESEARCH, 'Georgians', 4).resolve(1138).state).toBe('unknown');
    const r = evaluateArmyCost(ctx, { ...makeArmyCost('Georgians'), rows: [{ unit: 567, qty: '1' }] });
    expect(r.partial).toBe(true);
    for (const civ of ['Georgians', 'Khitans', 'Shu', 'Wu']) {
      const faith = evaluateArmyCost(ctx, { ...makeArmyCost(civ), targets: ['t:45'] });
      expect(faith.partial).toBe(true);
      expect(faith.ledger.find((e) => e.id === 45)?.reason).toContain('未核实');
      expect(faith.hasValue).toBe(false);
    }
  });
  it('maps every published civilization to its fixed-data identity, including the default empty plan', () => {
    for (const civ of civs) {
      expect(ARMY_RESEARCH.civs[civ.en], civ.en).toBeDefined();
      expect(evaluateArmyCost(ctx, makeArmyCost(civ.en)).blocked, civ.en).toEqual([]);
    }
    expect(evaluateArmyCost(ctx, makeArmyCost()).partial).toBe(false);
  });
  it('deduplicates the two Sicilian elite forms and keeps the light cavalry upgrade separate', () => {
    const result = evaluateArmyCost(ctx, {
      ...emptyArmyCost(),
      rows: [
        { unit: 1659, qty: '10' },
        { unit: 1661, qty: '5' },
        { unit: 546, qty: '4' },
        { unit: 331, qty: '2' },
      ],
    });
    expect(result.researchTotal).toMatchObject({ Food: 950, Gold: 725 });
    expect(result.partial).toBe(false);
    expect(result.ledger.filter((r) => r.id === 753)).toHaveLength(1);
  });
  it('resolves Goth elite, pike/halberdier and chemistry independently', () => {
    const result = evaluateArmyCost(ctx, {
      ...emptyArmyCost('Goths'),
      rows: [
        { unit: 761, qty: '10' },
        { unit: 359, qty: '5' },
        { unit: 36, qty: '2' },
      ],
    });
    expect(result.partial).toBe(false);
    expect(result.ledger.map((r) => r.id)).toEqual(expect.arrayContaining([365, 197, 429, 47]));
  });
  it('distinguishes free automatic from a zero-price research still requiring action', () => {
    expect(researchPrice(ARMY_RESEARCH, 'Magyars', 4, 67, new Set())).toMatchObject({ free: true, zero: true });
    const data = structuredClone(ARMY_RESEARCH);
    data.nodes[67]!.time = 5;
    data.nodes[67]!.cost = [];
    data.civs.Magyars!.mods = [];
    expect(researchPrice(data, 'Magyars', 4, 67, new Set())).toMatchObject({ free: false, zero: true });
  });
  it('does not turn an unresolved prerequisite or global research multiplier into a base-price quote', () => {
    expect(researchResolver(ARMY_RESEARCH, 'Goths', 2).resolve(365).error).not.toBe('');
    expect(researchPrice(ARMY_RESEARCH, 'Chinese', 4, 67, new Set()).cost).toBe(null);
  });
  it.each([
    ['Sicilians', [1659, 546, 331], { Food: 1730, Wood: 200, Gold: 1295, Stone: 0 }],
    ['Goths', [555, 359, 36], { Food: 2682, Wood: 242.5, Gold: 2034.5, Stone: 0 }],
    ['Goths', [761, 359, 36], { Food: 3132, Wood: 242.5, Gold: 2284.5, Stone: 0 }],
  ] as const)('matches the independent fixed-data full example %s %j', (civ, units, expected) => {
    const config = { ...emptyArmyCost(civ), rows: units.map((unit) => ({ unit, qty: '1' })), targets: ['t:75'] };
    const r = evaluateArmyCost(ctx, config);
    expect(r.partial, JSON.stringify({ ledger: r.ledger, lines: r.training.lines.map((l) => [l.unit?.id, l.status, l.reason]) })).toBe(false);
    expect(r.total).toEqual(expected);
    expect(r.ledger.find((e) => e.id === 67)?.beneficiaries).toEqual([0, 1]);
    expect(r.ledger.filter((e) => e.id === 75)).toHaveLength(1);
    const old = evaluateTrainTotal(ctx, { civ, age: 4, ageRaw: null, rows: config.rows, techs: civ === 'Goths' ? [16, 47] : [] });
    for (const resource of ['Food', 'Wood', 'Gold', 'Stone']) expect(r.trainingTotal[resource] ?? 0).toBe(old.total[resource] ?? 0);
  });
  it('excludes historical prerequisite costs without converting inferred history into manual selections', () => {
    const config = { ...emptyArmyCost(), done: ['t:68'], targets: ['t:75', 't:68'], rows: [{ unit: 1659, qty: '1' }] };
    const r = evaluateArmyCost(ctx, config);
    expect(r.ledger.find((e) => e.id === 67)).toMatchObject({ status: 'inferred-done', manual: false });
    expect(r.ledger.find((e) => e.id === 68)?.status).toBe('done');
    expect(r.researchTotal).toMatchObject({ Food: 1075, Gold: 900 });
    expect(config.done).toEqual(['t:68']);
  });
  it('keeps infantry and cavalry armor actions separate', () => {
    const r = evaluateArmyCost(ctx, {
      ...emptyArmyCost(),
      targets: ['t:77', 't:80'],
      rows: [
        { unit: 1659, qty: '1' },
        { unit: 546, qty: '1' },
      ],
    });
    expect(r.partial).toBe(false);
    expect(r.ledger.map((e) => e.id)).toEqual(expect.arrayContaining([74, 76, 77, 81, 82, 80]));
    expect(r.researchTotal).toMatchObject({ Food: 2300, Gold: 1325 });
  });
  it('applies completed Hussite Reforms before pricing Sanctity, but rejects an unproven same-plan ordering', () => {
    const config = { ...emptyArmyCost('Bohemians'), done: ['t:785'], targets: ['t:231'] };
    const r = evaluateArmyCost(ctx, config);
    expect(r.partial).toBe(false);
    expect(r.researchTotal).toMatchObject({ Food: 175, Gold: 0 });
    const uncertain = evaluateArmyCost(ctx, { ...config, done: [], targets: ['t:785', 't:231'] });
    expect(uncertain.partial).toBe(true);
    expect(uncertain.ledger.find((e) => e.id === 231)).toMatchObject({ status: 'invalid', cost: null });
  });
  it('uses a verified Burgundian action-specific research discount', () => {
    expect(researchPrice(ARMY_RESEARCH, 'Burgundians', 4, 254, new Set()).cost).toMatchObject({ Food: 75, Gold: 25 });
  });
  it('proves hidden enabling/era/building conditions from the full graph', () => {
    const resolve = researchResolver(ARMY_RESEARCH, 'Goths', 4).resolve;
    expect(ARMY_RESEARCH.buildingTriggers[82]).toBe(266);
    expect(resolve(266).ids.size).toBe(0);
    expect(resolve(270).ids.size).toBe(0);
    expect(resolve(115).ids.size).toBe(0);
    expect([...resolve(188).ids]).toEqual([47]);
    expect([...resolve(429).ids]).toEqual([197, 429]);
    expect(ARMY_RESEARCH.nodes[188]!.enables).toContain(36);
  });
  it('isolates invalid quantities and never charges a noncanonical alias of an action twice', () => {
    const r = evaluateArmyCost(ctx, {
      ...emptyArmyCost(),
      rows: [
        { unit: 331, qty: '-2' },
        { unit: 546, qty: '3' },
      ],
      targets: ['t:00753'],
    });
    expect(r.partial).toBe(true);
    expect(r.researchTotal.Food).toBe(150);
    expect(r.ledger.find((e) => e.key === 't:00753')?.status).toBe('invalid');
    expect(r.training.lines[0]?.subtotal).toBe(null);
  });
  it('preserves independently known training when only research price is unverified', () => {
    const r = evaluateArmyCost(ctx, { ...emptyArmyCost('Chinese'), rows: [{ unit: 4, qty: '2' }], targets: ['t:199'] });
    expect(r.partial).toBe(true);
    expect(r.ledger.find((e) => e.id === 199)?.cost).toBe(null);
    expect(r.training.lines[0]?.status).toBe('ok');
    expect(r.trainingTotal).toMatchObject({ Wood: 50, Gold: 90 });
  });
  it('handles empty, all-completed, invalid context, and unknown identity without fabricated zero totals', () => {
    expect(evaluateArmyCost(ctx, emptyArmyCost()).hasValue).toBe(false);
    const r = evaluateArmyCost(ctx, { ...emptyArmyCost(), rows: [{ unit: 1659, qty: '1' }], done: ['t:753'] });
    expect(r.partial).toBe(false);
    expect(r.researchTotal.Food ?? 0).toBe(0);
    expect(evaluateArmyCost(ctx, { ...emptyArmyCost(), civ: 'missing', rows: [{ unit: 1659, qty: '1' }] }).hasValue).toBe(false);
    expect(evaluateArmyCost(ctx, { ...emptyArmyCost(), targets: ['t:99999'] }).hasValue).toBe(false);
    expect(evaluateArmyCost(ctx, { ...emptyArmyCost(), done: ['t:67'], targets: ['t:67'] }).hasValue).toBe(true);
    expect(evaluateArmyCost(ctx, { ...makeArmyCost('Magyars'), targets: ['t:67'] }).hasValue).toBe(true);
    expect(evaluateArmyCost(ctx, { ...makeArmyCost('Magyars'), done: ['t:67'] }).hasValue).toBe(true);
  });
  it('respects count alternatives and ignores irrelevant unknown branches once the count is met (algorithm fixture)', () => {
    const data = structuredClone(ARMY_RESEARCH);
    data.nodes[68]!.requires = [67, 74, 99999];
    data.nodes[68]!.count = 1;
    const history = new Set([67]);
    expect([...researchResolver(data, 'Sicilians', 4, history).resolve(68).ids]).toEqual([68]);
    const r = evaluateArmyCost(ctx, { ...emptyArmyCost(), done: ['t:67'], targets: ['t:68'] }, data);
    expect(r.partial).toBe(false);
    expect(r.ledger.map((e) => e.id)).not.toContain(74);
    expect(r.ledger.map((e) => e.id)).not.toContain(99999);
  });
  it('keeps all four resources separate and closes unknown resources, operations, and ordering (algorithm fixtures)', () => {
    const data = structuredClone(ARMY_RESEARCH);
    data.nodes[67]!.cost = [
      [0, 2, 1],
      [1, 3, 1],
      [2, 5, 1],
      [3, 7, 1],
    ];
    expect(researchPrice(data, 'Sicilians', 4, 67, new Set()).cost).toEqual({ Food: 2, Wood: 3, Stone: 5, Gold: 7 });
    data.nodes[67]!.cost.push([99, 1, 1]);
    expect(researchPrice(data, 'Sicilians', 4, 67, new Set()).cost).toBe(null);
    data.nodes[67]!.cost.pop();
    data.civs.Sicilians!.mods.push({ Type: 101, A: 67, B: 3, C: 99, D: 1 });
    expect(researchPrice(data, 'Sicilians', 4, 67, new Set()).cost).toBe(null);
    data.civs.Sicilians!.mods = [{ Type: 101, A: 67, B: 0, C: 1, D: 10 }];
    data.nodes[68]!.mods = [{ Type: 101, A: 67, B: 0, C: 2, D: 0.5 }];
    expect(researchPrice(data, 'Sicilians', 4, 67, new Set([68])).cost).toBe(null);
  });
});
