import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { loadTrees } from '../../src/data';
import { civs } from '../../src/data';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import {
  emptyArmyCost as makeArmyCost,
  evaluateArmyCost,
  researchPrice,
  researchResolver,
  armyResearchChoices,
  researchKey,
  addArmyCost,
  hasDecimalCost,
} from '../../src/domain/armyCost';
import { productionUnits, PRODUCTION_UNLOCK_TECH_IDS } from '../../src/domain/production';
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
    const chinesePrice = researchPrice(ARMY_RESEARCH, 'Chinese', 4, 67, new Set());
    expect(chinesePrice.cost).toEqual({ Food: 127.5 });
    expect(chinesePrice.modifiers.filter((m) => m.applied && m.command.A === 85).map((m) => m.nodeId)).toEqual([352]);
    expect(chinesePrice.modifiers.filter((m) => m.superseded && m.command.A === 85).map((m) => m.nodeId)).toEqual([304, 350, 351]);
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
  it('scopes poison projectiles and the resistance portion of First Crusade, while exposing unresolved abilities', () => {
    for (const [civ, unit, id] of [
      ['Tupi', 4, 1393],
      ['Sicilians', 1658, 756],
    ] as const) {
      const config = { ...makeArmyCost(civ), rows: [{ unit, qty: '1' }], targets: [researchKey(id)] };
      expect(armyResearchChoices(ctx, config, false)).toContain(id);
      expect(evaluateArmyCost(ctx, config).ledger.find((e) => e.id === id)?.beneficiaries).toEqual([0]);
    }
    const unresolved = { ...makeArmyCost('Saracens'), rows: [{ unit: 125, qty: '1' }], targets: ['t:28'] };
    expect(armyResearchChoices(ctx, unresolved)).toContain(28);
    expect(armyResearchChoices(ctx, unresolved, false)).not.toContain(28);
    expect(evaluateArmyCost(ctx, unresolved).ledger.find((e) => e.id === 28)).toMatchObject({ status: 'invalid', cost: null });
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
  it('treats the nonfree Paphos shadow event as unavailable in standard RM rather than automatic or unknown', () => {
    expect(researchResolver(ARMY_RESEARCH, 'Georgians', 4).resolve(1138).state).toBe('unavailable');
    const r = evaluateArmyCost(ctx, { ...makeArmyCost('Georgians'), rows: [{ unit: 567, qty: '1' }] });
    expect(r.partial).toBe(false);
    expect(r.ledger.map((e) => e.id)).toContain(264);
    expect(r.ledger.map((e) => e.id)).not.toContain(1174);
    for (const civ of ['Georgians', 'Khitans', 'Shu', 'Wu']) {
      const faith = evaluateArmyCost(ctx, { ...makeArmyCost(civ), rows: [{ unit: 125, qty: '1' }], targets: ['t:45'] });
      expect(faith.partial).toBe(false);
      expect(faith.ledger.map((e) => e.id)).toEqual(expect.arrayContaining([45, 46]));
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
  it('does not turn an unresolved prerequisite or unverified global research multiplier into a base-price quote', () => {
    expect(researchResolver(ARMY_RESEARCH, 'Goths', 2).resolve(365).error).not.toBe('');
    const data = structuredClone(ARMY_RESEARCH);
    data.nodes[352]!.mods = [{ Type: 6, A: 85, B: 0, C: -1, D: 0.85 }];
    expect(researchPrice(data, 'Chinese', 4, 67, new Set()).cost).toBe(null);
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
    const data = structuredClone(ARMY_RESEARCH);
    data.nodes[352]!.mods = [{ Type: 6, A: 85, B: 0, C: -1, D: 0.85 }];
    const r = evaluateArmyCost(ctx, { ...emptyArmyCost('Chinese'), rows: [{ unit: 4, qty: '2' }], targets: ['t:199'] }, data);
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

  describe('#1402 regional re-enable, post-imperial/shadow filters, decimal rounding and duplicate champion upgrades', () => {
    it('AC1: clears t:79/t:656/t:1350 across all 56 civs and keeps non-owning regional upgrades unavailable', () => {
      const unexpectedFailures: string[] = [];
      const regionalUpgrades = new Set(ARMY_RESEARCH.nodes[79]!.mods.filter((m) => m.Type === 102).map((m) => Math.round(m.D)));
      const regionalUpgradesByUnit = new Map<number, number[]>();
      for (const [tidStr, n] of Object.entries(ARMY_RESEARCH.nodes)) {
        const tid = Number(tidStr);
        if (!regionalUpgrades.has(tid)) continue;
        for (const [, target] of n.upgrades) {
          if (target === undefined) continue;
          const list = regionalUpgradesByUnit.get(target);
          if (list) {
            if (!list.includes(tid)) list.push(tid);
          } else regionalUpgradesByUnit.set(target, [tid]);
        }
      }
      const checkedRegionalPairs: string[] = [];
      for (const c of civs) {
        const units = productionUnits(ctx, { civ: c.en, age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
        for (const u of units) {
          const r = evaluateArmyCost(ctx, { ...makeArmyCost(c.en), rows: [{ unit: u.id, qty: '1' }] });
          // Independent tech-tree unit availability: every civ (including Chinese and Fire Ship lines) must train and quote cleanly.
          if (r.training.lines[0]?.status !== 'ok') {
            unexpectedFailures.push(`${c.en}:${u.id}:line=${r.training.lines[0]?.status}(${r.training.lines[0]?.reason})`);
          }
          if (r.partial) {
            unexpectedFailures.push(`${c.en}:${u.id}:partial=true`);
          }
          // Determine expected regional upgrades from independent productionUnits (never gate on ARMY_RESEARCH.civs[c].enabled).
          const expectedRegional = regionalUpgradesByUnit.get(u.id) ?? [];
          for (const tid of expectedRegional) {
            checkedRegionalPairs.push(`${c.en}:${u.id}:t:${tid}`);
            const entry = r.ledger.find((e) => e.id === tid);
            if (!entry) {
              unexpectedFailures.push(`regional-missing:${c.en}:${u.id}:t:${tid}:line=${r.training.lines[0]?.status}`);
            } else if (entry.status !== 'planned') {
              unexpectedFailures.push(`regional-unplanned:${c.en}:${u.id}:t:${tid}:entry=${entry.status}(${entry.reason})`);
            }
          }
          for (const e of r.ledger) {
            if (e.status !== 'invalid') continue;
            const srcs = e.quote?.modifiers.map((m) => m.source).join(',') ?? '';
            if (srcs.includes('t:79') || srcs.includes('t:656') || e.id === 1350) {
              unexpectedFailures.push(`${c.en}:${u.id}:${e.key}:${e.reason}`);
            }
          }
        }
      }
      expect(unexpectedFailures).toEqual([]);
      expect(checkedRegionalPairs.length).toBeGreaterThanOrEqual(70);
      expect(checkedRegionalPairs).toEqual(expect.arrayContaining(['Chinese:1907:t:980', 'Chinese:1903:t:982', 'Tatars:1372:t:715', 'Spanish:2701:t:1451']));

      // Named regional upgrades across civs
      const spanish = evaluateArmyCost(ctx, { ...makeArmyCost('Spanish'), rows: [{ unit: 2701, qty: '1' }] });
      expect(spanish.partial).toBe(false);
      expect(spanish.researchTotal).toMatchObject({ Food: 1000, Gold: 650 });

      const byzVarangian = evaluateArmyCost(ctx, { ...makeArmyCost('Byzantines'), rows: [{ unit: 2704, qty: '1' }] });
      expect(byzVarangian.partial).toBe(false);
      expect(byzVarangian.researchTotal).toMatchObject({ Food: 750, Gold: 475 });

      const byzCamel = evaluateArmyCost(ctx, { ...makeArmyCost('Byzantines'), rows: [{ unit: 330, qty: '1' }] });
      expect(byzCamel.partial).toBe(false);
      expect(byzCamel.researchTotal).toMatchObject({ Food: 325, Gold: 360 });

      const berberGenitour = evaluateArmyCost(ctx, { ...makeArmyCost('Berbers'), rows: [{ unit: 1012, qty: '1' }] });
      expect(berberGenitour.partial).toBe(false);
      expect(berberGenitour.researchTotal).toMatchObject({ Food: 500, Wood: 450 });

      const vietSkirm = evaluateArmyCost(ctx, { ...makeArmyCost('Vietnamese'), rows: [{ unit: 1155, qty: '1' }] });
      expect(vietSkirm.partial).toBe(false);
      expect(vietSkirm.ledger.find((e) => e.id === 655)?.cost).toMatchObject({ Wood: 300, Gold: 300 });

      // All 4 South American civs x 4 Champi units = 16 combinations
      for (const civ of ['Incas', 'Mapuche', 'Muisca', 'Tupi']) {
        for (const uid of [2550, 2588, 2552, 2554]) {
          const r = evaluateArmyCost(ctx, { ...makeArmyCost(civ), rows: [{ unit: uid, qty: '1' }] });
          expect(r.partial, `${civ}:${uid}`).toBe(false);
          expect(r.training.lines[0]?.status, `${civ}:${uid}`).toBe('ok');
          expect((r.trainingTotal.Food ?? 0) + (r.trainingTotal.Gold ?? 0), `${civ}:${uid}`).toBeGreaterThan(0);
          expect(r.ledger.find((e) => e.id === 1350)).toMatchObject({ name: '启用：蔷琵斥候', status: 'free' });
        }
      }

      // Negative cases: non-owning civs must still reject regional upgrades and conditionally disabled techs (including done history)
      for (const tid of [236, 1454, 1350, 599]) {
        expect(researchResolver(ARMY_RESEARCH, 'Franks', 4).available(tid), `Franks t:${tid}`).toBe(false);
        expect(researchPrice(ARMY_RESEARCH, 'Franks', 4, tid, new Set()).cost, `Franks price t:${tid}`).toBe(null);
      }
      expect(researchPrice(ARMY_RESEARCH, 'Britons', 4, 655, new Set([98])).cost).toBe(null);
      expect(researchResolver(ARMY_RESEARCH, 'Britons', 4).resolve(655).state).toBe('unavailable');
      expect(researchResolver(ARMY_RESEARCH, 'Turks', 4).available(655)).toBe(false);

      // Britons marking Imperial Skirmisher t:655 as done must NOT infer Elite Skirmisher t:98 done or zero out its cost
      const britDone655 = evaluateArmyCost(ctx, { ...makeArmyCost('Britons'), rows: [{ unit: 6, qty: '1' }], done: ['t:655'] });
      expect(britDone655.partial).toBe(true);
      expect(britDone655.ledger.find((e) => e.id === 655)?.status).toBe('invalid');
      expect(britDone655.ledger.find((e) => e.id === 98)?.status).toBe('planned');
      expect(britDone655.researchTotal).toMatchObject({ Wood: 230, Gold: 130 });

      // Positive control: Vietnamese legitimately owns t:655 and CAN mark it done (inferring t:98 done)
      const vietDone655 = evaluateArmyCost(ctx, { ...makeArmyCost('Vietnamese'), rows: [{ unit: 6, qty: '1' }], done: ['t:655'] });
      expect(vietDone655.partial).toBe(false);
      expect(vietDone655.ledger.find((e) => e.id === 655)?.status).toBe('done');
      expect(vietDone655.ledger.find((e) => e.id === 98)?.status).toBe('inferred-done');
      expect(vietDone655.researchTotal.Wood ?? 0).toBe(0);

      // Poles marking disabled Hussar t:428 as done must NOT infer Light Cavalry t:254 done
      const polesDone428 = evaluateArmyCost(ctx, { ...makeArmyCost('Poles'), rows: [{ unit: 546, qty: '1' }], done: ['t:428'] });
      expect(polesDone428.partial).toBe(true);
      expect(polesDone428.ledger.find((e) => e.id === 428)?.status).toBe('invalid');
      expect(polesDone428.ledger.find((e) => e.id === 254)?.status).toBe('planned');
      expect(polesDone428.researchTotal).toMatchObject({ Food: 75, Gold: 50 });

      // Regicide-only t:117 (Disable Spies) must NOT reject completed Spies t:408 in standard RM across all 56 civs
      const britDone408 = evaluateArmyCost(ctx, { ...makeArmyCost('Britons'), rows: [{ unit: 6, qty: '1' }], done: ['t:408'] });
      expect(britDone408.partial).toBe(false);
      expect(britDone408.ledger.find((e) => e.id === 408)?.status).toBe('done');
      expect(britDone408.ledger.find((e) => e.id === 98)?.status).toBe('planned');
      for (const c of civs) {
        expect(researchResolver(ARMY_RESEARCH, c.en, 4).resolve(408).state, c.en).toBe('ready');
      }
    });

    it('AC2: ignores post-imperial t:790/791 and unreachable shadow t:1142 across affected civs', () => {
      const lith = evaluateArmyCost(ctx, { ...makeArmyCost('Lithuanians'), rows: [{ unit: 1707, qty: '1' }] });
      expect(lith.partial).toBe(false);
      expect(lith.ledger.find((e) => e.id === 786)?.cost).toMatchObject({ Food: 600, Gold: 800 });

      const poles = evaluateArmyCost(ctx, { ...makeArmyCost('Poles'), rows: [{ unit: 1707, qty: '1' }] });
      expect(poles.partial).toBe(false);
      expect(poles.ledger.find((e) => e.id === 786)?.cost).toMatchObject({ Food: 300, Gold: 800 });

      const paphosNavalBlocked: string[] = [];
      for (const civ of ['Armenians', 'Georgians', 'Jurchens', 'Khitans', 'Shu', 'Wei', 'Wu']) {
        for (const tid of [34, 35, 244, 905]) {
          if (!researchResolver(ARMY_RESEARCH, civ, 4).available(tid)) continue;
          const p = researchPrice(ARMY_RESEARCH, civ, 4, tid, new Set());
          if (p.modifiers.some((m) => m.source.includes('t:1142')) || p.cost === null) {
            paphosNavalBlocked.push(`${civ}:t:${tid}:${p.reason}`);
          }
        }
      }
      expect(paphosNavalBlocked).toEqual([]);

      const armGalleon = evaluateArmyCost(ctx, { ...makeArmyCost('Armenians'), rows: [{ unit: 442, qty: '1' }] });
      expect(armGalleon.partial).toBe(false);
      expect(armGalleon.researchTotal).toMatchObject({ Wood: 550, Gold: 415 });
    });

    it('AC3: prices non-integer discounted research to at most 2 decimals and eliminates float32 residue', () => {
      // Zero rounding rejections across all 56 civs' choices
      const roundingErrors: string[] = [];
      for (const c of civs) {
        const units = productionUnits(ctx, { civ: c.en, age: 4, techs: [...PRODUCTION_UNLOCK_TECH_IDS], rows: [], walk: 0, farm: 0 });
        const choices = armyResearchChoices(ctx, { ...makeArmyCost(c.en), rows: units.map((u) => ({ unit: u.id, qty: '1' })) }, false);
        for (const tid of choices) {
          const p = researchPrice(ARMY_RESEARCH, c.en, 4, tid, new Set());
          if (p.reason.includes('取整')) roundingErrors.push(`${c.en}:t:${tid}`);
        }
      }
      expect(roundingErrors).toEqual([]);

      // Bulgarians Blast Furnace (t:75 = 137.5F + 225G)
      const bulg = evaluateArmyCost(ctx, { ...makeArmyCost('Bulgarians'), rows: [{ unit: 1227, qty: '10' }], targets: ['t:75'] });
      expect(bulg.partial).toBe(false);
      expect(bulg.ledger.find((e) => e.id === 75)?.cost).toEqual({ Food: 137.5, Gold: 225 });
      expect(bulg.researchTotal).toMatchObject({ Food: 1322.5, Gold: 1095 });
      expect(bulg.ledger.filter((e) => e.status === 'planned' && hasDecimalCost(e.cost)).map((e) => e.id)).toEqual([75]);

      // Tupi Arson (37.5F) + Crossbowman (87.5F) + Arbalest prereq passes
      const tupi = evaluateArmyCost(ctx, {
        ...makeArmyCost('Tupi'),
        rows: [
          { unit: 492, qty: '1' },
          { unit: 2554, qty: '1' },
        ],
        targets: ['t:602'],
      });
      expect(tupi.partial).toBe(false);
      expect(tupi.ledger.find((e) => e.id === 602)?.cost).toEqual({ Food: 37.5, Gold: 25 });
      expect(tupi.ledger.find((e) => e.id === 100)?.cost).toEqual({ Food: 87.5, Gold: 100 });
      expect(tupi.ledger.find((e) => e.id === 237)?.status).toBe('planned');

      // Italians 2-decimal items + integer item (UX Fig 3)
      const ita = evaluateArmyCost(ctx, {
        ...makeArmyCost('Italians'),
        rows: [
          { unit: 868, qty: '10' },
          { unit: 691, qty: '3' },
        ],
        targets: ['t:93'],
      });
      expect(ita.partial).toBe(false);
      expect(ita.total).toEqual({ Food: 1125, Wood: 1548.75, Gold: 2166.25, Stone: 0 });
      expect(
        ita.ledger
          .filter((e) => e.status === 'planned' && hasDecimalCost(e.cost))
          .map((e) => e.id)
          .sort((a, b) => a! - b!),
      ).toEqual([93, 376]);
      expect(hasDecimalCost(ita.ledger.find((e) => e.id === 47)?.cost)).toBe(false);

      // Danes float32 residue rounds to exact integers (UX Fig 5) while done Long Swordsman keeps 22.1G reference quote
      const danes = evaluateArmyCost(ctx, { ...makeArmyCost('Danes'), rows: [{ unit: 567, qty: '10' }], done: ['t:222', 't:207'] });
      expect(danes.partial).toBe(false);
      expect(danes.ledger.find((e) => e.id === 264)?.cost).toEqual({ Food: 650, Gold: 119 });
      expect(danes.ledger.find((e) => e.id === 217)?.cost).toEqual({ Food: 200, Gold: 34 });
      expect(danes.ledger.filter((e) => e.status === 'planned' && hasDecimalCost(e.cost))).toEqual([]);
      expect(danes.ledger.find((e) => e.id === 207)?.quote?.cost).toEqual({ Food: 150, Gold: 22.1 });
      expect(hasDecimalCost(danes.ledger.find((e) => e.id === 207)?.quote?.cost)).toBe(true);

      // Summation drift guard (30.6 + 22.1 === 52.7, not 52.699999999999996)
      const acc: Record<string, number> = {};
      addArmyCost(acc, { Gold: 30.6 });
      addArmyCost(acc, { Gold: 22.1 });
      expect(acc.Gold).toBe(52.7);
    });

    it('AC4: excludes unreachable duplicate Champion upgrade t:1174 across all 39 Champion civs and fixes 5 shape() civs', () => {
      const champCivs = civs.filter((c) => ctx.core.unitById[567]!.civs.includes(c.en));
      expect(champCivs).toHaveLength(39);
      for (const c of champCivs) {
        const choices = armyResearchChoices(ctx, { ...makeArmyCost(c.en), rows: [{ unit: 567, qty: '1' }] });
        expect(choices, c.en).toContain(264);
        expect(choices, c.en).not.toContain(1174);
      }
      for (const civ of ['Armenians', 'Georgians', 'Khitans', 'Shu', 'Wu']) {
        const r = evaluateArmyCost(ctx, { ...makeArmyCost(civ), rows: [{ unit: 567, qty: '1' }] });
        expect(r.partial, civ).toBe(false);
        expect(r.training.lines[0]?.status, civ).toBe('ok');
        expect(
          r.ledger.map((e) => e.id),
          civ,
        ).toContain(264);
        expect(
          r.ledger.map((e) => e.id),
          civ,
        ).not.toContain(1174);
      }
      // Explicit URL targeting unreachable t:1174 remains invalid
      const badTarget = evaluateArmyCost(ctx, { ...makeArmyCost('Goths'), rows: [{ unit: 567, qty: '1' }], targets: ['t:1174'] });
      expect(badTarget.partial).toBe(true);
      expect(badTarget.ledger.find((e) => e.id === 1174)?.status).toBe('invalid');
    });
  });
});
